import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
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

interface PortableCommand {
  executable: string
  prefixArgs: readonly string[]
}

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
    ).toEqual({ executable: 'pnpm', prefixArgs: [] })
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
        executable: 'pnpm.cmd',
        prefixArgs: [],
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
      prefixArgs: ['/opt/pnpm/bin/pnpm.cjs'],
    })
  })

  it.each([
    { platform: 'linux', runtime: '/opt/runtime/node' },
    {
      platform: 'win32',
      runtime: String.raw`C:\Program Files\nodejs\node.exe`,
    },
  ])(
    'uses an ordinary absolute process executable for Node on $platform',
    async ({ platform, runtime }) => {
      const smokeModule = await import(smokeScriptUrl.href)
      const entrypoint =
        platform === 'win32'
          ? String.raw`C:\public\pnpm\pnpm.cjs`
          : '/opt/pnpm/bin/pnpm.cjs'

      expect(
        smokeModule.resolvePnpmCommand({
          environment: { npm_execpath: entrypoint },
          platform,
          processExecutable: runtime,
        }),
      ).toEqual({ executable: runtime, prefixArgs: [entrypoint] })
    },
  )

  it.each([
    '/Applications/DSH Desktop.app/Contents/MacOS/Electron',
    '/opt/runtime/bun',
  ])('does not use a non-Node process executable: %s', async (runtime) => {
    const smokeModule = await import(smokeScriptUrl.href)

    expect(
      smokeModule.resolvePnpmCommand({
        environment: { npm_execpath: '/opt/pnpm/bin/pnpm.cjs' },
        platform: 'darwin',
        processExecutable: runtime,
      }),
    ).toEqual({ executable: 'pnpm', prefixArgs: [] })
  })

  it.each([
    '/Applications/DSH Desktop.app/Contents/MacOS/Electron',
    '/opt/runtime/bun',
  ])('does not use a non-pnpm lifecycle executable: %s', async (entrypoint) => {
    const smokeModule = await import(smokeScriptUrl.href)

    expect(
      smokeModule.resolvePnpmCommand({
        environment: { npm_execpath: entrypoint },
        platform: 'darwin',
        processExecutable: '/opt/runtime/node',
      }),
    ).toEqual({ executable: 'pnpm', prefixArgs: [] })
  })

  it('forwards a Windows command shim for cross-spawn to resolve', async () => {
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
      executable: String.raw`C:\Program Files\pnpm\pnpm.cmd`,
      prefixArgs: [],
    })
  })

  it.each([
    { args: ['two words', 'a&b', '%PATH%', 'caret^value'] },
    { args: ['trailing\\', 'quote"value', '(group)', 'pipe|value'] },
  ])('passes Windows shim argv to cross-spawn without rewriting %#', async ({ args }) => {
    const smokeModule = await import(smokeScriptUrl.href)
    const command = {
      executable: String.raw`C:\Program Files\pnpm\pnpm.cmd`,
      prefixArgs: [],
    }

    expect(smokeModule.commandInvocation(command, args)).toEqual({
      executable: command.executable,
      args,
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
      HOME: '/Users/host',
      NPM_CONFIG_USERCONFIG: '/Users/host/.npmrc',
      npm_config_registry_auth_token: 'must-not-reach-child',
      npm_config_authToken: 'must-not-reach-child',
      npm_execpath: publicPnpmShim,
      PATH: '/Applications/DSH Desktop.app/Contents/Resources/runtime/bin:/usr/bin',
      USERPROFILE: String.raw`C:\Users\host`,
      XDG_CONFIG_HOME: '/Users/host/.config',
    }

    const command = smokeModule.resolvePnpmCommand({
      environment,
      platform: 'darwin',
      processExecutable: electron,
    })
    expect(command).toEqual({
      executable: publicPnpmShim,
      prefixArgs: [],
    })
    expect(command.executable).not.toBe(electron)

    const childEnvironment = smokeModule.smokeEnvironment(
      '/tmp/profile-smoke/home',
      '/tmp/profile-smoke',
      environment,
    )
    expect(childEnvironment).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(childEnvironment).not.toHaveProperty('ANBAN_API_KEY')
    expect(childEnvironment).not.toHaveProperty('npm_config_authToken')
    expect(childEnvironment).not.toHaveProperty('npm_execpath')
    expect(childEnvironment).not.toHaveProperty('npm_config_registry_auth_token')
    expect(childEnvironment).toEqual({
      DSH_HOME: '/tmp/profile-smoke/home',
      HOME: '/tmp/profile-smoke/home',
      NPM_CONFIG_USERCONFIG: '/tmp/profile-smoke/.npmrc',
      PATH: environment.PATH,
      TEMP: '/tmp/profile-smoke/tmp',
      TMP: '/tmp/profile-smoke/tmp',
      TMPDIR: '/tmp/profile-smoke/tmp',
      USERPROFILE: '/tmp/profile-smoke/home',
      XDG_CONFIG_HOME: '/tmp/profile-smoke/xdg-config',
    })
  })

  it('creates controlled config directories and a blank npmrc', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const mkdirMock = vi.fn(async () => undefined)
    const writeFileMock = vi.fn(async () => undefined)

    await expect(
      smokeModule.prepareSmokeEnvironment('/tmp/profile-smoke', {
        mkdir: mkdirMock,
        source: { PATH: '/runtime/bin:/usr/bin' },
        writeFile: writeFileMock,
      }),
    ).resolves.toEqual({
      DSH_HOME: '/tmp/profile-smoke/home',
      HOME: '/tmp/profile-smoke/home',
      NPM_CONFIG_USERCONFIG: '/tmp/profile-smoke/.npmrc',
      PATH: '/runtime/bin:/usr/bin',
      TEMP: '/tmp/profile-smoke/tmp',
      TMP: '/tmp/profile-smoke/tmp',
      TMPDIR: '/tmp/profile-smoke/tmp',
      USERPROFILE: '/tmp/profile-smoke/home',
      XDG_CONFIG_HOME: '/tmp/profile-smoke/xdg-config',
    })
    expect(mkdirMock.mock.calls).toEqual([
      ['/tmp/profile-smoke/home', { recursive: true }],
      ['/tmp/profile-smoke/xdg-config', { recursive: true }],
      ['/tmp/profile-smoke/tmp', { recursive: true }],
    ])
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/profile-smoke/.npmrc',
      '',
      { flag: 'wx' },
    )
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

describe('profile-smoke process supervision', () => {
  it('distinguishes cleanup failure from unexpected supervisor errors', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const leaked = 'Authorization Bearer unexpected-supervisor-secret'

    const cleanupFailure = smokeModule.profileCommandFailure(
      { commandFailure: 'cleanup' },
      { label: 'cleanup probe', timeoutMs: 1_000 },
    )
    const unexpectedFailure = smokeModule.profileCommandFailure(
      new Error(leaked),
      { label: 'unexpected probe', timeoutMs: 1_000 },
    )

    expect(cleanupFailure.message).toBe(
      'Profile smoke command "cleanup probe" did not exit after forced termination',
    )
    expect(unexpectedFailure.message).toBe(
      'Profile smoke command "unexpected probe" failed unexpectedly',
    )
    expect(unexpectedFailure.message).not.toContain(leaked)
  })

  it('distinguishes a spawn failure without rendering child diagnostics', async () => {
    const smokeModule = await import(smokeScriptUrl.href)

    await expect(
      smokeModule.runProfileCommand(
        { executable: '/definitely/missing/profile-smoke', prefixArgs: [] },
        [],
        {
          cwd: packageRoot,
          env: { PATH: '/usr/bin:/bin' },
          label: 'spawn probe',
          timeoutMs: 1_000,
        },
      ),
    ).rejects.toThrow(
      'Profile smoke command "spawn probe" failed to start: ENOENT',
    )
  })

  it('reports nonzero status without leaking arbitrary stderr', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const leaked = 'Authorization Bearer profile-smoke-secret'

    let failure: unknown
    try {
      await smokeModule.runProfileCommand(
        { executable: process.execPath, prefixArgs: [] },
        ['-e', `process.stderr.write(${JSON.stringify(leaked)});process.exit(7)`],
        {
          cwd: packageRoot,
          env: { PATH: process.env.PATH },
          label: 'nonzero probe',
          timeoutMs: 1_000,
        },
      )
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'Profile smoke command "nonzero probe" exited 7',
    )
    expect((failure as Error).message).not.toContain(leaked)
  })

  it('kills a SIGTERM-resistant command and its descendant on timeout', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const root = await mkdtemp(join(tmpdir(), 'anban-profile-supervisor-'))
    const parentPidPath = join(root, 'parent.pid')
    const descendantPidPath = join(root, 'descendant.pid')
    const descendantSource =
      `process.on('SIGTERM', () => {})\n` +
      `setInterval(() => {}, 1000)\n`
    const parentSource =
      `const { spawn } = require('node:child_process')\n` +
      `const { writeFileSync } = require('node:fs')\n` +
      `writeFileSync(${JSON.stringify(parentPidPath)}, String(process.pid))\n` +
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}])\n` +
      `writeFileSync(${JSON.stringify(descendantPidPath)}, String(child.pid))\n` +
      `process.on('SIGTERM', () => {})\n` +
      `setInterval(() => {}, 1000)\n`

    try {
      await expect(
        smokeModule.runProfileCommand(
          { executable: process.execPath, prefixArgs: [] },
          ['-e', parentSource],
          {
            cwd: root,
            env: { PATH: process.env.PATH },
            label: 'timeout probe',
            timeoutMs: 150,
          },
        ),
      ).rejects.toThrow(
        'Profile smoke command "timeout probe" timed out after 150ms',
      )
      const pids = await Promise.all(
        [parentPidPath, descendantPidPath].map(async (path) =>
          Number.parseInt(await readFile(path, 'utf8'), 10),
        ),
      )
      await expectProcessTreeGone(pids)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('kills a command that floods the aggregate output cap', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const root = await mkdtemp(join(tmpdir(), 'anban-profile-output-'))
    const pidPath = join(root, 'flood.pid')
    const source =
      `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid))\n` +
      `process.stdout.write('x'.repeat(2 * 1024 * 1024))\n` +
      `setInterval(() => {}, 1000)\n`

    try {
      await expect(
        smokeModule.runProfileCommand(
          { executable: process.execPath, prefixArgs: [] },
          ['-e', source],
          {
            cwd: root,
            env: { PATH: process.env.PATH },
            label: 'output probe',
            timeoutMs: 5_000,
          },
        ),
      ).rejects.toThrow(
        'Profile smoke command "output probe" exceeded the output byte limit',
      )
      const pid = Number.parseInt(await readFile(pidPath, 'utf8'), 10)
      await expectProcessTreeGone([pid])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it.runIf(process.platform === 'win32')(
    'executes a cmd shim with spaces and metacharacters through cross-spawn',
    async () => {
      const smokeModule = await import(smokeScriptUrl.href)
      const root = await mkdtemp(join(tmpdir(), 'anban-profile-cmd-'))
      const bin = join(root, 'node_modules', '.bin')
      const shim = join(bin, 'argument probe.cmd')
      const capture = join(root, 'capture.cjs')
      const args = ['two words', 'a&b', '%PATH%', 'caret^value']
      try {
        await mkdir(bin, { recursive: true })
        await writeFile(
          capture,
          'process.stdout.write(JSON.stringify(process.argv.slice(2)))\n',
        )
        await writeFile(
          shim,
          `@ECHO OFF\r\n"${process.execPath}" "${capture}" %*\r\n`,
        )
        await expect(
          smokeModule.runProfileCommand(
            { executable: shim, prefixArgs: [] },
            args,
            {
              cwd: root,
              env: { PATH: process.env.PATH },
              label: 'cmd probe',
              timeoutMs: 5_000,
            },
          ),
        ).resolves.toMatchObject({ stdout: JSON.stringify(args) })
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    },
  )
})

function profileFixture(version = '4.1.11') {
  const smokeRoot = join(tmpdir(), 'anban-dsh-profile-smoke-contract')
  const dshHome = join(smokeRoot, 'home')
  const profileDir = join(dshHome, 'profiles', 'web')
  const packTarball = join(smokeRoot, 'anban-dsh-plugin-4.1.11.tgz')
  const pnpmCommand: PortableCommand = {
    executable: 'pnpm',
    prefixArgs: [],
  }
  const dshCommand: PortableCommand = {
    executable: join(packageRoot, 'node_modules', '.bin', 'dsh'),
    prefixArgs: [],
  }
  const commandCalls: Array<{
    args: readonly string[]
    command: PortableCommand
    options: { cwd: string; env: NodeJS.ProcessEnv }
  }> = []
  const events: string[] = []
  const runCommand = vi.fn(
    (
      command: PortableCommand,
      args: readonly string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      events.push(`command:${args.join(' ')}`)
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
          version,
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
  const mkdirMock = vi.fn(async (path: string) => {
    events.push(`mkdir:${path}`)
  })
  const writeFileMock = vi.fn(async (path: string, source: string) => {
    events.push(`write:${path}:${source.length}`)
  })
  const overrides = {
    access: vi.fn(async () => undefined),
    discoverPresets,
    importInstalledExport,
    environment: {
      ANBAN_API_KEY: 'host-secret',
      HOME: '/host/home',
      npm_config_authToken: 'host-secret',
      NPM_CONFIG_USERCONFIG: '/host/home/.npmrc',
      PATH: '/runtime/bin:/usr/bin',
      USERPROFILE: String.raw`C:\Users\host`,
      XDG_CONFIG_HOME: '/host/home/.config',
    },
    log: vi.fn(),
    mkdir: mkdirMock,
    mkdtemp: vi.fn(async () => smokeRoot),
    parseConfig,
    resolveDshCommand: vi.fn(async () => dshCommand),
    resolveInstalledCommand,
    resolvePnpmCommand: vi.fn(async () => pnpmCommand),
    rm: vi.fn(async () => undefined),
    runCommand,
    tmpdir: () => tmpdir(),
    writeFile: writeFileMock,
  }
  return {
    commandCalls,
    discoverPresets,
    dshCommand,
    dshHome,
    events,
    importInstalledExport,
    mkdirMock,
    overrides,
    packTarball,
    parseConfig,
    pnpmCommand,
    profileDir,
    resolveInstalledCommand,
    smokeRoot,
    writeFileMock,
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
      expect(call.options.env).toEqual({
        DSH_HOME: fixture.dshHome,
        HOME: fixture.dshHome,
        NPM_CONFIG_USERCONFIG: join(fixture.smokeRoot, '.npmrc'),
        PATH: '/runtime/bin:/usr/bin',
        TEMP: join(fixture.smokeRoot, 'tmp'),
        TMP: join(fixture.smokeRoot, 'tmp'),
        TMPDIR: join(fixture.smokeRoot, 'tmp'),
        USERPROFILE: fixture.dshHome,
        XDG_CONFIG_HOME: join(fixture.smokeRoot, 'xdg-config'),
      })
    }
    expect(fixture.events.slice(0, 4)).toEqual([
      `mkdir:${fixture.dshHome}`,
      `mkdir:${join(fixture.smokeRoot, 'xdg-config')}`,
      `mkdir:${join(fixture.smokeRoot, 'tmp')}`,
      `write:${join(fixture.smokeRoot, '.npmrc')}:0`,
    ])
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
      expect(call.options.env.HOME).toBe(fixture.dshHome)
      expect(call.options.env.USERPROFILE).toBe(fixture.dshHome)
      expect(call.options.env.NPM_CONFIG_USERCONFIG).toBe(
        join(fixture.smokeRoot, '.npmrc'),
      )
      expect(call.options.env).not.toHaveProperty('HOME', '/host/home')
    }
    expect(fixture.writeFileMock).toHaveBeenCalledWith(
      join(fixture.smokeRoot, '.npmrc'),
      '',
      { flag: 'wx' },
    )
    expect(fixture.importInstalledExport.mock.calls).toEqual(
      publicExports.map((specifier) => [fixture.profileDir, specifier]),
    )
    expect(fixture.resolveInstalledCommand).not.toHaveBeenCalled()
  })

  it.each([
    '@anban/dsh-plugin@latest',
    '@anban/dsh-plugin@4.1.11-01',
    '@anban/dsh-plugin@4.1.11-alpha.00',
    '@anban/dsh-plugin@4.1.11-alpha-beta.01',
  ])('rejects unsafe registry source %s', async (artifactSource) => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    await expect(
      smokeModule.smokeProfile({
        ...fixture.overrides,
        artifactSource,
      }),
    ).rejects.toThrow('exact @anban/dsh-plugin version')
  })

  it('accepts hyphens inside a valid SemVer prerelease identifier', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const version = '4.1.11-alpha--beta'
    const fixture = profileFixture(version)

    await expect(
      smokeModule.smokeProfile({
        ...fixture.overrides,
        artifactSource: `@anban/dsh-plugin@${version}`,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects ambiguous pack output', async () => {
    const smokeModule = await import(smokeScriptUrl.href)
    const fixture = profileFixture()
    fixture.overrides.runCommand.mockImplementationOnce(() => ({
      stdout: `${packResult()}\n${packResult()}`,
    }))

    await expect(smokeModule.smokeProfile(fixture.overrides)).rejects.toThrow(
      'single JSON result',
    )
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
