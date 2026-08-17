import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_SCHEMA, Type, load } from 'js-yaml'

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const FILES_CONTRACT = [
  'dsh/cordis.patch.yml',
  'dsh/lib/**/*.js',
  'dsh/lib/**/*.d.ts',
  'dsh/bin/anban-dsh.js',
  'dsh/presets/**',
  'docs/dsh-installation.md',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
]
const EXPORTS_CONTRACT = {
  './anban-mcp': {
    types: './dsh/lib/anban-mcp.d.ts',
    default: './dsh/lib/anban-mcp.js',
  },
  './preset-manager': {
    types: './dsh/lib/preset-manager.d.ts',
    default: './dsh/lib/preset-manager.js',
  },
  './skills-provider': {
    types: './dsh/lib/skills-provider.d.ts',
    default: './dsh/lib/skills-provider.js',
  },
  './package.json': './package.json',
}
const PUBLIC_CODE_EXPORTS = Object.keys(EXPORTS_CONTRACT).filter(
  (name) => name !== './package.json',
)
const BIN_CONTRACT = {
  'anban-dsh': './dsh/bin/anban-dsh.js',
}
export const ARCHIVE_LIMITS = Object.freeze({
  maxCompressedBytes: 8 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryBytes: 16 * 1024 * 1024,
  maxInflatedBytes: 32 * 1024 * 1024,
  maxPathBytes: 1024,
  maxPaxBytes: 64 * 1024,
})
const CHILD_MAX_BUFFER = 1024 * 1024
const CHILD_TIMEOUT_MS = 30_000
const COMMAND_TIMEOUT_MS = 120_000
const CHILD_TERMINATION_GRACE_MS = 100
const CHILD_CLOSE_WATCHDOG_MS = 1_000
const NODE_SHEBANGS = [
  Buffer.from('#!/usr/bin/env node\n'),
  Buffer.from('#!/usr/bin/env node\r\n'),
]
const CORDIS_PATCH = [
  {
    insert: [
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
      },
    ],
  },
]
const PRESETS = [
  { id: 'article', label: 'Article' },
  { id: 'seednote', label: 'Seednote' },
]
const jsExpression = new Type('tag:yaml.org,2002:js', {
  construct: (value) => value,
  kind: 'scalar',
})
const yamlSchema = DEFAULT_SCHEMA.extend([jsExpression])

function fail(message) {
  throw new Error(`Package integrity failed: ${message}`)
}

function hasNodeShebang(source) {
  return NODE_SHEBANGS.some((shebang) =>
    source.subarray(0, shebang.length).equals(shebang),
  )
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sortedUnique(values, label) {
  const sorted = [...values].sort()
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) {
      fail(`${label} contains duplicate ${sorted[index]}`)
    }
  }
  return sorted
}

function relativeTarget(target, label) {
  if (
    typeof target !== 'string' ||
    !target.startsWith('./') ||
    target.includes('\\')
  ) {
    fail(`${label} must be a package-relative path`)
  }
  const path = target.slice(2)
  const normalized = posix.normalize(path)
  if (
    path.length === 0 ||
    normalized !== path ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    isAbsolute(path)
  ) {
    fail(`${label} has an unsafe path`)
  }
  return path
}

async function requireRegularFile(root, path, label) {
  let status
  try {
    status = await lstat(join(root, path))
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`Missing ${label}: ${path}`)
    throw error
  }
  if (!status.isFile() || status.isSymbolicLink()) {
    fail(`${label} is not a regular file: ${path}`)
  }
}

async function parseJsonFile(root, path, label) {
  await requireRegularFile(root, path, label)
  try {
    return JSON.parse(await readFile(join(root, path), 'utf8'))
  } catch {
    fail(`${label} is not valid JSON: ${path}`)
  }
}

async function parseYamlFile(root, path, label) {
  await requireRegularFile(root, path, label)
  try {
    return load(await readFile(join(root, path), 'utf8'), {
      schema: yamlSchema,
    })
  } catch {
    fail(`${label} is not valid YAML: ${path}`)
  }
}

