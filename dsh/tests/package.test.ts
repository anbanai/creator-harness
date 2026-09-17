import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import {
  chmod,
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageUrl = new URL('../../package.json', import.meta.url)
const workspaceUrl = new URL('../../pnpm-workspace.yaml', import.meta.url)
const installationGuideUrl = new URL(
  '../../docs/dsh-installation.md',
  import.meta.url,
)
const readmeUrl = new URL('../../README.md', import.meta.url)
const changelogUrl = new URL('../../CHANGELOG.md', import.meta.url)
const cordisPatchUrl = new URL('../cordis.patch.yml', import.meta.url)
const cliShimPath = fileURLToPath(
  new URL('../bin/anban-dsh.js', import.meta.url),
)
const builtLibPath = fileURLToPath(new URL('../lib/', import.meta.url))
const packageRootPath = fileURLToPath(new URL('../../', import.meta.url))
const integrityScriptUrl = new URL(
  '../scripts/package-integrity.mjs',
  import.meta.url,
)
const {
  assertSafeArchiveEntries,
  buildRuntimeInstallManifest,
  buildRuntimeWorkspaceManifest,
  commandFailureDiagnostic,
  inspectAndExtractArchive,
  parsePackResult,
  runBoundedCommand,
  verifyPackFileInventory,
  verifyInstalledPackage,
  verifySourceIntegrity,
} = await import(integrityScriptUrl.href)

describe('packed runtime installation', () => {
  it('pins shared transitive dependencies used by the verified runtime', () => {
    expect(
      buildRuntimeInstallManifest(
        {
          name: '@anban/dsh-plugin',
          peerDependencies: {
            '@deepseek-ai/cordis': '4.0.2',
          },
        },
        '../anban-dsh-plugin-4.2.0.tgz',
      ),
    ).toEqual({
      private: true,
      type: 'module',
      dependencies: {
        '@anban/dsh-plugin': 'file:../anban-dsh-plugin-4.2.0.tgz',
        '@deepseek-ai/cordis': '4.0.2',
      },
    })
    expect(buildRuntimeWorkspaceManifest()).toEqual({
      overrides: {
        yaml: '2.9.0',
        zod: '4.4.3',
      },
    })
  })

  it('reports only a package-manager error code from failed install output', () => {
    expect(
      commandFailureDiagnostic(
        'credential=https://secret.example/token\n[ERR_PNPM_NO_OFFLINE_TARBALL] missing',
      ),
    ).toBe(' (ERR_PNPM_NO_OFFLINE_TARBALL)')
    expect(commandFailureDiagnostic('unstructured private diagnostic')).toBe('')
  })
})

interface TarEntryFixture {
  content?: Buffer | string
  corruptChecksum?: boolean
  linkName?: string
  mode?: number
  name: string
  type?: string
}

function writeTarText(
  header: Buffer,
  value: string,
  offset: number,
  length: number,
) {
  header.write(value, offset, length, 'utf8')
}

function writeTarNumber(
  header: Buffer,
  value: number,
  offset: number,
  length: number,
) {
  writeTarText(
    header,
    value.toString(8).padStart(length - 1, '0'),
    offset,
    length - 1,
  )
}

function tarGzip(entries: readonly TarEntryFixture[]) {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content ?? '')
    const header = Buffer.alloc(512)
    writeTarText(header, entry.name, 0, 100)
    writeTarNumber(header, entry.mode ?? 0o644, 100, 8)
    writeTarNumber(header, 0, 108, 8)
    writeTarNumber(header, 0, 116, 8)
    writeTarNumber(header, content.length, 124, 12)
    writeTarNumber(header, 0, 136, 12)
    header.fill(0x20, 148, 156)
    header[156] = (entry.type ?? '0').charCodeAt(0)
    writeTarText(header, entry.linkName ?? '', 157, 100)
    writeTarText(header, 'ustar\0', 257, 6)
    writeTarText(header, '00', 263, 2)
    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    writeTarText(header, checksum.toString(8).padStart(6, '0'), 148, 6)
    header[154] = 0
    header[155] = 0x20
    if (entry.corruptChecksum) header[0] = (header[0] ?? 0) ^ 1
    blocks.push(header, content)
    const padding = (512 - (content.length % 512)) % 512
    if (padding > 0) blocks.push(Buffer.alloc(padding))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

function paxRecord(key: string, value: string) {
  const payload = `${key}=${value}\n`
  let length = Buffer.byteLength(payload) + 3
  while (true) {
    const record = `${length} ${payload}`
    const actual = Buffer.byteLength(record)
    if (actual === length) return record
    length = actual
  }
}

function publishedRuntimeFindings(source: string) {
  const findings: string[] = []
  const lower = source.toLowerCase()
  if (lower.includes('create_task')) findings.push('create_task')
  if (
    /mcp[_-]?(?:url|endpoint)\s*[:=][^\n]*(?:process\.env|config|options|credentialref)/i.test(
      source,
    )
  ) {
    findings.push('configurable MCP endpoint')
  }
  for (const marker of [
    'anban_mcp_url',
    'anban_mcp_endpoint',
    'mcp_endpoint',
    'leaked-secret',
    'resolved-secret',
    'fake-secret',
    'test-secret',
  ]) {
    if (lower.includes(marker)) findings.push(marker)
  }
  for (const match of source.matchAll(
    /(?:api[_-]?key|token|secret)\s*[:=]\s*["'`][^"'`]+["'`]/gi,
  )) {
    if (!match[0].includes('ANBAN_API_KEY')) {
      findings.push('literal credential assignment')
    }
  }
  for (const line of source.split(/\r?\n/)) {
    if (
      /authorization/i.test(line) &&
      /bearer\s/i.test(line) &&
      !line.includes('Bearer ${resolved.value}')
    ) {
      findings.push('serialized Authorization header')
    }
  }
  return findings
}

function bashBlockUnder(source: string, heading: string) {
  const sectionStart = source.indexOf(`${heading}\n`)
  expect(sectionStart, `missing ${heading}`).toBeGreaterThanOrEqual(0)
  const nextSection = source.indexOf('\n## ', sectionStart + heading.length)
  const section = source.slice(
    sectionStart,
    nextSection === -1 ? undefined : nextSection,
  )
  const match = section.match(/```bash\n([^`]+)```/)
  expect(match, `missing bash block under ${heading}`).not.toBeNull()
  const block = match?.[1]
  if (block === undefined) return []
  return block.trim().split('\n')
}

function shellWords(line: string) {
  const words: string[] = []
  let word = ''
  let wordStarted = false
  let quote: '"' | "'" | undefined
  let ambiguous = false
  const flush = () => {
    if (wordStarted) words.push(word)
    word = ''
    wordStarted = false
  }

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? ''
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined
      } else if (quote === '"' && character === '\\') {
        const escaped = line[index + 1]
        if (escaped === undefined) ambiguous = true
        else {
          word += escaped
          index += 1
        }
      } else {
        word += character
      }
      wordStarted = true
      continue
    }
    if (/\s/.test(character)) {
      flush()
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      wordStarted = true
      continue
    }
    if (character === '\\') {
      const escaped = line[index + 1]
      if (escaped === undefined) ambiguous = true
      else {
        word += escaped
        wordStarted = true
        index += 1
      }
      continue
    }
    if (character === ';' || character === '&' || character === '|') {
      flush()
      const doubled = line[index + 1] === character && character !== ';'
      words.push(doubled ? character + character : character)
      if (doubled) index += 1
      continue
    }
    word += character
    wordStarted = true
  }
  if (quote !== undefined) ambiguous = true
  flush()
  return { ambiguous, words }
}

function expandDocVariables(value: string, variables: Map<string, string>) {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, bare) => {
    return variables.get(braced ?? bare) ?? match
  })
}

