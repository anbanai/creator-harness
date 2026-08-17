import { types } from 'node:util'

const MAX_ERROR_SCAN_LENGTH = 4_096
const MAX_SAFE_ERROR_LENGTH = 512
const MIN_SAFE_SECRET_LENGTH = 8
const OMITTED_ERROR_LINE = 'Error details omitted'
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u001f\u007f-\u009f]+/g
const FORMAT_CONTROL_CHARACTERS_PATTERN = /\p{Cf}+/gu
const FORMAT_CONTROL_CHARACTER_PATTERN = /^\p{Cf}$/u
const IDENTIFIER_CONTINUATION_PATTERN = /^[$\p{ID_Continue}]$/u
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

function formatControlLengthAt(line: string, start: number): number {
  const codePoint = line.codePointAt(start)
  if (codePoint === undefined) {
    return 0
  }
  const character = String.fromCodePoint(codePoint)
  return FORMAT_CONTROL_CHARACTER_PATTERN.test(character) ? character.length : 0
}

function authorizationSchemeSeparatorLength(
  line: string,
  start: number,
): number {
  return isAuthorizationSeparator(line.charCodeAt(start))
    ? 1
    : formatControlLengthAt(line, start)
}

function isAuthorizationPayloadPunctuation(code: number): boolean {
  return code === 44 || code === 58 || code === 59 || code === 61
}

function matchingAuthorizationWrapperEnd(code: number): number | undefined {
  switch (code) {
    case 40:
      return 41
    case 91:
      return 93
    case 123:
      return 125
    default:
      return undefined
  }
}

function isIdentifierContinuationBefore(line: string, start: number): boolean {
  let end = start
  while (end > 0) {
    let previous = end - 1
    const code = line.charCodeAt(previous)
    if (
      code >= 0xdc00 &&
      code <= 0xdfff &&
      previous > 0 &&
      line.charCodeAt(previous - 1) >= 0xd800 &&
      line.charCodeAt(previous - 1) <= 0xdbff
    ) {
      previous -= 1
    }
    const character = line.slice(previous, end)
    if (character !== '\u200c' && character !== '\u200d') {
      return IDENTIFIER_CONTINUATION_PATTERN.test(character)
    }
    end = previous
  }
  return false
}

function isAuthorizationWrapperEnd(code: number): boolean {
  return (
    isAuthorizationSeparator(code) ||
    code === 41 ||
    code === 93
  )
}

function asciiEqualAt(line: string, start: number, expected: string): boolean {
  if (start + expected.length > line.length) {
    return false
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (line[start + index]?.toLowerCase() !== expected[index]) {
      return false
    }
  }
  return true
}

function hasAuthorizationScheme(line: string, start: number): boolean {
  for (const scheme of ['bearer', 'basic']) {
    if (!asciiEqualAt(line, start, scheme)) {
      continue
    }
    const end = start + scheme.length
    if (
      end === line.length ||
      authorizationSchemeSeparatorLength(line, end) === 0
    ) {
      continue
    }
    if (hasAuthorizationPayload(line, end)) {
      return true
    }
  }
  return false
}

function hasAuthorizationPayload(line: string, start: number): boolean {
  let cursor = start
  while (cursor < line.length) {
    const separatorLength = authorizationSchemeSeparatorLength(line, cursor)
    if (separatorLength > 0) {
      cursor += separatorLength
      continue
    }

    const code = line.charCodeAt(cursor)
    if (matchingAuthorizationWrapperEnd(code) !== undefined) {
      return emptyAuthorizationWrappersEnd(line, cursor) === undefined
    }
    if (isAuthorizationPayloadPunctuation(code)) {
      cursor += 1
      continue
    }
    return true
  }
  return false
}

function emptyAuthorizationWrappersEnd(
  line: string,
  start: number,
): number | undefined {
  let cursor = start
  const wrapperEnds: number[] = []
  while (cursor < line.length) {
    const separatorLength = authorizationSchemeSeparatorLength(line, cursor)
    if (separatorLength > 0) {
      cursor += separatorLength
      continue
    }

    const code = line.charCodeAt(cursor)
    const wrapperEnd = matchingAuthorizationWrapperEnd(code)
    if (wrapperEnd !== undefined) {
      wrapperEnds.push(wrapperEnd)
      cursor += 1
      continue
    }
    if (code === 41 || code === 93 || code === 125) {
      if (wrapperEnds.pop() !== code) {
        return undefined
      }
      cursor += 1
      if (wrapperEnds.length === 0) {
        return cursor
      }
      continue
    }
    if (isAuthorizationPayloadPunctuation(code)) {
      cursor += 1
      continue
    }
    return undefined
  }
  return undefined
}

