import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  acquirePresetLock,
  type PresetLockDependencies,
  type PresetLockOwner,
} from '../src/preset-lock.js'

const LOCK_NAME = '.anban-dsh.lock'
const OWNER_NAME = 'owner.json'
const FIXED_DATE = new Date('2026-08-17T08:09:10.000Z')
const fixtureRoots: string[] = []

interface Fixture {
  presetRoot: string
  root: string
}

interface DependencyOverrides {
  clock?: Partial<NonNullable<PresetLockDependencies['clock']>>
  faults?: PresetLockDependencies['faults']
  fileSystem?: PresetLockDependencies['fileSystem']
  hostname?: () => string
  isPidAlive?: (pid: number) => Promise<boolean> | boolean
  packageVersion?: string
  pid?: number
  randomOwnerId?: () => string
  retryIntervalMs?: number
  timeoutMs?: number
  wait?: (milliseconds: number) => Promise<void>
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-preset-lock-'))
  const presetRoot = join(root, '.agent-presets')
  fixtureRoots.push(root)
  await mkdir(presetRoot)
  return { presetRoot, root }
}

function lockPath(fixture: Fixture): string {
  return join(fixture.presetRoot, LOCK_NAME)
}

function ownerPath(fixture: Fixture): string {
  return join(lockPath(fixture), OWNER_NAME)
}

function dependencies(
  overrides: DependencyOverrides = {},
): PresetLockDependencies {
  let monotonicMilliseconds = 1_000
  const monotonicNow =
    overrides.clock?.monotonicNow ?? (() => monotonicMilliseconds)
  const wait =
    overrides.wait ??
    (async (milliseconds: number) => {
      monotonicMilliseconds += milliseconds
    })

  return {
    packageVersion: overrides.packageVersion ?? '4.1.11',
    pid: overrides.pid ?? 12_345,
    hostname: overrides.hostname ?? (() => 'local-host'),
    randomOwnerId: overrides.randomOwnerId ?? (() => 'owner-a'),
    isPidAlive: overrides.isPidAlive ?? (() => true),
    wait,
    timeoutMs: overrides.timeoutMs ?? 100,
    retryIntervalMs: overrides.retryIntervalMs ?? 25,
    clock: {
      monotonicNow,
      wallNow: overrides.clock?.wallNow ?? (() => new Date(FIXED_DATE)),
    },
    ...(overrides.fileSystem === undefined
      ? {}
      : { fileSystem: overrides.fileSystem }),
    ...(overrides.faults === undefined ? {} : { faults: overrides.faults }),
  }
}

function validOwner(overrides: Partial<PresetLockOwner> = {}): PresetLockOwner {
  return {
    schemaVersion: 1,
    pid: 41_234,
    hostname: 'local-host',
    createdAt: FIXED_DATE.toISOString(),
    packageVersion: '4.1.10',
    ownerId: 'stale-owner',
    ...overrides,
  }
}

async function installLock(
  fixture: Fixture,
  owner: PresetLockOwner | string,
): Promise<void> {
  await mkdir(lockPath(fixture))
  await writeFile(
    ownerPath(fixture),
    typeof owner === 'string' ? owner : `${JSON.stringify(owner)}\n`,
  )
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

function errno(code: string, message = code): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code })
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

