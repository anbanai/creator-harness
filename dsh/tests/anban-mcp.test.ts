import type { Context, Events } from '@deepseek-ai/cordis'
import {
  credentialRef,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-mcp-client', () => ({
  apply: vi.fn(),
  inject: ['tools'],
  name: 'mcp-client',
}))

import * as mcpClient from '@deepseek-ai/dsh-mcp-client'

import { apply, inject, name } from '../src/anban-mcp.js'
import { safeErrorLine } from '../src/safe-error.js'

const API_KEY_REF = credentialRef('ANBAN_API_KEY')
const FAKE_SECRET = 'fake-anban-secret-value'
const INVALID_CREDENTIAL_WARNING =
  'anban-mcp: ANBAN_API_KEY is invalid; creator MCP tools are unavailable'
const OMITTED_ERROR_LINE = 'Error details omitted'
const EMBEDDED_QUOTE_SECRET = 'resolved-secret-"embedded-secret-suffix'
const EMBEDDED_QUOTE_MESSAGE =
  String.raw`prefix {"Authorization":"Bearer resolved-secret-\"embedded-secret-suffix"} trailing-diagnostic-suffix`
const BACKSLASH_SECRET = String.raw`abcd\efgh`

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

interface FakeChild extends Promise<void> {
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>>
}

type UpdatedListener = Events['credentials/updated']
type RuntimeUpdatedListener = (
  ...args: Parameters<UpdatedListener>
) => unknown

interface FakeContext {
  context: Context
  emitUpdated: (ref?: CredentialRef) => Promise<unknown>
  listenerDisposer: ReturnType<typeof vi.fn<() => boolean>>
  loggerWarn: ReturnType<typeof vi.fn>
  mounted: FakeChild[]
  on: ReturnType<typeof vi.fn>
  plugin: ReturnType<typeof vi.fn>
  resolve: ReturnType<
    typeof vi.fn<
      (ref: CredentialRef) => Promise<ResolvedCredential | undefined>
    >
  >
  setCredential: (value: string | undefined) => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function childFiber(
  ready: Promise<void> = Promise.resolve(),
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>> = vi
    .fn()
    .mockResolvedValue(undefined),
): FakeChild {
  return Object.assign(ready, { dispose })
}

function resolved(value: string): ResolvedCredential {
  return { source: 'test', value }
}

function createContext(options: {
  children?: FakeChild[]
  credential?: string
  onPlugin?: () => void
  resolve?: FakeContext['resolve']
} = {}): FakeContext {
  let credential = options.credential
  let listener: RuntimeUpdatedListener | undefined
  const children = [...(options.children ?? [])]
  const mounted: FakeChild[] = []
  const resolve =
    options.resolve ??
    vi.fn(async () =>
      credential === undefined ? undefined : resolved(credential),
    )
  const plugin = vi.fn(() => {
    options.onPlugin?.()
    const child = children.shift() ?? childFiber()
    mounted.push(child)
    return child
  })
  const listenerDisposer = vi.fn(() => {
    const removed = listener !== undefined
    listener = undefined
    return removed
  })
  const on = vi.fn(
    (
      event: 'credentials/updated',
      callback: UpdatedListener,
    ): (() => boolean) => {
      expect(event).toBe('credentials/updated')
      listener = callback as RuntimeUpdatedListener
      return listenerDisposer
    },
  )
  const loggerWarn = vi.fn()
  const context = {
    credentials: { resolve },
    logger: { warn: loggerWarn },
    on,
    plugin,
  } as unknown as Context

  return {
    context,
    emitUpdated: async (ref = API_KEY_REF) => listener?.(ref),
    listenerDisposer,
    loggerWarn,
    mounted,
    on,
    plugin,
    resolve,
    setCredential(value) {
      credential = value
    },
  }
}

async function flushUntil(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch {
      await Promise.resolve()
    }
  }
  assertion()
}