function hasDottedAuthorizationValue(line: string, start: number): boolean {
  let cursor = start
  let hasField = false
  while (cursor < line.length) {
    if (line[cursor] === '.') {
      cursor += 1
      const fieldStart = cursor
      while (cursor < line.length && isAsciiWord(line.charCodeAt(cursor))) {
        cursor += 1
      }
      if (cursor === fieldStart) {
        return false
      }
      hasField = true
      continue
    }
    if (line[cursor] === '[') {
      if (!hasField) {
        return false
      }
      const indexEnd = authorizationIndexEnd(line, cursor)
      if (indexEnd === undefined) {
        return true
      }
      cursor = indexEnd
      continue
    }
    if (line[cursor] === '(') {
      if (!hasField) {
        return false
      }
      const wrapperEnd = emptyAuthorizationWrappersEnd(line, cursor)
      if (wrapperEnd === undefined) {
        return true
      }
      cursor = wrapperEnd
      continue
    }
    if (line[cursor] === ':' || line[cursor] === '=' || line[cursor] === ',') {
      return hasField
    }

    const separatorLength = authorizationSchemeSeparatorLength(line, cursor)
    if (separatorLength === 0) {
      return false
    }
    cursor += separatorLength
  }
  return false
}

function authorizationIndexEnd(
  line: string,
  start: number,
): number | undefined {
  let cursor = start + 1
  let separatorLength = authorizationSchemeSeparatorLength(line, cursor)
  while (separatorLength > 0) {
    cursor += separatorLength
    separatorLength = authorizationSchemeSeparatorLength(line, cursor)
  }

  const valueStart = cursor
  while (cursor < line.length && isAsciiWord(line.charCodeAt(cursor))) {
    cursor += 1
  }
  if (cursor === valueStart) {
    return undefined
  }

  separatorLength = authorizationSchemeSeparatorLength(line, cursor)
  while (separatorLength > 0) {
    cursor += separatorLength
    separatorLength = authorizationSchemeSeparatorLength(line, cursor)
  }
  return line[cursor] === ']' ? cursor + 1 : undefined
}

function authorizationStart(line: string): number | undefined {
  for (let start = 0; start < line.length; start += 1) {
    if (
      line[start]?.toLowerCase() !== AUTHORIZATION_KEY[0] ||
      (start > 0 && isIdentifierContinuationBefore(line, start))
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
        while (cursor < line.length) {
          const separatorLength = authorizationSchemeSeparatorLength(
            line,
            cursor,
          )
          if (separatorLength === 0) {
            break
          }
          cursor += separatorLength
        }
      }
    }

    if (
      keyIndex !== AUTHORIZATION_KEY.length ||
      (cursor < line.length && isAsciiWord(line.charCodeAt(cursor)))
    ) {
      continue
    }

    let separatedByWhitespace = false
    while (cursor < line.length) {
      const code = line.charCodeAt(cursor)
      const formatControlLength = formatControlLengthAt(line, cursor)
      if (!isAuthorizationWrapperEnd(code) && formatControlLength === 0) {
        break
      }
      separatedByWhitespace ||=
        code <= 32 || (code >= 127 && code <= 159) || formatControlLength > 0
      cursor += formatControlLength || 1
    }
    if (line[cursor] === ':' || line[cursor] === '=' || line[cursor] === ',') {
      return start
    }
    if (line[cursor] === '.' && hasDottedAuthorizationValue(line, cursor)) {
      return start
    }
    if (line[cursor] === '[' || line[cursor] === '(') {
      return start
    }
    if (separatedByWhitespace && hasAuthorizationScheme(line, cursor)) {
      return start
    }
  }
  return undefined
}

function redactSecret(line: string, secret: string): string {
  const variants = new Set([
    secret,
    JSON.stringify(secret).slice(1, -1),
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

  const normalizedAuthorization = authorizationStart(line)
  if (normalizedAuthorization !== undefined) {
    line = `${line.slice(0, normalizedAuthorization)}${REDACTED_AUTHORIZATION}`
  }

  if (secret !== undefined && secret !== '') {
    const compactLine = line.replace(FORMAT_CONTROL_CHARACTERS_PATTERN, '')
    const compactRedacted = redactSecret(compactLine, secret)
    if (compactRedacted !== compactLine) {
      line = compactRedacted
    }
    line = redactSecret(line, secret)
  }

  line = line
    .replace(FORMAT_CONTROL_CHARACTERS_PATTERN, ' ')
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
