import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const smokeScriptUrl = new URL('../scripts/smoke-profile.mjs', import.meta.url)
const publicExports = [
  '@anban/dsh-plugin/anban-mcp',
  '@anban/dsh-plugin/preset-manager',
  '@anban/dsh-plugin/skills-provider',
  '@anban/dsh-plugin/package.json',
]

interface NativeCommand {
  executable: string
  kind: 'native'
  prefixArgs: readonly string[]
}

interface WindowsCommand {
  executable: string
  kind: 'windows-cmd'
  prefixArgs: readonly string[]
  shim: string
}

type PortableCommand = NativeCommand | WindowsCommand

function packResult(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: '@anban/dsh-plugin',
    version: '4.1.11',
    filename: 'anban-dsh-plugin-4.1.11.tgz',
    files: [
      { path: 'dsh/bin/anban-dsh.js' },
      { path: 'dsh/lib/anban-mcp.d.ts' },
      { path: 'dsh/lib/anban-mcp.js' },
      { path: 'dsh/lib/preset-manager.d.ts' },
      { path: 'dsh/lib/preset-manager.js' },
      { path: 'dsh/lib/skills-provider.d.ts' },
      { path: 'dsh/lib/skills-provider.js' },
      { path: 'package.json' },
    ],
    ...overrides,
  })
}

describe('portable profile-smoke commands', () => {
  it('represents a POSIX native executable without a Node wrapper', async () => {
    const smokeModule = await import(smokeScriptUrl.href)

    expect(
      smokeModule.portableCommand('/opt/pnpm/bin/pnpm', {
        platform: 'darwin',
      }),
    ).toEqual({
      executable: '/opt/pnpm/bin/pnpm',
      kind: 'native',
      prefixArgs: [],
    })
  })

  it('uses the plain pnpm command from PATH without lifecycle data', async () => {
    const smokeModule = await import(smokeScriptUrl.href)

    expect(
      smokeModule.resolvePnpmCommand({
        environment: { PATH: '/public/bin:/usr/bin' },
        platform: 'linux',
        processExecutable: '/usr/bin/node',
      }),
    ).toEqual({ executable: 'pnpm', kind: 'native', prefixArgs: [] })
  })

  it.each([
    { environment: {} },
    {
      environment: {
        npm_execpath: String.raw`C:\public\pnpm\pnpm.cjs`,
        npm_node_execpath: String.raw`C:\Program Files\DSH Desktop\electron.exe`,
      },
    },
  ])(
    'uses the Windows pnpm.cmd PATH shim when public Node lifecycle data is unavailable',
    async ({ environment }) => {
      const smokeModule = await import(smokeScriptUrl.href)

      expect(
        smokeModule.resolvePnpmCommand({
          environment: {
            ComSpec: String.raw`C:\Windows\System32\cmd.exe`,
            ...environment,
          },
          platform: 'win32',
          processExecutable: String.raw`C:\Program Files\DSH Desktop\electron.exe`,
        }),
      ).toEqual({
        executable: String.raw`C:\Windows\System32\cmd.exe`,
        kind: 'windows-cmd',
        prefixArgs: ['/d', '/s', '/v:off', '/c'],
        shim: 'pnpm.cmd',
      })
    },
  )

  it('uses the standard npm Node runtime for a JavaScript lifecycle entrypoint', async () => {
    const smokeModule = await import(smokeScriptUrl.href)

    expect(
      smokeModule.resolvePnpmCommand({
        environment: {
          npm_execpath: '/opt/pnpm/bin/pnpm.cjs',
          npm_node_execpath: '/opt/node/bin/node',
        },
        platform: 'linux',
        processExecutable: '/Applications/DSH Desktop.app/Electron',
      }),
    ).toEqual({
      executable: '/opt/node/bin/node',
      kind: 'native',
      prefixArgs: ['/opt/pnpm/bin/pnpm.cjs'],
    })
  })

  it('runs a Windows command shim through an explicit cmd.exe strategy', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const command = smokeModule.resolvePnpmCommand({
      environment: {
        ComSpec: String.raw`C:\Windows\System32\cmd.exe`,
        npm_execpath: String.raw`C:\Program Files\pnpm\pnpm.cmd`,
      },
      platform: 'win32',
      processExecutable: String.raw`C:\Program Files\DSH Desktop\electron.exe`,
    })

    expect(command).toEqual({
      executable: String.raw`C:\Windows\System32\cmd.exe`,
      kind: 'windows-cmd',
      prefixArgs: ['/d', '/s', '/v:off', '/c'],
      shim: String.raw`C:\Program Files\pnpm\pnpm.cmd`,
    })
    expect(
      smokeModule.commandInvocation(command, [
        'pack',
        '--pack-destination',
        String.raw`C:\Smoke Profile`,
      ]),
    ).toEqual({
      executable: String.raw`C:\Windows\System32\cmd.exe`,
      args: [
        '/d',
        '/s',
        '/v:off',
        '/c',
        String.raw`""C:\Program Files\pnpm\pnpm.cmd" "pack" "--pack-destination" "C:\Smoke Profile""`,
      ],
    })
  })

  it('honors the pinned DSH Desktop public-runtime contract', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const electron =
      '/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop'
    const publicPnpmShim =
      '/Applications/DSH Desktop.app/Contents/Resources/runtime/bin/pnpm'
    const environment = {
      ANBAN_API_KEY: 'must-not-reach-child',
      ELECTRON_RUN_AS_NODE: '1',
      npm_config_authToken: 'must-not-reach-child',
      npm_execpath: publicPnpmShim,
      PATH: '/Applications/DSH Desktop.app/Contents/Resources/runtime/bin:/usr/bin',
    }

    const command = smokeModule.resolvePnpmCommand({
      environment,
      platform: 'darwin',
      processExecutable: electron,
    })
    expect(command).toEqual({
      executable: publicPnpmShim,
      kind: 'native',
      prefixArgs: [],
    })
    expect(command.executable).not.toBe(electron)

    const childEnvironment = smokeModule.smokeEnvironment(
      '/tmp/dsh-home',
      environment,
    )
    expect(childEnvironment).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(childEnvironment).not.toHaveProperty('ANBAN_API_KEY')
    expect(childEnvironment).not.toHaveProperty('npm_config_authToken')
    expect(childEnvironment).toMatchObject({
      DSH_HOME: '/tmp/dsh-home',
      npm_execpath: publicPnpmShim,
    })
  })

  it('does not depend on Desktop-private runtime helpers', async () => {
    const source = await readFile(smokeScriptUrl, 'utf8')

    for (const forbidden of [
      'desktopRuntime',
      'desktopPnpmBootstrap',
      'ELECTRON' + '_RUN_AS_NODE',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })
})