describe('preset lock acquisition', () => {
  it('creates the exact lock directory and a complete bounded owner document', async () => {
    const fixture = await createFixture()

    const lock = await acquirePresetLock(fixture.presetRoot, dependencies())
    const owner = JSON.parse(await readFile(ownerPath(fixture), 'utf8')) as unknown

    expect((await lstat(lockPath(fixture))).isDirectory()).toBe(true)
    expect(owner).toEqual({
      schemaVersion: 1,
      pid: 12_345,
      hostname: 'local-host',
      createdAt: FIXED_DATE.toISOString(),
      packageVersion: '4.1.11',
      ownerId: 'owner-a',
    })
    expect(Reflect.ownKeys(owner as object)).toEqual([
      'schemaVersion',
      'pid',
      'hostname',
      'createdAt',
      'packageVersion',
      'ownerId',
    ])
    expect(await readdir(lockPath(fixture))).toEqual([OWNER_NAME])

    await lock.release()
  })

  it('waits only to the monotonic deadline and reports a live local owner as locked', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let monotonicMilliseconds = 10_000
    const waits: number[] = []
    const liveness = vi.fn(() => true)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          clock: {
            monotonicNow: () => monotonicMilliseconds,
          },
          isPidAlive: liveness,
          retryIntervalMs: 20,
          timeoutMs: 45,
          wait: async (milliseconds) => {
            waits.push(milliseconds)
            monotonicMilliseconds += milliseconds
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    expect(waits).toEqual([20, 20, 5])
    expect(liveness).toHaveBeenCalledWith(41_234)
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      validOwner(),
    )
  })

  it('rejects a monotonic clock that moves backward before waiting', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const readings = [1_000, 999]
    const wait = vi.fn(async () => {})

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          clock: {
            monotonicNow: () => readings.shift() ?? 999,
          },
          wait,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(wait).not.toHaveBeenCalled()
    expect(await pathExists(lockPath(fixture))).toBe(true)
  })

  it('atomically quarantines and reclaims a valid same-host dead owner', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const renamed: Array<[string, string]> = []
    const fileSystem = {
      rename: async (source: string, destination: string) => {
        renamed.push([source, destination])
        await rename(source, destination)
      },
    }

    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem,
        isPidAlive: () => false,
        randomOwnerId: () => 'fresh-owner',
      }),
    )

    expect(renamed).toHaveLength(3)
    expect(renamed[0]).toEqual([
      ownerPath(fixture),
      join(lockPath(fixture), '.anban-dsh.reclaim-fresh-owner.json'),
    ])
    expect(renamed[1]?.[0]).toBe(lockPath(fixture))
    expect(renamed[1]?.[1]).toBe(
      join(fixture.presetRoot, '.anban-dsh.lock.quarantine-fresh-owner'),
    )
    expect(renamed[2]?.[1]).toBe(ownerPath(fixture))
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      validOwner({
        pid: 12_345,
        packageVersion: '4.1.11',
        ownerId: 'fresh-owner',
      }),
    )
    expect(await readdir(fixture.presetRoot)).toEqual([LOCK_NAME])

    await lock.release()
  })

  it('retries safely when another reclaimer wins the quarantine rename race', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const competingQuarantine = join(fixture.presetRoot, '.competing-quarantine')
    let raced = false
    const fileSystem = {
      rename: async (source: string, destination: string) => {
        if (!raced && source === lockPath(fixture)) {
          raced = true
          await rename(source, competingQuarantine)
          await rm(competingQuarantine, { recursive: true })
          throw errno('ENOENT', 'another reclaimer moved the lock')
        }
        await rename(source, destination)
      },
    }

    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem,
        isPidAlive: () => false,
        randomOwnerId: () => 'race-winner',
      }),
    )

    expect(raced).toBe(true)
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toMatchObject({
      ownerId: 'race-winner',
    })
    await lock.release()
  })

  it('never quarantines a fresh lock after validating a replaced stale owner', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let signalPaused!: () => void
    const paused = new Promise<void>((resolvePaused) => {
      signalPaused = resolvePaused
    })
    let resumeLoser!: () => void
    const resume = new Promise<void>((resolveResume) => {
      resumeLoser = resolveResume
    })
    let pausedOnce = false
    const loserPromise = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: async (pid) => {
          if (pid === 41_234 && !pausedOnce) {
            pausedOnce = true
            signalPaused()
            await resume
            return false
          }
          return true
        },
        pid: 20_002,
        randomOwnerId: () => 'race-loser',
        timeoutMs: 0,
      }),
    )
    await paused

    const winnerLock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: (pid) => pid !== 41_234,
        pid: 20_001,
        randomOwnerId: () => 'race-winner',
      }),
    )
    resumeLoser()
    const loserOutcome = await loserPromise.then(
      (lock) => ({ kind: 'acquired' as const, lock }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    )
    const canonicalOwner = JSON.parse(
      await readFile(ownerPath(fixture), 'utf8'),
    ) as PresetLockOwner

    expect(loserOutcome).toMatchObject({
      error: { code: 'ERR_PRESET_LOCKED' },
      kind: 'rejected',
    })
    expect(canonicalOwner.ownerId).toBe('race-winner')
    expect(canonicalOwner.pid).toBe(20_001)
    expect(await readdir(fixture.presetRoot)).toEqual([LOCK_NAME])

    await winnerLock.release()
  })
})