function shellLogicalLines(block: string) {
  const logicalLines: string[] = []
  let current = ''
  for (const rawLine of block.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    const continued = trimmed.endsWith('\\')
    const fragment = continued ? trimmed.slice(0, -1).trimEnd() : trimmed
    current = [current, fragment].filter(Boolean).join(' ')
    if (!continued && current !== '') {
      logicalLines.push(current)
      current = ''
    }
  }
  if (current !== '') logicalLines.push(current)
  return logicalLines
}

function documentedPluginAddFindings(source: string) {
  const findings: string[] = []
  const variables = new Map<string, string>()
  const shellBlocks = source.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)

  for (const block of shellBlocks) {
    for (const line of shellLogicalLines(block[1] ?? '')) {
      const assignment = /^([A-Z_][A-Z0-9_]*)=["']([^"']*)["']$/.exec(line)
      if (assignment !== null) {
        variables.set(assignment[1] ?? '', assignment[2] ?? '')
        continue
      }

      const commandLine = line.replace(/^\$\s+/, '')
      const { ambiguous, words } = shellWords(commandLine)
      let sawAddSequence = false
      for (let commandIndex = 0; commandIndex + 1 < words.length; commandIndex += 1) {
        if (words[commandIndex] !== 'dsh' || words[commandIndex + 1] !== 'plugin') {
          continue
        }
        let commandEnd = words.length
        for (let index = commandIndex + 2; index < words.length; index += 1) {
          if ([';', '&', '&&', '|', '||'].includes(words[index] ?? '')) {
            commandEnd = index
            break
          }
        }
        const addIndex = words.indexOf('add', commandIndex + 2)
        if (addIndex === -1 || addIndex >= commandEnd) continue
        sawAddSequence = true
        if (ambiguous) {
          findings.push(`${line}: ambiguous shell tokenization`)
          break
        }
        const rawSpecifier = words[addIndex + 1]
        if (rawSpecifier === undefined || addIndex + 1 >= commandEnd) {
          findings.push(`${line}: missing add specifier`)
          continue
        }
        const specifier = expandDocVariables(rawSpecifier, variables)
        const npmPackage =
          /^@anban\/dsh-plugin@(?:replace-with-published-version|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.test(
            specifier,
          )
        const localTarballPattern =
          /(?:^|[/\\])anban-dsh-plugin-(?:replace-with-published-version|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\.tgz$/
        const fileTarball =
          specifier.startsWith('file:') &&
          localTarballPattern.test(specifier.slice('file:'.length))
        const releaseTarballMatch =
          /^https:\/\/github\.com\/anbanai\/anban-creator\/releases\/download\/v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\/anban-dsh-plugin-((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\.tgz$/.exec(
            specifier,
          )
        const releaseTarball =
          releaseTarballMatch !== null &&
          releaseTarballMatch[1] === releaseTarballMatch[2]
        const localTarball =
          !specifier.startsWith('file:') &&
          !specifier.includes('://') &&
          localTarballPattern.test(specifier)
        const tarball = fileTarball || releaseTarball || localTarball
        const gitMatch =
          /^git\+https:\/\/github\.com\/anbanai\/creator-harness\.git#(.+)$/.exec(
            specifier,
          )
        const gitRef = gitMatch?.[1]
        const immutableGit =
          gitRef !== undefined &&
          (gitRef === 'replace-with-immutable-tag-or-full-40-character-commit' ||
            /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(gitRef) ||
            /^[0-9a-f]{40}$/.test(gitRef))

        if (!npmPackage && !tarball && !immutableGit) {
          findings.push(`${line}: unsupported add specifier ${specifier}`)
        }
      }
      if (
        ambiguous &&
        !sawAddSequence &&
        /\bdsh\s+plugin\b.*\badd\b/.test(commandLine)
      ) {
        findings.push(`${line}: ambiguous shell tokenization`)
      }
    }
  }

  return findings
}

async function createShimFixture(cliSource?: string) {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-shim-'))
  const binDir = join(root, 'dsh', 'bin')
  const shimPath = join(binDir, 'anban-dsh.js')

  await mkdir(binDir, { recursive: true })
  await copyFile(cliShimPath, shimPath)
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n')

  if (cliSource !== undefined) {
    const libDir = join(root, 'dsh', 'lib')
    await mkdir(libDir, { recursive: true })
    await writeFile(join(libDir, 'cli.js'), cliSource)
  }

  return { root, shimPath }
}

async function createIntegrityFixture() {
  const fixtureParent = await mkdtemp(join(tmpdir(), 'anban-dsh-integrity-'))
  const root = join(fixtureParent, 'package')
  await mkdir(root)
  await copyFile(join(packageRootPath, 'package.json'), join(root, 'package.json'))
  for (const directory of ['dsh', 'packs', 'skills']) {
    await cp(join(packageRootPath, directory), join(root, directory), {
      recursive: true,
    })
  }
  return { fixtureParent, root }
}

async function createInstalledPackageFixture({
  cliSource =
    `#!/usr/bin/env node\n` +
    `process.stderr.write('anban-dsh: invalid command\\n')\n` +
    `process.exitCode = 2\n`,
  exportSources = {},
}: {
  cliSource?: string
  exportSources?: Partial<
    Record<'anban-mcp' | 'preset-manager' | 'skills-provider', string>
  >
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-runtime-'))
  const packageDirectory = join(
    root,
    'node_modules',
    '@anban',
    'dsh-plugin',
  )
  await mkdir(join(packageDirectory, 'dsh', 'lib'), { recursive: true })
  await mkdir(join(packageDirectory, 'dsh', 'bin'), { recursive: true })
  await writeFile(
    join(packageDirectory, 'package.json'),
    JSON.stringify({
      name: '@anban/dsh-plugin',
      version: '1.0.0',
      type: 'module',
      bin: { 'anban-dsh': './dsh/bin/anban-dsh.js' },
      exports: {
        './anban-mcp': './dsh/lib/anban-mcp.js',
        './preset-manager': './dsh/lib/preset-manager.js',
        './skills-provider': './dsh/lib/skills-provider.js',
        './package.json': './package.json',
      },
    }),
  )
  for (const exportName of [
    'anban-mcp',
    'preset-manager',
    'skills-provider',
  ] as const) {
    await writeFile(
      join(packageDirectory, 'dsh', 'lib', `${exportName}.js`),
      exportSources[exportName] ?? 'export const loaded = true\n',
    )
  }
  const binPath = join(packageDirectory, 'dsh', 'bin', 'anban-dsh.js')
  await writeFile(binPath, cliSource)
  await chmod(binPath, 0o755)
  return { packageDirectory, root }
}

async function createArchiveFixture(entries: readonly TarEntryFixture[]) {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-archive-'))
  const archivePath = join(root, 'fixture.tgz')
  const destination = join(root, 'extracted')
  await writeFile(archivePath, tarGzip(entries))
  return { archivePath, destination, root }
}

function processExists(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
}

async function expectProcessTreeGone(pids: readonly number[]) {
  const deadline = Date.now() + 2_000
  while (pids.some(processExists) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  expect(pids.filter(processExists)).toEqual([])
}

describe('DSH package manifest', () => {
  it('declares the exact publishing and build contract', async () => {
    const manifest = JSON.parse(await readFile(packageUrl, 'utf8'))

    expect({
      name: manifest.name,
      version: manifest.version,
      type: manifest.type,
      engines: manifest.engines,
      packageManager: manifest.packageManager,
      dsh: manifest.dsh,
      bin: manifest.bin,
      files: manifest.files,
      scripts: manifest.scripts,
      exports: manifest.exports,
      dependencies: manifest.dependencies,
      peerDependencies: manifest.peerDependencies,
      devDependencies: manifest.devDependencies,
    }).toEqual({
      name: '@anban/dsh-plugin',
      version: '4.2.0',
      type: 'module',
      engines: {
        node: '>=22.19.0 <23 || >=24.0.0',
      },
      packageManager: 'pnpm@11.19.0',
      dsh: {
        bundle: {
          patch: './dsh/cordis.patch.yml',
        },
      },
      bin: {
        'anban-dsh': './dsh/bin/anban-dsh.js',
      },
      files: [
        'dsh/cordis.patch.yml',
        'dsh/lib/**/*.js',
        'dsh/lib/**/*.d.ts',
        'dsh/bin/anban-dsh.js',
        'dsh/presets/**',
        'docs/dsh-installation.md',
        'README.md',
        'CHANGELOG.md',
        'LICENSE',
      ],
      scripts: {
        clean: 'node dsh/scripts/clean.mjs',
        build: 'pnpm run clean && tsc -p tsconfig.json',
        typecheck:
          'tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit',
        test: 'vitest run',
        prepare: 'pnpm run build',
        prepack: 'pnpm run build && pnpm run verify:source',
        'verify:source': 'node dsh/scripts/package-integrity.mjs source',
        'verify:pack': 'node dsh/scripts/package-integrity.mjs pack',
        'smoke:profile': 'node dsh/scripts/smoke-profile.mjs',
        check:
          'pnpm run typecheck && pnpm run build && pnpm run test && pnpm run verify:pack && pnpm run smoke:profile',
      },
      exports: {
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
      },
      dependencies: {
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh-agent-instructions': '0.1.5-rc.2',
        '@deepseek-ai/dsh-commands': '0.1.5-rc.2',
        '@deepseek-ai/dsh-credentials': '0.1.5-rc.2',
        '@deepseek-ai/dsh-home-paths': '0.1.5-rc.2',
        '@deepseek-ai/dsh-mcp-client': '0.1.5-rc.2',
        '@deepseek-ai/dsh-persona': '0.1.5-rc.2',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-bash': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-fs': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-fs-search': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-pwsh': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-skill': '0.1.5-rc.2',
        '@deepseek-ai/dsh-tool-todo': '0.1.5-rc.2',
      },
      peerDependencies: {
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh-commands': '0.1.5-rc.2',
        '@deepseek-ai/dsh-credentials': '0.1.5-rc.2',
        '@deepseek-ai/dsh-home-paths': '0.1.5-rc.2',
        '@deepseek-ai/dsh-mcp-client': '0.1.5-rc.2',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.5-rc.2',
      },
      devDependencies: {
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh': '0.1.5-rc.2',
        '@deepseek-ai/dsh-agent-presets': '0.1.5-rc.2',
        '@deepseek-ai/dsh-commands': '0.1.5-rc.2',
        '@deepseek-ai/dsh-credentials': '0.1.5-rc.2',
        '@deepseek-ai/dsh-home-paths': '0.1.5-rc.2',
        '@deepseek-ai/dsh-mcp-client': '0.1.5-rc.2',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.5-rc.2',
        '@types/node': '22.20.0',
        'cross-spawn': '7.0.6',
        'js-yaml': '4.3.1',
        typescript: '6.0.3',
        vitest: '4.1.8',
      },
    })
  })

  it('packages the article marketing scanner at the DSH adapter path', async () => {
    const manifest = JSON.parse(await readFile(packageUrl, 'utf8'))
    const skill = await readFile(
      new URL(
        '../presets/article/skills/content-writing/SKILL.md',
        import.meta.url,
      ),
      'utf8',
    )
    const agent = await readFile(
      new URL('../presets/article/agent.cordis.yml', import.meta.url),
      'utf8',
    )
    const scanner = await readFile(
      new URL(
        '../presets/article/skills/content-writing/scripts/scan-article-marketing.mjs',
        import.meta.url,
      ),
      'utf8',
    )

    expect(manifest.files).not.toContain('scripts/scan-article-marketing.mjs')
    expect(scanner).toContain('createHash("sha256")')
    expect(agent).toContain(
      '"$DSH_HOME/.agent-presets/article/skills/content-writing/scripts/scan-article-marketing.mjs"',
    )
    expect(agent).not.toContain('$CLAUDE_PLUGIN_ROOT')
    expect(skill).not.toContain('$CLAUDE_PLUGIN_ROOT')
  })

  it('approves the exact dependency build scripts required by the DSH runtime', async () => {
    expect(await readFile(workspaceUrl, 'utf8')).toBe(`allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': true
  koffi: true
  node-pty: true
  protobufjs: true
`)
  })

  it('ships the exact two-entry Cordis host patch', async () => {
    expect(await readFile(cordisPatchUrl, 'utf8')).toBe(`- insert:
    - id: anban-mcp
      name: '@anban/dsh-plugin/anban-mcp'
    - id: anban-preset-manager
      name: '@anban/dsh-plugin/preset-manager'
`)
  })

  it('documents the exact host support matrix and canonical Skill ownership', async () => {
    const readme = await readFile(readmeUrl, 'utf8')
    const guide = await readFile(installationGuideUrl, 'utf8')

    for (const body of [readme, guide]) {
      for (const row of [
        '| Skills-only installer | Yes | No | No | No |',
        '| Claude Code plugin | Yes | Claude Agent | Claude MCP adapter | No |',
        '| Codex plugin | Yes | Codex subagent | Codex MCP adapter | No |',
        '| Full DSH plugin | Article/Seednote generated copies | DSH composition | Official Bundle/MCP adapters | Article/Seednote only |',
      ]) {
        expect(body).toContain(row)
      }
    }

    const normalized = guide.replace(/\s+/g, ' ')
    expect(normalized).toContain(
      'DSH is not a separate Anban business workflow or Skill tree.',
    )
    expect(normalized).toMatch(
      /harness\/skills\/\*\*.*canonical.*Agent Pack generator copies the exact declared Skills/i,
    )
    expect(normalized).toMatch(
      /DSH-only code.*host composition.*MCP.*credentials.*Preset manager.*Skill provider/i,
    )
    expect(normalized).toMatch(/only Article and Seednote.*DSH Presets/i)
    expect(normalized).not.toMatch(
      /(?:ecommerce|live-slicer|moments|montage)[^.|\n]*(?:DSH Preset|Preset support)/i,
    )
  })

  it('documents only supported immutable DSH installation artifacts', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const normalized = guide.replace(/\s+/g, ' ')

    for (const required of [
      'public npm package (primary)',
      'PUBLISHED_VERSION="replace-with-published-version"',
      'npm view "@anban/dsh-plugin@${PUBLISHED_VERSION}" version',
      'checksummed GitHub Release',
      'anban-dsh-plugin-<published-version>.tgz.sha256',
      'immutable Git tag or full commit',
      'prepare build',
      'pnpm pack --json',
      'exact tarball path reported in the `filename` field',
      'dsh plugin --profile "$ACTIVE_PROFILE" add "$PACKED_TARBALL"',
    ]) {
      expect(normalized).toContain(required)
    }
    expect(documentedPluginAddFindings(guide)).toEqual([])
    expect(normalized).toMatch(
      /Never install this plugin from a source directory with a `file:` specifier/i,
    )
  })

  it('rejects source directories from fenced dsh plugin add commands', () => {
    const fixture = (specifier: string) => `\`\`\`bash
dsh plugin --profile "$ACTIVE_PROFILE" add ${specifier}
\`\`\``

    for (const allowed of [
      '"@anban/dsh-plugin@4.1.14"',
      '"/tmp/anban-dsh-plugin-4.1.14.tgz"',
      '"file:/tmp/anban-dsh-plugin-4.1.14.tgz"',
      '"https://github.com/anbanai/anban-creator/releases/download/v4.1.14/anban-dsh-plugin-4.1.14.tgz"',
      '"git+https://github.com/anbanai/creator-harness.git#v4.1.14"',
      '"git+https://github.com/anbanai/creator-harness.git#0123456789abcdef0123456789abcdef01234567"',
    ]) {
      expect(documentedPluginAddFindings(fixture(allowed)), allowed).toEqual([])
    }
    for (const forbidden of [
      '.',
      '..',
      '../legacy-plugin',
      './harness',
      '/tmp/legacy-plugin',
      'file:../legacy-plugin',
      'file:/tmp/legacy-plugin',
      'file:/tmp/anban-dsh-plugin.tgz',
      '"@anban/dsh-plugin"',
      '"@anban/dsh-plugin@latest"',
      '"@anban/dsh-plugin@^4.1.14"',
      '"@anban/dsh-plugin@01.2.3"',
      '"/tmp/arbitrary-plugin-4.1.12.tgz"',
      '"https://example.com/anban-dsh-plugin-4.1.12.tgz"',
      '"https://github.com/anbanai/anban-creator/releases/download/v4.1.14/anban-dsh-plugin-4.1.15.tgz"',
      '"git+https://github.com/anbanai/creator-harness.git#main"',
      '"git+https://github.com/anbanai/creator-harness.git#HEAD"',
      '"git+https://github.com/anbanai/creator-harness.git#v01.2.3"',
      '"git+https://github.com/anbanai/creator-harness.git"',
    ]) {
      expect(
        documentedPluginAddFindings(fixture(forbidden)),
        forbidden,
      ).not.toEqual([])
    }

    for (const source of [
      `\`\`\`bash
$ dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin"
\`\`\``,
      `\`\`\`bash
CHECK_ONLY=1 dsh plugin --profile "$ACTIVE_PROFILE" add "/tmp/arbitrary-plugin-4.1.12.tgz"
\`\`\``,
      `\`\`\`bash
command dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#main"
\`\`\``,
      `\`\`\`bash
dsh plugin --profile "$ACTIVE_PROFILE" add \\
  "file:/tmp/legacy-plugin"
\`\`\``,
      `\`\`\`bash
env -- dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin"
\`\`\``,
      `\`\`\`bash
command -- dsh plugin --profile "$ACTIVE_PROFILE" add "/tmp/arbitrary-plugin-4.1.12.tgz"
\`\`\``,
      `\`\`\`bash
env -u DSH_HOME dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#main"
\`\`\``,
      `\`\`\`bash
ONE=1 TWO=2 wrapper -- dsh plugin --profile "$ACTIVE_PROFILE" add "file:/tmp/legacy-plugin"
\`\`\``,
      `\`\`\`bash
LABEL="two words" dsh plugin --profile "$ACTIVE_PROFILE" add "/tmp/with spaces/arbitrary-plugin-4.1.12.tgz"
\`\`\``,
      `\`\`\`bash
dsh plugin --profile "$ACTIVE_PROFILE" add
\`\`\``,
      `\`\`\`bash
dsh plugin --profile "$ACTIVE_PROFILE" add "unterminated
\`\`\``,
    ]) {
      expect(documentedPluginAddFindings(source), source).not.toEqual([])
    }
    for (const source of [
      `\`\`\`bash
$ dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@4.1.14"
\`\`\``,
      `\`\`\`bash
CHECK_ONLY=1 dsh plugin --profile "$ACTIVE_PROFILE" add "file:/tmp/anban-dsh-plugin-4.1.14.tgz"
\`\`\``,
      `\`\`\`bash
command dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#0123456789abcdef0123456789abcdef01234567"
\`\`\``,
      `\`\`\`bash
dsh plugin --profile "$ACTIVE_PROFILE" add \\
  "https://github.com/anbanai/anban-creator/releases/download/v4.1.14/anban-dsh-plugin-4.1.14.tgz"
\`\`\``,
      `\`\`\`bash
env -- dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@4.1.14"
\`\`\``,
      `\`\`\`bash
command -- dsh plugin --profile "$ACTIVE_PROFILE" add "file:/tmp/anban-dsh-plugin-4.1.14.tgz"
\`\`\``,
      `\`\`\`bash
env -u DSH_HOME dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#0123456789abcdef0123456789abcdef01234567"
\`\`\``,
      `\`\`\`bash
ONE=1 TWO=2 LABEL="two words" wrapper -- dsh plugin --profile "$ACTIVE_PROFILE" add "/tmp/with spaces/anban-dsh-plugin-4.1.14.tgz"
\`\`\``,
    ]) {
      expect(documentedPluginAddFindings(source), source).toEqual([])
    }
    expect(
      documentedPluginAddFindings(
        'Run dsh plugin --profile web add "@anban/dsh-plugin" in a shell.',
      ),
    ).toEqual([])
  })

  it('normalizes the effective DSH home before any home filesystem use', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const sectionStart = guide.indexOf('## Resolve DSH home')
    const sectionEnd = guide.indexOf('\n## ', sectionStart + 1)
    const section = guide.slice(sectionStart, sectionEnd)
    const scriptMatch = /node <<'NODE'\n([\s\S]*?)\nNODE/.exec(section)
    const script = scriptMatch?.[1]
    expect(script).toBeDefined()

    for (const [input, expected] of [
      [undefined, resolve(homedir(), '.dsh')],
      ['  \t ', resolve(homedir(), '.dsh')],
      [
        '  relative/dsh-home  ',
        resolve(packageRootPath, '  relative/dsh-home  '),
      ],
      ['~', resolve(homedir())],
      ['~/custom', resolve(homedir(), 'custom')],
      ['~\\custom', resolve(homedir(), 'custom')],
      ['relative/dsh-home', resolve(packageRootPath, 'relative/dsh-home')],
      [join(tmpdir(), 'absolute-dsh-home'), resolve(tmpdir(), 'absolute-dsh-home')],
    ] as const) {
      const env = { ...process.env }
      if (input === undefined) delete env.DSH_HOME
      else env.DSH_HOME = input
      const result = spawnSync(process.execPath, ['-e', script ?? ''], {
        cwd: packageRootPath,
        encoding: 'utf8',
        env,
      })
      expect(result.status, `${input ?? '<unset>'}: ${result.stderr}`).toBe(0)
      expect(result.stdout).toBe(expected)
    }

    expect(script).toContain("const configured = process.env.DSH_HOME ?? ''")
    expect(script).toContain("configured.trim() === ''")
    expect(script).not.toContain("(process.env.DSH_HOME ?? '').trim()")

    const rootResult = spawnSync(process.execPath, ['-e', script ?? ''], {
      cwd: packageRootPath,
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: parse(resolve('/')).root },
    })
    expect(rootResult.status).not.toBe(0)
    expect(rootResult.stderr).toMatch(/filesystem root/i)

    const captureIndex = section.indexOf('NORMALIZED_DSH_HOME="$(')
    const emptyGuardIndex = section.indexOf('[ -n "$NORMALIZED_DSH_HOME" ]')
    const exportIndex = section.indexOf('export DSH_HOME="$NORMALIZED_DSH_HOME"')
    expect(captureIndex).toBeGreaterThanOrEqual(0)
    expect(emptyGuardIndex).toBeGreaterThan(captureIndex)
    expect(exportIndex).toBeGreaterThan(emptyGuardIndex)
    expect(guide.slice(0, sectionStart)).not.toContain('$DSH_HOME')

    const filesystemLines = guide.match(
      /^(?:install|mkdir|chmod|mv|cp|rm)\b[^\n]*\$DSH_HOME[^\n]*$/gm,
    ) ?? []
    expect(filesystemLines.length).toBeGreaterThan(0)
    expect(guide.indexOf(filesystemLines[0] ?? '')).toBeGreaterThan(
      sectionStart + exportIndex,
    )
    for (const line of filesystemLines) {
      expect(line).toMatch(/"\$DSH_HOME(?:\/[^"\n]*)?"/)
    }
    expect(guide).toContain('install -d -m 700 "$DSH_HOME"')
    expect(guide).toContain('chmod 700 "$DSH_HOME"')
    expect(guide).toContain('chmod 600 "$DSH_HOME/.credentials.yaml"')
    expect(guide).toContain(
      'mv -- "$DSH_HOME/.agent-presets/.anban-dsh.lock" "$LOCK_QUARANTINE"',
    )
  })

  it('documents both executable Preset management surfaces', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const normalized = guide.replace(/\s+/g, ' ')
    for (const command of [
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets',
      '/anban-presets-install',
      '/anban-presets-status',
      '/anban-presets-install force',
      '/anban-presets-remove confirm',
    ]) {
      expect(guide).toContain(command)
    }
    expect(normalized).toMatch(/same Preset manager/i)
    expect(normalized).toMatch(/shell.*automation.*recovery/i)
    expect(normalized).toMatch(/interactive.*Web.*Desktop/i)
    expect(normalized).toMatch(
      /interactive confirmation.*differs.*explicit shell CLI removal/i,
    )
    expect(guide.match(/^ACTIVE_PROFILE=/gm)).toHaveLength(1)
    expect(guide).not.toMatch(
      /^dsh plugin --profile web (?:add|exec|remove)\b/gm,
    )
  })

  it('keeps package publication under operator control for the current release', async () => {
    const changelog = await readFile(changelogUrl, 'utf8')
    const releaseHeading = '## [4.1.14] - 2026-09-01'
    const release = changelog.slice(
      changelog.indexOf(releaseHeading),
      changelog.indexOf('\n## [', changelog.indexOf(releaseHeading) + 1),
    )
    expect(release).toContain('Prepared')
    expect(release).toContain('does not claim npm publication')
    expect(release.replace(/\s+/g, ' ')).toMatch(
      /release workflow.*release operator.*must/i,
    )
    expect(release).not.toMatch(
      /(?:package|version) (?:is|is now|has been) (?:published|available) (?:on|from) npm/i,
    )
  })

  it('documents profile discovery and the complete two-step lifecycle', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const normalized = guide.replace(/\s+/g, ' ')

    for (const command of [
      'dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets',
      'dsh plugin --profile "$ACTIVE_PROFILE" remove @anban/dsh-plugin',
    ]) {
      expect(guide).toContain(command)
    }
    for (const concept of [
      'Bundle is profile-local',
      'Presets are global',
      '$DSH_HOME/.agent-presets',
      'shared by every profile using the same `DSH_HOME`',
      'Bundle activation never installs, upgrades, or removes Presets',
      'cross-profile',
      'upgrade',
      'rollback',
      'recovery',
    ]) {
      expect(normalized).toContain(concept)
    }

    const firstStatus = guide.indexOf(
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status',
    )
    const force = guide.indexOf(
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force',
    )
    const removePresets = guide.indexOf(
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets',
    )
    const removeBundle = guide.indexOf(
      'dsh plugin --profile "$ACTIVE_PROFILE" remove @anban/dsh-plugin',
    )
    expect(firstStatus).toBeGreaterThanOrEqual(0)
    expect(firstStatus).toBeLessThan(force)
    expect(firstStatus).toBeLessThan(removePresets)
    expect(removePresets).toBeLessThan(removeBundle)
    expect(normalized).toMatch(/status.*back up.*before.*(?:--force|remove)/i)
    expect(normalized).toMatch(/unowned Preset directories.*refused/i)
  })

  it('documents exact official credential precedence without an onboarding shortcut', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const normalized = guide.replace(/\s+/g, ' ')

    expect(normalized).toContain(
      'inherited process environment (read-only, highest priority) -> `$DSH_HOME/.credentials.yaml` (managed, writable) -> invocation-project `.env` -> `$DSH_HOME/.env`',
    )
    expect(guide.match(/^ANBAN_API_KEY: <value>$/gm)).toHaveLength(1)
    expect(normalized).toMatch(/process environment.*temporary.*CI override/i)
    expect(normalized).toMatch(/owner-only.*0700.*0600/i)
    expect(normalized).toMatch(
      /model onboarding.*does not configure arbitrary third-party credentials/i,
    )
    expect(guide).not.toMatch(/~\/\.dsh\/\.credentials\.yaml/)
    expect(guide).not.toMatch(/<(?:harness|dsh)[ -]home>\/\.credentials\.yaml/i)
  })

  it('documents stable recovery diagnostics without unsafe lock deletion', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    for (const code of [
      'ERR_RUNTIME_MISSING',
      'ERR_PRESET_UNOWNED',
      'ERR_PRESET_MODIFIED',
      'ERR_PRESET_LOCKED',
      'ERR_PRESET_LOCK_INVALID',
      'ERR_PRESET_ROLLBACK',
      'ERR_PRESET_OPERATION',
    ]) {
      expect(guide).toContain(code)
    }
    expect(guide).toMatch(/incomplete (?:package|source) install/i)
    expect(guide).toMatch(/lock residue/i)
    expect(guide).toMatch(/move .*quarantine/i)
    expect(guide).not.toMatch(/rm\s+(?:-[^\s]*r[^\s]*\s+)?[^\n]*\.anban-dsh\.lock/)
  })

  it('composes the selected profile before invoking the standalone Bundle CLI', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')

    expect(bashBlockUnder(guide, '## Select the active profile')).toEqual([
      'ACTIVE_PROFILE="replace-with-web-or-desktop-profile-name"',
    ])
    expect(bashBlockUnder(guide, '## Initial installation and configuration')).toEqual([
      'PUBLISHED_VERSION="replace-with-published-version"',
      'dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"',
      'dsh --profile "$ACTIVE_PROFILE" --dump-config',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets',
    ])
    expect(guide.replace(/\s+/g, ' ')).toContain(
      'The dump-config step composes the selected profile configuration and ' +
        'prepares its peer fallback before the first standalone Bundle CLI command.',
    )
    expect(guide).not.toContain('official profile boot')
  })

  it('documents the destructive removal behavior for modified owned Presets', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const removalSection = guide.slice(guide.indexOf('## Removal'))
    const normalized = removalSection.replace(/\s+/g, ' ')
    const warning =
      'remove-presets removes Anban-owned Presets even if they are modified.'
    const warningIndex = removalSection.indexOf(warning)
    const backupPathIndex = removalSection.indexOf('$DSH_HOME/.agent-presets/<id>')
    const removalCommands = [
      ...removalSection.matchAll(
        /^dsh plugin --profile .* exec anban-dsh remove-presets$/gm,
      ),
    ]

    expect(removalCommands).toHaveLength(1)
    expect(warningIndex).toBeGreaterThanOrEqual(0)
    for (const command of removalCommands) {
      expect(warningIndex).toBeLessThan(command.index)
    }
    expect(backupPathIndex).toBeGreaterThan(warningIndex)
    for (const command of removalCommands) {
      expect(backupPathIndex).toBeLessThan(command.index)
    }
    expect(normalized).toMatch(
      /run .*status.*back up .*local modifications.*before removing/i,
    )
    expect(normalized).toMatch(/refuses to remove unowned Preset directories/i)
    expect(normalized).not.toMatch(/refuses to (?:remove|delete)[^.]*modified/i)
  })

  it('scans every built runtime payload during the check sequence', async () => {
    let entries
    try {
      entries = await readdir(builtLibPath, { recursive: true, withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    const runtimeFiles = entries
      .filter(
        (entry) => entry.isFile() && /\.(?:d\.ts|js)$/.test(entry.name),
      )
      .map((entry) => join(entry.parentPath, entry.name))
      .sort()
    expect(runtimeFiles.length).toBeGreaterThan(0)
    for (const runtimeFile of runtimeFiles) {
      expect(
        publishedRuntimeFindings(await readFile(runtimeFile, 'utf8')),
        runtimeFile,
      ).toEqual([])
    }
  })

  it('detects unsafe executable payloads', () => {
    expect(
      publishedRuntimeFindings(
        `const operation = 'create_task'\nconst headers = { Authorization: 'Bearer leaked-secret' }`,
      ),
    ).toEqual([
      'create_task',
      'leaked-secret',
      'serialized Authorization header',
    ])
    expect(
      publishedRuntimeFindings(`const apiKey = 'hard-coded-value'`),
    ).toEqual(['literal credential assignment'])
    expect(
      publishedRuntimeFindings(
        'const MCP_URL = process.env.CREATOR_MCP_URL',
      ),
    ).toEqual(['configurable MCP endpoint'])
  })
})

describe('DSH package integrity verifier', () => {
  it('accepts the generated source package contract', async () => {
    await expect(verifySourceIntegrity(packageRootPath)).resolves.toBeUndefined()
  })

  it.each([
    {
      name: 'export target',
      path: 'dsh/lib/anban-mcp.js',
      expected: 'export ./anban-mcp default',
    },
    {
      name: 'bin target',
      path: 'dsh/bin/anban-dsh.js',
      expected: 'bin anban-dsh',
    },
    {
      name: 'Cordis patch',
      path: 'dsh/cordis.patch.yml',
      expected: 'exact Cordis patch',
    },
    {
      name: 'Preset manifest',
      path: 'dsh/presets/article/preset.yml',
      expected: 'Article Preset manifest',
    },
    {
      name: 'Agent composition',
      path: 'dsh/presets/seednote/agent.cordis.yml',
      expected: 'Seednote Agent composition',
    },
    {
      name: 'declared Skill',
      path: 'dsh/presets/article/skills/content-writing/SKILL.md',
      expected: 'Article declared Skill content-writing',
    },
  ])('rejects a missing $name', async ({ path, expected }) => {
    const fixture = await createIntegrityFixture()
    try {
      await rm(join(fixture.root, path))
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(expected)
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it('rejects a modified Cordis patch', async () => {
    const fixture = await createIntegrityFixture()
    try {
      await writeFile(
        join(fixture.root, 'dsh/cordis.patch.yml'),
        '- insert: []\n',
      )
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'exact Cordis patch',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it('requires exactly the three public code exports and package.json', async () => {
    const fixture = await createIntegrityFixture()
    try {
      const manifestPath = join(fixture.root, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      manifest.exports['./undeclared'] = './dsh/lib/cli.js'
      await writeFile(manifestPath, JSON.stringify(manifest))
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'exact public exports',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it.each([
    {
      name: 'remapped default target',
      mutate(manifest: Record<string, any>) {
        manifest.exports['./anban-mcp'].default = './dsh/lib/cli.js'
      },
    },
    {
      name: 'renamed default condition',
      mutate(manifest: Record<string, any>) {
        const entry = manifest.exports['./anban-mcp']
        entry.browser = entry.default
        delete entry.default
      },
    },
    {
      name: 'remapped types target',
      mutate(manifest: Record<string, any>) {
        manifest.exports['./anban-mcp'].types =
          './dsh/lib/preset-manager.d.ts'
      },
    },
    {
      name: 'remapped package manifest',
      mutate(manifest: Record<string, any>) {
        manifest.exports['./package.json'] = './dsh/lib/cli.js'
      },
    },
  ])('rejects an exact exports contract with a $name', async ({ mutate }) => {
    const fixture = await createIntegrityFixture()
    try {
      const manifestPath = join(fixture.root, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      mutate(manifest)
      await writeFile(manifestPath, JSON.stringify(manifest))
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'exact public exports',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it.each([
    {
      name: 'renamed bin key',
      async mutate(manifest: Record<string, any>) {
        manifest.bin = { renamed: manifest.bin['anban-dsh'] }
      },
    },
    {
      name: 'additional bin key',
      async mutate(manifest: Record<string, any>) {
        manifest.bin.extra = manifest.bin['anban-dsh']
      },
    },
    {
      name: 'remapped executable target',
      async mutate(manifest: Record<string, any>, root: string) {
        const target = join(root, 'dsh/bin/remapped.js')
        await copyFile(join(root, 'dsh/bin/anban-dsh.js'), target)
        await chmod(target, 0o755)
        manifest.bin['anban-dsh'] = './dsh/bin/remapped.js'
      },
    },
  ])('rejects an exact bin contract with a $name', async ({ mutate }) => {
    const fixture = await createIntegrityFixture()
    try {
      const manifestPath = join(fixture.root, 'package.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      await mutate(manifest, fixture.root)
      await writeFile(manifestPath, JSON.stringify(manifest))
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'exact package bin',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it('accepts a CRLF Node shebang in the source package bin', async () => {
    const fixture = await createIntegrityFixture()
    try {
      const binPath = join(fixture.root, 'dsh/bin/anban-dsh.js')
      const source = await readFile(binPath, 'utf8')
      await writeFile(binPath, source.replace(/^#!\/usr\/bin\/env node\n/, '#!/usr/bin/env node\r\n'))
      await expect(verifySourceIntegrity(fixture.root)).resolves.toBeUndefined()
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it('rejects altered Node shebang semantics', async () => {
    const fixture = await createIntegrityFixture()
    try {
      const binPath = join(fixture.root, 'dsh/bin/anban-dsh.js')
      const source = await readFile(binPath, 'utf8')
      await writeFile(binPath, source.replace(/^#!\/usr\/bin\/env node/, '#!/usr/bin/env -S node'))
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'Node shebang',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it('requires a shebang on the declared package bin', async () => {
    const fixture = await createIntegrityFixture()
    try {
      await writeFile(
        join(fixture.root, 'dsh/bin/anban-dsh.js'),
        "process.exitCode = 2\n",
      )
      await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
        'bin anban-dsh must start with a Node shebang',
      )
    } finally {
      await rm(fixture.fixtureParent, { force: true, recursive: true })
    }
  })

  it.runIf(process.platform !== 'win32')(
    'requires executable mode on the declared package bin',
    async () => {
      const fixture = await createIntegrityFixture()
      try {
        await chmod(join(fixture.root, 'dsh/bin/anban-dsh.js'), 0o644)
        await expect(verifySourceIntegrity(fixture.root)).rejects.toThrow(
          'bin anban-dsh is not executable',
        )
      } finally {
        await rm(fixture.fixtureParent, { force: true, recursive: true })
      }
    },
  )

  it('structurally consumes one pnpm pack JSON result', () => {
    expect(
      parsePackResult(
        JSON.stringify({
          name: '@anban/dsh-plugin',
          version: '4.1.11',
          filename: 'anban-dsh-plugin-4.1.11.tgz',
          files: [{ path: 'package.json' }, { path: 'dsh/lib/cli.js' }],
        }),
      ),
    ).toEqual({
      name: '@anban/dsh-plugin',
      version: '4.1.11',
      filename: 'anban-dsh-plugin-4.1.11.tgz',
      files: ['dsh/lib/cli.js', 'package.json'],
    })

    expect(() => parsePackResult('[]')).toThrow('single JSON result')
    expect(() => parsePackResult('{}\n{}')).toThrow('single JSON result')
  })

  it('rejects a packed artifact with a missing file', () => {
    expect(() =>
      verifyPackFileInventory(
        ['dsh/bin/anban-dsh.js', 'package.json'],
        ['package.json'],
      ),
    ).toThrow('missing: dsh/bin/anban-dsh.js')
  })

  it('rejects a packed artifact with an unexpected file', () => {
    expect(() =>
      verifyPackFileInventory(
        ['package.json'],
        ['package.json', 'dsh/lib/undeclared.js'],
      ),
    ).toThrow('unexpected: dsh/lib/undeclared.js')
  })

  it.each([
    [{ path: 'package/../escape', type: 'file' }, 'unsafe path'],
    [{ path: '/absolute', type: 'file' }, 'unsafe path'],
    [{ path: 'outside/', type: 'directory' }, 'outside the package root'],
    [{ path: 'package/dsh/bin/link', type: 'symlink' }, 'symlink'],
  ])('rejects unsafe archive entry %#', (entry, expected) => {
    expect(() => assertSafeArchiveEntries([entry])).toThrow(expected)
  })

  it.each([
    {
      name: 'missing file',
      entries: [{ name: 'package/package.json', content: '{}' }],
      expectedFiles: ['package.json', 'dsh/bin/anban-dsh.js'],
      error: 'missing: dsh/bin/anban-dsh.js',
    },
    {
      name: 'unexpected file',
      entries: [
        { name: 'package/package.json', content: '{}' },
        { name: 'package/undeclared.js', content: '' },
      ],
      expectedFiles: ['package.json'],
      error: 'unexpected: undeclared.js',
    },
    {
      name: 'traversal path',
      entries: [{ name: 'package/../outside.txt', content: 'unsafe' }],
      expectedFiles: [],
      error: 'unsafe path',
    },
    {
      name: 'absolute path',
      entries: [{ name: '/absolute.txt', content: 'unsafe' }],
      expectedFiles: [],
      error: 'unsafe path',
    },
    {
      name: 'symlink typeflag',
      entries: [
        {
          name: 'package/link',
          type: '2',
          linkName: '../outside',
        },
      ],
      expectedFiles: [],
      error: 'symlink',
    },
    {
      name: 'hardlink typeflag',
      entries: [
        {
          name: 'package/link',
          type: '1',
          linkName: 'package/target',
        },
      ],
      expectedFiles: [],
      error: 'hardlink',
    },
    {
      name: 'invalid checksum',
      entries: [
        {
          name: 'package/package.json',
          content: '{}',
          corruptChecksum: true,
        },
      ],
      expectedFiles: ['package.json'],
      error: 'header checksum',
    },
    {
      name: 'PAX path traversal',
      entries: [
        {
          name: 'PaxHeader',
          type: 'x',
          content: paxRecord('path', 'package/../outside.txt'),
        },
        { name: 'package/safe.txt', content: 'unsafe' },
      ],
      expectedFiles: ['safe.txt'],
      error: 'unsafe path',
    },
    {
      name: 'unsupported PAX key',
      entries: [
        {
          name: 'PaxHeader',
          type: 'x',
          content: paxRecord('SCHILY.xattr.user.test', 'value'),
        },
        { name: 'package/safe.txt', content: 'safe' },
      ],
      expectedFiles: ['safe.txt'],
      error: 'unsupported PAX key',
    },
  ])('rejects a real tar.gz with $name', async (testCase) => {
    const fixture = await createArchiveFixture(testCase.entries)
    try {
      await expect(
        inspectAndExtractArchive({
          archivePath: fixture.archivePath,
          destination: fixture.destination,
          expectedFiles: testCase.expectedFiles,
        }),
      ).rejects.toThrow(testCase.error)
      await expect(
        readFile(join(fixture.root, 'outside.txt')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readdir(fixture.destination)).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it.each([
    {
      name: 'entry size',
      entries: [{ name: 'package/file', content: 'too-large' }],
      limits: { maxEntryBytes: 4 },
      error: 'entry size limit',
    },
    {
      name: 'entry count',
      entries: [
        { name: 'package/one', content: '' },
        { name: 'package/two', content: '' },
      ],
      expectedFiles: ['one', 'two'],
      limits: { maxEntries: 1 },
      error: 'entry count limit',
    },
    {
      name: 'path length',
      entries: [{ name: 'package/path-is-too-long', content: '' }],
      limits: { maxPathBytes: 12 },
      error: 'path length limit',
    },
  ])('enforces the tar $name bound', async (testCase) => {
    const fixture = await createArchiveFixture(testCase.entries)
    try {
      await expect(
        inspectAndExtractArchive({
          archivePath: fixture.archivePath,
          destination: fixture.destination,
          expectedFiles: testCase.expectedFiles ?? [],
          limits: testCase.limits,
        }),
      ).rejects.toThrow(testCase.error)
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('rejects compressed input before reading beyond its byte bound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-compressed-limit-'))
    const archivePath = join(root, 'fixture.tgz')
    try {
      await writeFile(archivePath, Buffer.alloc(2048))
      await expect(
        inspectAndExtractArchive({
          archivePath,
          destination: join(root, 'extracted'),
          expectedFiles: [],
          limits: { maxCompressedBytes: 1024 },
        }),
      ).rejects.toThrow('compressed byte limit')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('rejects a gzip bomb at the inflated byte bound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-inflated-limit-'))
    const archivePath = join(root, 'fixture.tgz')
    try {
      await writeFile(archivePath, gzipSync(Buffer.alloc(4096)))
      await expect(
        inspectAndExtractArchive({
          archivePath,
          destination: join(root, 'extracted'),
          expectedFiles: [],
          limits: { maxInflatedBytes: 1024 },
        }),
      ).rejects.toThrow('inflated byte limit')
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it.each([
    {
      name: 'non-executable bin mode',
      entry: {
        name: 'package/dsh/bin/anban-dsh.js',
        content: '#!/usr/bin/env node\n',
        mode: 0o644,
      },
      error: 'not executable',
    },
    {
      name: 'missing Node shebang',
      entry: {
        name: 'package/dsh/bin/anban-dsh.js',
        content: 'process.exitCode = 2\n',
        mode: 0o755,
      },
      error: 'Node shebang',
    },
    {
      name: 'altered Node shebang semantics',
      entry: {
        name: 'package/dsh/bin/anban-dsh.js',
        content: '#!/usr/bin/env -S node\nprocess.exitCode = 2\n',
        mode: 0o755,
      },
      error: 'Node shebang',
    },
  ])('rejects a packed bin with $name', async ({ entry, error }) => {
    const fixture = await createArchiveFixture([entry])
    try {
      await expect(
        inspectAndExtractArchive({
          archivePath: fixture.archivePath,
          destination: fixture.destination,
          executablePaths: ['dsh/bin/anban-dsh.js'],
          expectedFiles: ['dsh/bin/anban-dsh.js'],
        }),
      ).rejects.toThrow(error)
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('accepts a packed executable with a CRLF Node shebang', async () => {
    const fixture = await createArchiveFixture([
      {
        name: 'package/dsh/bin/anban-dsh.js',
        content: '#!/usr/bin/env node\r\nprocess.exitCode = 2\r\n',
        mode: 0o755,
      },
    ])
    try {
      await expect(
        inspectAndExtractArchive({
          archivePath: fixture.archivePath,
          destination: fixture.destination,
          executablePaths: ['dsh/bin/anban-dsh.js'],
          expectedFiles: ['dsh/bin/anban-dsh.js'],
        }),
      ).resolves.toEqual({ files: ['dsh/bin/anban-dsh.js'] })
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('does not resolve an undeclared dev-only dependency', async () => {
    const fixture = await createInstalledPackageFixture({
      exportSources: {
        'anban-mcp': "import 'typescript'\nexport const loaded = true\n",
      },
    })
    try {
      await expect(verifyInstalledPackage(fixture.root)).rejects.toThrow(
        'public export smoke failed',
      )
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('times out a hanging public export deterministically', async () => {
    const fixture = await createInstalledPackageFixture({
      exportSources: {
        'anban-mcp':
          'await new Promise(() => setInterval(() => {}, 1000))\n',
      },
    })
    try {
      await expect(
        verifyInstalledPackage(fixture.root, { childTimeoutMs: 50 }),
      ).rejects.toThrow('public export smoke timed out')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('times out a hanging packaged CLI deterministically', async () => {
    const fixture = await createInstalledPackageFixture({
      cliSource:
        '#!/usr/bin/env node\nsetInterval(() => {}, 1000)\n',
    })
    try {
      await expect(
        verifyInstalledPackage(fixture.root, {
          childTimeoutMs: 50,
          runCommand(command: string, args: string[], options: { label: string }) {
            if (options.label === 'public export smoke') {
              return Promise.resolve({ status: 0, stderr: '', stdout: '' })
            }
            return runBoundedCommand(command, args, options)
          },
        }),
      ).rejects.toThrow('packaged CLI smoke timed out')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('kills an ignored-SIGTERM public export and its descendant', async () => {
    const fixture = await createInstalledPackageFixture()
    const parentPidPath = join(fixture.root, 'parent.pid')
    const descendantPidPath = join(fixture.root, 'descendant.pid')
    const descendantSource =
      `process.on('SIGTERM', () => {})\n` +
      `setInterval(() => {}, 1000)\n`
    await writeFile(
      join(
        fixture.packageDirectory,
        'dsh',
        'lib',
        'anban-mcp.js',
      ),
      `import { spawn } from 'node:child_process'\n` +
        `import { writeFileSync } from 'node:fs'\n` +
        `writeFileSync(${JSON.stringify(parentPidPath)}, String(process.pid))\n` +
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}])\n` +
        `writeFileSync(${JSON.stringify(descendantPidPath)}, String(child.pid))\n` +
        `process.on('SIGTERM', () => {})\n` +
        `setInterval(() => {}, 1000)\n`,
    )

    const startedAt = Date.now()
    try {
      await expect(
        verifyInstalledPackage(fixture.root, { childTimeoutMs: 500 }),
      ).rejects.toThrow('public export smoke timed out')
      expect(Date.now() - startedAt).toBeLessThan(2_000)
      const pids = await Promise.all(
        [parentPidPath, descendantPidPath].map(async (path) =>
          Number.parseInt(await readFile(path, 'utf8'), 10),
        ),
      )
      await expectProcessTreeGone(pids)
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('stops a public export that floods the output cap', async () => {
    const fixture = await createInstalledPackageFixture()
    const pidPath = join(fixture.root, 'flood.pid')
    await writeFile(
      join(
        fixture.packageDirectory,
        'dsh',
        'lib',
        'anban-mcp.js',
      ),
      `import { writeFileSync } from 'node:fs'\n` +
        `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid))\n` +
        `process.stdout.write('x'.repeat(2 * 1024 * 1024))\n` +
        `setInterval(() => {}, 1000)\n`,
    )

    const startedAt = Date.now()
    try {
      await expect(
        verifyInstalledPackage(fixture.root, { childTimeoutMs: 5_000 }),
      ).rejects.toThrow('public export smoke exceeded the output byte limit')
      expect(Date.now() - startedAt).toBeLessThan(2_000)
      const pid = Number.parseInt(await readFile(pidPath, 'utf8'), 10)
      await expectProcessTreeGone([pid])
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it.runIf(process.platform !== 'win32')(
    'retries the packaged CLI through Node only when direct execution is denied',
    async () => {
      const fixture = await createInstalledPackageFixture()
      const attempts: Array<{ args: string[]; command: string; label: string }> = []
      const binPath = join(
        fixture.packageDirectory,
        'dsh',
        'bin',
        'anban-dsh.js',
      )
      try {
        await expect(
          verifyInstalledPackage(fixture.root, {
            async runCommand(command: string, args: string[], options: { label: string }) {
              attempts.push({ args, command, label: options.label })
              if (options.label === 'public export smoke') {
                return { status: 0, stderr: '', stdout: '' }
              }
              if (command === binPath) {
                throw Object.assign(new Error('permission denied'), {
                  code: 'EACCES',
                })
              }
              if (command === process.execPath && args[0] === binPath) {
                return {
                  status: 2,
                  stderr: 'anban-dsh: invalid command\n',
                  stdout: '',
                }
              }
              throw new Error(`unexpected command: ${command}`)
            },
          }),
        ).resolves.toBeUndefined()
        expect(attempts.slice(1)).toEqual([
          {
            args: ['--package-integrity-smoke'],
            command: binPath,
            label: 'packaged CLI smoke',
          },
          {
            args: [binPath, '--package-integrity-smoke'],
            command: process.execPath,
            label: 'packaged CLI smoke via Node',
          },
        ])
      } finally {
        await rm(fixture.root, { force: true, recursive: true })
      }
    },
  )

  it.runIf(process.platform !== 'win32')(
    'does not retry other direct packaged CLI failures through Node',
    async () => {
      const fixture = await createInstalledPackageFixture()
      const attempts: string[] = []
      const binPath = join(
        fixture.packageDirectory,
        'dsh',
        'bin',
        'anban-dsh.js',
      )
      try {
        await expect(
          verifyInstalledPackage(fixture.root, {
            async runCommand(command: string, _args: string[], options: { label: string }) {
              attempts.push(command)
              if (options.label === 'public export smoke') {
                return { status: 0, stderr: '', stdout: '' }
              }
              throw Object.assign(new Error('operation not permitted'), {
                code: 'EPERM',
              })
            },
          }),
        ).rejects.toMatchObject({ code: 'EPERM' })
        expect(attempts).toEqual([process.execPath, binPath])
      } finally {
        await rm(fixture.root, { force: true, recursive: true })
      }
    },
  )

  it('does not use synchronous child-process supervision', async () => {
    expect(await readFile(integrityScriptUrl, 'utf8')).not.toContain('spawnSync')
  })
})

describe('DSH CLI shim', () => {
  it('diagnoses an incomplete tarball install when the CLI entrypoint is missing', async () => {
    const fixture = await createShimFixture()

    try {
      const result = spawnSync(process.execPath, [fixture.shimPath], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe(
        'ERR_RUNTIME_MISSING: Missing package entrypoint dsh/lib/cli.js. Run pnpm pack, then pass the exact .tgz path it reports to pnpm add.\n',
      )
      expect(result.stderr.trimEnd().split('\n')).toHaveLength(1)
      expect(result.stderr).not.toContain('file:')
      expect(result.stderr).not.toContain('*')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('sanitizes unrelated runtime import failures as one operation diagnostic', async () => {
    const fixture = await createShimFixture(
      `import './Authorization-Bearer-leaked-import-secret.js'\n`,
    )

    try {
      const result = spawnSync(process.execPath, [fixture.shimPath], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe(
        'ERR_PRESET_OPERATION: Anban preset operation failed.\n',
      )
      expect(result.stderr.trimEnd().split('\n')).toHaveLength(1)
      expect(result.stderr).not.toContain('leaked-import-secret')
      expect(result.stderr).not.toContain('Authorization')
      expect(result.stderr).not.toContain('Error:')
      expect(result.stderr).not.toContain('at ')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('reports a CLI entrypoint that disappears during import as runtime missing', async () => {
    const fixture = await createShimFixture(`import { rm } from 'node:fs/promises'
await rm(new URL(import.meta.url))
throw new Error('Authorization Bearer leaked-import-secret')
`)

    try {
      const result = spawnSync(process.execPath, [fixture.shimPath], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe(
        'ERR_RUNTIME_MISSING: Missing package entrypoint dsh/lib/cli.js. Run pnpm pack, then pass the exact .tgz path it reports to pnpm add.\n',
      )
      expect(result.stderr).not.toContain('leaked-import-secret')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })

  it('passes user argv to runCLI and propagates its numeric result', async () => {
    const fixture = await createShimFixture(`export async function runCLI(argv) {
  process.stdout.write(JSON.stringify(argv ?? null))
  return 2
}
`)

    try {
      const result = spawnSync(
        process.execPath,
        [fixture.shimPath, 'first', 'two words'],
        { encoding: 'utf8' },
      )

      expect(result.status).toBe(2)
      expect(result.stdout).toBe('["first","two words"]')
      expect(result.stderr).toBe('')
    } finally {
      await rm(fixture.root, { force: true, recursive: true })
    }
  })
})
