import { types } from 'node:util'

const MAX_SAFE_ERROR_LENGTH = 512
const AUTHORIZATION_VALUE_PATTERN =
  /\bauthorization\b\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}]+)/gi
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u001f\u007f-\u009f]+/g
const WHITESPACE_PATTERN = /\s+/g

function ownString(error: Error, key: 'message' | 'name'): string | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, key)
    return descriptor !== undefined &&
      'value' in descriptor &&
      typeof descriptor.value === 'string'
      ? descriptor.value
      : undefined
  } catch {
    return undefined
  }
}

function renderUnknown(error: unknown): string {
  switch (typeof error) {
    case 'string':
      return error
    case 'boolean':
    case 'bigint':
    case 'number':
    case 'symbol':
    case 'undefined':
      return String(error)
    case 'function':
      return 'Unknown error'
    case 'object':
      if (error === null) {
        return 'null'
      }
      if (types.isProxy(error) || !types.isNativeError(error)) {
        return 'Unknown error'
      }

      const name = ownString(error, 'name') ?? 'Error'
      const message = ownString(error, 'message')
      return message === undefined || message === ''
        ? name
        : `${name}: ${message}`
  }
}

/** Render an unknown failure without retaining its stack, cause, or payload. */
export function safeErrorLine(error: unknown, secret?: string): string {
  let line = renderUnknown(error).replace(
    AUTHORIZATION_VALUE_PATTERN,
    'Authorization: [REDACTED]',
  )

  if (secret !== undefined && secret !== '') {
    line = line.split(secret).join('[REDACTED]')
  }

  line = line
    .replace(CONTROL_CHARACTERS_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()

  if (line === '') {
    return 'Unknown error'
  }
  return line.slice(0, MAX_SAFE_ERROR_LENGTH)
}

/** Create a fresh operational error whose observable fields contain no cause. */
export function safeError(error: unknown, secret?: string): Error {
  return new Error(safeErrorLine(error, secret))
}
