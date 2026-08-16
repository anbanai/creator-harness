import { types } from 'node:util'

const MAX_ERROR_SCAN_LENGTH = 4_096
const MAX_SAFE_ERROR_LENGTH = 512
const MIN_SAFE_SECRET_LENGTH = 8
const OMITTED_ERROR_LINE = 'Error details omitted'
const AUTHORIZATION_VALUE_PATTERN =
  /["']?\bauthorization\b["']?\s*[:=,]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}\]]+)/gi
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u001f\u007f-\u009f]+/g
const ESCAPED_SIMPLE_QUOTE_PATTERN = /\\(["'])/g
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

function bounded(value: string): string | undefined {
  return value.length <= MAX_ERROR_SCAN_LENGTH ? value : undefined
}

function renderUnknown(error: unknown): string | undefined {
  switch (typeof error) {
    case 'string':
      return bounded(error)
    case 'boolean':
    case 'number':
    case 'undefined':
      return String(error)
    case 'bigint':
      if (
        error < BigInt(Number.MIN_SAFE_INTEGER) ||
        error > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return undefined
      }
      return String(error)
    case 'symbol': {
      const description = error.description
      if (
        description !== undefined &&
        description.length > MAX_ERROR_SCAN_LENGTH - 8
      ) {
        return undefined
      }
      return String(error)
    }
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
      if (name.length > MAX_ERROR_SCAN_LENGTH) {
        return undefined
      }
      if (message === undefined || message === '') {
        return name
      }
      if (message.length > MAX_ERROR_SCAN_LENGTH - name.length - 2) {
        return undefined
      }
      return `${name}: ${message}`
  }
}

/** Render an unknown failure without retaining its stack, cause, or payload. */
export function safeErrorLine(error: unknown, secret?: string): string {
  if (
    secret !== undefined &&
    secret !== '' &&
    (typeof secret !== 'string' ||
      secret.length < MIN_SAFE_SECRET_LENGTH ||
      secret.length > MAX_ERROR_SCAN_LENGTH)
  ) {
    return OMITTED_ERROR_LINE
  }

  const rendered = renderUnknown(error)
  if (rendered === undefined) {
    return OMITTED_ERROR_LINE
  }

  let line = rendered
    .replace(ESCAPED_SIMPLE_QUOTE_PATTERN, '$1')
    .replace(CONTROL_CHARACTERS_PATTERN, '')
    .replace(
      AUTHORIZATION_VALUE_PATTERN,
      'Authorization: [REDACTED]',
    )

  if (secret !== undefined && secret !== '') {
    line = line.split(secret).join('[REDACTED]')
  }

  line = line
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
