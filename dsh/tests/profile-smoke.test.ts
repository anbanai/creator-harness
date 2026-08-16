import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const smokeScriptUrl = new URL('../scripts/smoke-profile.mjs', import.meta.url)

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
    const dshBin = join(packageRoot, 'node_modules', '.bin', 'dsh')
    const installedCli = join(
      profileDir,
      'node_modules',
      '.bin',
      'anban-dsh',
    )
    const events: string[] = []
    const commandCalls: Array<{
      args: readonly string[]
      command: string
      options: { cwd: string; env: NodeJS.ProcessEnv }
    }> = []
    const runCommand = vi.fn(
      (
        command: string,
        args: readonly string[],
        options: { cwd: string; env: NodeJS.ProcessEnv },
      ) => {
        events.push(`command:${command}:${args.join(' ')}`)
        commandCalls.push({ args, command, options })
        if (command === 'pnpm') {
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
    const parseConfig = vi.fn(() => [
      { id: 'base-row', name: '@deepseek-ai/dsh-base' },
      { id: 'anban-mcp', name: '@anban/dsh-plugin/anban-mcp' },
      {
        id: 'anban-preset-manager',
        name: '@anban/dsh-plugin/preset-manager',
      },
    ])
    const access = vi.fn(async () => undefined)
    const healProfileFallback = vi.fn(async () => {
      events.push('heal-profile-fallback')
    })
    const mkdtemp = vi.fn(async () => smokeRoot)
    const rm = vi.fn(async () => undefined)
    const log = vi.fn()

    const overrides = {
      access,
      discoverPresets,
      healProfileFallback,
      importInstalledExport,
      log,
      mkdtemp,
      parseConfig,
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
          command: 'pnpm',
          args: ['pack', '--pack-destination', smokeRoot],
        },
        {
          command: dshBin,
          args: ['plugin', '--profile', 'web', 'add', packTarball],
        },
        {
          command: installedCli,
          args: ['install-presets'],
        },
        {
          command: dshBin,
          args: ['--profile', 'web', '--dump-config'],
        },
      ],
    )
    expect(commandCalls[0]?.options.cwd).toBe(packageRoot)
    for (const call of commandCalls.slice(1)) {
      expect(call.options.env.DSH_HOME).toBe(dshHome)
    }
    expect(healProfileFallback).toHaveBeenCalledWith(dshHome)
    expect(events).toEqual([
      'command:pnpm:pack --pack-destination ' + smokeRoot,
      `command:${dshBin}:plugin --profile web add ${packTarball}`,
      'heal-profile-fallback',
      `command:${installedCli}:install-presets`,
      `command:${dshBin}:--profile web --dump-config`,
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
  })
})
