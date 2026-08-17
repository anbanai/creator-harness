import {
  chmod,
  cp,
  copyFile as realCopyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { execFile, fork, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const copyFault = vi.hoisted(() => ({
  before: undefined as (() => Promise<void> | void) | undefined,
  path: '',
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()

  return {
    ...actual,
    copyFile: async (...args: Parameters<typeof actual.copyFile>) => {
      if (copyFault.before !== undefined) {
        const before = copyFault.before
        copyFault.before = undefined
        await before()
      }
      if (copyFault.path !== '' && String(args[0]) === copyFault.path) {
        copyFault.path = ''
        throw new Error('injected copy interruption')
      }

      return actual.copyFile(...args)
    },
  }
})

import {
  PRESET_IDS,
  installPresets,
  presetTestInternals,
  removePresets,
  statusPresets,
} from '../src/presets.js'
import {
  acquirePresetLock,
  type PresetLockDependencies,
} from '../src/preset-lock.js'

const OWNERSHIP_FILE = '.anban-dsh-preset.json'
const LOCK_NAME = '.anban-dsh.lock'
const execFileAsync = promisify(execFile)
const fixtureRoots: string[] = []
let processPackageRoot = ''

interface Fixture {
  dshHome: string
  root: string
  sourceRoot: string
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-presets-'))
  const dshHome = join(root, 'home')
  const sourceRoot = join(root, 'source')
  fixtureRoots.push(root)

  for (const id of PRESET_IDS) {
    await mkdir(join(sourceRoot, id, 'skills', `${id}-skill`), {
      recursive: true,
    })
    await writeFile(join(sourceRoot, id, 'agent.cordis.yml'), `id: ${id}\n`)
    await writeFile(join(sourceRoot, id, 'preset.yml'), `name: ${id}\n`)
    await writeFile(
      join(sourceRoot, id, 'skills', `${id}-skill`, 'SKILL.md'),
      `# ${id}\n`,
    )
  }

  return { dshHome, root, sourceRoot }
}

function destination(fixture: Fixture, id: string): string {
  return join(fixture.dshHome, '.agent-presets', id)
}

function fixtureOptions(
  fixture: Fixture,
  overrides: {
    faults?: {
      beforeRemoveOperationPath?: (path: string) => Promise<void> | void
      beforeRename?: (source: string, destination: string) => Promise<void> | void
    }
    force?: boolean
    packageVersion?: string
    presetIds?: readonly string[]
    lockDependencies?: Omit<PresetLockDependencies, 'packageVersion'>
  } = {},
) {
  return {
    dshHome: fixture.dshHome,
    sourceRoot: fixture.sourceRoot,
    packageVersion: overrides.packageVersion ?? '1.2.3',
    ...(overrides.faults === undefined ? {} : { faults: overrides.faults }),
    ...(overrides.force === undefined ? {} : { force: overrides.force }),
    ...(overrides.presetIds === undefined
      ? {}
      : { presetIds: overrides.presetIds }),
    ...(overrides.lockDependencies === undefined
      ? {}
      : { lockDependencies: overrides.lockDependencies }),
  }
}

function lockDependencies(
  ownerId: string,
  overrides: Omit<PresetLockDependencies, 'packageVersion'> = {},
): PresetLockDependencies {
  return {
    packageVersion: '1.2.3',
    hostname,
    isPidAlive: () => true,
    pid: process.pid,
    randomOwnerId: () => ownerId,
    retryIntervalMs: 1,
    timeoutMs: 250,
    ...overrides,
  }
}

interface WorkerResult {
  error?: { code?: string; message?: string; recovery?: string }
  ok: boolean
  type: 'result'
  value?: unknown
}

interface PresetWorker {
  child: ChildProcess
  output(): string
  ready: Promise<void>
  result: Promise<WorkerResult>
  start(): void
}

function spawnPresetWorker(action: string, dshHome: string): PresetWorker {
  const workerPath = fileURLToPath(
    new URL('./fixtures/preset-process-worker.mjs', import.meta.url),
  )
  const moduleUrl = pathToFileURL(
    join(processPackageRoot, 'dsh', 'lib', 'presets.js'),
  ).href
  const child = fork(workerPath, [moduleUrl, action, dshHome], {
    silent: true,
  })
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })
  let resolveReady!: () => void
  let resolveResult!: (result: WorkerResult) => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const result = new Promise<WorkerResult>((resolve, reject) => {
    resolveResult = resolve
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code !== 0 && action !== 'crash-lock') {
        reject(new Error(`preset worker exited ${String(code)}: ${output}`))
      }
    })
  })
  child.on('message', (message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message
    ) {
      if (message.type === 'ready') resolveReady()
      if (message.type === 'result') resolveResult(message as WorkerResult)
    }
  })

  return {
    child,
    output: () => output,
    ready,
    result,
    start() {
      child.send({ type: 'start' })
    },
  }
}

