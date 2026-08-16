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
