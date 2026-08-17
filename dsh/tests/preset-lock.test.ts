import {
  appendFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
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

function validClaim(
  overrides: Partial<{
    createdAt: string
    expectedOwner: PresetLockOwner
    hostname: string
    ownerId: string
    pid: number
    schemaVersion: 1
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    pid: 61_234,
    hostname: 'local-host',
    createdAt: FIXED_DATE.toISOString(),
    ownerId: 'stale-claimant',
    expectedOwner: validOwner(),
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

async function installClaim(fixture: Fixture, claim: ReturnType<typeof validClaim>) {
  const claimPath = join(lockPath(fixture), '.anban-dsh.reclaim-claim')
  await mkdir(claimPath)
  await writeFile(
    join(claimPath, 'claim.json'),
    `${JSON.stringify(claim)}\n`,
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
  it('publishes only a complete staged lock into the canonical path', async () => {
    const fixture = await createFixture()
    let signalStaged!: () => void
    const staged = new Promise<void>((resolveStaged) => {
      signalStaged = resolveStaged
    })
    let resumePublisher!: () => void
    const publisherResume = new Promise<void>((resolveResume) => {
      resumePublisher = resolveResume
    })
    const firstPromise = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        faults: {
          async beforeOwnerPublish() {
            signalStaged()
            await publisherResume
          },
        },
        pid: 10_001,
        randomOwnerId: () => 'staged-loser',
        timeoutMs: 0,
      }),
    )
    await staged

    const canonicalWasHidden = !(await pathExists(lockPath(fixture)))
    const secondOutcome = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        pid: 10_002,
        randomOwnerId: () => 'staged-winner',
      }),
    ).then(
      (lock) => ({ kind: 'acquired' as const, lock }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    )
    resumePublisher()
    const firstOutcome = await firstPromise.then(
      (lock) => ({ kind: 'acquired' as const, lock }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    )

    expect(canonicalWasHidden).toBe(true)
    expect(secondOutcome).toMatchObject({ kind: 'acquired' })
    expect(firstOutcome).toMatchObject({
      error: { code: 'ERR_PRESET_LOCKED' },
      kind: 'rejected',
    })
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toMatchObject({
      ownerId: 'staged-winner',
    })
    if (secondOutcome.kind === 'acquired') await secondOutcome.lock.release()
  })

  it('does not replace an empty canonical lock directory', async () => {
    const fixture = await createFixture()
    await mkdir(lockPath(fixture))

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({ randomOwnerId: () => 'empty-lock-contender' }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await readdir(lockPath(fixture))).toEqual([])
    expect(await readdir(fixture.presetRoot)).toEqual([LOCK_NAME])
  })

  it.each(['EPERM', 'EACCES'])(
    'treats a Windows-style %s lock publication collision as contention',
    async (collisionCode) => {
      const fixture = await createFixture()
      const replacement = validOwner({
        pid: 70_001,
        packageVersion: '4.1.11',
        ownerId: `windows-${collisionCode.toLowerCase()}-winner`,
      })
      let collided = false

      await expect(
        acquirePresetLock(
          fixture.presetRoot,
          dependencies({
            fileSystem: {
              rename: async (source, destination) => {
                if (
                  !collided &&
                  source.endsWith('.anban-dsh.lock.acquire-windows-contender') &&
                  destination === lockPath(fixture)
                ) {
                  collided = true
                  await installLock(fixture, replacement)
                  throw errno(collisionCode, 'Windows directory rename collision')
                }
                await rename(source, destination)
              },
            },
            isPidAlive: () => true,
            randomOwnerId: () => 'windows-contender',
            timeoutMs: 0,
          }),
        ),
      ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

      expect(collided).toBe(true)
      expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
        replacement,
      )
    },
  )

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
    const written: Array<{
      data: string
      options: { flag?: string; mode?: number } | undefined
      path: string
    }> = []
    const fileSystem = {
      rename: async (source: string, destination: string) => {
        renamed.push([source, destination])
        await rename(source, destination)
      },
      writeFile: async (
        path: string,
        data: string,
        options?: { flag?: string; mode?: number },
      ) => {
        written.push({ data, options, path })
        await writeFile(path, data, options)
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

    expect(written.find(({ path }) => path.endsWith('/claim.json'))).toEqual({
      data: `${JSON.stringify({
        schemaVersion: 1,
        pid: 12_345,
        hostname: 'local-host',
        createdAt: FIXED_DATE.toISOString(),
        ownerId: 'fresh-owner',
        expectedOwner: validOwner(),
      })}\n`,
      options: { flag: 'wx', mode: 0o600 },
      path: join(
        lockPath(fixture),
        '.anban-dsh.reclaim-stage-fresh-owner',
        'claim.json',
      ),
    })
    const claimPublish = renamed.findIndex(
      ([source, destination]) =>
        source ===
          join(
            lockPath(fixture),
            '.anban-dsh.reclaim-stage-fresh-owner',
          ) &&
        destination ===
          join(lockPath(fixture), '.anban-dsh.reclaim-claim'),
    )
    const quarantine = renamed.findIndex(
      ([source, destination]) =>
        source === lockPath(fixture) &&
        destination ===
          join(
            fixture.presetRoot,
            '.anban-dsh.lock.quarantine-fresh-owner',
          ),
    )
    const ownerPublish = renamed.findIndex(
      ([source, destination], index) =>
        index > quarantine &&
        source ===
          join(fixture.presetRoot, '.anban-dsh.lock.acquire-fresh-owner') &&
        destination === lockPath(fixture),
    )
    expect(claimPublish).toBeGreaterThanOrEqual(0)
    expect(quarantine).toBeGreaterThan(claimPublish)
    expect(ownerPublish).toBeGreaterThan(quarantine)
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

  it('takes over a complete same-host dead reclaim claim', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    await installClaim(fixture, validClaim())

    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: () => false,
        randomOwnerId: () => 'claim-takeover',
      }),
    )

    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toMatchObject({
      ownerId: 'claim-takeover',
    })
    expect(await readdir(fixture.presetRoot)).toEqual([LOCK_NAME])
    await lock.release()
  })

  it('treats a Windows-style claim publication collision as contention', async () => {
    const fixture = await createFixture()
    const competingClaim = validClaim({
      pid: 70_002,
      ownerId: 'windows-claim-winner',
    })
    const canonicalClaimPath = join(
      lockPath(fixture),
      '.anban-dsh.reclaim-claim',
    )
    let collided = false
    await installLock(fixture, validOwner())

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            rename: async (source, destination) => {
              if (
                !collided &&
                source.endsWith('.anban-dsh.reclaim-stage-windows-claim-loser') &&
                destination === canonicalClaimPath
              ) {
                collided = true
                await installClaim(fixture, competingClaim)
                throw errno('EACCES', 'Windows claim rename collision')
              }
              await rename(source, destination)
            },
          },
          isPidAlive: (pid) => pid === competingClaim.pid,
          randomOwnerId: () => 'windows-claim-loser',
          timeoutMs: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    expect(collided).toBe(true)
    expect(
      JSON.parse(
        await readFile(join(canonicalClaimPath, 'claim.json'), 'utf8'),
      ),
    ).toEqual(competingClaim)
  })

  it('restores a newer live claim displaced by a stale claim takeover', async () => {
    const fixture = await createFixture()
    const canonicalClaimPath = join(
      lockPath(fixture),
      '.anban-dsh.reclaim-claim',
    )
    const contenderBRetiredPath = join(
      lockPath(fixture),
      '.anban-dsh.reclaim-retired-contender-b',
    )
    let signalBPaused!: () => void
    const bPaused = new Promise<void>((resolvePaused) => {
      signalBPaused = resolvePaused
    })
    let resumeB!: () => void
    const bResume = new Promise<void>((resolveResume) => {
      resumeB = resolveResume
    })
    let signalCPublished!: () => void
    const cPublished = new Promise<void>((resolvePublished) => {
      signalCPublished = resolvePublished
    })
    let resumeC!: () => void
    const cResume = new Promise<void>((resolveResume) => {
      resumeC = resolveResume
    })
    let bPausedOnce = false
    let cPausedOnce = false
    await installLock(fixture, validOwner())
    await installClaim(fixture, validClaim())

    const contenderB = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem: {
          rename: async (source, destination) => {
            if (
              !bPausedOnce &&
              source === canonicalClaimPath &&
              destination === contenderBRetiredPath
            ) {
              bPausedOnce = true
              signalBPaused()
              await bResume
            }
            await rename(source, destination)
          },
        },
        isPidAlive: () => false,
        pid: 62_001,
        randomOwnerId: () => 'contender-b',
      }),
    )
    await bPaused

    const contenderC = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem: {
          rename: async (source, destination) => {
            await rename(source, destination)
            if (
              !cPausedOnce &&
              source.endsWith('.anban-dsh.reclaim-stage-contender-c') &&
              destination === canonicalClaimPath
            ) {
              cPausedOnce = true
              signalCPublished()
              await cResume
            }
          },
        },
        isPidAlive: () => false,
        pid: 62_002,
        randomOwnerId: () => 'contender-c',
      }),
    )
    await cPublished
    resumeB()

    await expect(contenderB).rejects.toMatchObject({
      code: 'ERR_PRESET_LOCK_INVALID',
    })
    expect(
      JSON.parse(
        await readFile(join(canonicalClaimPath, 'claim.json'), 'utf8'),
      ),
    ).toEqual(
      validClaim({
        pid: 62_002,
        ownerId: 'contender-c',
      }),
    )

    resumeC()
    const lock = await contenderC
    await lock.release()
  })

  it('keeps a complete same-host live reclaim claim intact', async () => {
    const fixture = await createFixture()
    const claim = validClaim()
    await installLock(fixture, validOwner())
    await installClaim(fixture, claim)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: (pid) => pid === claim.pid,
          randomOwnerId: () => 'live-claim-contender',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
    expect(
      JSON.parse(
        await readFile(
          join(lockPath(fixture), '.anban-dsh.reclaim-claim', 'claim.json'),
          'utf8',
        ),
      ),
    ).toEqual(claim)
  })

  it('waits to the original monotonic deadline for a live reclaim claim', async () => {
    const fixture = await createFixture()
    const claim = validClaim()
    let monotonicMilliseconds = 10_000
    const waits: number[] = []
    await installLock(fixture, validOwner())
    await installClaim(fixture, claim)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          clock: { monotonicNow: () => monotonicMilliseconds },
          isPidAlive: (pid) => pid === claim.pid,
          randomOwnerId: () => 'live-claim-waiter',
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
    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
  })

  it('keeps a complete remote-host reclaim claim invalid and intact', async () => {
    const fixture = await createFixture()
    const claim = validClaim({ hostname: 'remote-host' })
    await installLock(fixture, validOwner())
    await installClaim(fixture, claim)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => false,
          randomOwnerId: () => 'remote-claim-contender',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
    expect(
      JSON.parse(
        await readFile(
          join(lockPath(fixture), '.anban-dsh.reclaim-claim', 'claim.json'),
          'utf8',
        ),
      ),
    ).toEqual(claim)
  })

  it('keeps a malformed reclaim claim invalid and intact', async () => {
    const fixture = await createFixture()
    const claim = validClaim({ ownerId: 'invalid owner id' })
    await installLock(fixture, validOwner())
    await installClaim(fixture, claim)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => false,
          randomOwnerId: () => 'malformed-claim-contender',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
    expect(
      JSON.parse(
        await readFile(
          join(lockPath(fixture), '.anban-dsh.reclaim-claim', 'claim.json'),
          'utf8',
        ),
      ),
    ).toEqual(claim)
  })

  it('does not displace a complete claim when staged claim writing collides', async () => {
    const fixture = await createFixture()
    const claim = validClaim()
    await installLock(fixture, validOwner())
    await installClaim(fixture, claim)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            writeFile: async (path, data, options) => {
              if (path.endsWith('/claim.json')) {
                throw errno('EEXIST', 'staged claim document collision')
              }
              await writeFile(path, data, options)
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'claim-write-collision',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
    expect(
      JSON.parse(
        await readFile(
          join(lockPath(fixture), '.anban-dsh.reclaim-claim', 'claim.json'),
          'utf8',
        ),
      ),
    ).toEqual(claim)
  })

  it('keeps an empty reclaim claim directory invalid and intact', async () => {
    const fixture = await createFixture()
    const claimPath = join(lockPath(fixture), '.anban-dsh.reclaim-claim')
    await installLock(fixture, validOwner())
    await mkdir(claimPath)

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => false,
          randomOwnerId: () => 'empty-claim-contender',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
    expect(await readdir(claimPath)).toEqual([])
  })

  it('bounds continuous dead-owner churn by the original deadline', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let monotonicMilliseconds = 0
    let reclaimCycles = 0
    const fileSystem = {
      rm: async (path: string, options: { force?: boolean; recursive?: boolean }) => {
        await rm(path, options)
        if (path.includes('.anban-dsh.lock.quarantine-')) {
          reclaimCycles += 1
          monotonicMilliseconds += 10
          if (reclaimCycles > 10) throw new Error('unbounded reclaim churn')
          await installLock(
            fixture,
            validOwner({ ownerId: `stale-owner-${reclaimCycles}` }),
          )
        }
      },
    }

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          clock: { monotonicNow: () => monotonicMilliseconds },
          fileSystem,
          isPidAlive: () => false,
          randomOwnerId: () => 'churn-claimant',
          timeoutMs: 25,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    expect(reclaimCycles).toBeLessThanOrEqual(3)
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

  it('keeps a fresh owner releasable while a stale contender validates its claim', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let signalStalePaused!: () => void
    const stalePaused = new Promise<void>((resolvePaused) => {
      signalStalePaused = resolvePaused
    })
    let resumeStale!: () => void
    const staleResume = new Promise<void>((resolveResume) => {
      resumeStale = resolveResume
    })
    let signalClaimPaused!: () => void
    const claimPaused = new Promise<void>((resolvePaused) => {
      signalClaimPaused = resolvePaused
    })
    let resumeClaim!: () => void
    const claimResume = new Promise<void>((resolveResume) => {
      resumeClaim = resolveResume
    })
    let staleSnapshotValidated = false
    let claimReadPaused = false
    const loserPromise = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem: {
          open: async (path, flags) => {
            const handle = await open(path, flags)
            return {
              close: () => handle.close(),
              read: async (buffer, offset, length, position) => {
                if (staleSnapshotValidated && !claimReadPaused) {
                  claimReadPaused = true
                  signalClaimPaused()
                  await claimResume
                }
                return handle.read(buffer, offset, length, position)
              },
              stat: () => handle.stat(),
            }
          },
        },
        isPidAlive: async (pid) => {
          if (pid === 41_234) {
            staleSnapshotValidated = true
            signalStalePaused()
            await staleResume
            return false
          }
          return true
        },
        pid: 30_002,
        randomOwnerId: () => 'release-race-loser',
        timeoutMs: 0,
      }),
    )
    await stalePaused
    const winnerLock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: (pid) => pid !== 41_234,
        pid: 30_001,
        randomOwnerId: () => 'release-race-winner',
      }),
    )
    resumeStale()
    await claimPaused

    const releaseOutcome = await Promise.all([
      winnerLock.release(),
      winnerLock.release(),
    ]).then(
      () => ({ kind: 'released' as const }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    )
    resumeClaim()
    const loserOutcome = await loserPromise.then(
      (lock) => ({ kind: 'acquired' as const, lock }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    )

    expect(releaseOutcome).toEqual({ kind: 'released' })
    expect(loserOutcome).toMatchObject({ kind: 'rejected' })
    expect(await readdir(fixture.presetRoot)).toEqual([])
    await expect(winnerLock.release()).resolves.toBeUndefined()
  })

  it('keeps a fresh owner releasable when a stale contender crashes after claim', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    let signalStalePaused!: () => void
    const stalePaused = new Promise<void>((resolvePaused) => {
      signalStalePaused = resolvePaused
    })
    let resumeStale!: () => void
    const staleResume = new Promise<void>((resolveResume) => {
      resumeStale = resolveResume
    })
    let staleSnapshotValidated = false
    const loserPromise = acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        fileSystem: {
          open: async (path, flags) => {
            const handle = await open(path, flags)
            return {
              close: () => handle.close(),
              read: async (buffer, offset, length, position) => {
                if (staleSnapshotValidated) {
                  throw new Error('injected crash after fresh-directory claim')
                }
                return handle.read(buffer, offset, length, position)
              },
              stat: () => handle.stat(),
            }
          },
        },
        isPidAlive: async (pid) => {
          if (pid === 41_234) {
            staleSnapshotValidated = true
            signalStalePaused()
            await staleResume
            return false
          }
          return true
        },
        pid: 31_002,
        randomOwnerId: () => 'crash-race-loser',
      }),
    )
    await stalePaused
    const winnerLock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: (pid) => pid !== 41_234,
        pid: 31_001,
        randomOwnerId: () => 'crash-race-winner',
      }),
    )
    resumeStale()

    await expect(loserPromise).rejects.toMatchObject({
      code: 'ERR_PRESET_LOCK_INVALID',
    })
    await expect(
      Promise.all([winnerLock.release(), winnerLock.release()]),
    ).resolves.toEqual([undefined, undefined])
    expect(await readdir(fixture.presetRoot)).toEqual([])
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
    const remove = vi.fn((path: string, options: { force?: boolean; recursive?: boolean }) =>
      rm(path, options),
    )

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            open: async (path, flags) => {
              if (path === ownerPath(fixture)) {
                throw errno('EACCES', 'permission denied')
              }
              return open(path, flags)
            },
            rm: remove,
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(
      remove.mock.calls.some(([path]) => path === lockPath(fixture)),
    ).toBe(false)
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
    const claimName = '.anban-dsh.reclaim-claim'

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

    expect(await pathExists(ownerPath(fixture))).toBe(true)
    expect((await readdir(lockPath(fixture))).sort()).toEqual([
      claimName,
      OWNER_NAME,
    ])
    const recovered = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        isPidAlive: () => false,
        randomOwnerId: () => 'later-contender',
      }),
    )
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toMatchObject({
      ownerId: 'later-contender',
    })
    await recovered.release()
  })

  it('handles ENOENT claim creation races without deleting the replacement owner', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const displacedLock = join(fixture.root, 'displaced-stale-lock')
    const replacement = validOwner({
      pid: 52_001,
      packageVersion: '4.1.11',
      ownerId: 'claim-race-replacement',
    })
    let raced = false

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            writeFile: async (path, data, options) => {
              if (!raced && path.endsWith('/claim.json')) {
                raced = true
                await rename(lockPath(fixture), displacedLock)
                await mkdir(lockPath(fixture))
                await writeFile(
                  ownerPath(fixture),
                  `${JSON.stringify(replacement)}\n`,
                )
                throw errno('ENOENT', 'stale lock disappeared before claim')
              }
              await writeFile(path, data, options)
            },
          },
          isPidAlive: (pid) => pid !== 41_234,
          randomOwnerId: () => 'enoent-claimant',
          timeoutMs: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCKED' })

    expect(raced).toBe(true)
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      replacement,
    )
  })

  it('leaves ownership untouched when sentinel creation is permission-denied', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            writeFile: async (path, data, options) => {
              if (path.endsWith('/claim.json')) {
                throw errno('EACCES', 'claim creation permission denied')
              }
              await writeFile(path, data, options)
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'permission-claimant',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      validOwner(),
    )
    expect(await readdir(lockPath(fixture))).toEqual([OWNER_NAME])
  })
})