function sameStructure(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} does not match its canonical declaration`)
  }
}

async function directoryFiles(
  root,
  directory,
  label,
  { excludeGitMetadata = false } = {},
) {
  const start = join(root, directory)
  let initial
  try {
    initial = await lstat(start)
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`Missing ${label}: ${directory}`)
    throw error
  }
  if (!initial.isDirectory() || initial.isSymbolicLink()) {
    fail(`${label} is not a regular directory: ${directory}`)
  }

  const files = []
  async function visit(absolute, relativeDirectory) {
    const entries = await readdir(absolute, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (excludeGitMetadata && relativeDirectory === '' && entry.name === '.git') {
        continue
      }
      const relativePath = relativeDirectory
        ? posix.join(relativeDirectory, entry.name)
        : entry.name
      const absolutePath = join(absolute, entry.name)
      if (entry.isSymbolicLink()) fail(`${label} contains a symlink: ${relativePath}`)
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath)
      } else if (entry.isFile()) {
        files.push(relativePath)
      } else {
        fail(`${label} contains a non-regular entry: ${relativePath}`)
      }
    }
  }
  await visit(start, '')
  return files
}

function skillFrontmatter(source, label) {
  const lines = source.split(/\r?\n/)
  if (lines[0] !== '---') fail(`${label} has no YAML frontmatter`)
  const end = lines.indexOf('---', 1)
  if (end === -1) fail(`${label} has unterminated YAML frontmatter`)
  const metadata = load(lines.slice(1, end).join('\n'))
  if (!isRecord(metadata)) fail(`${label} has invalid YAML frontmatter`)
  return metadata
}

async function compareSkill(root, preset, skill) {
  const label = `${preset.label} declared Skill ${skill}`
  const sourceDirectory = posix.join('skills', skill)
  const generatedDirectory = posix.join(
    'dsh/presets',
    preset.id,
    'skills',
    skill,
  )
  const sourceFiles = await directoryFiles(root, sourceDirectory, label, {
    excludeGitMetadata: true,
  })
  const generatedFiles = await directoryFiles(root, generatedDirectory, label)
  sameStructure(generatedFiles, sourceFiles, label)

  const skillPath = posix.join(sourceDirectory, 'SKILL.md')
  await requireRegularFile(root, skillPath, label)
  const metadata = skillFrontmatter(
    await readFile(join(root, skillPath), 'utf8'),
    label,
  )
  if (metadata.name !== skill) fail(`${label} has a mismatched frontmatter name`)

  for (const path of sourceFiles) {
    const [source, generated] = await Promise.all([
      readFile(join(root, sourceDirectory, path)),
      readFile(join(root, generatedDirectory, path)),
    ])
    if (!source.equals(generated)) fail(`${label} differs at ${path}`)
  }
}

function exportTargets(value, label, targets) {
  if (typeof value === 'string') {
    targets.push({ label, target: value })
    return
  }
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail(`${label} has no target`)
  }
  for (const [condition, target] of Object.entries(value)) {
    exportTargets(target, `${label} ${condition}`, targets)
  }
}

async function verifyPreset(root, preset) {
  const packPath = posix.join('packs', preset.id, 'agent-pack.yaml')
  const pack = await parseYamlFile(root, packPath, `${preset.label} Pack manifest`)
  if (!isRecord(pack) || !isRecord(pack.agent)) {
    fail(`${preset.label} Pack manifest has no agent declaration`)
  }
  if (
    pack.id !== preset.id ||
    typeof pack.display_name !== 'string' ||
    typeof pack.description !== 'string' ||
    typeof pack.agent.dsh_source !== 'string' ||
    !Array.isArray(pack.agent.skills) ||
    pack.agent.skills.some((skill) => typeof skill !== 'string' || skill === '')
  ) {
    fail(`${preset.label} Pack manifest has an invalid DSH declaration`)
  }
  const skills = sortedUnique(pack.agent.skills, `${preset.label} Pack Skills`)

  const manifestPath = posix.join('dsh/presets', preset.id, 'preset.yml')
  const generatedManifest = await parseYamlFile(
    root,
    manifestPath,
    `${preset.label} Preset manifest`,
  )
  sameStructure(
    generatedManifest,
    { name: pack.display_name, description: pack.description },
    `${preset.label} Preset manifest`,
  )

  const sourceCompositionPath = posix.join(
    'packs',
    preset.id,
    relativeTarget(`./${pack.agent.dsh_source}`, `${preset.label} DSH source`),
  )
  const generatedCompositionPath = posix.join(
    'dsh/presets',
    preset.id,
    'agent.cordis.yml',
  )
  const [sourceComposition, generatedComposition] = await Promise.all([
    parseYamlFile(root, sourceCompositionPath, `${preset.label} Agent source`),
    parseYamlFile(
      root,
      generatedCompositionPath,
      `${preset.label} Agent composition`,
    ),
  ])
  sameStructure(
    generatedComposition,
    sourceComposition,
    `${preset.label} Agent composition`,
  )
  if (!Array.isArray(generatedComposition)) {
    fail(`${preset.label} Agent composition is not a row array`)
  }
  const providers = generatedComposition.filter(
    (row) => isRecord(row) && row.name === '@anban/dsh-plugin/skills-provider',
  )
  if (
    providers.length !== 1 ||
    !isRecord(providers[0].config) ||
    providers[0].config.presetId !== preset.id
  ) {
    fail(`${preset.label} Agent composition has an invalid Skills provider`)
  }

  const generatedSkillRoot = posix.join('dsh/presets', preset.id, 'skills')
  const generatedSkillEntries = await readdir(join(root, generatedSkillRoot), {
    withFileTypes: true,
  })
  const generatedSkills = []
  for (const entry of generatedSkillEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      fail(`${preset.label} generated Skill tree contains ${entry.name}`)
    }
    generatedSkills.push(entry.name)
  }
  sameStructure(
    generatedSkills.sort(),
    skills,
    `${preset.label} generated Skill tree`,
  )
  for (const skill of skills) await compareSkill(root, preset, skill)
}

export async function verifySourceIntegrity(packageRoot = PACKAGE_ROOT) {
  const root = resolve(packageRoot)
  const manifest = await parseJsonFile(root, 'package.json', 'package manifest')
  if (!isRecord(manifest)) fail('package manifest must be an object')
  sameStructure(manifest.files, FILES_CONTRACT, 'package files contract')

  if (!isRecord(manifest.exports)) fail('package manifest has no exports')
  sameStructure(manifest.exports, EXPORTS_CONTRACT, 'exact public exports')
  const targets = []
  for (const [name, value] of Object.entries(manifest.exports)) {
    exportTargets(value, `export ${name}`, targets)
  }
  for (const { label, target } of targets) {
    const path = relativeTarget(target, label)
    await requireRegularFile(root, path, label)
  }

  sameStructure(manifest.bin, BIN_CONTRACT, 'exact package bin')
  for (const [name, target] of Object.entries(manifest.bin)) {
    const path = relativeTarget(target, `bin ${name}`)
    await requireRegularFile(root, path, `bin ${name}`)
    const source = await readFile(join(root, path))
    if (!hasNodeShebang(source)) {
      fail(`bin ${name} must start with a Node shebang`)
    }
    if (process.platform !== 'win32') {
      const status = await lstat(join(root, path))
      if ((status.mode & 0o111) === 0) fail(`bin ${name} is not executable`)
    }
  }

  if (manifest.dsh?.bundle?.patch !== './dsh/cordis.patch.yml') {
    fail('package manifest does not declare the exact Cordis patch target')
  }
  const patch = await parseYamlFile(
    root,
    'dsh/cordis.patch.yml',
    'exact Cordis patch',
  )
  sameStructure(patch, CORDIS_PATCH, 'exact Cordis patch')
  for (const preset of PRESETS) await verifyPreset(root, preset)
}

export function parsePackResult(stdout) {
  let value
  try {
    value = JSON.parse(stdout)
  } catch {
    fail('pnpm pack must emit a single JSON result')
  }
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.filename !== 'string' ||
    !Array.isArray(value.files) ||
    value.files.some(
      (file) => !isRecord(file) || typeof file.path !== 'string',
    )
  ) {
    fail('pnpm pack must emit a single JSON result')
  }
  return {
    name: value.name,
    version: value.version,
    filename: value.filename,
    files: sortedUnique(
      value.files.map((file) => file.path),
      'pnpm pack inventory',
    ),
  }
}

export function verifyPackFileInventory(expectedFiles, actualFiles) {
  const expected = new Set(sortedUnique(expectedFiles, 'expected inventory'))
  const actual = new Set(sortedUnique(actualFiles, 'packed inventory'))
  const missing = [...expected].filter((path) => !actual.has(path)).sort()
  const unexpected = [...actual].filter((path) => !expected.has(path)).sort()
  if (missing.length > 0 || unexpected.length > 0) {
    const findings = []
    if (missing.length > 0) findings.push(`missing: ${missing.join(', ')}`)
    if (unexpected.length > 0) {
      findings.push(`unexpected: ${unexpected.join(', ')}`)
    }
    fail(`packed file inventory mismatch (${findings.join('; ')})`)
  }
}

function safeArchivePath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false
  }
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const segments = trimmed.split('/')
  return (
    trimmed.length > 0 &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..') &&
    posix.normalize(trimmed) === trimmed
  )
}

export function assertSafeArchiveEntries(entries) {
  for (const entry of entries) {
    if (!isRecord(entry) || !safeArchivePath(entry.path)) {
      fail(`archive contains an unsafe path: ${entry?.path ?? '<invalid>'}`)
    }
    const archivePath = entry.path.endsWith('/')
      ? entry.path.slice(0, -1)
      : entry.path
    if (archivePath !== 'package' && !archivePath.startsWith('package/')) {
      fail(`archive entry is outside the package root: ${entry.path}`)
    }
    if (entry.type === 'symlink' || entry.type === 'hardlink') {
      fail(`archive contains a ${entry.type}: ${entry.path}`)
    }
    if (entry.type !== 'file' && entry.type !== 'directory') {
      fail(`archive contains an unsafe entry type: ${entry.path}`)
    }
  }
}

function tarString(block, offset, length) {
  const end = block.indexOf(0, offset)
  return block
    .subarray(offset, end === -1 || end > offset + length ? offset + length : end)
    .toString('utf8')
}

function tarNumber(block, offset, length, label) {
  const field = block.subarray(offset, offset + length)
  if ((field[0] & 0x80) !== 0) {
    let value = BigInt(field[0] & 0x7f)
    for (const byte of field.subarray(1)) value = value * 256n + BigInt(byte)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail(`archive ${label} is too large`)
    return Number(value)
  }
  const source = field.toString('ascii').replace(/\0.*$/, '').trim()
  if (source === '') return 0
  if (!/^[0-7]+$/.test(source)) fail(`archive has an invalid ${label}`)
  return Number.parseInt(source, 8)
}

function parsePax(data) {
  const values = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space === -1) fail('archive has invalid PAX metadata')
    const length = Number.parseInt(data.subarray(offset, space).toString('ascii'), 10)
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > data.length) {
      fail('archive has invalid PAX metadata')
    }
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals <= 0) fail('archive has invalid PAX metadata')
    const key = record.slice(0, equals)
    if (key !== 'path' && key !== 'linkpath') {
      fail(`archive contains unsupported PAX key: ${key}`)
    }
    values[key] = record.slice(equals + 1)
    offset += length
  }
  return values
}

function resolvedArchiveLimits(overrides = {}) {
  const limits = { ...ARCHIVE_LIMITS, ...overrides }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      fail(`archive ${name} must be a positive safe integer`)
    }
  }
  return limits
}

function streamedInflatedReader(archivePath, maxInflatedBytes) {
  const source = createReadStream(archivePath)
  const gunzip = createGunzip()
  const iterator = source.pipe(gunzip)[Symbol.asyncIterator]()
  let buffered = Buffer.alloc(0)
  let bufferedOffset = 0
  let inflatedBytes = 0

  async function nextChunk() {
    const next = await iterator.next()
    if (next.done) return undefined
    inflatedBytes += next.value.length
    if (inflatedBytes > maxInflatedBytes) {
      source.destroy()
      gunzip.destroy()
      fail(`archive exceeds the inflated byte limit (${maxInflatedBytes})`)
    }
    return next.value
  }

  async function readExactly(size, { allowEnd = false } = {}) {
    const output = Buffer.allocUnsafe(size)
    let written = 0
    while (written < size) {
      if (bufferedOffset === buffered.length) {
        buffered = (await nextChunk()) ?? Buffer.alloc(0)
        bufferedOffset = 0
        if (buffered.length === 0) {
          if (allowEnd && written === 0) return undefined
          fail('archive ended before the current tar record')
        }
      }
      const available = Math.min(size - written, buffered.length - bufferedOffset)
      buffered.copy(output, written, bufferedOffset, bufferedOffset + available)
      bufferedOffset += available
      written += available
    }
    return output
  }

  async function requireZeroRemainder() {
    while (true) {
      if (bufferedOffset < buffered.length) {
        if (!buffered.subarray(bufferedOffset).every((byte) => byte === 0)) {
          fail('archive has non-zero data after its end marker')
        }
        bufferedOffset = buffered.length
      }
      buffered = (await nextChunk()) ?? Buffer.alloc(0)
      bufferedOffset = 0
      if (buffered.length === 0) return
    }
  }

  return {
    close() {
      source.destroy()
      gunzip.destroy()
    },
    readExactly,
    requireZeroRemainder,
  }
}

function tarEntryType(typeFlag) {
  if (typeFlag === '\0' || typeFlag === '0' || typeFlag === '7') return 'file'
  if (typeFlag === '5') return 'directory'
  if (typeFlag === '1') return 'hardlink'
  if (typeFlag === '2') return 'symlink'
  return `tar-${typeFlag}`
}

export async function inspectAndExtractArchive({
  archivePath,
  destination,
  executablePaths = [],
  expectedFiles,
  limits: limitOverrides,
}) {
  const limits = resolvedArchiveLimits(limitOverrides)
  const archiveStatus = await lstat(archivePath)
  if (!archiveStatus.isFile() || archiveStatus.isSymbolicLink()) {
    fail('packed artifact is not a regular file')
  }
  if (archiveStatus.size > limits.maxCompressedBytes) {
    fail(
      `archive exceeds the compressed byte limit (${limits.maxCompressedBytes})`,
    )
  }

  const expected = new Set(sortedUnique(expectedFiles, 'expected inventory'))
  const executables = new Set(
    sortedUnique(executablePaths, 'expected executable inventory'),
  )
  for (const executable of executables) {
    if (!expected.has(executable)) {
      fail(`expected executable is absent from inventory: ${executable}`)
    }
  }

  const reader = streamedInflatedReader(archivePath, limits.maxInflatedBytes)
  const seenEntries = new Set()
  const seenFiles = []
  let entryCount = 0
  let nextPax = {}
  await mkdir(destination)
  try {
    while (true) {
      const header = await reader.readExactly(512, { allowEnd: true })
      if (header === undefined) fail('archive has no tar end marker')
      if (header.every((byte) => byte === 0)) {
        const secondEndBlock = await reader.readExactly(512)
        if (!secondEndBlock.every((byte) => byte === 0)) {
          fail('archive has an invalid tar end marker')
        }
        await reader.requireZeroRemainder()
        break
      }

      entryCount += 1
      if (entryCount > limits.maxEntries) {
        fail(`archive exceeds the entry count limit (${limits.maxEntries})`)
      }
      const storedChecksum = tarNumber(header, 148, 8, 'checksum')
      let checksum = 0
      for (let index = 0; index < header.length; index += 1) {
        checksum += index >= 148 && index < 156 ? 0x20 : header[index]
      }
      if (checksum !== storedChecksum) {
        fail('archive has an invalid header checksum')
      }

      const size = tarNumber(header, 124, 12, 'entry size')
      const typeFlag = String.fromCharCode(header[156] || 0)
      const paxEntry = typeFlag === 'x'
      if (typeFlag === 'g') fail('archive contains unsupported global PAX metadata')
      const sizeLimit = paxEntry ? limits.maxPaxBytes : limits.maxEntryBytes
      if (size > sizeLimit) {
        fail(
          `archive exceeds the ${paxEntry ? 'PAX' : 'entry size'} limit (${sizeLimit})`,
        )
      }
      const data = await reader.readExactly(size)
      const padding = (512 - (size % 512)) % 512
      if (padding > 0) await reader.readExactly(padding)

      if (paxEntry) {
        if (Object.keys(nextPax).length > 0) {
          fail('archive contains consecutive PAX headers')
        }
        nextPax = parsePax(data)
        continue
      }

      const headerName = tarString(header, 0, 100)
      const prefix = tarString(header, 345, 155)
      const headerPath = prefix ? `${prefix}/${headerName}` : headerName
      const path = nextPax.path ?? headerPath
      const linkPath = nextPax.linkpath ?? tarString(header, 157, 100)
      nextPax = {}
      if (Buffer.byteLength(path) > limits.maxPathBytes) {
        fail(`archive exceeds the path length limit (${limits.maxPathBytes})`)
      }
      const entry = {
        linkPath,
        mode: tarNumber(header, 100, 8, 'entry mode'),
        path,
        type: tarEntryType(typeFlag),
      }
      assertSafeArchiveEntries([entry])
      const archivePathKey = path.endsWith('/') ? path.slice(0, -1) : path
      if (seenEntries.has(archivePathKey)) {
        fail(`archive contains duplicate entry: ${path}`)
      }
      seenEntries.add(archivePathKey)

      const output = join(destination, ...path.split('/'))
      const fromDestination = relative(destination, output)
      if (
        fromDestination === '' ||
        fromDestination === '..' ||
        fromDestination.startsWith(`..${sep}`) ||
        isAbsolute(fromDestination)
      ) {
        fail(`archive contains an unsafe path: ${path}`)
      }
      if (entry.type === 'directory') {
        await mkdir(output, { recursive: true })
        continue
      }

      const packagedPath = path.slice('package/'.length)
      if (!expected.has(packagedPath)) {
        fail(`packed file inventory mismatch (unexpected: ${packagedPath})`)
      }
      seenFiles.push(packagedPath)
      if (executables.has(packagedPath)) {
        if ((entry.mode & 0o111) === 0) {
          fail(`packed bin ${packagedPath} is not executable`)
        }
        if (!hasNodeShebang(data)) {
          fail(`packed bin ${packagedPath} must start with a Node shebang`)
        }
      }
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, data, { flag: 'wx' })
      await chmod(output, entry.mode & 0o777)
    }
    if (Object.keys(nextPax).length > 0) {
      fail('archive ends with unused PAX metadata')
    }
    verifyPackFileInventory([...expected], seenFiles)
    for (const executable of executables) {
      if (!seenFiles.includes(executable)) {
        fail(`packed executable is missing: ${executable}`)
      }
    }
    return { files: [...seenFiles].sort() }
  } catch (error) {
    await rm(destination, { force: true, recursive: true })
    if (
      error instanceof Error &&
      error.message.startsWith('Package integrity failed:')
    ) {
      throw error
    }
    fail('packed artifact is not a valid gzip archive')
  } finally {
    reader.close()
  }
}

async function filesFromContract(root, manifest) {
  const files = ['package.json']
  for (const declaration of manifest.files) {
    const recursive = declaration.match(/^(.*)\/\*\*(?:\/\*(\..+))?$/)
    if (recursive === null) {
      await requireRegularFile(root, declaration, `package files entry ${declaration}`)
      files.push(declaration)
      continue
    }
    const directory = recursive[1]
    const suffix = recursive[2]
    const children = await directoryFiles(
      root,
      directory,
      `package files entry ${declaration}`,
    )
    for (const child of children) {
      if (suffix === undefined || child.endsWith(suffix)) {
        files.push(posix.join(directory, child))
      }
    }
  }
  return sortedUnique(files, 'expected package inventory')
}

function pnpmInvocation(args) {
  const npmEntrypoint = process.env.npm_execpath
  return npmEntrypoint === undefined
    ? { command: 'pnpm', args }
    : { command: process.execPath, args: [npmEntrypoint, ...args] }
}

function childEnvironment() {
  const environment = {}
  for (const key of [
    'COMSPEC',
    'LANG',
    'LC_ALL',
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'WINDIR',
  ]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key]
  }
  return environment
}

function commandStartError(label, error) {
  const failure = new Error(
    `Package integrity failed: ${label} failed to start: ${error?.code ?? 'unknown error'}`,
    { cause: error },
  )
  if (error?.code !== undefined) failure.code = error.code
  return failure
}

function terminateWindowsTree(pid, force) {
  return new Promise((resolveTermination) => {
    const args = ['/PID', String(pid), '/T']
    if (force) args.push('/F')
    const killer = spawn('taskkill', args, {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.once('error', resolveTermination)
    killer.once('close', resolveTermination)
  })
}

function signalProcessTree(child, signal) {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    void terminateWindowsTree(child.pid, signal === 'SIGKILL')
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') child.kill(signal)
  }
}

function runBoundedCommand(
  command,
  args,
  { cwd, environment = childEnvironment(), label, timeoutMs },
) {
  return new Promise((resolveCommand, rejectCommand) => {
    let child
    try {
      child = spawn(command, args, {
        cwd,
        detached: process.platform !== 'win32',
        env: environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      rejectCommand(commandStartError(label, error))
      return
    }

    const stdout = []
    const stderr = []
    let outputBytes = 0
    let terminationReason
    let graceTimer
    let watchdogTimer
    let settled = false

    const timeoutTimer = setTimeout(() => {
      beginTermination('timeout')
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timeoutTimer)
      clearTimeout(graceTimer)
      clearTimeout(watchdogTimer)
    }

    function rejectOnce(error) {
      if (settled) return
      settled = true
      cleanup()
      rejectCommand(error)
    }

    function beginTermination(reason) {
      if (terminationReason !== undefined || settled) return
      terminationReason = reason
      clearTimeout(timeoutTimer)
      signalProcessTree(child, 'SIGTERM')
      graceTimer = setTimeout(() => {
        signalProcessTree(child, 'SIGKILL')
      }, CHILD_TERMINATION_GRACE_MS)
      watchdogTimer = setTimeout(() => {
        rejectOnce(
          new Error(
            `Package integrity failed: ${label} did not exit after forced termination`,
          ),
        )
      }, CHILD_CLOSE_WATCHDOG_MS)
    }

    function capture(chunks, chunk) {
      if (terminationReason !== undefined) return
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      outputBytes += data.length
      if (outputBytes > CHILD_MAX_BUFFER) {
        beginTermination('output')
        return
      }
      chunks.push(data)
    }

    child.stdout.on('data', (chunk) => capture(stdout, chunk))
    child.stderr.on('data', (chunk) => capture(stderr, chunk))
    child.once('error', (error) => {
      rejectOnce(commandStartError(label, error))
    })
    child.once('close', (status, signal) => {
      if (settled) return
      settled = true
      cleanup()
      if (terminationReason === 'timeout') {
        rejectCommand(
          new Error(
            `Package integrity failed: ${label} timed out after ${timeoutMs}ms`,
          ),
        )
        return
      }
      if (terminationReason === 'output') {
        rejectCommand(
          new Error(
            `Package integrity failed: ${label} exceeded the output byte limit (${CHILD_MAX_BUFFER})`,
          ),
        )
        return
      }
      resolveCommand({
        signal,
        status,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      })
    })
  })
}

async function runPackCommand(root, destination) {
  const invocation = pnpmInvocation([
    'pack',
    '--json',
    '--pack-destination',
    destination,
  ])
  const result = await runBoundedCommand(invocation.command, invocation.args, {
    cwd: root,
    environment: process.env,
    label: 'pnpm pack',
    timeoutMs: COMMAND_TIMEOUT_MS,
  })
  if (result.status !== 0) fail(`pnpm pack exited ${result.status ?? 1}`)
  return result.stdout
}

export async function verifyInstalledPackage(
  sandboxRoot,
  {
    childTimeoutMs = CHILD_TIMEOUT_MS,
    runCommand = runBoundedCommand,
  } = {},
) {
  const packageDirectory = join(
    sandboxRoot,
    'node_modules',
    '@anban',
    'dsh-plugin',
  )
  const manifest = await parseJsonFile(
    packageDirectory,
    'package.json',
    'installed package manifest',
  )
  const checkPath = join(sandboxRoot, '.package-integrity-check.mjs')
  await writeFile(
    checkPath,
    `import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
