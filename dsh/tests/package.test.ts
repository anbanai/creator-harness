import { spawnSync } from 'node:child_process'
import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageUrl = new URL('../../package.json', import.meta.url)
const workspaceUrl = new URL('../../pnpm-workspace.yaml', import.meta.url)
const installationGuideUrl = new URL(
  '../../docs/dsh-installation.md',
  import.meta.url,
)
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
  parsePackResult,
  verifyPackFileInventory,
  verifySourceIntegrity,
} = await import(integrityScriptUrl.href)

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
      peerDependencies: manifest.peerDependencies,
      devDependencies: manifest.devDependencies,
    }).toEqual({
      name: '@anban/dsh-plugin',
      version: '4.1.11',
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
        'smoke:profile':
          'pnpm run build && node dsh/scripts/smoke-profile.mjs',
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
      peerDependencies: {
        '@deepseek-ai/cordis': '4.0.1',
        '@deepseek-ai/dsh-commands': '0.1.0-rc.6',
        '@deepseek-ai/dsh-credentials': '0.1.0-rc.6',
        '@deepseek-ai/dsh-home-paths': '0.1.0-rc.6',
        '@deepseek-ai/dsh-mcp-client': '0.1.0-rc.6',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.0-rc.6',
      },
      devDependencies: {
        '@deepseek-ai/cordis': '4.0.1',
        '@deepseek-ai/dsh': '0.1.0-rc.6',
        '@deepseek-ai/dsh-agent-presets': '0.1.0-rc.6',
        '@deepseek-ai/dsh-commands': '0.1.0-rc.6',
        '@deepseek-ai/dsh-credentials': '0.1.0-rc.6',
        '@deepseek-ai/dsh-home-paths': '0.1.0-rc.6',
        '@deepseek-ai/dsh-mcp-client': '0.1.0-rc.6',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.0-rc.6',
        '@types/node': '22.20.0',
        'js-yaml': '4.3.1',
        typescript: '6.0.3',
        vitest: '4.1.8',
      },
    })
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

  it('boots each fresh profile before invoking the standalone Bundle CLI', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')

    expect(bashBlockUnder(guide, '## Web profile')).toEqual([
      'dsh plugin --profile web add @anban/dsh-plugin',
      'dsh --profile web --dump-config',
      'dsh plugin --profile web exec anban-dsh install-presets',
    ])
    expect(bashBlockUnder(guide, '## Desktop active profile')).toEqual([
      'ACTIVE_PROFILE="replace-with-desktop-profile-name"',
      'dsh plugin --profile "$ACTIVE_PROFILE" add @anban/dsh-plugin',
      'dsh --profile "$ACTIVE_PROFILE" --dump-config',
      'dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets',
    ])
    expect(guide.replace(/\s+/g, ' ')).toContain(
      'The official profile boot is required only to initialize or refresh ' +
        "the profile's peer fallback before the first standalone Bundle CLI " +
        'command.',
    )
  })

  it('documents the destructive removal behavior for modified owned Presets', async () => {
    const guide = await readFile(installationGuideUrl, 'utf8')
    const normalized = guide.replace(/\s+/g, ' ')
    const warning =
      'remove-presets removes Anban-owned Presets even if they are modified.'
    const warningIndex = guide.indexOf(warning)
    const backupPathIndex = guide.indexOf('$DSH_HOME/.agent-presets/<id>')
    const removalCommands = [
      ...guide.matchAll(
        /^dsh plugin --profile .* exec anban-dsh remove-presets$/gm,
      ),
    ]

    expect(removalCommands).toHaveLength(2)
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
