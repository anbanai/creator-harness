import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const smokeScriptUrl = new URL('../scripts/smoke-profile.mjs', import.meta.url)

interface NodeCommand {
  executable: string
  prefixArgs: readonly string[]
}

describe('DSH profile smoke script', () => {
  it('packs and installs the current Bundle into an isolated web profile', async () => {
    const smokeModule = await import(smokeScriptUrl.href).catch(() => undefined)

    expect(
      smokeModule?.smokeProfile,
      'smoke-profile.mjs must export smokeProfile',
    ).toBeTypeOf('function')

    if (smokeModule === undefined) {
      return
    }

    const smokeRoot = join(tmpdir(), 'anban-dsh-profile-smoke-contract')
    const dshHome = join(smokeRoot, 'home')
    const profileDir = join(dshHome, 'profiles', 'web')
    const packTarball = join(smokeRoot, 'anban-dsh-plugin-4.1.11.tgz')
    const nodeRuntime = join(packageRoot, 'runtime', 'node')
    const pnpmCommand = {
      executable: nodeRuntime,
      prefixArgs: [join(packageRoot, 'tools', 'pnpm.mjs')],
    }
    const dshCommand = {
      executable: nodeRuntime,
      prefixArgs: [
        join(
          packageRoot,
          'node_modules',
          '@deepseek-ai',
          'dsh',
          'lib',
          'bin.js',
        ),
      ],
    }
    const installedCommand = {
      executable: nodeRuntime,
      prefixArgs: [
        join(
          profileDir,
          'node_modules',
          '@anban',
          'dsh-plugin',
          'dsh',
          'bin',
          'anban-dsh.js',
        ),
      ],
    }
    const events: string[] = []
    const commandCalls: Array<{
      args: readonly string[]
      command: NodeCommand
      options: { cwd: string; env: NodeJS.ProcessEnv }
    }> = []
    const runCommand = vi.fn(
      (
        command: NodeCommand,
        args: readonly string[],
        options: { cwd: string; env: NodeJS.ProcessEnv },
      ) => {
        events.push(
          `command:${command.executable}:${command.prefixArgs.join(' ')}:${args.join(' ')}`,
        )
        commandCalls.push({ args, command, options })
        if (args[0] === 'pack') {
          return { stdout: `${packTarball}\n` }
        }
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
        path: join(
          dshHome,
          '.agent-presets',
          'seednote',
          'agent.cordis.yml',
        ),
        trust: 'user',
      },
    ])
    const importInstalledExport = vi.fn(async () => ({
      apply() {},
      name: 'anban-skills-provider',
    }))
    const parseConfig = vi.fn((): unknown => [
      { id: 'base-row', name: '@deepseek-ai/dsh-base' },
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
      },
    ])
    const access = vi.fn(async () => undefined)
    const healProfileFallback = vi.fn(async () => {
      throw new Error('profile smoke must not call the internal healer')
    })
    const mkdtemp = vi.fn(async () => smokeRoot)
    const rm = vi.fn(async () => undefined)
    const log = vi.fn()
    const resolveDshCommand = vi.fn(async () => dshCommand)
    const resolveInstalledCommand = vi.fn(async () => installedCommand)
    const resolvePnpmCommand = vi.fn(async () => pnpmCommand)

    const overrides = {
      access,
      discoverPresets,
      healProfileFallback,
      importInstalledExport,
      log,
      mkdtemp,
      parseConfig,
      resolveDshCommand,
      resolveInstalledCommand,
      resolvePnpmCommand,
      rm,
      runCommand,
      tmpdir: () => tmpdir(),
    }

    await smokeModule.smokeProfile(overrides)

    expect(access).toHaveBeenCalledWith(join(packageRoot, 'dsh', 'lib', 'cli.js'))
    expect(mkdtemp).toHaveBeenCalledWith(
      join(tmpdir(), 'anban-dsh-profile-smoke-'),
    )
    expect(commandCalls.map(({ command, args }) => ({ command, args }))).toEqual(
      [
        {
          command: pnpmCommand,
          args: ['pack', '--pack-destination', smokeRoot],
        },
        {
          command: dshCommand,
          args: ['plugin', '--profile', 'web', 'add', packTarball],
        },
        {
          command: dshCommand,
          args: ['--profile', 'web', '--dump-config'],
        },
        {
          command: installedCommand,
          args: ['install-presets'],
        },
        {
          command: dshCommand,
          args: ['--profile', 'web', '--dump-config'],
        },
      ],
    )
    expect(commandCalls[0]?.options.cwd).toBe(packageRoot)
    for (const call of commandCalls.slice(1)) {
      expect(call.options.env.DSH_HOME).toBe(dshHome)
    }
    expect(healProfileFallback).not.toHaveBeenCalled()
    expect(resolvePnpmCommand).toHaveBeenCalledOnce()
    expect(resolveDshCommand).toHaveBeenCalledOnce()
    expect(resolveInstalledCommand).toHaveBeenCalledWith(profileDir)
    expect(events).toEqual([
      `command:${nodeRuntime}:${pnpmCommand.prefixArgs[0]}:pack --pack-destination ${smokeRoot}`,
      `command:${nodeRuntime}:${dshCommand.prefixArgs[0]}:plugin --profile web add ${packTarball}`,
      `command:${nodeRuntime}:${dshCommand.prefixArgs[0]}:--profile web --dump-config`,
      `command:${nodeRuntime}:${installedCommand.prefixArgs[0]}:install-presets`,
      `command:${nodeRuntime}:${dshCommand.prefixArgs[0]}:--profile web --dump-config`,
    ])
    expect(discoverPresets).toHaveBeenCalledWith([
      { path: join(dshHome, '.agent-presets'), trust: 'user' },
    ])
    expect(parseConfig).toHaveBeenCalledWith('mock composed config')
    expect(importInstalledExport).toHaveBeenCalledWith(
      profileDir,
      '@anban/dsh-plugin/skills-provider',
    )
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'Bundle rows: anban-mcp=1 anban-preset-manager=1 preset-local-mcp=0',
      'Healthy Presets: article, seednote',
      'Export resolution: @anban/dsh-plugin/skills-provider',
    ])
    expect(rm).toHaveBeenCalledWith(smokeRoot, {
      force: true,
      recursive: true,
    })

    parseConfig.mockReturnValue([
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      { id: 'anban-mcp', name: '@example/not-anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
      },
    ])
    await expect(smokeModule.smokeProfile(overrides)).rejects.toThrow(
      'Installed profile has invalid Anban Bundle rows',
    )
    expect(rm).toHaveBeenCalledTimes(2)

    parseConfig.mockReturnValue([
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
        config: {
          presetRows: [
            {
              id: 'mcp-client',
              name: '@deepseek-ai/dsh-mcp-client',
            },
          ],
        },
      },
    ])
    await expect(smokeModule.smokeProfile(overrides)).rejects.toThrow(
      'Installed profile has invalid Anban Bundle rows',
    )
    expect(rm).toHaveBeenCalledTimes(3)
  })

  it.each([
    {
      entrypoint: String.raw`C:\tools\pnpm\bin\pnpm.cjs`,
      executable: String.raw`C:\Program Files\nodejs\node.exe`,
      platform: 'win32',
    },
    {
      entrypoint: '/opt/pnpm/bin/pnpm.mjs',
      executable: '/opt/node/bin/node',
      platform: 'darwin',
    },
  ])(
    'uses a Node entrypoint command on $platform',
    async ({ entrypoint, executable, platform }) => {
      const smokeModule = await import(smokeScriptUrl.href)

      expect(smokeModule.nodeEntrypointCommand).toBeTypeOf('function')
      expect(
        smokeModule.nodeEntrypointCommand(entrypoint, {
          executable,
          platform,
        }),
      ).toEqual({
        executable,
        prefixArgs: [entrypoint],
      })
    },
  )
})