describe('preset lock refusal and fault handling', () => {
  it('rejects a valid remote-host owner without checking or deleting its PID', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner({ hostname: 'remote-host' }))
    const liveness = vi.fn(() => false)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ isPidAlive: liveness }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(liveness).not.toHaveBeenCalled()
    expect(await pathExists(lockPath(fixture))).toBe(true)
  })

  it.each([
    ['partial JSON', '{"schemaVersion":1'],
    [
      'missing field',
      JSON.stringify({
        schemaVersion: 1,
        pid: 41_234,
        hostname: 'local-host',
      }),
    ],
    [
      'unexpected field',
      JSON.stringify({ ...validOwner(), extra: true }),
    ],
  ])('rejects %s ownership without reclaiming it', async (_label, contents) => {
    const fixture = await createFixture()
    await installLock(fixture, contents)
    const liveness = vi.fn(() => false)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ isPidAlive: liveness }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(liveness).not.toHaveBeenCalled()
    expect(await readFile(ownerPath(fixture), 'utf8')).toBe(contents)
  })

  it('treats permission-denied owner inspection as invalid and never removes it', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const remove = vi.fn()

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            readFile: async () => {
              throw errno('EACCES', 'permission denied')
            },
            rm: remove,
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(remove).not.toHaveBeenCalled()
    expect(await pathExists(lockPath(fixture))).toBe(true)
  })

  it('does not reclaim when PID liveness is permission-denied or indeterminate', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => {
            throw errno('EPERM', 'process visibility denied')
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await pathExists(lockPath(fixture))).toBe(true)
  })

  it('reports quarantine cleanup failure without touching a subsequent canonical path', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let quarantinePath = ''

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          faults: {
            beforeQuarantineRemove(path) {
              quarantinePath = path
              throw errno('EACCES', 'injected quarantine cleanup failure')
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'cleanup-fault-owner',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(quarantinePath).toBe(
      join(fixture.presetRoot, '.anban-dsh.lock.quarantine-cleanup-fault-owner'),
    )
    expect(await pathExists(lockPath(fixture))).toBe(false)
    expect(await pathExists(quarantinePath)).toBe(true)
  })

  it('cleans an unpublished lock after an injected owner publication fault', async () => {
    const fixture = await createFixture()

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          faults: {
            beforeOwnerPublish() {
              throw new Error('injected owner publication failure')
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })

    expect(await pathExists(lockPath(fixture))).toBe(false)
  })

  it('leaves a crash-after-claim lock invalid instead of reclaiming it again', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const claimName = '.anban-dsh.reclaim-crash-claimant.json'

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          faults: {
            beforeQuarantineRename() {
              throw new Error('injected crash after reclaim claim')
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'crash-claimant',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await pathExists(ownerPath(fixture))).toBe(false)
    expect(await readdir(lockPath(fixture))).toEqual([claimName])
    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => false,
          randomOwnerId: () => 'later-contender',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })
    expect(await readdir(lockPath(fixture))).toEqual([claimName])
  })
})

describe('preset lock path safety and bounds', () => {
  it('never follows a symbolic-link preset root', async () => {
    const fixture = await createFixture()
    const linkedRoot = join(fixture.root, 'linked-presets')
    await symlink(fixture.presetRoot, linkedRoot, 'dir')

    await expect(
      acquirePresetLock(linkedRoot, dependencies()),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await readdir(fixture.presetRoot)).toEqual([])
  })

  it('never follows or reclaims a symbolic-link lock path', async () => {
    const fixture = await createFixture()
    const target = join(fixture.root, 'outside-lock')
    await mkdir(target)
    await writeFile(join(target, 'sentinel'), 'keep')
    await symlink(target, lockPath(fixture), 'dir')

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ isPidAlive: () => false }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await readFile(join(target, 'sentinel'), 'utf8')).toBe('keep')
    expect((await lstat(lockPath(fixture))).isSymbolicLink()).toBe(true)
  })

  it('refuses a pre-existing quarantine symlink without moving the stale lock', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const target = join(fixture.root, 'outside-quarantine')
    const quarantine = join(
      fixture.presetRoot,
      '.anban-dsh.lock.quarantine-owner-a',
    )
    await mkdir(target)
    await writeFile(join(target, 'sentinel'), 'keep')
    await symlink(target, quarantine, 'dir')

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ isPidAlive: () => false }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await pathExists(lockPath(fixture))).toBe(true)
    expect(await readFile(join(target, 'sentinel'), 'utf8')).toBe('keep')
  })

  it('revalidates the lock directory before claiming its owner file', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const movedLock = join(fixture.root, 'moved-stale-lock')
    const outsideLock = join(fixture.root, 'outside-lock-owner')
    const outsideOwner = join(outsideLock, OWNER_NAME)
    let replaced = false

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: async () => {
            if (!replaced) {
              replaced = true
              await rename(lockPath(fixture), movedLock)
              await mkdir(outsideLock)
              await writeFile(
                outsideOwner,
                `${JSON.stringify(validOwner())}\n`,
              )
              await symlink(outsideLock, lockPath(fixture), 'dir')
            }
            return false
          },
          randomOwnerId: () => 'symlink-claimant',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await lstat(lockPath(fixture))).isSymbolicLink()).toBe(true)
    expect(JSON.parse(await readFile(outsideOwner, 'utf8'))).toEqual(validOwner())
    expect(await readdir(outsideLock)).toEqual([OWNER_NAME])
    expect(await pathExists(join(movedLock, OWNER_NAME))).toBe(true)
  })

  it('revalidates the claimed directory before its quarantine rename', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const movedClaim = join(fixture.root, 'moved-claimed-lock')
    const outsideLock = join(fixture.root, 'outside-claimed-lock')
    await mkdir(outsideLock)
    await writeFile(join(outsideLock, 'sentinel'), 'keep')

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          faults: {
            async beforeQuarantineRename() {
              await rename(lockPath(fixture), movedClaim)
              await symlink(outsideLock, lockPath(fixture), 'dir')
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'post-claim-symlink',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await lstat(lockPath(fixture))).isSymbolicLink()).toBe(true)
    expect(await readFile(join(outsideLock, 'sentinel'), 'utf8')).toBe('keep')
    expect(await readdir(movedClaim)).toEqual([
      '.anban-dsh.reclaim-post-claim-symlink.json',
    ])
  })

  it.each([
    ['PID', { pid: 0 }],
    ['hostname', { hostname: () => '' }],
    ['hostname bound', { hostname: () => 'h'.repeat(256) }],
    ['owner id', { randomOwnerId: () => '' }],
    ['owner id bound', { randomOwnerId: () => 'o'.repeat(129) }],
    ['package version', { packageVersion: '' }],
    ['package version bound', { packageVersion: 'v'.repeat(129) }],
    ['timeout', { timeoutMs: 60_001 }],
    ['retry interval', { retryIntervalMs: 5_001 }],
  ] satisfies Array<[string, DependencyOverrides]>) (
    'rejects an invalid %s dependency before creating the lock',
    async (_label, override) => {
      const fixture = await createFixture()

      await expect(
        acquirePresetLock(fixture.presetRoot, dependencies(override)),
      ).rejects.toMatchObject({ code: 'ERR_PRESET_OPERATION' })
      expect(await readdir(fixture.presetRoot)).toEqual([])
    },
  )

  it('treats an out-of-bounds stored owner as invalid and never reclaims it', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner({ hostname: 'h'.repeat(256) }))

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ isPidAlive: () => false }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await pathExists(lockPath(fixture))).toBe(true)
  })
})

