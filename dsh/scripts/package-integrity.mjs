import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
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
const PUBLIC_CODE_EXPORTS = [
  './anban-mcp',
  './preset-manager',
  './skills-provider',
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
  if (manifest.exports['./package.json'] !== './package.json') {
    fail('package.json export is missing or invalid')
  }
  const targets = []
  for (const [name, value] of Object.entries(manifest.exports)) {
    exportTargets(value, `export ${name}`, targets)
  }
  for (const { label, target } of targets) {
    const path = relativeTarget(target, label)
    await requireRegularFile(root, path, label)
  }

  if (!isRecord(manifest.bin) || Object.keys(manifest.bin).length === 0) {
    fail('package manifest has no bin')
  }
  for (const [name, target] of Object.entries(manifest.bin)) {
    const path = relativeTarget(target, `bin ${name}`)
    await requireRegularFile(root, path, `bin ${name}`)
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
    values[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return values
}

function parseTarArchive(compressed) {
  let archive
  try {
    archive = gunzipSync(compressed)
  } catch {
    fail('packed artifact is not a valid gzip archive')
  }
  const entries = []
  let offset = 0
  let globalPax = {}
  let nextPax = {}
  let longPath
  let longLink
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const storedChecksum = tarNumber(header, 148, 8, 'checksum')
    let checksum = 0
    for (let index = 0; index < header.length; index += 1) {
      checksum += index >= 148 && index < 156 ? 0x20 : header[index]
    }
    if (checksum !== storedChecksum) fail('archive has an invalid header checksum')

    const size = tarNumber(header, 124, 12, 'entry size')
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > archive.length) fail('archive entry exceeds the archive bounds')
    const data = archive.subarray(dataStart, dataEnd)
    const typeFlag = String.fromCharCode(header[156] || 0)
    const headerName = tarString(header, 0, 100)
    const prefix = tarString(header, 345, 155)
    const headerPath = prefix ? `${prefix}/${headerName}` : headerName

    if (typeFlag === 'x' || typeFlag === 'g') {
      const pax = parsePax(data)
      if (typeFlag === 'g') globalPax = { ...globalPax, ...pax }
      else nextPax = pax
    } else if (typeFlag === 'L') {
      longPath = tarString(data, 0, data.length)
    } else if (typeFlag === 'K') {
      longLink = tarString(data, 0, data.length)
    } else {
      const metadata = { ...globalPax, ...nextPax }
      const path = metadata.path ?? longPath ?? headerPath
      const linkPath = metadata.linkpath ?? longLink ?? tarString(header, 157, 100)
      let type
      if (typeFlag === '\0' || typeFlag === '0' || typeFlag === '7') type = 'file'
      else if (typeFlag === '5') type = 'directory'
      else if (typeFlag === '1') type = 'hardlink'
      else if (typeFlag === '2') type = 'symlink'
      else type = `tar-${typeFlag}`
      entries.push({
        data,
        linkPath,
        mode: tarNumber(header, 100, 8, 'entry mode'),
        path,
        type,
      })
      nextPax = {}
      longPath = undefined
      longLink = undefined
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  assertSafeArchiveEntries(entries)
  return entries
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

function runPackCommand(root, destination) {
  const npmEntrypoint = process.env.npm_execpath
  const command = npmEntrypoint === undefined ? 'pnpm' : process.execPath
  const prefix = npmEntrypoint === undefined ? [] : [npmEntrypoint]
  const result = spawnSync(
    command,
    [...prefix, 'pack', '--json', '--pack-destination', destination],
    {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr)
    fail(`pnpm pack exited ${result.status ?? 1}`)
  }
  return result.stdout
}

async function extractArchive(entries, destination) {
  await mkdir(destination)
  for (const entry of entries) {
    const output = join(destination, ...entry.path.split('/'))
    const fromDestination = relative(destination, output)
    if (
      fromDestination === '' ||
      fromDestination === '..' ||
      fromDestination.startsWith(`..${sep}`) ||
      isAbsolute(fromDestination)
    ) {
      fail(`archive contains an unsafe path: ${entry.path}`)
    }
    if (entry.type === 'directory') {
      await mkdir(output, { recursive: true })
    } else {
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, entry.data, { flag: 'wx' })
      await chmod(output, entry.mode & 0o777)
    }
  }
}

async function verifyExtractedPackage(packageDirectory) {
  const checkPath = join(packageDirectory, '.package-integrity-check.mjs')
  await writeFile(
    checkPath,
    `import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
await Promise.all([
  import('@anban/dsh-plugin/anban-mcp'),
  import('@anban/dsh-plugin/preset-manager'),
  import('@anban/dsh-plugin/skills-provider'),
])
const require = createRequire(import.meta.url)
const manifestPath = require.resolve('@anban/dsh-plugin/package.json')
JSON.parse(await readFile(manifestPath, 'utf8'))
`,
  )
  const imported = spawnSync(process.execPath, [checkPath], {
    cwd: packageDirectory,
    encoding: 'utf8',
    env: process.env,
    shell: false,
  })
  if (imported.error !== undefined) throw imported.error
  if (imported.status !== 0) {
    fail(`public export smoke exited ${imported.status ?? 1}: ${imported.stderr.trim()}`)
  }

  const cli = spawnSync(
    process.execPath,
    [join(packageDirectory, 'dsh/bin/anban-dsh.js'), '--package-integrity-smoke'],
    {
      cwd: packageDirectory,
      encoding: 'utf8',
      env: process.env,
      shell: false,
    },
  )
  if (cli.error !== undefined) throw cli.error
  if (
    cli.status !== 2 ||
    cli.stdout !== '' ||
    cli.stderr !== 'anban-dsh: invalid command\n'
  ) {
    fail(`packaged CLI smoke returned an unexpected result`)
  }
}

export async function verifyPackedArtifact(packageRoot = PACKAGE_ROOT) {
  const root = resolve(packageRoot)
  await verifySourceIntegrity(root)
  const temporaryRoot = await mkdtemp(join(root, '.anban-dsh-pack-'))
  try {
    const result = parsePackResult(runPackCommand(root, temporaryRoot))
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

    const entries = parseTarArchive(await readFile(tarball))
    const archiveFiles = entries
      .filter((entry) => entry.type === 'file')
      .map((entry) => {
        if (!entry.path.startsWith('package/')) {
          fail(`archive entry is outside the package root: ${entry.path}`)
        }
        return entry.path.slice('package/'.length)
      })
    verifyPackFileInventory(result.files, archiveFiles)

    const extractionRoot = join(temporaryRoot, 'extracted')
    await extractArchive(entries, extractionRoot)
    await verifyExtractedPackage(join(extractionRoot, 'package'))
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
