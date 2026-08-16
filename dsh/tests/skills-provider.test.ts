import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-skill-filesystem', () => ({
  apply: vi.fn(),
  inject: ['skills'],
  name: 'skill-filesystem',
}))

import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

import { apply, name, type Config } from '../src/skills-provider.js'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

interface FakeChild extends Promise<void> {
  dispose: ReturnType<typeof vi.fn<() => Promise<void>>>
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