await Promise.all([
${PUBLIC_CODE_EXPORTS.map((name) => `  import('@anban/dsh-plugin/${name.slice(2)}'),`).join('\n')}
])
const require = createRequire(import.meta.url)
const manifestPath = require.resolve('@anban/dsh-plugin/package.json')
JSON.parse(await readFile(manifestPath, 'utf8'))
`,
  )
  const imported = await runCommand(process.execPath, [checkPath], {
    cwd: sandboxRoot,
    label: 'public export smoke',
    timeoutMs: childTimeoutMs,
  })
  if (imported.status !== 0) {
    fail(`public export smoke failed with exit ${imported.status ?? 1}`)
  }

  const binTarget = manifest.bin?.['anban-dsh']
  const binPath = join(
    packageDirectory,
    relativeTarget(binTarget, 'installed bin anban-dsh'),
  )
  await requireRegularFile(
    packageDirectory,
    relative(packageDirectory, binPath),
    'installed bin anban-dsh',
  )
  const binSource = await readFile(binPath)
  if (!hasNodeShebang(binSource)) {
    fail('installed bin anban-dsh must start with a Node shebang')
  }
  if (process.platform !== 'win32') {
    const status = await lstat(binPath)
    if ((status.mode & 0o111) === 0) {
      fail('installed bin anban-dsh is not executable')
    }
  }

  let cli
  if (process.platform === 'win32') {
    cli = await runCommand(
      process.execPath,
      [binPath, '--package-integrity-smoke'],
      {
        cwd: sandboxRoot,
        label: 'packaged CLI smoke',
        timeoutMs: childTimeoutMs,
      },
    )
  } else {
    try {
      cli = await runCommand(binPath, ['--package-integrity-smoke'], {
        cwd: sandboxRoot,
        label: 'packaged CLI smoke',
        timeoutMs: childTimeoutMs,
      })
    } catch (error) {
      if (error?.code !== 'EACCES') throw error
      cli = await runCommand(
        process.execPath,
        [binPath, '--package-integrity-smoke'],
        {
          cwd: sandboxRoot,
          label: 'packaged CLI smoke via Node',
          timeoutMs: childTimeoutMs,
        },
      )
    }
  }
  if (
    cli.status !== 2 ||
    cli.stdout !== '' ||
    cli.stderr !== 'anban-dsh: invalid command\n'
  ) {
    fail(`packaged CLI smoke returned an unexpected result`)
  }
}

async function installPackedRuntime(sandboxRoot, tarball, manifest) {
  const runtimeRoot = join(sandboxRoot, 'runtime')
  await mkdir(runtimeRoot)
  if (!isRecord(manifest.peerDependencies)) {
    fail('package manifest has no peerDependencies')
  }
  const tarballReference = relative(runtimeRoot, tarball).split(sep).join('/')
  await writeFile(
    join(runtimeRoot, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          [manifest.name]: `file:${tarballReference}`,
          ...manifest.peerDependencies,
        },
      },
      null,
      2,
    )}\n`,
  )
  const invocation = pnpmInvocation([
    'install',
    '--offline',
    '--ignore-scripts',
    '--lockfile=false',
  ])
  const installed = await runBoundedCommand(invocation.command, invocation.args, {
    cwd: runtimeRoot,
    environment: process.env,
    label: 'offline runtime install',
    timeoutMs: COMMAND_TIMEOUT_MS,
  })
  if (installed.status !== 0) {
    fail(`offline runtime install exited ${installed.status ?? 1}`)
  }
  return runtimeRoot
}