async function waitForLockOwner(dshHome: string, pid: number): Promise<void> {
  const ownerPath = join(dshHome, '.agent-presets', LOCK_NAME, 'owner.json')
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    try {
      const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as { pid?: unknown }
      if (owner.pid === pid) return
    } catch (error) {
      if (
        !(
          error instanceof SyntaxError ||
          (error instanceof Error &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT')
        )
      ) {
        throw error
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  throw new Error(`worker ${pid} did not publish the preset lock`)
}

async function expectNoLockResidue(dshHome: string): Promise<void> {
  const entries = await readdir(join(dshHome, '.agent-presets')).catch(
    (error: unknown) => {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return []
      }
      throw error
    },
  )
  expect(entries.filter((entry) => entry.startsWith('.anban-dsh'))).toEqual([])
}

async function expectHealthyOwnership(dshHome: string): Promise<void> {
  const statusWorker = spawnPresetWorker('status', dshHome)
  await statusWorker.ready
  statusWorker.start()
  const result = await statusWorker.result
  expect(result).toMatchObject({ ok: true })
  const statuses = result.value as Array<{
    id: string
    sourceDigest: string
    state: string
  }>
  for (const status of statuses) {
    expect(['absent', 'current']).toContain(status.state)
    if (status.state === 'current') {
      const ownership = JSON.parse(
        await readFile(
          join(dshHome, '.agent-presets', status.id, OWNERSHIP_FILE),
          'utf8',
        ),
      ) as { presetId?: unknown; sourceDigest?: unknown }
      expect(ownership).toMatchObject({
        presetId: status.id,
        sourceDigest: status.sourceDigest,
      })
    }
  }
  await expectNoLockResidue(dshHome)
}

beforeAll(async () => {
  const templateRoot = await mkdtemp(join(tmpdir(), 'anban-dsh-process-package-'))
  processPackageRoot = join(templateRoot, 'package')
  await mkdir(join(processPackageRoot, 'dsh', 'presets'), { recursive: true })
  await writeFile(
    join(processPackageRoot, 'package.json'),
    `${JSON.stringify({ name: '@anban/dsh-plugin-test', type: 'module', version: '9.8.7' })}\n`,
  )
  await cp(
    fileURLToPath(new URL('../presets/', import.meta.url)),
    join(processPackageRoot, 'dsh', 'presets'),
    { recursive: true },
  )
  await symlink(
    fileURLToPath(new URL('../../node_modules', import.meta.url)),
    join(processPackageRoot, 'node_modules'),
    'dir',
  )
  await execFileAsync(
    fileURLToPath(new URL('../../node_modules/.bin/tsc', import.meta.url)),
    [
      '-p',
      fileURLToPath(new URL('../../tsconfig.json', import.meta.url)),
      '--outDir',
      join(processPackageRoot, 'dsh', 'lib'),
      '--declaration',
      'false',
    ],
  )
}, 30_000)

afterAll(async () => {
  const templateRoot = processPackageRoot === '' ? '' : join(processPackageRoot, '..')
  processPackageRoot = ''
  if (templateRoot !== '') {
    await rm(templateRoot, { force: true, recursive: true })
  }
})

afterEach(async () => {
  copyFault.before = undefined
  copyFault.path = ''
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

describe('preset public contract', () => {
  it('exports only the supported preset ids and callable operations', () => {
    expect(PRESET_IDS).toEqual(['article', 'seednote'])
    expect(installPresets).toBeTypeOf('function')
    expect(statusPresets).toBeTypeOf('function')
    expect(removePresets).toBeTypeOf('function')
  })
})

describe('preset transaction locking', () => {
  it('keeps status lock-free while install and remove wait for the global lock', async () => {
    const fixture = await createFixture()
    const root = join(fixture.dshHome, '.agent-presets')
    await mkdir(root, { recursive: true })
    const held = await acquirePresetLock(root, lockDependencies('held-owner'))

    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).resolves.toEqual([
      expect.objectContaining({ state: 'absent' }),
      expect.objectContaining({ state: 'absent' }),
    ])
    await expect(
      presetTestInternals.install(
        fixtureOptions(fixture, {
          lockDependencies: { timeoutMs: 0 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })
    await expect(
      presetTestInternals.remove(
        fixtureOptions(fixture, {
          lockDependencies: { timeoutMs: 0 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    await held.release()
  })

  it('re-reads preset state only after acquiring the lock', async () => {
    const fixture = await createFixture()
    const root = join(fixture.dshHome, '.agent-presets')
    await mkdir(root, { recursive: true })
    const held = await acquirePresetLock(root, lockDependencies('state-writer'))
    let signalWaiting!: () => void
    const waiting = new Promise<void>((resolve) => {
      signalWaiting = resolve
    })
    let resumeWait!: () => void
    const waitResume = new Promise<void>((resolve) => {
      resumeWait = resolve
    })
    let elapsed = 0
    const installPromise = presetTestInternals.install(
      fixtureOptions(fixture, {
        lockDependencies: {
          clock: { monotonicNow: () => elapsed },
          hostname,
          isPidAlive: () => true,
          pid: process.pid,
          randomOwnerId: () => 'state-reader',
          retryIntervalMs: 1,
          timeoutMs: 250,
          async wait(milliseconds) {
            signalWaiting()
            await waitResume
            elapsed += milliseconds
          },
        },
      }),
    )
    const initialOutcome = await Promise.race([
      waiting.then(() => 'waiting' as const),
      installPromise.then(() => 'completed' as const),
    ])
    expect(initialOutcome).toBe('waiting')

    const before = await presetTestInternals.status(fixtureOptions(fixture))
    for (const status of before) {
      const target = destination(fixture, status.id)
      await cp(join(fixture.sourceRoot, status.id), target, { recursive: true })
      await writeFile(
        join(target, OWNERSHIP_FILE),
        `${JSON.stringify({
          schemaVersion: 1,
          packageName: '@anban/dsh-plugin',
          packageVersion: '1.2.3',
          presetId: status.id,
          sourceDigest: status.sourceDigest,
        }, null, 2)}\n`,
      )
    }
    const articleBefore = await lstat(destination(fixture, 'article'))
    await held.release()
    resumeWait()

    const result = await installPromise
    expect(result.every((status) => status.state === 'current')).toBe(true)
    expect((await lstat(destination(fixture, 'article'))).ino).toBe(
      articleBefore.ino,
    )
    await expectNoLockResidue(fixture.dshHome)
  })

  it('releases the lock after a failed mutation', async () => {
    const fixture = await createFixture()
    copyFault.path = join(fixture.sourceRoot, 'article', 'preset.yml')

    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    const root = join(fixture.dshHome, '.agent-presets')
    const next = await acquirePresetLock(root, lockDependencies('next-owner'))
    await next.release()
    await expectNoLockResidue(fixture.dshHome)
  })
})

describe('preset installation', () => {
  it('installs fresh presets with ownership written last', async () => {
    const fixture = await createFixture()

    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'absent' }),
      expect.objectContaining({ id: 'seednote', state: 'absent' }),
    ])

    const statuses = await presetTestInternals.install(fixtureOptions(fixture))

    expect(statuses).toEqual([
      expect.objectContaining({ id: 'article', state: 'current' }),
      expect.objectContaining({ id: 'seednote', state: 'current' }),
    ])
    for (const status of statuses) {
      expect(
        await readFile(join(destination(fixture, status.id), 'preset.yml'), 'utf8'),
      ).toBe(`name: ${status.id}\n`)
      expect(
        JSON.parse(
          await readFile(
            join(destination(fixture, status.id), OWNERSHIP_FILE),
            'utf8',
          ),
        ),
      ).toEqual({
        schemaVersion: 1,
        packageName: '@anban/dsh-plugin',
        packageVersion: '1.2.3',
        presetId: status.id,
        sourceDigest: status.sourceDigest,
      })
    }
  })

  it('leaves identical current installations untouched', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const before = await lstat(destination(fixture, 'article'))

    const statuses = await presetTestInternals.install(fixtureOptions(fixture))
    const after = await lstat(destination(fixture, 'article'))

    expect(statuses.every((status) => status.state === 'current')).toBe(true)
    expect(after.ino).toBe(before.ino)
  })

  it('upgrades an owned installation when its source or package version changes', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'name: new\n')

    const before = await presetTestInternals.status(
      fixtureOptions(fixture, { packageVersion: '2.0.0' }),
    )
    expect(before).toEqual([
      expect.objectContaining({
        id: 'article',
        state: 'outdated',
        installedVersion: '1.2.3',
      }),
      expect.objectContaining({
        id: 'seednote',
        state: 'outdated',
        installedVersion: '1.2.3',
      }),
    ])

    const after = await presetTestInternals.install(
      fixtureOptions(fixture, { packageVersion: '2.0.0' }),
    )

    expect(after.every((status) => status.state === 'current')).toBe(true)
    expect(
      await readFile(join(destination(fixture, 'article'), 'preset.yml'), 'utf8'),
    ).toBe('name: new\n')
  })

  it('refuses to replace an unowned directory without force', async () => {
    const fixture = await createFixture()
    const article = destination(fixture, 'article')
    await mkdir(article, { recursive: true })
    await writeFile(join(article, 'personal.txt'), 'keep me')

    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toMatchObject({
      code: 'ERR_PRESET_UNOWNED',
      recovery: 'Review preset status and use force only to replace trusted content.',
    })
    expect(await readFile(join(article, 'personal.txt'), 'utf8')).toBe('keep me')
    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'unowned' }),
      expect.objectContaining({ id: 'seednote', state: 'absent' }),
    ])
  })

  it('refuses to replace a modified owned directory without force', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const installedPreset = join(destination(fixture, 'article'), 'preset.yml')
    await writeFile(installedPreset, 'name: locally-modified\n')

    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'modified' }),
      expect.objectContaining({ id: 'seednote', state: 'current' }),
    ])
    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toMatchObject({
      code: 'ERR_PRESET_MODIFIED',
      recovery: 'Review local changes and use force only when replacement is intended.',
    })
    expect(await readFile(installedPreset, 'utf8')).toBe(
      'name: locally-modified\n',
    )
  })

  it.each([
    ['unowned', 'ERR_PRESET_UNOWNED'],
    ['modified', 'ERR_PRESET_MODIFIED'],
  ] as const)(
    'maps a destination that becomes %s while copying to its ownership code',
    async (state, code) => {
      const fixture = await createFixture()
      await presetTestInternals.install(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      )
      await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'new\n')
      copyFault.before = async () => {
        if (state === 'unowned') {
          await rm(join(destination(fixture, 'article'), OWNERSHIP_FILE))
        } else {
          await writeFile(
            join(destination(fixture, 'article'), 'preset.yml'),
            'locally modified\n',
          )
        }
      }

      await expect(
        presetTestInternals.install(
          fixtureOptions(fixture, { presetIds: ['article'] }),
        ),
      ).rejects.toMatchObject({ code })
    },
  )

  it('force replaces unowned and modified directories without retaining old files', async () => {
    const fixture = await createFixture()
    const article = destination(fixture, 'article')
    await mkdir(article, { recursive: true })
    await writeFile(join(article, 'personal.txt'), 'replace me')
    await presetTestInternals.install(
      fixtureOptions(fixture, { force: true, presetIds: ['seednote'] }),
    )
    await writeFile(join(destination(fixture, 'seednote'), 'preset.yml'), 'modified\n')

    const statuses = await presetTestInternals.install(
      fixtureOptions(fixture, { force: true }),
    )

    expect(statuses.every((status) => status.state === 'current')).toBe(true)
    await expect(lstat(join(article, 'personal.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      await readFile(join(destination(fixture, 'seednote'), 'preset.yml'), 'utf8'),
    ).toBe('name: seednote\n')
  })

  it('cleans operation-owned temporary paths when copying is interrupted', async () => {
    const fixture = await createFixture()
    copyFault.path = join(fixture.sourceRoot, 'article', 'preset.yml')

    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    await expect(lstat(destination(fixture, 'article'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const entries = await readdir(join(fixture.dshHome, '.agent-presets'))
    expect(entries).toEqual([])
  })

  it('restores the original and cleans siblings when the replacement rename fails', async () => {
    const fixture = await createFixture()
    const options = fixtureOptions(fixture, { presetIds: ['article'] })
    await presetTestInternals.install(options)
    const article = destination(fixture, 'article')
    const originalOwnership = await readFile(join(article, OWNERSHIP_FILE), 'utf8')
    await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'name: new\n')
    let replacementFailed = false

    await expect(
      presetTestInternals.install(
        fixtureOptions(fixture, {
          faults: {
            beforeRename(source, target) {
              if (
                !replacementFailed &&
                source.includes('.article.anban-temporary-') &&
                target === article
              ) {
                replacementFailed = true
                throw new Error('injected replacement rename failure')
              }
            },
          },
          presetIds: ['article'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(await readFile(join(article, 'preset.yml'), 'utf8')).toBe('name: article\n')
    expect(await readFile(join(article, OWNERSHIP_FILE), 'utf8')).toBe(
      originalOwnership,
    )
    expect(await readdir(join(fixture.dshHome, '.agent-presets'))).toEqual([
      'article',
    ])
  })

  it('retries backup cleanup after a successful replacement', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'name: new\n')
    let backupRemovalAttempts = 0

    await expect(
      presetTestInternals.install(
        fixtureOptions(fixture, {
          faults: {
            beforeRemoveOperationPath(path) {
              if (path.includes('.article.anban-backup-')) {
                backupRemovalAttempts += 1
                if (backupRemovalAttempts === 1) {
                  throw new Error('injected backup cleanup failure')
                }
              }
            },
          },
          presetIds: ['article'],
        }),
      ),
    ).resolves.toEqual([expect.objectContaining({ state: 'current' })])

    expect(backupRemovalAttempts).toBe(2)
    expect(
      await readFile(join(destination(fixture, 'article'), 'preset.yml'), 'utf8'),
    ).toBe('name: new\n')
    expect(await readdir(join(fixture.dshHome, '.agent-presets'))).toEqual([
      'article',
    ])
  })

  it('attempts safe backup cleanup even when temporary cleanup fails', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'name: new\n')
    let backupRemovalAttempts = 0
    let temporaryCleanupFailed = false

    await expect(
      presetTestInternals.install(
        fixtureOptions(fixture, {
          faults: {
            beforeRemoveOperationPath(path) {
              if (path.includes('.article.anban-backup-')) {
                backupRemovalAttempts += 1
                if (backupRemovalAttempts === 1) {
                  throw new Error('injected backup cleanup failure')
                }
              }
              if (
                !temporaryCleanupFailed &&
                path.includes('.article.anban-temporary-')
              ) {
                temporaryCleanupFailed = true
                throw new Error('injected temporary cleanup failure')
              }
            },
          },
          presetIds: ['article'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(backupRemovalAttempts).toBe(2)
    expect(
      await presetTestInternals.status(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      ),
    ).toEqual([expect.objectContaining({ state: 'current' })])
    expect(await readdir(join(fixture.dshHome, '.agent-presets'))).toEqual([
      'article',
    ])
  })
})

describe('preset removal', () => {
  it('removes directories carrying valid ownership, including modified ones', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    await writeFile(join(destination(fixture, 'article'), 'preset.yml'), 'modified\n')

    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).resolves.toEqual(['article', 'seednote'])
    for (const id of PRESET_IDS) {
      await expect(lstat(destination(fixture, id))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    }
  })

  it('refuses to remove any presets when a selected directory is unowned', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['seednote'] }),
    )
    await mkdir(destination(fixture, 'article'), { recursive: true })
    await writeFile(join(destination(fixture, 'article'), 'personal.txt'), 'keep')

    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_UNOWNED' })
    expect(
      await readFile(join(destination(fixture, 'article'), 'personal.txt'), 'utf8'),
    ).toBe('keep')
    expect(await lstat(destination(fixture, 'seednote'))).toBeTruthy()
  })

  it('restores the destination when deletion fails before mutation', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    let deletionFailed = false

    await expect(
      presetTestInternals.remove(
        fixtureOptions(fixture, {
          faults: {
            beforeRemoveOperationPath(path) {
              if (!deletionFailed && path.includes('.article.anban-remove-')) {
                deletionFailed = true
                throw new Error('injected preset deletion failure')
              }
            },
          },
          presetIds: ['article'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(
      await readFile(join(destination(fixture, 'article'), 'preset.yml'), 'utf8'),
    ).toBe('name: article\n')
    expect(await readdir(join(fixture.dshHome, '.agent-presets'))).toEqual([
      'article',
    ])
  })

  it('reports both failures and the recovery path when removal rollback fails', async () => {
    const fixture = await createFixture()
    const article = destination(fixture, 'article')
    const presetRoot = join(fixture.dshHome, '.agent-presets')
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    let failure: unknown

    try {
      await presetTestInternals.remove(
        fixtureOptions(fixture, {
          faults: {
            beforeRemoveOperationPath(path) {
              if (path.includes('.article.anban-remove-')) {
                throw new Error('injected preset deletion failure')
              }
            },
            beforeRename(source, target) {
              if (source.includes('.article.anban-remove-') && target === article) {
                throw new Error('injected removal rollback failure')
              }
            },
          },
          presetIds: ['article'],
        }),
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      code: 'ERR_PRESET_ROLLBACK',
      recovery: 'Inspect the preset directory before retrying the operation.',
    })
    expect(JSON.stringify(failure)).not.toContain('injected')
    expect(JSON.stringify(failure)).not.toContain(presetRoot)
    const entries = await readdir(presetRoot)
    const recoveryName = entries.find((entry) =>
      entry.startsWith('.article.anban-remove-'),
    )
    expect(recoveryName).toBeDefined()
    await expect(lstat(article)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      await readFile(join(presetRoot, recoveryName!, OWNERSHIP_FILE), 'utf8'),
    ).toContain('"presetId": "article"')
  })
})

describe('preset containment and digest safety', () => {
  it('rejects a symlinked preset root before inspecting destinations', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside-presets')
    await mkdir(outside)
    await mkdir(fixture.dshHome)
    await symlink(outside, join(fixture.dshHome, '.agent-presets'))

    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
    expect(await readdir(outside)).toEqual([])
  })

  it('rejects symlinks in sources and at destination boundaries', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'keep.txt'), 'outside')
    await mkdir(join(fixture.dshHome, '.agent-presets'), { recursive: true })
    await symlink(outside, destination(fixture, 'article'))

    await expect(
      presetTestInternals.install(fixtureOptions(fixture, { force: true })),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })
    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })
    expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('outside')

    await rm(destination(fixture, 'article'))
    await symlink(
      join(outside, 'keep.txt'),
      join(fixture.sourceRoot, 'article', 'linked-file'),
    )
    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
  })

  it('rejects symlinks inside an owned destination tree', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const outside = join(fixture.root, 'outside.txt')
    await writeFile(outside, 'keep')
    await symlink(outside, join(destination(fixture, 'article'), 'linked-file'))

    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
    expect(await readFile(outside, 'utf8')).toBe('keep')
  })

  it('rejects invalid preset ids before constructing filesystem paths', async () => {
    const fixture = await createFixture()

    for (const id of ['', '../escape', 'Uppercase', 'a/b', 'a'.repeat(65)]) {
      await expect(
        Promise.resolve().then(() =>
          presetTestInternals.status(
            fixtureOptions(fixture, { presetIds: [id] }),
          ),
        ),
      ).rejects.toThrow(/invalid preset id/i)
    }
    await expect(lstat(join(fixture.dshHome, 'escape'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('includes only slash-normalized paths, mode class, and bytes in digests', async () => {
    const fixture = await createFixture()
    const skillPath = join(
      fixture.sourceRoot,
      'article',
      'skills',
      'article-skill',
      'SKILL.md',
    )
    const initial = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )

    await realCopyFile(skillPath, `${skillPath}.copy`)
    const withExtraFile = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(withExtraFile[0]?.sourceDigest).not.toBe(initial[0]?.sourceDigest)

    await rm(`${skillPath}.copy`)
    if (process.platform !== 'win32') {
      await chmod(skillPath, 0o600)
      const nonExecutable = await presetTestInternals.status(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      )
      expect(nonExecutable[0]?.sourceDigest).toBe(initial[0]?.sourceDigest)
      await chmod(skillPath, 0o700)
      const executable = await presetTestInternals.status(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      )
      expect(executable[0]?.sourceDigest).not.toBe(initial[0]?.sourceDigest)
      await chmod(skillPath, 0o600)
    }

    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    const ownershipPath = join(destination(fixture, 'article'), OWNERSHIP_FILE)
    const ownership = JSON.parse(await readFile(ownershipPath, 'utf8'))
    await writeFile(ownershipPath, `${JSON.stringify(ownership, null, 4)}\n`)
    expect(
      await presetTestInternals.status(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      ),
    ).toEqual([expect.objectContaining({ state: 'current' })])
  })

  it('frames digest records so content cannot forge a following file', async () => {
    const twoFiles = await createFixture()
    const forgedRecord = await createFixture()
    const twoFilesSource = join(twoFiles.sourceRoot, 'article')
    const forgedSource = join(forgedRecord.sourceRoot, 'article')
    await rm(twoFilesSource, { recursive: true })
    await rm(forgedSource, { recursive: true })
    await mkdir(twoFilesSource)
    await mkdir(forgedSource)
    await writeFile(join(twoFilesSource, 'a'), 'x')
    await writeFile(join(twoFilesSource, 'b'), 'y')
    await writeFile(join(forgedSource, 'a'), Buffer.from('x\0b\0file\0y'))

    const [twoFilesStatus] = await presetTestInternals.status(
      fixtureOptions(twoFiles, { presetIds: ['article'] }),
    )
    const [forgedStatus] = await presetTestInternals.status(
      fixtureOptions(forgedRecord, { presetIds: ['article'] }),
    )

    expect(twoFilesStatus?.sourceDigest).not.toBe(forgedStatus?.sourceDigest)
  })

  it('sorts digest paths by a stable lexical order instead of locale', async () => {
    const fixture = await createFixture()
    await writeFile(join(fixture.sourceRoot, 'article', 'Z.txt'), 'upper')
    await writeFile(join(fixture.sourceRoot, 'article', 'a.txt'), 'lower')

    const files = [
      ['Z.txt', 'upper'],
      ['a.txt', 'lower'],
      ['agent.cordis.yml', 'id: article\n'],
      ['preset.yml', 'name: article\n'],
      ['skills/article-skill/SKILL.md', '# article\n'],
    ] as const
    const expected = createHash('sha256')
    for (const [relativePath, contents] of [...files].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      const pathBytes = Buffer.from(relativePath, 'utf8')
      const contentBytes = Buffer.from(contents)
      expected.update('file')
      expected.update('\0')
      expected.update(String(pathBytes.byteLength))
      expected.update('\0')
      expected.update(pathBytes)
      expected.update('\0')
      expected.update('file')
      expected.update('\0')
      expected.update(String(contentBytes.byteLength))
      expected.update('\0')
      expected.update(contentBytes)
      expected.update('\0')
    }

    const [status] = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(status?.sourceDigest).toBe(expected.digest('hex'))
  })
})

describe('preset cross-process transactions', () => {
  async function runWorker(action: string, dshHome: string): Promise<{
    output: string
    result: WorkerResult
  }> {
    const worker = spawnPresetWorker(action, dshHome)
    await worker.ready
    worker.start()
    const result = await worker.result
    return { output: worker.output(), result }
  }

  function waitForMessage(child: ChildProcess, type: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === type
        ) {
          child.off('error', onError)
          child.off('message', onMessage)
          resolve()
        }
      }
      const onError = (error: Error) => {
        child.off('message', onMessage)
        reject(error)
      }
      child.on('message', onMessage)
      child.once('error', onError)
    })
  }

  it('makes concurrent install/install idempotent across Node processes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-process-install-'))
    fixtureRoots.push(root)
    const dshHome = join(root, 'home')
    const first = spawnPresetWorker('install', dshHome)
    const second = spawnPresetWorker('install', dshHome)
    await Promise.all([first.ready, second.ready])

    first.start()
    second.start()
    const results = await Promise.all([first.result, second.result])

    expect(results).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ])
    expect(`${first.output()}\n${second.output()}`).not.toContain('ENOTEMPTY')
    await expectHealthyOwnership(dshHome)
  })

  it('serializes install then remove in observed acquisition order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-process-remove-'))
    fixtureRoots.push(root)
    const dshHome = join(root, 'home')
    const install = spawnPresetWorker('install', dshHome)
    const remove = spawnPresetWorker('remove', dshHome)
    await Promise.all([install.ready, remove.ready])
    install.start()
    await waitForLockOwner(dshHome, install.child.pid!)
    remove.start()

    const [installResult, removeResult] = await Promise.all([
      install.result,
      remove.result,
    ])

    expect(installResult).toMatchObject({ ok: true })
    expect(removeResult).toMatchObject({
      ok: true,
      value: ['article', 'seednote'],
    })
    expect(`${install.output()}\n${remove.output()}`).not.toContain('ENOTEMPTY')
    await expectHealthyOwnership(dshHome)
  })

  it('serializes force install then regular install in observed acquisition order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-process-force-'))
    fixtureRoots.push(root)
    const dshHome = join(root, 'home')
    expect((await runWorker('install', dshHome)).result).toMatchObject({ ok: true })
    await writeFile(join(dshHome, '.agent-presets', 'article', 'preset.yml'), 'modified\n')
    const force = spawnPresetWorker('force-install', dshHome)
    const install = spawnPresetWorker('install', dshHome)
    await Promise.all([force.ready, install.ready])
    force.start()
    await waitForLockOwner(dshHome, force.child.pid!)
    install.start()

    const [forceResult, installResult] = await Promise.all([
      force.result,
      install.result,
    ])

    expect(forceResult).toMatchObject({ ok: true })
    expect(installResult).toMatchObject({ ok: true })
    expect(`${force.output()}\n${install.output()}`).not.toContain('ENOTEMPTY')
    await expectHealthyOwnership(dshHome)
  })

  it('releases its process lock when a preset operation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-process-failure-'))
    fixtureRoots.push(root)
    const dshHome = join(root, 'home')
    const badSource = join(
      processPackageRoot,
      'dsh',
      'presets',
      'article',
      'unexpected-link',
    )
    await symlink(join(processPackageRoot, 'package.json'), badSource)

    let failed: Awaited<ReturnType<typeof runWorker>>
    try {
      failed = await runWorker('install', dshHome)
    } finally {
      await rm(badSource, { force: true })
    }

    expect(failed.result).toMatchObject({
      error: { code: 'ERR_PRESET_OPERATION' },
      ok: false,
    })
    expect(failed.output).not.toContain('ENOTEMPTY')
    await expectNoLockResidue(dshHome)
    expect((await runWorker('install', dshHome)).result).toMatchObject({ ok: true })
    await expectHealthyOwnership(dshHome)
  })

  it('reclaims process-crash lock residue before the next install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'anban-dsh-process-crash-'))
    fixtureRoots.push(root)
    const dshHome = join(root, 'home')
    const crashed = spawnPresetWorker('crash-lock', dshHome)
    await crashed.ready
    const acquired = waitForMessage(crashed.child, 'acquired')
    crashed.start()
    await acquired
    const exitCode = await new Promise<number | null>((resolve) =>
      crashed.child.once('exit', resolve),
    )
    expect(exitCode).toBe(73)
    expect(
      await readFile(
        join(dshHome, '.agent-presets', LOCK_NAME, 'owner.json'),
        'utf8',
      ),
    ).toContain(`"pid":${String(crashed.child.pid)}`)

    const recovered = await runWorker('install', dshHome)

    expect(recovered.result).toMatchObject({ ok: true })
    expect(recovered.output).not.toContain('ENOTEMPTY')
    await expectHealthyOwnership(dshHome)
  })
})