function renderedError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  return JSON.stringify(error, Object.getOwnPropertyNames(error))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('anban MCP registration', () => {
  it('declares the exact plugin metadata and official credentials event shape', async () => {
    const fake = createContext()
    const cleanup = await apply(fake.context)

    expect(name).toBe('anban-mcp')
    expect(inject).toEqual(['credentials'])
    expect(fake.on).toHaveBeenCalledWith(
      'credentials/updated',
      expect.any(Function),
    )
    expect(fake.listenerDisposer).not.toHaveBeenCalled()

    await cleanup()
    expect(fake.listenerDisposer).toHaveBeenCalledTimes(1)
    expect(fake.listenerDisposer.mock.results[0]?.value).toBe(true)
  })

  it('stays active without ANBAN_API_KEY, mounts no child, and warns once', async () => {
    const fake = createContext()

    const cleanup = await apply(fake.context)
    await fake.emitUpdated()

    expect(cleanup).toBeTypeOf('function')
    expect(fake.resolve).toHaveBeenCalledTimes(2)
    expect(fake.resolve).toHaveBeenNthCalledWith(1, API_KEY_REF)
    expect(fake.plugin).not.toHaveBeenCalled()
    expect(fake.loggerWarn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(fake.loggerWarn.mock.calls)).not.toContain(FAKE_SECRET)

    await cleanup()
  })

  it('mounts exactly one creator child with the fixed streamable HTTP config', async () => {
    const fake = createContext({ credential: FAKE_SECRET })

    const cleanup = await apply(fake.context)

    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledWith(mcpClient, {
      transport: 'streamable-http',
      serverName: 'creator',
      url: 'https://creator.anbanai.com/mcp',
      headers: { Authorization: `Bearer ${FAKE_SECRET}` },
      toolCallTimeoutMs: 900_000,
      failOnStartupError: false,
    })
    expect(fake.loggerWarn).not.toHaveBeenCalled()

    await cleanup()
  })

  it.each([
    ['empty', ''],
    ['CR/LF', `${FAKE_SECRET}\r\ncontrol-suffix`],
    ['NUL', `${FAKE_SECRET}\u0000control-suffix`],
    ['C0', `${FAKE_SECRET}\u001fcontrol-suffix`],
    ['DEL', `${FAKE_SECRET}\u007fcontrol-suffix`],
    ['C1', `${FAKE_SECRET}\u0085control-suffix`],
    ['non-ByteString', `${FAKE_SECRET}\u0100control-suffix`],
    ['trailing space', `${FAKE_SECRET} control-suffix `],
    ['oversized', 'x'.repeat(4_097)],
  ])(
    'keeps the plugin active without mounting for an invalid %s credential',
    async (_label, credential) => {
      const fake = createContext({ credential })

      const cleanup = await apply(fake.context)
      await fake.emitUpdated()

      expect(cleanup).toBeTypeOf('function')
      expect(fake.plugin.mock.calls.length).toBe(0)
      expect(fake.loggerWarn).toHaveBeenCalledTimes(1)
      expect(fake.loggerWarn).toHaveBeenCalledWith(
        INVALID_CREDENTIAL_WARNING,
      )
      const logs = JSON.stringify(fake.loggerWarn.mock.calls)
      expect(logs).not.toContain(FAKE_SECRET)
      expect(logs).not.toContain('control-suffix')
      expect(logs).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)

      await cleanup()
    },
  )

  it('preserves a valid credential at the exact length boundary', async () => {
    const credential = ` ${'v'.repeat(4_095)}`
    const fake = createContext({ credential })

    const cleanup = await apply(fake.context)

    expect(credential).toHaveLength(4_096)
    expect(fake.plugin).toHaveBeenCalledWith(
      mcpClient,
      expect.objectContaining({
        headers: { Authorization: `Bearer ${credential}` },
      }),
    )

    await cleanup()
  })
})

