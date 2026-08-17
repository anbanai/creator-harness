import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-skill-filesystem', () => ({
  apply: vi.fn(),
  inject: ['skills'],
  name: 'skill-filesystem',
}))

import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

import { OperationalError } from '../src/operational-error.js'
import { apply, name, type Config } from '../src/skills-provider.js'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
  reject: (reason?: unknown) => void
}

interface FakeChild extends Promise<void> {
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>>
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

function childFiber(
  ready: Promise<void> = Promise.resolve(),
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>> = vi
    .fn()
    .mockResolvedValue(undefined),
): FakeChild {
  return Object.assign(ready, { dispose })
}

function createContext(child: FakeChild = childFiber()) {
  const plugin = vi.fn(() => child)
  const context = { plugin } as unknown as Context
  return { context, plugin }
}

function invalidConfig(value: unknown): Config {
  return value as Config
}

function proxyConfig(
  trapName: 'getPrototypeOf' | 'ownKeys' | 'getOwnPropertyDescriptor',
  marker: string,
) {
  const trap = vi.fn(() => {
    throw new Error(marker)
  })
  const handler: ProxyHandler<Config> = {}
  Object.defineProperty(handler, trapName, { value: trap })
  const config = new Proxy(
    { presetId: 'article', providerName: 'anban-article' },
    handler,
  )
  return { config, trap }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('skills provider registration', () => {
  it('declares the stable plugin name', () => {
    expect(name).toBe('anban-skills-provider')
  })

  it('mounts exactly one isolated Article skill root after the child is ready', async () => {
    const readiness = deferred()
    const fake = createContext(childFiber(readiness.promise))

    let settled = false
    const applying = apply(fake.context, {
      presetId: 'article',
      providerName: 'anban-article',
    }).then((disposer) => {
      settled = true
      return disposer
    })

    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledWith(skillFilesystem, {
      providerName: 'anban-article',
      includeDefaultRoots: false,
      customSkillDirs: [dshHomePath('.agent-presets', 'article', 'skills')],
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    readiness.resolve()
    await expect(applying).resolves.toBeTypeOf('function')
  })

  it('mounts the canonical Seednote skill root', async () => {
    const fake = createContext()

    await apply(fake.context, {
      presetId: 'seednote',
      providerName: 'anban-seednote',
    })

    expect(fake.plugin).toHaveBeenCalledTimes(1)
    expect(fake.plugin).toHaveBeenCalledWith(skillFilesystem, {
      providerName: 'anban-seednote',
      includeDefaultRoots: false,
      customSkillDirs: [dshHomePath('.agent-presets', 'seednote', 'skills')],
    })
  })

  it('awaits the child fiber disposer', async () => {
    const disposal = deferred()
    const dispose = vi.fn(() => disposal.promise)
    const fake = createContext(childFiber(Promise.resolve(), dispose))
    const cleanup = await apply(fake.context, {
      presetId: 'article',
      providerName: 'anban-article',
    })

    let settled = false
    const disposing = cleanup().then(() => {
      settled = true
    })

    expect(dispose).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(settled).toBe(false)

    disposal.resolve()
    await disposing
    expect(settled).toBe(true)
  })

  it('awaits disposal of the created child before preserving a readiness failure', async () => {
    const readiness = deferred()
    const disposal = deferred()
    const dispose = vi.fn(() => disposal.promise)
    const fake = createContext(childFiber(readiness.promise, dispose))
    const readinessFailure = new Error('readiness failed')

    let settled = false
    const applying = apply(fake.context, {
      presetId: 'article',
      providerName: 'anban-article',
    }).catch((error: unknown) => {
      settled = true
      return error
    })

    readiness.reject(readinessFailure)
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)

    disposal.resolve()
    await expect(applying).resolves.toBe(readinessFailure)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('shares one awaited disposal across repeated and concurrent cleanup calls', async () => {
    const disposal = deferred()
    const dispose = vi.fn(() => disposal.promise)
    const fake = createContext(childFiber(Promise.resolve(), dispose))
    const cleanup = await apply(fake.context, {
      presetId: 'article',
      providerName: 'anban-article',
    })

    const first = cleanup()
    const second = cleanup()
    const third = cleanup()

    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(dispose).toHaveBeenCalledTimes(1)

    disposal.resolve()
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      undefined,
      undefined,
      undefined,
    ])
    expect(cleanup()).toBe(first)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('reports a controlled readiness failure when rollback disposal also fails', async () => {
    const readinessSecret = 'readiness-token-secret'
    const disposalSecret = 'disposal-password-secret'
    const dispose = vi.fn().mockRejectedValue(new Error(disposalSecret))
    const fake = createContext(
      childFiber(Promise.reject(new Error(readinessSecret)), dispose),
    )

    const failure = await apply(fake.context, {
      presetId: 'seednote',
      providerName: 'anban-seednote',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(OperationalError)
    expect(failure).toHaveProperty('code', 'ERR_PRESET_OPERATION')
    expect(failure).toHaveProperty(
      'message',
      'Anban preset Skills failed to become ready and cleanup also failed.',
    )
    expect(failure).not.toHaveProperty('cause')
    expect(String(failure)).not.toContain(readinessSecret)
    expect(String(failure)).not.toContain(disposalSecret)
    expect(JSON.stringify(failure)).not.toContain(readinessSecret)
    expect(JSON.stringify(failure)).not.toContain(disposalSecret)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('shares one controlled secret-safe rejection when cleanup disposal fails', async () => {
    const disposalSecret = 'cleanup-authorization-secret'
    const dispose = vi.fn().mockRejectedValue(new Error(disposalSecret))
    const fake = createContext(childFiber(Promise.resolve(), dispose))
    const cleanup = await apply(fake.context, {
      presetId: 'article',
      providerName: 'anban-article',
    })

    const first = cleanup()
    const second = cleanup()
    const firstFailure = await first.catch((error: unknown) => error)
    const secondFailure = await second.catch((error: unknown) => error)

    expect(first).toBe(second)
    expect(firstFailure).toBe(secondFailure)
    expect(firstFailure).toBeInstanceOf(OperationalError)
    expect(firstFailure).toHaveProperty('code', 'ERR_PRESET_OPERATION')
    expect(firstFailure).toHaveProperty(
      'message',
      'Unable to dispose Anban preset Skills.',
    )
    expect(firstFailure).not.toHaveProperty('cause')
    expect(String(firstFailure)).not.toContain(disposalSecret)
    expect(JSON.stringify(firstFailure)).not.toContain(disposalSecret)
    expect(cleanup()).toBe(first)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('skills provider validation', () => {
  it.each([
    ['getPrototypeOf', 'get-prototype-credential-secret'],
    ['ownKeys', 'own-keys-token-secret'],
    ['getOwnPropertyDescriptor', 'descriptor-password-secret'],
  ] as const)(
    'contains a throwing %s Proxy trap before loading a child plugin',
    async (trapName, marker) => {
      const fake = createContext()
      const proxy = proxyConfig(trapName, marker)

      const error = await apply(fake.context, proxy.config).catch(
        (reason: unknown) => reason,
      )

      expect(error).toBeInstanceOf(TypeError)
      expect(error).toHaveProperty('message', 'Invalid skills provider config')
      expect(String(error)).toBe('TypeError: Invalid skills provider config')
      expect(
        JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
      ).not.toContain(marker)
      expect(proxy.trap).not.toHaveBeenCalled()
      expect(fake.plugin).not.toHaveBeenCalled()
    },
  )

  it.each([
    null,
    [],
    Object.create(null),
    Object.assign(Object.create({ inherited: true }), {
      presetId: 'article',
      providerName: 'anban-article',
    }),
  ])('rejects a non-plain config before loading a child plugin', async (config) => {
    const fake = createContext()

    await expect(apply(fake.context, invalidConfig(config))).rejects.toThrow(
      'Invalid skills provider config',
    )

    expect(fake.plugin).not.toHaveBeenCalled()
  })

  it.each([
    '',
    '   ',
    'unknown',
    '.',
    '..',
    '../article',
    'article/child',
    'article\\child',
  ])(
    'rejects an unsupported preset id before loading a child plugin',
    async (presetId) => {
      const fake = createContext()

      await expect(
        apply(fake.context, { presetId, providerName: 'anban-article' }),
      ).rejects.toThrow('Invalid skills provider config')

      expect(fake.plugin).not.toHaveBeenCalled()
    },
  )

  it.each([
    '',
    '   ',
    '-anban-article',
    'anban-article-',
    'anban/article',
    'anban\\article',
    'anban\narticle',
    'token=credential-secret',
    'https://credential.invalid',
    'a'.repeat(65),
  ])(
    'rejects an unsafe provider name before loading a child plugin',
    async (providerName) => {
      const fake = createContext()

      await expect(
        apply(fake.context, { presetId: 'article', providerName }),
      ).rejects.toThrow('Invalid skills provider config')

      expect(fake.plugin).not.toHaveBeenCalled()
    },
  )

  it('rejects unknown own keys without exposing their values', async () => {
    const fake = createContext()
    const credential = 'credential-secret-value'

    const rejection = apply(
      fake.context,
      invalidConfig({
        presetId: 'article',
        providerName: 'anban-article',
        token: credential,
      }),
    )

    await expect(rejection).rejects.toThrow('Invalid skills provider config')
    await expect(rejection).rejects.not.toThrow(credential)
    expect(fake.plugin).not.toHaveBeenCalled()
  })

  it('rejects accessor properties without executing them', async () => {
    const fake = createContext()
    const getter = vi.fn(() => 'article')
    const config = Object.defineProperties(
      {},
      {
        presetId: { enumerable: true, get: getter },
        providerName: {
          enumerable: true,
          value: 'anban-article',
          writable: true,
        },
      },
    )

    await expect(
      apply(fake.context, invalidConfig(config)),
    ).rejects.toThrow('Invalid skills provider config')

    expect(getter).not.toHaveBeenCalled()
    expect(fake.plugin).not.toHaveBeenCalled()
  })
})
