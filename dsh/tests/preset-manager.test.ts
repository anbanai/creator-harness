import type { Context } from '@deepseek-ai/cordis'
import type {
  CommandDefinition,
  CommandInvocation,
} from '@deepseek-ai/dsh-commands'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const presetOperations = vi.hoisted(() => ({
  installPresets: vi.fn(),
  removePresets: vi.fn(),
  statusPresets: vi.fn(),
}))

vi.mock('../src/presets.js', () => presetOperations)

import { apply, inject, name } from '../src/preset-manager.js'
import { OperationalError } from '../src/operational-error.js'

const SOURCE_DIGEST = '0123456789abcdef'.repeat(4)
const INSTALLED_DIGEST = 'fedcba9876543210'.repeat(4)
const UNSAFE_INSTALLED_VERSIONS = [
  '1.2.3+token.secret',
  '1.2.3-..',
  '1.2.3-01',
  `1.2.3+${'x'.repeat(64)}`,
  '01.2.3',
  ' 1.2.3',
  '1.2.3 ',
  '\uff11.2.3',
  `1.2.${'9'.repeat(64)}`,
] as const

interface FakeContext {
  context: Context
  definitions: CommandDefinition[]
  disposers: Array<ReturnType<typeof vi.fn>>
  effect: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
}

function createContext(): FakeContext {
  const definitions: CommandDefinition[] = []
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  const register = vi.fn((definition: CommandDefinition) => {
    definitions.push(definition)
    return vi.fn()
  })
  const effect = vi.fn((execute: () => () => void) => {
    const disposer = execute()
    disposers.push(disposer as ReturnType<typeof vi.fn>)
    return vi.fn()
  })
  const context = { commands: { register }, effect } as unknown as Context

  return { context, definitions, disposers, effect, register }
}

function invocation(rawInput: string): CommandInvocation {
  return { rawInput } as CommandInvocation
}

beforeEach(() => {
  vi.resetAllMocks()
  presetOperations.installPresets.mockResolvedValue([])
  presetOperations.removePresets.mockResolvedValue([])
  presetOperations.statusPresets.mockResolvedValue([])
})

describe('preset manager registration', () => {
  it('declares exact plugin metadata', () => {
    expect(name).toBe('anban-preset-manager')
    expect(inject).toEqual(['commands'])
  })

  it('registers the three global commands and owns every disposer as an effect', () => {
    const fake = createContext()

    apply(fake.context)

    expect(fake.effect).toHaveBeenCalledTimes(3)
    expect(fake.register).toHaveBeenCalledTimes(3)
    expect(fake.definitions.map(({ name, input }) => ({ name, input }))).toEqual([
      { name: 'anban-presets-install', input: { hint: '[force]' } },
      { name: 'anban-presets-status', input: undefined },
      { name: 'anban-presets-remove', input: { hint: 'confirm' } },
    ])
    expect(fake.disposers).toHaveLength(3)
    for (const disposer of fake.disposers) {
      expect(disposer).toBeTypeOf('function')
    }
  })
})