describe('anban MCP credential reconciliation', () => {
  it('ignores unrelated credential updates', async () => {
    const fake = createContext({ credential: FAKE_SECRET })
    const cleanup = await apply(fake.context)

    await fake.emitUpdated(credentialRef('OTHER_API_KEY'))

    expect(fake.resolve).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.mounted[0]?.dispose).not.toHaveBeenCalled()

    await cleanup()
  })

  it('disposes before every resolve and serializes rapid matching updates', async () => {
    const order: string[] = []
    const first = childFiber(
      Promise.resolve(),
      vi.fn(async () => {
        order.push('dispose:first')
      }),
    )
    const second = childFiber(
      Promise.resolve(),
      vi.fn(async () => {
        order.push('dispose:second')
      }),
    )
    const third = childFiber()
    const resolve = vi
      .fn<(ref: CredentialRef) => Promise<ResolvedCredential | undefined>>()
      .mockImplementationOnce(async () => {
        order.push('resolve:first')
        return resolved('first-secret')
      })
      .mockImplementationOnce(async () => {
        order.push('resolve:second')
        return resolved('second-secret')
      })
      .mockImplementationOnce(async () => {
        order.push('resolve:third')
        return resolved('third-secret')
      })
    let mount = 0
    const fake = createContext({
      children: [first, second, third],
      onPlugin: () => {
        mount += 1
        order.push(`mount:${mount}`)
      },
      resolve,
    })

    const cleanup = await apply(fake.context)
    order.length = 0
    const updateOne = fake.emitUpdated()
    const updateTwo = fake.emitUpdated()
    await Promise.all([updateOne, updateTwo])

    expect(order).toEqual([
      'dispose:first',
      'resolve:second',
      'mount:2',
      'dispose:second',
      'resolve:third',
      'mount:3',
    ])
    expect(fake.plugin).toHaveBeenCalledTimes(3)
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.dispose).toHaveBeenCalledTimes(1)

    await cleanup()
  })

  it('unsetting removes the child and warns once for that missing period', async () => {
    const child = childFiber()
    const fake = createContext({ children: [child], credential: FAKE_SECRET })
    const cleanup = await apply(fake.context)
    fake.setCredential(undefined)

    await fake.emitUpdated()
    await fake.emitUpdated()

    expect(child.dispose).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.loggerWarn).toHaveBeenCalledTimes(1)

    await cleanup()
    expect(child.dispose).toHaveBeenCalledTimes(1)
  })

  it('warns again only after a configured credential mounted successfully', async () => {
    const fake = createContext()
    const cleanup = await apply(fake.context)

    fake.setCredential(FAKE_SECRET)
    await fake.emitUpdated()
    fake.setCredential(undefined)
    await fake.emitUpdated()

    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.loggerWarn).toHaveBeenCalledTimes(2)

    await cleanup()
  })

  it('recovers from an invalid credential and resets its warning only after mounting', async () => {
    const invalid = `${FAKE_SECRET}\r\ncontrol-suffix`
    const child = childFiber()
    const fake = createContext({ children: [child], credential: invalid })
    const cleanup = await apply(fake.context)

    await fake.emitUpdated()
    expect(fake.loggerWarn).toHaveBeenCalledTimes(1)
    expect(fake.plugin.mock.calls.length).toBe(0)

    fake.setCredential(FAKE_SECRET)
    await fake.emitUpdated()
    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.loggerWarn).toHaveBeenCalledTimes(1)

    fake.setCredential(invalid)
    await fake.emitUpdated()
    expect(child.dispose).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.loggerWarn).toHaveBeenCalledTimes(2)
    expect(fake.loggerWarn).toHaveBeenLastCalledWith(
      INVALID_CREDENTIAL_WARNING,
    )
    const logs = JSON.stringify(fake.loggerWarn.mock.calls)
    expect(logs).not.toContain(FAKE_SECRET)
    expect(logs).not.toContain('control-suffix')

    await cleanup()
  })

  it('removes the listener, waits queued refreshes, then disposes the last child', async () => {
    const readiness = deferred()
    const first = childFiber()
    const second = childFiber(readiness.promise)
    const fake = createContext({
      children: [first, second],
      credential: FAKE_SECRET,
    })
    const cleanup = await apply(fake.context)

    const update = fake.emitUpdated()
    await flushUntil(() => expect(fake.plugin).toHaveBeenCalledTimes(2))
    let disposed = false
    const disposal = cleanup().then(() => {
      disposed = true
    })

    expect(fake.listenerDisposer).toHaveBeenCalledTimes(1)
    expect(second.dispose).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(disposed).toBe(false)

    readiness.resolve()
    await update
    await disposal

    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(await fake.emitUpdated()).toBeUndefined()
    expect(fake.plugin).toHaveBeenCalledTimes(2)
  })

  it('contains a failed refresh without breaking the later reconciliation queue', async () => {
    const failure = new Error(`Authorization: Bearer ${FAKE_SECRET}`)
    const fake = createContext({
      children: [childFiber(), childFiber(Promise.reject(failure)), childFiber()],
      credential: FAKE_SECRET,
    })
    const cleanup = await apply(fake.context)

    const error = await fake.emitUpdated().catch((reason: unknown) => reason)
    expect(renderedError(error)).not.toContain(FAKE_SECRET)

    await expect(fake.emitUpdated()).resolves.toBeUndefined()
    expect(fake.plugin).toHaveBeenCalledTimes(3)

    await cleanup()
  })
})