describe('preset lock path safety and bounds', () => {
  it('bounds owner reads from one no-follow handle when the file grows', async () => {
    const fixture = await createFixture()
    const openedPaths: string[] = []
    const readLengths: number[] = []
    let grew = false
    await installLock(fixture, validOwner())

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            open: async (path, flags) => {
              openedPaths.push(path)
              const handle = await open(path, flags)
              return {
                close: () => handle.close(),
                read: async (buffer, offset, length, position) => {
                  readLengths.push(length)
                  if (!grew && path === ownerPath(fixture)) {
                    grew = true
                    await appendFile(path, 'x'.repeat(4_097))
                  }
                  return handle.read(buffer, offset, length, position)
                },
                stat: () => handle.stat(),
              }
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(openedPaths).toContain(ownerPath(fixture))
    expect(Math.max(...readLengths)).toBeLessThanOrEqual(4_097)
  })

  it('rejects an oversized owner before reading its contents', async () => {
    const fixture = await createFixture()
    await installLock(fixture, 'x'.repeat(4_097))
    const ownerRead = vi.fn()

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            open: async (path, flags) => {
              const handle = await open(path, flags)
              if (path !== ownerPath(fixture)) return handle
              return {
                close: () => handle.close(),
                read: async (buffer, offset, length, position) => {
                  ownerRead()
                  return handle.read(buffer, offset, length, position)
                },
                stat: () => handle.stat(),
              }
            },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(ownerRead).not.toHaveBeenCalled()
  })

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

  it('treats a pre-existing symlink claim sentinel as invalid without following it', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const target = join(fixture.root, 'outside-claim-sentinel')
    const claimPath = join(lockPath(fixture), '.anban-dsh.reclaim-claim')
    await writeFile(target, 'keep')
    await symlink(target, claimPath, 'file')

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          isPidAlive: () => false,
          randomOwnerId: () => 'symlink-sentinel-claimant',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(await readFile(target, 'utf8')).toBe('keep')
    expect((await lstat(claimPath)).isSymbolicLink()).toBe(true)
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      validOwner(),
    )
  })

  it('revalidates the lock directory before creating its claim sentinel', async () => {
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
    expect((await readdir(movedClaim)).sort()).toEqual([
      '.anban-dsh.reclaim-claim',
      OWNER_NAME,
    ])
  })

  it('restores a fresh directory displaced after the final reclaim checks', async () => {
    const fixture = await createFixture()
    await installLock(fixture, validOwner())
    const displacedClaim = join(fixture.root, 'displaced-final-claim')
    const quarantine = join(
      fixture.presetRoot,
      '.anban-dsh.lock.quarantine-final-swap-claimant',
    )
    const freshOwner = validOwner({
      pid: 72_001,
      packageVersion: '4.1.11',
      ownerId: 'final-swap-fresh-owner',
    })
    let swapped = false

    await expect(
      acquirePresetLock(
        fixture.presetRoot,
        dependencies({
          fileSystem: {
            rename: async (source, destination) => {
              if (!swapped && source === lockPath(fixture) && destination === quarantine) {
                swapped = true
                await rename(source, displacedClaim)
                await mkdir(source)
                await writeFile(
                  join(source, OWNER_NAME),
                  `${JSON.stringify(freshOwner)}\n`,
                )
              }
              await rename(source, destination)
            },
          },
          isPidAlive: () => false,
          randomOwnerId: () => 'final-swap-claimant',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ERR_PRESET_LOCK_INVALID' })

    expect(swapped).toBe(true)
    expect(JSON.parse(await readFile(ownerPath(fixture), 'utf8'))).toEqual(
      freshOwner,
    )
    expect(await pathExists(quarantine)).toBe(false)
    expect(await pathExists(displacedClaim)).toBe(true)
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

  it('allows an exact owner to retry release after a recoverable failure', async () => {
    const fixture = await createFixture()
    let releaseAttempts = 0
    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        faults: {
          beforeReleaseRename() {
            releaseAttempts += 1
            if (releaseAttempts === 1) {
              throw errno('EACCES', 'temporary release permission failure')
            }
          },
        },
      }),
    )

    await expect(lock.release()).rejects.toMatchObject({
      code: 'ERR_PRESET_OPERATION',
    })
    await expect(lock.release()).resolves.toBeUndefined()
    await expect(lock.release()).resolves.toBeUndefined()
    expect(releaseAttempts).toBe(2)
    expect(await pathExists(lockPath(fixture))).toBe(false)
  })

  it('keeps staged-release cleanup failures retryable and structured', async () => {
    const fixture = await createFixture()
    let beforeRemoveAttempts = 0
    let removalAttempts = 0
    const lock = await acquirePresetLock(
      fixture.presetRoot,
      dependencies({
        faults: {
          beforeReleaseRemove() {
            beforeRemoveAttempts += 1
            if (beforeRemoveAttempts === 1) {
              throw errno('EACCES', 'temporary pre-remove failure')
            }
          },
        },
        fileSystem: {
          rm: async (path, options) => {
            if (path.includes('.anban-dsh.lock.release-')) {
              removalAttempts += 1
              if (removalAttempts === 1) {
                throw errno('EACCES', 'temporary staged cleanup failure')
              }
            }
            await rm(path, options)
          },
        },
      }),
    )

    await expect(lock.release()).rejects.toMatchObject({
      code: 'ERR_PRESET_OPERATION',
    })
    await expect(lock.release()).rejects.toMatchObject({
      code: 'ERR_PRESET_OPERATION',
    })
    await expect(lock.release()).resolves.toBeUndefined()
    await expect(lock.release()).resolves.toBeUndefined()
    expect(beforeRemoveAttempts).toBe(3)
    expect(removalAttempts).toBe(2)
    expect(await pathExists(lockPath(fixture))).toBe(false)
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