describe('preset manager handlers', () => {
  it('installs for only blank input or force', async () => {
    const fake = createContext()
    apply(fake.context)
    const install = fake.definitions[0]!

    await expect(install.handler(invocation('   '))).resolves.toEqual({
      kind: 'success',
      text: '',
    })
    expect(presetOperations.installPresets).toHaveBeenLastCalledWith({})

    await expect(install.handler(invocation(' force '))).resolves.toEqual({
      kind: 'success',
      text: '',
    })
    expect(presetOperations.installPresets).toHaveBeenLastCalledWith({
      force: true,
    })

    await expect(install.handler(invocation(' --force'))).resolves.toEqual({
      kind: 'error',
      text: 'Usage: /anban-presets-install [force]',
    })
    expect(presetOperations.installPresets).toHaveBeenCalledTimes(2)
  })

  it('rejects input for status and formats every preset deterministically', async () => {
    presetOperations.statusPresets.mockResolvedValue([
      {
        id: 'article',
        installedDigest: INSTALLED_DIGEST,
        installedVersion: '0.0.0',
        sourceDigest: SOURCE_DIGEST,
        state: 'outdated',
      },
      {
        id: 'seednote',
        sourceDigest: INSTALLED_DIGEST,
        state: 'absent',
      },
    ])
    const fake = createContext()
    apply(fake.context)
    const status = fake.definitions[1]!

    await expect(status.handler(invocation(''))).resolves.toEqual({
      kind: 'success',
      text: [
        'article state=outdated source=0123456789ab installed=fedcba987654 version=0.0.0',
        'seednote state=absent source=fedcba987654 installed=none version=none',
      ].join('\n'),
    })
    await expect(status.handler(invocation(' unexpected'))).resolves.toEqual({
      kind: 'error',
      text: 'Usage: /anban-presets-status',
    })
    expect(presetOperations.statusPresets).toHaveBeenCalledTimes(1)
  })

  it.each(UNSAFE_INSTALLED_VERSIONS)(
    'does not echo unsafe installed version %j in status output',
    async (installedVersion) => {
      presetOperations.statusPresets.mockResolvedValue([
        {
          id: 'article',
          installedDigest: INSTALLED_DIGEST,
          installedVersion,
          sourceDigest: SOURCE_DIGEST,
          state: 'modified',
        },
      ])
      const fake = createContext()
      apply(fake.context)
      const status = fake.definitions[1]!

      const result = await status.handler(invocation(''))

      expect(result).toEqual({
        kind: 'success',
        text: 'article state=modified source=0123456789ab installed=fedcba987654 version=invalid',
      })
      const output = JSON.stringify(result)
      expect(output).not.toContain(installedVersion)
      expect(output).not.toContain('token')
      expect(output).not.toContain('secret')
    },
  )

  it('removes presets only after exact confirm input', async () => {
    presetOperations.removePresets.mockResolvedValue(['article'])
    const fake = createContext()
    apply(fake.context)
    const remove = fake.definitions[2]!

    await expect(remove.handler(invocation(' confirm '))).resolves.toEqual({
      kind: 'success',
      text: 'removed=article',
    })
    await expect(remove.handler(invocation(' Confirm'))).resolves.toEqual({
      kind: 'error',
      text: 'Usage: /anban-presets-remove confirm',
    })
    await expect(remove.handler(invocation(' confirm now'))).resolves.toEqual({
      kind: 'error',
      text: 'Usage: /anban-presets-remove confirm',
    })
    expect(presetOperations.removePresets).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['install', 0, 'installPresets'],
    ['status', 1, 'statusPresets'],
    ['remove', 2, 'removePresets'],
  ] as const)(
    'returns a sanitized error when %s fails',
    async (_label, definitionIndex, operation) => {
      presetOperations[operation].mockRejectedValue(
        new Error('credential token=super-secret'),
      )
      const fake = createContext()
      apply(fake.context)
      const definition = fake.definitions[definitionIndex]!
      const input = operation === 'removePresets' ? ' confirm' : ''

      const result = await definition.handler(invocation(input))

      expect(result).toEqual({
        kind: 'error',
        text: 'ERR_PRESET_OPERATION: Anban preset operation failed.',
      })
      expect(JSON.stringify(result)).not.toContain('super-secret')
    },
  )

  it('uses the same formatter as the CLI for known operational errors', async () => {
    presetOperations.installPresets.mockRejectedValue(
      new OperationalError(
        'ERR_PRESET_MODIFIED',
        'The Article preset has local changes.',
        {
          cause: new Error('Authorization Bearer leaked-secret'),
          recovery: 'Rerun with --force after reviewing those changes.',
        },
      ),
    )
    const fake = createContext()
    apply(fake.context)

    const result = await fake.definitions[0]!.handler(invocation(''))

    expect(result).toEqual({
      kind: 'error',
      text: 'ERR_PRESET_MODIFIED: The Article preset has local changes. Rerun with --force after reviewing those changes.',
    })
    expect(JSON.stringify(result)).not.toContain('leaked-secret')
  })

  it('accepts injected debug configuration without mutating process state', async () => {
    const failure = new OperationalError(
      'ERR_PRESET_LOCKED',
      'Another preset operation is running.',
    )
    failure.stack = [
      'OperationalError: Another preset operation is running.',
      '    at Authorization Bearer leaked-debug-secret',
    ].join('\n')
    presetOperations.installPresets.mockRejectedValue(failure)
    const fake = createContext()
    apply(fake.context, { environment: { ANBAN_DSH_DEBUG: '1' } })

    const result = await fake.definitions[0]!.handler(invocation(''))

    expect(result).toEqual({
      kind: 'error',
      text: [
        'ERR_PRESET_LOCKED: Another preset operation is running.',
        'OperationalError: Another preset operation is running.',
        'at Authorization: [REDACTED]',
      ].join('\n'),
    })
  })
})