describe('anban MCP failure containment', () => {
  it('rethrows a duplicate creator startup failure once without renaming or retrying', async () => {
    const duplicate = new Error(
      `mcp-client: serverName "creator" already exists; Authorization: Bearer ${FAKE_SECRET}`,
      { cause: new Error(`cause ${FAKE_SECRET}`) },
    )
    duplicate.name = `Duplicate-${FAKE_SECRET}`
    const child = childFiber(Promise.reject(duplicate))
    const fake = createContext({ children: [child], credential: FAKE_SECRET })

    const error = await apply(fake.context).catch((reason: unknown) => reason)
    const rendered = renderedError(error)

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('creator')
    expect(rendered).not.toContain(FAKE_SECRET)
    expect(rendered).not.toContain('cause')
    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.plugin.mock.calls[0]?.[1]).toMatchObject({
      serverName: 'creator',
    })
    expect(child.dispose).toHaveBeenCalledTimes(1)
    expect(fake.listenerDisposer).toHaveBeenCalledTimes(1)
  })

  it('renders hostile unknown errors as one bounded line without inspecting payloads', () => {
    const getter = vi.fn(() => FAKE_SECRET)
    const object = Object.defineProperty({}, 'message', { get: getter })
    const proxyTrap = vi.fn(() => {
      throw new Error(`proxy-${FAKE_SECRET}`)
    })
    const proxy = new Proxy(object, {
      get: proxyTrap,
      getOwnPropertyDescriptor: proxyTrap,
      getPrototypeOf: proxyTrap,
      ownKeys: proxyTrap,
    })
    const aggregate = new AggregateError(
      [new Error(`nested-${FAKE_SECRET}`)],
      `Authorization: Bearer ${FAKE_SECRET}\r\n${'x'.repeat(1_000)}`,
      { cause: new Error(`cause-${FAKE_SECRET}`) },
    )
    aggregate.name = `Aggregate-${FAKE_SECRET}`

    const proxyLine = safeErrorLine(proxy, FAKE_SECRET)
    const objectLine = safeErrorLine(object, FAKE_SECRET)
    const aggregateLine = safeErrorLine(aggregate, FAKE_SECRET)
    const authorizationLine = safeErrorLine(
      'request failed Authorization: Basic public-but-sensitive-value\nnext',
    )

    expect(proxyTrap).not.toHaveBeenCalled()
    expect(getter).not.toHaveBeenCalled()
    for (const line of [
      proxyLine,
      objectLine,
      aggregateLine,
      authorizationLine,
    ]) {
      expect(line).not.toContain(FAKE_SECRET)
      expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
      expect(line.length).toBeLessThanOrEqual(512)
    }
    expect(aggregateLine).toContain('[REDACTED]')
    expect(aggregateLine).not.toContain('nested-')
    expect(aggregateLine).not.toContain('cause-')
    expect(authorizationLine).not.toContain('public-but-sensitive-value')
  })

  it.each([
    ['JSON raw string', '{"Authorization":"Bearer leaked-secret"}'],
    [
      'lowercase raw string',
      'headers={"authorization":"Basic leaked-secret"}',
    ],
    [
      'single-quoted raw string',
      "headers={'Authorization':'Bearer leaked-secret'}",
    ],
    [
      'mismatched-quote raw string',
      "headers={'Authorization\":\"Bearer leaked-secret\"}",
    ],
    ['JSON Error', new Error('{"Authorization":"Bearer leaked-secret"}')],
    [
      'lowercase Error',
      new Error('headers={"authorization":"Basic leaked-secret"}'),
    ],
    [
      'single-quoted Error',
      new Error("headers={'Authorization':'Bearer leaked-secret'}"),
    ],
    [
      'mismatched-quote Error',
      new Error("headers={'Authorization\":\"Bearer leaked-secret\"}"),
    ],
  ])('redacts a quoted Authorization header from a %s', (_label, error) => {
    const line = safeErrorLine(error)

    expect(line).toContain('[REDACTED]')
    expect(line).not.toContain('leaked-secret')
    expect(line).not.toMatch(/\b(?:Bearer|Basic)\s+[^\s,;}]+/i)
    expect(line).not.toMatch(/["']authorization["']\s*[:=]/i)
    expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
    expect(line.length).toBeLessThanOrEqual(512)
  })

  it.each([
    ['Bearer value', 'request Authorization Bearer leaked-secret'],
    [
      'parenthesized Bearer payload',
      'request Authorization Bearer (leaked-secret)',
    ],
    [
      'bracketed Bearer payload',
      'request Authorization Bearer [leaked-secret]',
    ],
    [
      'braced Bearer payload',
      'request Authorization Bearer {leaked-secret}',
    ],
    ['dotted token', 'request authorization.token=leaked-secret'],
    ['braced boundary', 'request {Authorization: Bearer leaked-secret}'],
    ['hyphen boundary', 'request -authorization=leaked-secret'],
    ['slash boundary', 'request /authorization.token=leaked-secret'],
    ['indexed value', 'request authorization[0]=leaked-secret'],
    [
      'quoted indexed value',
      'request authorization["token"]=leaked-secret',
    ],
    [
      'parenthesized value',
      'request authorization(Bearer leaked-secret)',
    ],
    ['nested header', 'request headers.authorization=leaked-secret'],
    ['bracketed key', 'request [Authorization]=leaked-secret'],
    ['spaced assignment', 'request authorization = leaked-secret'],
    ['mixed case', 'request aUtHoRiZaTiOn: Bearer leaked-secret'],
    [
      'escaped quotes',
      String.raw`request {\"Authorization\":\"Bearer leaked-secret\"}`,
    ],
    [
      'array JSON',
      'request ["headers",{"authorization":"Bearer leaked-secret"}]',
    ],
    ['tab separator', 'request Authorization\tBearer leaked-secret'],
    [
      'NUL-interrupted key',
      'request Authoriza\u0000tion: Bearer leaked-secret',
    ],
    [
      'zero-width-space-interrupted key',
      'request Authori\u200bzation: Bearer leaked-secret',
    ],
    [
      'word-joiner-interrupted key',
      'request Authori\u2060zation: Bearer leaked-secret',
    ],
    [
      'language-tag-interrupted key',
      'request Authori\u{e0001}zation: Bearer leaked-secret',
    ],
    [
      'Syriac-mark-interrupted key',
      'request Authori\u070fzation: Bearer leaked-secret',
    ],
  ])('redacts Authorization carried by %s', (_label, diagnostic) => {
    const line = safeErrorLine(diagnostic)

    expect(line).toContain('[REDACTED]')
    expect(line).not.toContain('leaked-secret')
    expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
    expect(line.length).toBeLessThanOrEqual(512)
  })

  it.each([
    ['xauthorization key', 'request xauthorization=public-value'],
    ['longer identifier key', 'request authorizationPolicy=public-value'],
    ['ordinary prose', 'request failed because authorization is required'],
    ['Bearer scheme without payload', 'request authorization Bearer'],
    ['Basic scheme without payload', 'request authorization Basic'],
    ['empty parenthesized payload', 'request Authorization Bearer ()'],
    ['empty bracketed payload', 'request Authorization Bearer []'],
    ['empty braced payload', 'request Authorization Bearer {}'],
    [
      'nested empty balanced payload',
      'request Authorization Bearer ({[]})',
    ],
  ])('preserves non-Authorization carrier text from %s', (_label, diagnostic) => {
    expect(safeErrorLine(diagnostic)).toBe(diagnostic)
  })

  it('preserves a scheme without a payload hidden by a format control', () => {
    expect(safeErrorLine('request authorization Bearer \u200b')).toBe(
      'request authorization Bearer',
    )
  })

  it('preserves a scheme followed only by trailing whitespace', () => {
    expect(safeErrorLine('request authorization Bearer   ')).toBe(
      'request authorization Bearer',
    )
  })

  it.each([
    [
      'escaped JSON',
      String.raw`{\"Authorization\":\"Bearer leaked-secret\"}`,
    ],
    ['tuple', '[ ["Authorization","Bearer leaked-secret"] ]'],
    [
      'control-interrupted key',
      'Auth\u0000orization: Bearer leaked-secret',
    ],
    [
      'escaped-quote-interrupted key',
      String.raw`A\"uthorization: Bearer leaked-secret`,
    ],
    ['whitespace-interrupted key', 'Auth orization: Bearer leaked-secret'],
    [
      'NBSP-interrupted key',
      'Auth\u00a0orization: Bearer leaked-secret',
    ],
    [
      'Ogham-space-interrupted key',
      'Auth\u1680orization: Bearer leaked-secret',
    ],
    [
      'line-separator-interrupted key',
      'Auth\u2028orization: Bearer leaked-secret',
    ],
  ])('redacts a structurally disguised Authorization header from %s', (_label, error) => {
    const line = safeErrorLine(error)

    expect(line).toContain('[REDACTED]')
    expect(line).not.toContain('leaked-secret')
    expect(line).not.toMatch(/\bBearer\s+[^\s,;}\]]+/i)
    expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
    expect(line.length).toBeLessThanOrEqual(512)
  })

  it.each([
    ['raw string', EMBEDDED_QUOTE_MESSAGE],
    ['Error', new Error(EMBEDDED_QUOTE_MESSAGE)],
  ])(
    'redacts an embedded escaped quote and the remaining payload from a %s with its secret',
    (_label, error) => {
      const line = safeErrorLine(error, EMBEDDED_QUOTE_SECRET)

      expect(line).toContain('[REDACTED]')
      expect(line).not.toContain(EMBEDDED_QUOTE_SECRET)
      expect(line).not.toContain('embedded-secret-suffix')
      expect(line).not.toContain('trailing-diagnostic-suffix')
      expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
      expect(line.length).toBeLessThanOrEqual(512)
    },
  )

  it.each([
    ['raw string', EMBEDDED_QUOTE_MESSAGE],
    ['Error', new Error(EMBEDDED_QUOTE_MESSAGE)],
  ])(
    'redacts an embedded escaped quote and the entire payload from a %s without a secret',
    (_label, error) => {
      const line = safeErrorLine(error)

      expect(line).toContain('[REDACTED]')
      expect(line).not.toContain('Bearer')
      expect(line).not.toContain('embedded-secret-suffix')
      expect(line).not.toContain('trailing-diagnostic-suffix')
      expect(line).not.toMatch(/[\r\n\u0000-\u001f\u007f-\u009f]/)
      expect(line.length).toBeLessThanOrEqual(512)
    },
  )

  it('redacts an escaped secret outside an Authorization payload', () => {
    const line = safeErrorLine(
      String.raw`request token=resolved-secret-\"embedded-secret-suffix`,
      EMBEDDED_QUOTE_SECRET,
    )

    expect(line).toContain('[REDACTED]')
    expect(line).not.toContain('embedded-secret-suffix')
  })

  it.each([
    ['control removal', 'abcdefghijklmno', 'token=abcd\u0000efghijklmno'],
    ['whitespace collapse', 'abcd efgh', 'token=abcd  efgh'],
    [
      'JSON backslash escaping',
      BACKSLASH_SECRET,
      `token=${JSON.stringify(BACKSLASH_SECRET).slice(1, -1)}`,
    ],
  ])('redacts a secret reconstructed by %s', (_label, secret, diagnostic) => {
    expect(safeErrorLine(diagnostic, secret)).toBe('token=[REDACTED]')
  })

  it('omits oversized errors before scanning their name and message', () => {
    const error = new Error(
      `${'x'.repeat(4_097)} Authorization: Bearer leaked-secret`,
    )
    error.name = 'HugeError'

    expect(safeErrorLine(error)).toBe(OMITTED_ERROR_LINE)
  })

  it('omits short or oversized secrets before replacement allocation', () => {
    const huge = new Error('x'.repeat(100_000))

    expect(safeErrorLine(huge, 'x')).toBe(OMITTED_ERROR_LINE)
    expect(safeErrorLine('safe message', 'x')).toBe(OMITTED_ERROR_LINE)
    expect(safeErrorLine('safe message', 'x'.repeat(4_097))).toBe(
      OMITTED_ERROR_LINE,
    )
  })

  it.each([
    [undefined, 'undefined'],
    [null, 'null'],
    [false, 'false'],
    [42, '42'],
    [42n, '42'],
    [Symbol('safe'), 'Symbol(safe)'],
  ])('renders the primitive %s safely', (value, expected) => {
    expect(safeErrorLine(value, '')).toBe(expected)
  })
})
