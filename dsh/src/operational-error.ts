import { safeErrorLine } from './safe-error.js'

export const OPERATIONAL_ERROR_CODES = Object.freeze(
  [
    'ERR_RUNTIME_MISSING',
    'ERR_PRESET_UNOWNED',
    'ERR_PRESET_MODIFIED',
    'ERR_PRESET_LOCKED',
    'ERR_PRESET_LOCK_INVALID',
    'ERR_PRESET_ROLLBACK',
    'ERR_PRESET_OPERATION',
  ] as const,
)

export type OperationalErrorCode = (typeof OPERATIONAL_ERROR_CODES)[number]

export interface OperationalErrorOptions {
  cause?: unknown
  recovery?: string
}

export interface DshDebugEnvironment {
  readonly ANBAN_DSH_DEBUG?: string
}

export interface OperationalDiagnosticsOptions {
  readonly environment?: DshDebugEnvironment
}

export interface OperationalErrorFormatOptions {
  readonly debug?: boolean
}

const MAX_PUBLIC_TEXT_LENGTH = 240
const MAX_DEBUG_STACK_LINES = 32
const MAX_DEBUG_STACK_SCAN_LENGTH = 4_096
const PUBLIC_TEXT_PATTERN = /^[\x20-\x7e]+$/
const OPERATIONAL_ERRORS = new WeakSet<object>()
const OPERATIONAL_STACKS = new WeakMap<object, string | undefined>()

function validateCode(code: OperationalErrorCode): OperationalErrorCode {
  if (!(OPERATIONAL_ERROR_CODES as readonly unknown[]).includes(code)) {
    throw new TypeError('Invalid operational error code')
  }
  return code
}

function validatePublicText(value: string, field: 'message' | 'recovery'): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_PUBLIC_TEXT_LENGTH ||
    !PUBLIC_TEXT_PATTERN.test(value)
  ) {
    throw new TypeError(`Invalid operational error ${field}`)
  }
  return value
}

function captureOwnStack(error: OperationalError): string | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'stack')
    if (descriptor === undefined) {
      return undefined
    }
    const stack =
      'value' in descriptor ? descriptor.value : descriptor.get?.call(error)
    if (typeof stack !== 'string') {
      return undefined
    }
    return stack.slice(0, MAX_DEBUG_STACK_SCAN_LENGTH)
  } catch {
    return undefined
  }
}

function formatDebugStack(stack: string | undefined): string[] {
  if (stack === undefined || stack === '') {
    return []
  }

  const lines: string[] = []
  let lineStart = 0
  while (
    lineStart < stack.length &&
    lines.length < MAX_DEBUG_STACK_LINES
  ) {
    const lineBreak = stack.indexOf('\n', lineStart)
    const lineEnd = lineBreak === -1 ? stack.length : lineBreak
    lines.push(safeErrorLine(stack.slice(lineStart, lineEnd)))
    if (lineBreak === -1) {
      break
    }
    lineStart = lineBreak + 1
  }
  return lines
}

export class OperationalError extends Error {
  declare readonly code: OperationalErrorCode
  declare readonly recovery?: string
  readonly #cause: unknown

  constructor(
    code: OperationalErrorCode,
    message: string,
    options: OperationalErrorOptions = {},
  ) {
    const validatedMessage = validatePublicText(message, 'message')
    const validatedCode = validateCode(code)
    const recovery =
      options.recovery === undefined
        ? undefined
        : validatePublicText(options.recovery, 'recovery')
    super(validatedMessage)
    this.name = 'OperationalError'
    this.#cause = options.cause
    Object.defineProperty(this, 'message', {
      configurable: false,
      enumerable: false,
      value: validatedMessage,
      writable: false,
    })
    Object.defineProperty(this, 'code', {
      configurable: false,
      enumerable: true,
      value: validatedCode,
      writable: false,
    })
    Object.defineProperty(this, 'recovery', {
      configurable: false,
      enumerable: recovery !== undefined,
      value: recovery,
      writable: false,
    })
    OPERATIONAL_STACKS.set(this, captureOwnStack(this))
    OPERATIONAL_ERRORS.add(this)
  }
}

export function isDshDebugEnabled(
  environment: DshDebugEnvironment = process.env,
): boolean {
  try {
    return environment.ANBAN_DSH_DEBUG === '1'
  } catch {
    return false
  }
}

function publicDiagnostic(error: OperationalError): string {
  return safeErrorLine(
    `${error.code}: ${error.message}${
      error.recovery === undefined ? '' : ` ${error.recovery}`
    }`,
  )
}

function isOperationalError(error: unknown): error is OperationalError {
  return (
    typeof error === 'object' &&
    error !== null &&
    OPERATIONAL_ERRORS.has(error)
  )
}

export function formatOperationalError(
  error: unknown,
  options: OperationalErrorFormatOptions = {},
): string {
  if (!isOperationalError(error)) {
    return publicDiagnostic(
      new OperationalError(
        'ERR_PRESET_OPERATION',
        'Anban preset operation failed.',
        { cause: error },
      ),
    )
  }

  const diagnostic = publicDiagnostic(error)
  if (options.debug !== true) {
    return diagnostic
  }

  const stackLines = formatDebugStack(OPERATIONAL_STACKS.get(error))
  return stackLines.length === 0
    ? diagnostic
    : [diagnostic, ...stackLines].join('\n')
}
