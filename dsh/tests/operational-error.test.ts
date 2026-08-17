import { describe, expect, it } from 'vitest'

import {
  OPERATIONAL_ERROR_CODES,
  OperationalError,
  formatOperationalError,
  isDshDebugEnabled,
  type OperationalErrorCode,
} from '../src/operational-error.js'

const EXPECTED_CODES = [
  'ERR_RUNTIME_MISSING',
  'ERR_PRESET_UNOWNED',
  'ERR_PRESET_MODIFIED',
  'ERR_PRESET_LOCKED',
  'ERR_PRESET_LOCK_INVALID',
  'ERR_PRESET_ROLLBACK',
  'ERR_PRESET_OPERATION',
] as const satisfies readonly OperationalErrorCode[]

describe('OperationalError', () => {
  it('supports exactly the seven stable public codes', () => {
    expect(OPERATIONAL_ERROR_CODES).toEqual(EXPECTED_CODES)

    for (const code of EXPECTED_CODES) {
      const error = new OperationalError(code, 'The operation could not finish.')

      expect(error.code).toBe(code)
      expect(formatOperationalError(error)).toBe(
        `${code}: The operation could not finish.`,
      )
    }
  })

  it('keeps the approved code set and validated public fields immutable', () => {
    const error = new OperationalError(
      'ERR_PRESET_MODIFIED',
      'The Article preset has local changes.',
      { recovery: 'Review the preset before forcing replacement.' },
    )

    expect(Object.isFrozen(OPERATIONAL_ERROR_CODES)).toBe(true)
    expect(() =>
      (OPERATIONAL_ERROR_CODES as unknown as string[]).push(
        'ERR_UNAPPROVED',
      ),
    ).toThrow()
    expect(Reflect.set(error, 'code', 'ERR_UNAPPROVED')).toBe(false)
    expect(Reflect.set(error, 'message', 'Authorization Bearer leaked-secret')).toBe(
      false,
    )
    expect(Reflect.set(error, 'recovery', 'leaked recovery')).toBe(false)
    expect(formatOperationalError(error)).toBe(
      'ERR_PRESET_MODIFIED: The Article preset has local changes. Review the preset before forcing replacement.',
    )
  })

  it('does not allow recovery text to be injected after construction', () => {
    const error = new OperationalError(
      'ERR_PRESET_LOCKED',
      'Another preset operation is running.',
    )

    expect(Reflect.set(error, 'recovery', 'Authorization Bearer leaked-secret')).toBe(
      false,
    )
    expect(formatOperationalError(error)).toBe(
      'ERR_PRESET_LOCKED: Another preset operation is running.',
    )
  })

  it('rejects unapproved runtime codes without echoing them', () => {
    expect(
      () =>
        new OperationalError(
          'ERR_TOKEN_leaked-secret' as OperationalErrorCode,
          'The operation could not finish.',
        ),
    ).toThrow('Invalid operational error code')
  })

  it.each([
    ['', 'empty'],
    ['line one\nline two', 'multiline'],
    ['Authorization Bearer leaked-secret\u0000', 'control'],
    ['Use the caf\u00e9 recovery path.', 'non-ASCII'],
    ['x'.repeat(241), 'oversized'],
  ])('rejects %s public text (%s)', (message) => {
    expect(
      () => new OperationalError('ERR_PRESET_OPERATION', message),
    ).toThrow('Invalid operational error message')
  })

  it('formats owned recovery text on the same bounded public line', () => {
    const error = new OperationalError(
      'ERR_PRESET_OPERATION',
      'Unable to install Anban Presets.',
      { recovery: 'Run anban-dsh status-presets.' },
    )

    const rendered = formatOperationalError(error)

    expect(rendered).toBe(
      'ERR_PRESET_OPERATION: Unable to install Anban Presets. Run anban-dsh status-presets.',
    )
    expect(rendered.split('\n')).toHaveLength(1)
    expect(rendered.length).toBeLessThanOrEqual(512)
  })

  it('never renders its internal cause by default', () => {
    const cause = new Error('Authorization Bearer leaked-secret')
    const error = new OperationalError(
      'ERR_PRESET_OPERATION',
      'Unable to install Anban Presets.',
      { cause, recovery: 'Run anban-dsh status-presets.' },
    )

    const rendered = formatOperationalError(error)

    expect(rendered).not.toContain('leaked-secret')
    expect(rendered).not.toContain('Authorization')
    expect(error).not.toHaveProperty('cause')
  })

  it('sanitizes and bounds every appended debug stack line', () => {
    const preparedStack = [
      'OperationalError: Unable to install Anban Presets.',
      '    at Authorization Bearer leaked-stack-secret',
      `    at ${'x'.repeat(700)}`,
    ].join('\n')
    const previousPrepareStackTrace = Error.prepareStackTrace
    let error: OperationalError
    try {
      Error.prepareStackTrace = () => preparedStack
      error = new OperationalError(
        'ERR_PRESET_OPERATION',
        'Unable to install Anban Presets.',
        { cause: { config: { authorization: 'leaked-object-secret' } } },
      )
      void error.stack
    } finally {
      Error.prepareStackTrace = previousPrepareStackTrace
    }

    const rendered = formatOperationalError(error, { debug: true })
    const lines = rendered.split('\n')

    expect(lines[0]).toBe(
      'ERR_PRESET_OPERATION: Unable to install Anban Presets.',
    )
    expect(lines.slice(1)).toEqual([
      'OperationalError: Unable to install Anban Presets.',
      'at Authorization: [REDACTED]',
      `at ${'x'.repeat(509)}`,
    ])
    expect(lines.every((line) => line.length <= 512)).toBe(true)
    expect(rendered).not.toContain('leaked-stack-secret')
    expect(rendered).not.toContain('leaked-object-secret')
    expect(rendered).not.toContain('config')
  })

  it('never executes a stack getter installed after construction', () => {
    const error = new OperationalError(
      'ERR_PRESET_OPERATION',
      'Unable to install Anban Presets.',
    )
    let getterCalls = 0
    Object.defineProperty(error, 'stack', {
      configurable: true,
      get() {
        getterCalls += 1
        return 'token=credential-secret'
      },
    })

    const rendered = formatOperationalError(error, { debug: true })

    expect(getterCalls).toBe(0)
    expect(rendered).not.toContain('credential-secret')
  })

  it('does not scan a trusted stack snapshot past 4096 characters', () => {
    const preparedStack = `${'x'.repeat(4_096)}\ntail-marker-secret`
    const previousPrepareStackTrace = Error.prepareStackTrace
    let error: OperationalError
    try {
      Error.prepareStackTrace = () => preparedStack
      error = new OperationalError(
        'ERR_PRESET_OPERATION',
        'Unable to install Anban Presets.',
      )
      void error.stack
    } finally {
      Error.prepareStackTrace = previousPrepareStackTrace
    }

    const rendered = formatOperationalError(error, { debug: true })

    expect(rendered).not.toContain('tail-marker-secret')
    expect(rendered.split('\n')).toHaveLength(2)
  })

  it('maps unknown failures to a safe operation diagnostic without inspecting them', () => {
    const unknownFailure = new Proxy(
      { authorization: 'leaked-object-secret' },
      {
        get() {
          throw new Error('arbitrary objects must not be inspected')
        },
      },
    )

    expect(formatOperationalError(unknownFailure, { debug: true })).toBe(
      'ERR_PRESET_OPERATION: Anban preset operation failed.',
    )
  })

  it('does not inspect a proxy wrapped around an operational error', () => {
    const proxiedFailure = new Proxy(
      new OperationalError(
        'ERR_PRESET_MODIFIED',
        'The Article preset has local changes.',
      ),
      {
        get() {
          throw new Error('proxy values must not be inspected')
        },
        getPrototypeOf() {
          throw new Error('proxy prototypes must not be inspected')
        },
      },
    )

    expect(formatOperationalError(proxiedFailure, { debug: true })).toBe(
      'ERR_PRESET_OPERATION: Anban preset operation failed.',
    )
  })
})

describe('DSH debug selection', () => {
  it('enables debug only for the exact ANBAN_DSH_DEBUG=1 setting', () => {
    expect(isDshDebugEnabled({ ANBAN_DSH_DEBUG: '1' })).toBe(true)
    expect(isDshDebugEnabled({ ANBAN_DSH_DEBUG: 'true' })).toBe(false)
    expect(isDshDebugEnabled({})).toBe(false)
  })
})