function profileFixture() {
  const smokeRoot = join(tmpdir(), 'anban-dsh-profile-smoke-contract')
  const dshHome = join(smokeRoot, 'home')
  const profileDir = join(dshHome, 'profiles', 'web')
  const packTarball = join(smokeRoot, 'anban-dsh-plugin-4.1.11.tgz')
  const pnpmCommand: NativeCommand = {
    executable: 'pnpm',
    kind: 'native',
    prefixArgs: [],
  }
  const dshCommand: NativeCommand = {
    executable: join(packageRoot, 'node_modules', '.bin', 'dsh'),
    kind: 'native',
    prefixArgs: [],
  }
  const commandCalls: Array<{
    args: readonly string[]
    command: PortableCommand
    options: { cwd: string; env: NodeJS.ProcessEnv }
  }> = []
  const runCommand = vi.fn(
    (
      command: PortableCommand,
      args: readonly string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      commandCalls.push({ args, command, options })
      if (args[0] === 'pack') return { stdout: packResult() }
      if (args.at(-1) === '--dump-config') {
        return { stdout: 'mock composed config' }
      }
      return { stdout: '' }
    },
  )
  const discoverPresets = vi.fn(async () => [
    {
      id: 'article',
      path: join(dshHome, '.agent-presets', 'article', 'agent.cordis.yml'),
      trust: 'user',
    },
    {
      id: 'seednote',
      path: join(dshHome, '.agent-presets', 'seednote', 'agent.cordis.yml'),
      trust: 'user',
    },
  ])
  const importInstalledExport = vi.fn(
    async (_profileDir: string, specifier: string) => {
      if (specifier.endsWith('/package.json')) {
        return {
          name: '@anban/dsh-plugin',
          version: '4.1.11',
          exports: {
            './anban-mcp': {},
            './preset-manager': {},
            './skills-provider': {},
            './package.json': './package.json',
          },
        }
      }
      const names = {
        '@anban/dsh-plugin/anban-mcp': 'anban-mcp',
        '@anban/dsh-plugin/preset-manager': 'anban-preset-manager',
        '@anban/dsh-plugin/skills-provider': 'anban-skills-provider',
      }
      return {
        apply() {},
        name: names[specifier as keyof typeof names],
      }
    },
  )
  const parseConfig = vi.fn((): unknown => [
    { id: 'base-row', name: '@deepseek-ai/dsh-base' },
    { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
    {
      id: 'anban-preset-manager',
      name: '@anban/dsh-plugin/preset-manager',
    },
  ])
  const resolveInstalledCommand = vi.fn(async () => {
    throw new Error('profile smoke must not resolve a private installed bin')
  })
  const overrides = {
    access: vi.fn(async () => undefined),
    discoverPresets,
    importInstalledExport,
    log: vi.fn(),
    mkdtemp: vi.fn(async () => smokeRoot),
    parseConfig,
    resolveDshCommand: vi.fn(async () => dshCommand),
    resolveInstalledCommand,
    resolvePnpmCommand: vi.fn(async () => pnpmCommand),
    rm: vi.fn(async () => undefined),
    runCommand,
    tmpdir: () => tmpdir(),
  }
  return {
    commandCalls,
    discoverPresets,
    dshCommand,
    dshHome,
    importInstalledExport,
    overrides,
    packTarball,
    parseConfig,
    pnpmCommand,
    profileDir,
    resolveInstalledCommand,
    smokeRoot,
  }
}

describe('DSH profile smoke flow', () => {
  it('packs structured output and validates the fresh local profile', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()

    await smokeModule.smokeProfile(fixture.overrides)

    expect(
      fixture.commandCalls.map(({ command, args }) => ({ command, args })),
    ).toEqual([
      {
        command: fixture.pnpmCommand,
        args: ['pack', '--json', '--pack-destination', fixture.smokeRoot],
      },
      {
        command: fixture.dshCommand,
        args: ['plugin', '--profile', 'web', 'add', fixture.packTarball],
      },
      {
        command: fixture.dshCommand,
        args: ['--profile', 'web', '--dump-config'],
      },
      {
        command: fixture.dshCommand,
        args: [
          'plugin',
          '--profile',
          'web',
          'exec',
          'anban-dsh',
          'install-presets',
        ],
      },
      {
        command: fixture.dshCommand,
        args: ['--profile', 'web', '--dump-config'],
      },
    ])
    expect(fixture.commandCalls.map(({ options }) => options.cwd)).toEqual([
      packageRoot,
      packageRoot,
      packageRoot,
      packageRoot,
      packageRoot,
    ])
    const localEnvironment = fixture.commandCalls[0]?.options.env
    for (const call of fixture.commandCalls) {
      expect(call.options.env).toBe(localEnvironment)
      expect(call.options.env.DSH_HOME).toBe(fixture.dshHome)
      expect(call.options.env).not.toHaveProperty('ANBAN_API_KEY')
    }
    expect(fixture.discoverPresets).toHaveBeenCalledWith([
      { path: join(fixture.dshHome, '.agent-presets'), trust: 'user' },
    ])
    expect(fixture.importInstalledExport.mock.calls).toEqual(
      publicExports.map((specifier) => [fixture.profileDir, specifier]),
    )
    expect(fixture.resolveInstalledCommand).not.toHaveBeenCalled()
    expect(fixture.overrides.log.mock.calls.map(([line]) => line)).toEqual([
      'Bundle rows: anban-mcp=1 anban-preset-manager=1 preset-local-mcp=0',
      'Healthy Presets: article, seednote',
      `Export resolution: ${publicExports.join(', ')}`,
    ])
    expect(fixture.overrides.rm).toHaveBeenCalledWith(fixture.smokeRoot, {
      force: true,
      recursive: true,
    })
  })

  it('accepts pnpm absolute filenames contained by the pack destination', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    fixture.overrides.runCommand.mockImplementationOnce(() => ({
      stdout: packResult({ filename: fixture.packTarball }),
    }))

    await expect(
      smokeModule.smokeProfile(fixture.overrides),
    ).resolves.toBeUndefined()
    expect(fixture.commandCalls[0]).toMatchObject({
      args: ['plugin', '--profile', 'web', 'add', fixture.packTarball],
    })
  })

  it('installs an exact registry package into a clean profile without packing', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    const artifactSource = '@anban/dsh-plugin@4.1.11'

    await smokeModule.smokeProfile({
      ...fixture.overrides,
      artifactSource,
    })

    expect(fixture.overrides.resolvePnpmCommand).not.toHaveBeenCalled()
    expect(
      fixture.commandCalls.map(({ command, args, options }) => ({
        command,
        args,
        cwd: options.cwd,
      })),
    ).toEqual([
      {
        command: fixture.dshCommand,
        args: ['plugin', '--profile', 'web', 'add', artifactSource],
        cwd: packageRoot,
      },
      {
        command: fixture.dshCommand,
        args: ['--profile', 'web', '--dump-config'],
        cwd: packageRoot,
      },
      {
        command: fixture.dshCommand,
        args: [
          'plugin',
          '--profile',
          'web',
          'exec',
          'anban-dsh',
          'install-presets',
        ],
        cwd: packageRoot,
      },
      {
        command: fixture.dshCommand,
        args: ['--profile', 'web', '--dump-config'],
        cwd: packageRoot,
      },
    ])
    const registryEnvironment = fixture.commandCalls[0]?.options.env
    for (const call of fixture.commandCalls) {
      expect(call.options.env).toBe(registryEnvironment)
      expect(call.options.env.DSH_HOME).toBe(fixture.dshHome)
    }
    expect(fixture.importInstalledExport.mock.calls).toEqual(
      publicExports.map((specifier) => [fixture.profileDir, specifier]),
    )
    expect(fixture.resolveInstalledCommand).not.toHaveBeenCalled()
  })

  it('rejects ambiguous pack output and unsafe registry sources', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    fixture.overrides.runCommand.mockImplementationOnce(() => ({
      stdout: `${packResult()}\n${packResult()}`,
    }))

    await expect(smokeModule.smokeProfile(fixture.overrides)).rejects.toThrow(
      'single JSON result',
    )
    await expect(
      smokeModule.smokeProfile({
        ...profileFixture().overrides,
        artifactSource: '@anban/dsh-plugin@latest',
      }),
    ).rejects.toThrow('exact @anban/dsh-plugin version')
  })

  it.each([
    {
      expected: 'outside the smoke root',
      pack: { filename: '../anban-dsh-plugin-4.1.11.tgz' },
    },
    {
      expected: 'unsafe file inventory',
      pack: { files: [{ path: '../profile-escape' }] },
    },
    {
      expected: 'inventory is missing',
      pack: { files: [{ path: 'package.json' }] },
    },
  ])('rejects unsafe structured pack data: $expected', async (testCase) => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    fixture.overrides.runCommand.mockImplementationOnce(() => ({
      stdout: packResult(testCase.pack),
    }))

    await expect(smokeModule.smokeProfile(fixture.overrides)).rejects.toThrow(
      testCase.expected,
    )
  })

  it('rejects duplicate Bundle rows and preset-local MCP rows', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    fixture.parseConfig.mockReturnValue([
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      { id: 'anban-mcp', name: '@example/not-anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
      },
    ])
    await expect(smokeModule.smokeProfile(fixture.overrides)).rejects.toThrow(
      'Installed profile has invalid Anban Bundle rows',
    )

    const nestedFixture = profileFixture()
    nestedFixture.parseConfig.mockReturnValue([
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
        config: {
          presetRows: [
            { id: 'mcp-client', name: '@deepseek-ai/dsh-mcp-client' },
          ],
        },
      },
    ])
    await expect(
      smokeModule.smokeProfile(nestedFixture.overrides),
    ).rejects.toThrow('Installed profile has invalid Anban Bundle rows')
  })
})
