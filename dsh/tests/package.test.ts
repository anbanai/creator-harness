import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageUrl = new URL('../../package.json', import.meta.url)
const workspaceUrl = new URL('../../pnpm-workspace.yaml', import.meta.url)
const cordisPatchUrl = new URL('../cordis.patch.yml', import.meta.url)
const cliShimPath = fileURLToPath(
  new URL('../bin/anban-dsh.js', import.meta.url),
)

async function createShimFixture(cliSource?: string) {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-shim-'))
  const binDir = join(root, 'bin')
  const shimPath = join(binDir, 'anban-dsh.js')

  await mkdir(binDir, { recursive: true })
  await copyFile(cliShimPath, shimPath)
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n')

  if (cliSource !== undefined) {
    const libDir = join(root, 'lib')
    await mkdir(libDir, { recursive: true })
    await writeFile(join(libDir, 'cli.js'), cliSource)
  }

  return { root, shimPath }
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
        'smoke:profile':
          'pnpm run build && node dsh/scripts/smoke-profile.mjs',
        check:
          'pnpm run typecheck && pnpm run test && pnpm run build && pnpm pack --dry-run',
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
})

describe('DSH CLI shim', () => {
  it('reports a missing CLI module as one safe stderr line', async () => {
    const fixture = await createShimFixture()

    try {
      const result = spawnSync(process.execPath, [fixture.shimPath], {
        encoding: 'utf8',
      })

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toBe('anban-dsh: command failed\n')
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
