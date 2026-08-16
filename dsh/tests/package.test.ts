import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const packageUrl = new URL('../../package.json', import.meta.url)
const workspaceUrl = new URL('../../pnpm-workspace.yaml', import.meta.url)

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
        '@deepseek-ai/dsh-commands': '0.1.0-rc.6',
        '@deepseek-ai/dsh-credentials': '0.1.0-rc.6',
        '@deepseek-ai/dsh-home-paths': '0.1.0-rc.6',
        '@deepseek-ai/dsh-mcp-client': '0.1.0-rc.6',
        '@deepseek-ai/dsh-skill-filesystem': '0.1.0-rc.6',
        '@types/node': '22.20.0',
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
})
