import { types } from 'node:util'

const MAX_ERROR_SCAN_LENGTH = 4_096
const MAX_SAFE_ERROR_LENGTH = 512
const MIN_SAFE_SECRET_LENGTH = 8
const OMITTED_ERROR_LINE = 'Error details omitted'
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u001f\u007f-\u009f]+/g
const WHITESPACE_PATTERN = /\s+/g
const AUTHORIZATION_KEY = 'authorization'
const REDACTED_AUTHORIZATION = 'Authorization: [REDACTED]'

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

function isAsciiWord(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  )
}

function isAuthorizationSeparator(code: number): boolean {
  return (
    code === 34 ||
    code === 39 ||
    code === 92 ||
    code <= 32 ||
    (code >= 127 && code <= 159)
  )
}

function authorizationStart(line: string): number | undefined {
  for (let start = 0; start < line.length; start += 1) {
    if (
      line[start]?.toLowerCase() !== AUTHORIZATION_KEY[0] ||
      (start > 0 && isAsciiWord(line.charCodeAt(start - 1)))
    ) {
      continue
    }

    let cursor = start
    let keyIndex = 0
    while (keyIndex < AUTHORIZATION_KEY.length) {
      if (line[cursor]?.toLowerCase() !== AUTHORIZATION_KEY[keyIndex]) {
        break
      }
      cursor += 1
      keyIndex += 1

      if (keyIndex < AUTHORIZATION_KEY.length) {
        while (
          cursor < line.length &&
          isAuthorizationSeparator(line.charCodeAt(cursor))
        ) {
          cursor += 1
        }
      }
    }

    if (
      keyIndex !== AUTHORIZATION_KEY.length ||
      (cursor < line.length && isAsciiWord(line.charCodeAt(cursor)))
    ) {
      continue
    }

    while (
      cursor < line.length &&
      isAuthorizationSeparator(line.charCodeAt(cursor))
    ) {
      cursor += 1
    }
    if (line[cursor] === ':' || line[cursor] === '=' || line[cursor] === ',') {
      return start
    }
  }
  return undefined
}

function redactSecret(line: string, secret: string): string {
  const variants = new Set([
    secret,
    secret.replaceAll('"', '\\"'),
    secret.replaceAll("'", "\\'"),
  ])
  for (const variant of variants) {
    line = line.split(variant).join('[REDACTED]')
  }
  return line
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
  if (secret !== undefined && secret !== '') {
    line = redactSecret(line, secret)
  }

  const authorization = authorizationStart(line)
  if (authorization !== undefined) {
    line = `${line.slice(0, authorization)}${REDACTED_AUTHORIZATION}`
  }

  line = line
    .replace(CONTROL_CHARACTERS_PATTERN, '')
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
