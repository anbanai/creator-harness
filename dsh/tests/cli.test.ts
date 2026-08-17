import { beforeEach, describe, expect, it, vi } from 'vitest'

const presetOperations = vi.hoisted(() => ({
  installPresets: vi.fn(),
  removePresets: vi.fn(),
  statusPresets: vi.fn(),
}))

vi.mock('../src/presets.js', () => presetOperations)

import { runCLI } from '../src/cli.js'
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
  `${'9'.repeat(64)}.2.3`,
] as const

function createIO() {
  return {
    error: vi.fn(),
    log: vi.fn(),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  presetOperations.installPresets.mockResolvedValue([])
  presetOperations.removePresets.mockResolvedValue([])
  presetOperations.statusPresets.mockResolvedValue([])
})

describe('runCLI argument parsing', () => {
  it('installs presets without force', async () => {
    const io = createIO()

    await expect(runCLI(['install-presets'], io)).resolves.toBe(0)

    expect(presetOperations.installPresets).toHaveBeenCalledWith({})
    expect(io.error).not.toHaveBeenCalled()
  })

  it('installs presets with force', async () => {
    const io = createIO()

    await expect(runCLI(['install-presets', '--force'], io)).resolves.toBe(0)

    expect(presetOperations.installPresets).toHaveBeenCalledWith({ force: true })
  })

  it('reports status', async () => {
    const io = createIO()

    await expect(runCLI(['status'], io)).resolves.toBe(0)

    expect(presetOperations.statusPresets).toHaveBeenCalledWith()
  })

  it('removes presets', async () => {
    presetOperations.removePresets.mockResolvedValue(['article', 'seednote'])
    const io = createIO()

    await expect(runCLI(['remove-presets'], io)).resolves.toBe(0)

    expect(presetOperations.removePresets).toHaveBeenCalledWith()
    expect(io.log).toHaveBeenCalledWith('removed=article,seednote')
  })

  it.each([
    [],
    ['--help'],
    ['install-presets', '--unknown'],
    ['install-presets', '--force', '--force'],
    ['status', '--force'],
    ['remove-presets', 'confirm'],
    ['unknown'],
  ])('rejects every unsupported argv shape: %j', async (...argv: string[]) => {
    const io = createIO()

    await expect(runCLI(argv, io)).resolves.toBe(2)

    expect(presetOperations.installPresets).not.toHaveBeenCalled()
    expect(presetOperations.statusPresets).not.toHaveBeenCalled()
    expect(presetOperations.removePresets).not.toHaveBeenCalled()
    expect(io.error).toHaveBeenCalledWith('anban-dsh: invalid command')
  })
})

describe('runCLI output', () => {
  it('formats status as one stable line per preset', async () => {
    presetOperations.statusPresets.mockResolvedValue([
      {
        id: 'article',
        installedDigest: INSTALLED_DIGEST,
        installedVersion: '4.1.11',
        sourceDigest: SOURCE_DIGEST,
        state: 'current',
      },
      {
        id: 'seednote',
        sourceDigest: INSTALLED_DIGEST,
        state: 'absent',
      },
    ])
    const io = createIO()

    await expect(runCLI(['status'], io)).resolves.toBe(0)

    expect(io.log.mock.calls).toEqual([
      [
        'article state=current source=0123456789ab installed=fedcba987654 version=4.1.11',
      ],
      [
        'seednote state=absent source=fedcba987654 installed=none version=none',
      ],
    ])
  })

  it('does not expose invalid status metadata', async () => {
    presetOperations.statusPresets.mockResolvedValue([
      {
        id: 'article',
        installedDigest: 'token-secret-value',
        installedVersion: 'password=hunter2',
        sourceDigest: 'credential-secret-value',
        state: 'modified',
      },
    ])
    const io = createIO()

    await expect(runCLI(['status'], io)).resolves.toBe(0)

    expect(io.log).toHaveBeenCalledWith(
      'article state=modified source=invalid installed=invalid version=invalid',
    )
    expect(JSON.stringify(io.log.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(io.log.mock.calls)).not.toContain('hunter2')
  })

  it.each(UNSAFE_INSTALLED_VERSIONS)(
    'does not echo unsafe installed version %j',
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
      const io = createIO()

      await expect(runCLI(['status'], io)).resolves.toBe(0)

      expect(io.log).toHaveBeenCalledWith(
        'article state=modified source=0123456789ab installed=fedcba987654 version=invalid',
      )
      const output = JSON.stringify(io.log.mock.calls)
      expect(output).not.toContain(installedVersion)
      expect(output).not.toContain('token')
      expect(output).not.toContain('secret')
    },
  )

  it('returns one and maps unknown failures to the stable operation code', async () => {
    presetOperations.installPresets.mockRejectedValue(
      new Error('request failed: token=credential-secret'),
    )
    const io = createIO()

    await expect(runCLI(['install-presets'], io)).resolves.toBe(1)

    expect(io.error).toHaveBeenCalledWith(
      'ERR_PRESET_OPERATION: Anban preset operation failed.',
    )
    expect(JSON.stringify(io.error.mock.calls)).not.toContain('credential-secret')
  })

  it('preserves known codes and recovery through the shared formatter', async () => {
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
    const io = createIO()

    await expect(runCLI(['install-presets'], io)).resolves.toBe(1)

    expect(io.error).toHaveBeenCalledWith(
      'ERR_PRESET_MODIFIED: The Article preset has local changes. Rerun with --force after reviewing those changes.',
    )
    expect(JSON.stringify(io.error.mock.calls)).not.toContain('leaked-secret')
  })

  it('uses injected debug configuration without trusting a replaced stack', async () => {
    const failure = new OperationalError(
      'ERR_PRESET_LOCKED',
      'Another preset operation is running.',
    )
    failure.stack = [
      'OperationalError: Another preset operation is running.',
      '    at Authorization Bearer leaked-debug-secret',
    ].join('\n')
    presetOperations.installPresets.mockRejectedValue(failure)
    const io = createIO()

    await expect(
      runCLI(['install-presets'], io, {
        environment: { ANBAN_DSH_DEBUG: '1' },
      }),
    ).resolves.toBe(1)

    expect(io.error).toHaveBeenCalledOnce()
    const output = io.error.mock.calls[0]![0] as string
    expect(output.split('\n').slice(0, 2)).toEqual([
      'ERR_PRESET_LOCKED: Another preset operation is running.',
      'OperationalError: Another preset operation is running.',
    ])
    expect(output).not.toContain('leaked-debug-secret')
    expect(output).not.toContain(
      'Authorization: [REDACTED]',
    )
  })
})