describe('preset lock release', () => {
  it('removes only its exact ownership and is deterministic across concurrent repeats', async () => {
    const fixture = await createFixture()
    let releaseRemovals = 0
    const fileSystem = {
      rm: async (path: string, options: { force?: boolean; recursive?: boolean }) => {
        if (path.includes('.anban-dsh.lock.release-')) {
          releaseRemovals += 1
        }
        await rm(path, options)
      },
    }
    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({ fileSystem }),
    )

    await Promise.all([lock.release(), lock.release(), lock.release()])
    await lock.release()

    expect(releaseRemovals).toBe(1)
    expect(await pathExists(lockPath(fixture))).toBe(false)
  })

  it('safely leaves a valid replacement owner in place', async () => {
    const fixture = await createFixture()
    const lock = await acquirePresetLock(fixture.presetRoot, dependencies())
    const replacement = validOwner({
      pid: 88_888,
      ownerId: 'replacement-owner',
    })
    await writeFile(ownerPath(fixture), `${JSON.stringify(replacement)}\n`)

    await expect(lock.release()).resolves.toBeUndefined()

    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      replacement,
    )
    expect(await pathExists(lockPath(fixture))).toBe(true)
  })

  it('revalidates the preset root and never releases through a replacement symlink', async () => {
    const fixture = await createFixture()
    const lock = await acquirePresetLock(fixture.presetRoot, dependencies())
    const movedRoot = join(fixture.root, 'moved-presets')
    const outsideRoot = join(fixture.root, 'outside-presets')
    const outsideLock = join(outsideRoot, LOCK_NAME)
    await rename(fixture.presetRoot, movedRoot)
    await mkdir(outsideLock, { recursive: true })
    await writeFile(
      join(outsideLock, OWNER_NAME),
      `${JSON.stringify(validOwner({
        pid: 12_345,
        packageVersion: '4.1.11',
        ownerId: 'owner-a',
      }))}\n`,
    )
    await symlink(outsideRoot, fixture.presetRoot, 'dir')

    await expect(lock.release()).rejects.toMatchObject({
      code: 'ERR_PRESET_LOCK_INVALID',
    })

    expect(await pathExists(outsideLock)).toBe(true)
    expect(await pathExists(join(movedRoot, LOCK_NAME))).toBe(true)
  })

  it('rejects malformed replacement ownership without deleting it', async () => {
    const fixture = await createFixture()
    const lock = await acquirePresetLock(fixture.presetRoot, dependencies())
    await writeFile(ownerPath(fixture), '{"partial":')

    const firstRelease = lock.release()
    const repeatedRelease = lock.release()
    await expect(firstRelease).rejects.toMatchObject({
      code: 'ERR_PRESET_LOCK_INVALID',
    })
    await expect(repeatedRelease).rejects.toBe(await firstRelease.catch((error) => error))
    expect(await readFile(ownerPath(fixture), 'utf8')).toBe('{"partial":')
  })
})