export async function verifyPackedArtifact(packageRoot = PACKAGE_ROOT) {
  const root = resolve(packageRoot)
  await verifySourceIntegrity(root)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'anban-dsh-pack-'))
  try {
    const result = parsePackResult(await runPackCommand(root, temporaryRoot))
    const manifest = await parseJsonFile(root, 'package.json', 'package manifest')
    if (result.name !== manifest.name || result.version !== manifest.version) {
      fail('pnpm pack metadata does not match package.json')
    }
    const tarball = resolve(
      isAbsolute(result.filename)
        ? result.filename
        : join(temporaryRoot, result.filename),
    )
    const expectedTarball = join(temporaryRoot, basename(result.filename))
    if (tarball !== expectedTarball) {
      fail('pnpm pack returned an unsafe tarball filename')
    }
    await requireRegularFile(
      temporaryRoot,
      basename(result.filename),
      'packed artifact',
    )
    const expectedFiles = await filesFromContract(root, manifest)
    verifyPackFileInventory(expectedFiles, result.files)

    const extractionRoot = join(temporaryRoot, 'extracted')
    await inspectAndExtractArchive({
      archivePath: tarball,
      destination: extractionRoot,
      executablePaths: Object.values(manifest.bin).map((target) =>
        relativeTarget(target, 'package bin'),
      ),
      expectedFiles: result.files,
    })
    const runtimeRoot = await installPackedRuntime(
      temporaryRoot,
      tarball,
      manifest,
    )
    await verifyInstalledPackage(runtimeRoot)
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

async function main() {
  const mode = process.argv[2]
  if (mode === 'source') {
    await verifySourceIntegrity()
  } else if (mode === 'pack') {
    await verifyPackedArtifact()
    process.stdout.write('DSH packed artifact integrity verified\n')
  } else {
    fail('usage: package-integrity.mjs <source|pack>')
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Package integrity failed'}\n`)
    process.exitCode = 1
  }
}
