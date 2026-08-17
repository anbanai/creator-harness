/// <reference types="node" />

import { randomUUID } from 'node:crypto'
import { constants as fileSystemConstants } from 'node:fs'
import {
  lstat as realLstat,
  mkdir as realMkdir,
  open as realOpen,
  rename as realRename,
  rm as realRm,
  writeFile as realWriteFile,
} from 'node:fs/promises'
import { hostname as realHostname } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

import {
  OperationalError,
  isOperationalError,
} from './operational-error.js'

export interface PresetLockOwner {
  schemaVersion: 1
  pid: number
  hostname: string
  createdAt: string
  packageVersion: string
  ownerId: string
}

interface PresetReclaimClaim {
  schemaVersion: 1
  pid: number
  hostname: string
  createdAt: string
  ownerId: string
  expectedOwner: PresetLockOwner
}

interface PresetReclaimAbandonment {
  schemaVersion: 1
  claim: PresetReclaimClaim
}

export interface PresetLock {
  release(): Promise<void>
}

interface LockStats {
  size: number
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

interface PresetLockFileHandle {
  close(): Promise<void>
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>
  stat(): Promise<LockStats>
}

export interface PresetLockFileSystem {
  lstat(path: string): Promise<LockStats>
  mkdir(path: string, options?: { mode?: number }): Promise<unknown>
  open(path: string, flags: number): Promise<PresetLockFileHandle>
  rename(source: string, destination: string): Promise<void>
  rm(
    path: string,
    options: { force?: boolean; recursive?: boolean },
  ): Promise<void>
  writeFile(
    path: string,
    data: string,
    options?: { flag?: string; mode?: number },
  ): Promise<unknown>
}

export interface PresetLockClock {
  monotonicNow(): number
  wallNow(): Date
}

export interface PresetLockFaults {
  beforeOwnerPublish?: (
    temporaryOwnerPath: string,
    ownerPath: string,
  ) => Promise<void> | void
  beforeQuarantineRename?: (
    lockPath: string,
    quarantinePath: string,
  ) => Promise<void> | void
  beforeQuarantineRemove?: (quarantinePath: string) => Promise<void> | void
  beforeReleaseRename?: (
    lockPath: string,
    releasePath: string,
  ) => Promise<void> | void
  beforeReleaseRemove?: (releasePath: string) => Promise<void> | void
}

export interface PresetLockDependencies {
  packageVersion: string
  clock?: Partial<PresetLockClock>
  faults?: PresetLockFaults
  fileSystem?: Partial<PresetLockFileSystem>
  hostname?: () => string
  isPidAlive?: (pid: number) => Promise<boolean> | boolean
  pid?: number
  randomOwnerId?: () => string
  retryIntervalMs?: number
  timeoutMs?: number
  wait?: (milliseconds: number) => Promise<void>
}

interface ResolvedDependencies {
  clock: PresetLockClock
  faults: PresetLockFaults | undefined
  fileSystem: PresetLockFileSystem
  hostname: string
  isPidAlive: (pid: number) => Promise<boolean> | boolean
  ownerId: string
  packageVersion: string
  pid: number
  retryIntervalMs: number
  timeoutMs: number
  wait: (milliseconds: number) => Promise<void>
}

const LOCK_NAME = '.anban-dsh.lock'
const OWNER_NAME = 'owner.json'
const RECLAIM_CLAIM_NAME = '.anban-dsh.reclaim-claim'
const RECLAIM_CLAIM_DOCUMENT = 'claim.json'
const RECLAIM_ABANDONMENT_PREFIX = '.anban-dsh.reclaim-abandoned-'
const RECLAIM_ABANDONMENT_DOCUMENT = 'abandonment.json'
const OWNER_KEYS = [
  'schemaVersion',
  'pid',
  'hostname',
  'createdAt',
  'packageVersion',
  'ownerId',
] as const
const MAX_HOSTNAME_LENGTH = 255
const MAX_OWNER_ID_LENGTH = 128
const MAX_PACKAGE_VERSION_LENGTH = 128
const MAX_OWNER_DOCUMENT_LENGTH = 4_096
const MAX_CLAIM_DOCUMENT_LENGTH = 8_192
const MAX_ABANDONMENT_DOCUMENT_LENGTH = 12_288
const MAX_TIMEOUT_MS = 60_000
const MAX_RETRY_INTERVAL_MS = 5_000
const MAX_RACE_RETRIES = 64
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RETRY_INTERVAL_MS = 50
const LIVE_CLAIM_CONTENDED = Symbol('live-claim-contended')
const SAFE_TOKEN_PATTERN = /^[\x21-\x7e]+$/
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const DEFAULT_FILE_SYSTEM: PresetLockFileSystem = {
  lstat: realLstat,
  mkdir: realMkdir,
  open: realOpen,
  rename: realRename,
  rm: realRm,
  writeFile: realWriteFile,
}

function defaultMonotonicNow(): number {
  return Number(process.hrtime.bigint()) / 1_000_000
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

function defaultPidLiveness(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (hasErrno(error, 'ESRCH')) {
      return false
    }
    throw error
  }
}

function hasErrno(error: unknown, code: string): boolean {
  try {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === code
    )
  } catch {
    return false
  }
}

function invalidLock(cause?: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_LOCK_INVALID',
    'The Anban preset lock is invalid and was not changed.',
    { cause },
  )
}

function locked(cause?: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_LOCKED',
    'Another preset operation is running.',
    { cause },
  )
}

function operationFailure(cause?: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_OPERATION',
    'Unable to manage the Anban preset lock.',
    { cause },
  )
}

function assertBoundedToken(
  value: unknown,
  maximumLength: number,
  pattern: RegExp,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    !pattern.test(value)
  ) {
    throw operationFailure()
  }
}

function assertBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw operationFailure()
  }
}

function resolveDependencies(
  dependencies: PresetLockDependencies,
): ResolvedDependencies {
  try {
    const pid = dependencies.pid ?? process.pid
    const hostname = (dependencies.hostname ?? realHostname)()
    const ownerId = (dependencies.randomOwnerId ?? randomUUID)()
    const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const retryIntervalMs =
      dependencies.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS

    assertBoundedInteger(pid, 1, Number.MAX_SAFE_INTEGER)
    assertBoundedToken(hostname, MAX_HOSTNAME_LENGTH, SAFE_TOKEN_PATTERN)
    assertBoundedToken(ownerId, MAX_OWNER_ID_LENGTH, OWNER_ID_PATTERN)
    assertBoundedToken(
      dependencies.packageVersion,
      MAX_PACKAGE_VERSION_LENGTH,
      SAFE_TOKEN_PATTERN,
    )
    assertBoundedInteger(timeoutMs, 0, MAX_TIMEOUT_MS)
    assertBoundedInteger(retryIntervalMs, 1, MAX_RETRY_INTERVAL_MS)

    return {
      clock: {
        monotonicNow:
          dependencies.clock?.monotonicNow ?? defaultMonotonicNow,
        wallNow: dependencies.clock?.wallNow ?? (() => new Date()),
      },
      faults: dependencies.faults,
      fileSystem: {
        ...DEFAULT_FILE_SYSTEM,
        ...dependencies.fileSystem,
      },
      hostname,
      isPidAlive: dependencies.isPidAlive ?? defaultPidLiveness,
      ownerId,
      packageVersion: dependencies.packageVersion,
      pid,
      retryIntervalMs,
      timeoutMs,
      wait: dependencies.wait ?? defaultWait,
    }
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }
}

function monotonicNow(dependencies: ResolvedDependencies): number {
  let value: number
  try {
    value = dependencies.clock.monotonicNow()
  } catch (error) {
    throw operationFailure(error)
  }
  if (!Number.isFinite(value) || value < 0) {
    throw operationFailure()
  }
  return value
}

function creationTime(dependencies: ResolvedDependencies): string {
  try {
    const date = dependencies.clock.wallNow()
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new TypeError('Invalid wall clock')
    }
    const createdAt = date.toISOString()
    if (!ISO_DATE_PATTERN.test(createdAt)) {
      throw new TypeError('Invalid wall clock')
    }
    return createdAt
  } catch (error) {
    throw operationFailure(error)
  }
}

function assertContained(parent: string, child: string): void {
  const parentPath = resolve(parent)
  const childPath = resolve(child)
  const pathFromParent = relative(parentPath, childPath)
  if (
    pathFromParent === '' ||
    pathFromParent === '..' ||
    pathFromParent.startsWith(`..${sep}`) ||
    resolve(parentPath, pathFromParent) !== childPath
  ) {
    throw invalidLock()
  }
}

async function assertSafePresetRoot(
  presetRoot: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  let stats: LockStats
  try {
    stats = await dependencies.fileSystem.lstat(presetRoot)
  } catch (error) {
    throw invalidLock(error)
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw invalidLock()
  }
}

function ownerFromValue(value: unknown): PresetLockOwner | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null
  }

  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== OWNER_KEYS.length ||
    OWNER_KEYS.some((key) => !keys.includes(key))
  ) {
    return null
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (
    OWNER_KEYS.some((key) => {
      const descriptor = descriptors[key]
      return descriptor === undefined || !('value' in descriptor)
    })
  ) {
    return null
  }

  const owner = value as Partial<PresetLockOwner>
  if (
    owner.schemaVersion !== 1 ||
    typeof owner.pid !== 'number' ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.hostname !== 'string' ||
    owner.hostname.length === 0 ||
    owner.hostname.length > MAX_HOSTNAME_LENGTH ||
    !SAFE_TOKEN_PATTERN.test(owner.hostname) ||
    typeof owner.createdAt !== 'string' ||
    !ISO_DATE_PATTERN.test(owner.createdAt) ||
    new Date(owner.createdAt).toISOString() !== owner.createdAt ||
    typeof owner.packageVersion !== 'string' ||
    owner.packageVersion.length === 0 ||
    owner.packageVersion.length > MAX_PACKAGE_VERSION_LENGTH ||
    !SAFE_TOKEN_PATTERN.test(owner.packageVersion) ||
    typeof owner.ownerId !== 'string' ||
    owner.ownerId.length === 0 ||
    owner.ownerId.length > MAX_OWNER_ID_LENGTH ||
    !OWNER_ID_PATTERN.test(owner.ownerId)
  ) {
    return null
  }

  return owner as PresetLockOwner
}

function reclaimClaimFromValue(value: unknown): PresetReclaimClaim | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== 6 ||
    !keys.includes('schemaVersion') ||
    !keys.includes('pid') ||
    !keys.includes('hostname') ||
    !keys.includes('createdAt') ||
    !keys.includes('ownerId') ||
    !keys.includes('expectedOwner')
  ) {
    return null
  }
  const claim = value as Partial<PresetReclaimClaim>
  if (
    claim.schemaVersion !== 1 ||
    typeof claim.pid !== 'number' ||
    !Number.isSafeInteger(claim.pid) ||
    claim.pid <= 0 ||
    typeof claim.hostname !== 'string' ||
    claim.hostname.length === 0 ||
    claim.hostname.length > MAX_HOSTNAME_LENGTH ||
    !SAFE_TOKEN_PATTERN.test(claim.hostname) ||
    typeof claim.createdAt !== 'string' ||
    !ISO_DATE_PATTERN.test(claim.createdAt) ||
    new Date(claim.createdAt).toISOString() !== claim.createdAt ||
    typeof claim.ownerId !== 'string' ||
    claim.ownerId.length === 0 ||
    claim.ownerId.length > MAX_OWNER_ID_LENGTH ||
    !OWNER_ID_PATTERN.test(claim.ownerId)
  ) {
    return null
  }
  const expectedOwner = ownerFromValue(claim.expectedOwner)
  if (expectedOwner === null) {
    return null
  }
  return {
    schemaVersion: 1,
    pid: claim.pid,
    hostname: claim.hostname,
    createdAt: claim.createdAt,
    ownerId: claim.ownerId,
    expectedOwner,
  }
}

function reclaimAbandonmentFromValue(
  value: unknown,
): PresetReclaimAbandonment | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null
  }
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== 2 ||
    !keys.includes('schemaVersion') ||
    !keys.includes('claim')
  ) {
    return null
  }
  const abandonment = value as Partial<PresetReclaimAbandonment>
  if (abandonment.schemaVersion !== 1) return null
  const claim = reclaimClaimFromValue(abandonment.claim)
  if (claim === null) return null
  return { schemaVersion: 1, claim }
}

async function readBoundedRegularFile(
  directoryPath: string,
  filePath: string,
  maximumLength: number,
  dependencies: ResolvedDependencies,
): Promise<string> {
  assertContained(directoryPath, filePath)
  let handle: PresetLockFileHandle | undefined
  let contents: string | undefined
  let failure: unknown
  try {
    handle = await dependencies.fileSystem.open(
      filePath,
      fileSystemConstants.O_RDONLY | fileSystemConstants.O_NOFOLLOW,
    )
    const stats = await handle.stat()
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      !Number.isSafeInteger(stats.size) ||
      stats.size < 0 ||
      stats.size > maximumLength
    ) {
      throw invalidLock()
    }
    const buffer = Buffer.alloc(maximumLength + 1)
    let offset = 0
    while (offset < buffer.length) {
      const result = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      )
      if (
        !Number.isSafeInteger(result.bytesRead) ||
        result.bytesRead < 0 ||
        result.bytesRead > buffer.length - offset
      ) {
        throw invalidLock()
      }
      if (result.bytesRead === 0) break
      offset += result.bytesRead
    }
    if (offset > maximumLength) throw invalidLock()
    contents = buffer.toString('utf8', 0, offset)
  } catch (error) {
    failure = error
  }
  if (handle !== undefined) {
    try {
      await handle.close()
    } catch (error) {
      failure =
        failure === undefined
          ? error
          : new AggregateError(
              [failure, error],
              'Preset lock document read and close failed.',
            )
    }
  }
  if (failure !== undefined) {
    if (isOperationalError(failure)) throw failure
    throw invalidLock(failure)
  }
  if (contents === undefined) throw invalidLock()
  return contents
}

async function readOwnerFile(
  directoryPath: string,
  ownerPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner> {
  assertContained(directoryPath, ownerPath)

  try {
    const contents = await readBoundedRegularFile(
      directoryPath,
      ownerPath,
      MAX_OWNER_DOCUMENT_LENGTH,
      dependencies,
    )
    const owner = ownerFromValue(JSON.parse(contents) as unknown)
    if (owner === null) {
      throw invalidLock()
    }
    return owner
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw invalidLock(error)
  }
}

async function readOwnerFromLock(
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner> {
  return readOwnerFile(lockPath, join(lockPath, OWNER_NAME), dependencies)
}

async function readReclaimClaim(
  lockPath: string,
  claimPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetReclaimClaim> {
  assertContained(lockPath, claimPath)
  const documentPath = join(claimPath, RECLAIM_CLAIM_DOCUMENT)
  assertContained(claimPath, documentPath)
  try {
    const claimStats = await dependencies.fileSystem.lstat(claimPath)
    if (claimStats.isSymbolicLink() || !claimStats.isDirectory()) {
      throw invalidLock()
    }
    const contents = await readBoundedRegularFile(
      claimPath,
      documentPath,
      MAX_CLAIM_DOCUMENT_LENGTH,
      dependencies,
    )
    const claim = reclaimClaimFromValue(JSON.parse(contents) as unknown)
    if (claim === null) {
      throw invalidLock()
    }
    return claim
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw invalidLock(error)
  }
}

async function readReclaimAbandonment(
  lockPath: string,
  abandonmentPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetReclaimAbandonment> {
  assertContained(lockPath, abandonmentPath)
  const documentPath = join(
    abandonmentPath,
    RECLAIM_ABANDONMENT_DOCUMENT,
  )
  assertContained(abandonmentPath, documentPath)
  try {
    const abandonmentStats = await dependencies.fileSystem.lstat(
      abandonmentPath,
    )
    if (
      abandonmentStats.isSymbolicLink() ||
      !abandonmentStats.isDirectory()
    ) {
      throw invalidLock()
    }
    const contents = await readBoundedRegularFile(
      abandonmentPath,
      documentPath,
      MAX_ABANDONMENT_DOCUMENT_LENGTH,
      dependencies,
    )
    const abandonment = reclaimAbandonmentFromValue(
      JSON.parse(contents) as unknown,
    )
    if (abandonment === null) throw invalidLock()
    return abandonment
  } catch (error) {
    if (isOperationalError(error)) throw error
    throw invalidLock(error)
  }
}

async function inspectLock(
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner | null> {
  try {
    const stats = await dependencies.fileSystem.lstat(lockPath)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw invalidLock()
    }
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) {
      return null
    }
    if (isOperationalError(error)) {
      throw error
    }
    throw invalidLock(error)
  }
  return readOwnerFromLock(lockPath, dependencies)
}

async function assertVacantPath(
  path: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  try {
    await dependencies.fileSystem.lstat(path)
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) {
      return
    }
    throw invalidLock(error)
  }
  throw invalidLock()
}

async function pathExistsNoFollow(
  path: string,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  try {
    await dependencies.fileSystem.lstat(path)
    return true
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) return false
    throw invalidLock(error)
  }
}

async function assertSafeQuarantine(
  path: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  try {
    const stats = await dependencies.fileSystem.lstat(path)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw invalidLock()
    }
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }
}

async function removeOwnedDirectory(
  presetRoot: string,
  path: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  assertContained(presetRoot, path)
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    const stats = await dependencies.fileSystem.lstat(path)
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw invalidLock()
    }
    await dependencies.fileSystem.rm(path, { force: true, recursive: true })
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) return
    if (isOperationalError(error)) throw error
    throw operationFailure(error)
  }
}

async function tryPublishLock(
  presetRoot: string,
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const stagingPath = join(
    presetRoot,
    `${LOCK_NAME}.acquire-${dependencies.ownerId}`,
  )
  const stagingOwnerPath = join(stagingPath, OWNER_NAME)
  assertContained(presetRoot, stagingPath)
  assertContained(stagingPath, stagingOwnerPath)
  const owner: PresetLockOwner = {
    schemaVersion: 1,
    pid: dependencies.pid,
    hostname: dependencies.hostname,
    createdAt: creationTime(dependencies),
    packageVersion: dependencies.packageVersion,
    ownerId: dependencies.ownerId,
  }
  let stagingCreated = false
  let stagingValidated = false
  const lockOccupied = Symbol('lock-occupied')

  try {
    await assertVacantPath(stagingPath, dependencies)
    await dependencies.fileSystem.mkdir(stagingPath, { mode: 0o700 })
    stagingCreated = true
    await dependencies.fileSystem.writeFile(
      stagingOwnerPath,
      `${JSON.stringify(owner)}\n`,
      { flag: 'wx', mode: 0o600 },
    )
    await dependencies.faults?.beforeOwnerPublish?.(
      stagingOwnerPath,
      join(lockPath, OWNER_NAME),
    )
    await assertSafePresetRoot(presetRoot, dependencies)
    const stagedOwner = await readOwnerFromLock(stagingPath, dependencies)
    if (!ownersMatch(stagedOwner, owner)) throw invalidLock()
    stagingValidated = true
    try {
      await dependencies.fileSystem.lstat(lockPath)
      throw lockOccupied
    } catch (error) {
      if (error === lockOccupied) throw error
      if (!hasErrno(error, 'ENOENT')) throw invalidLock(error)
    }
    await dependencies.fileSystem.rename(stagingPath, lockPath)
    return true
  } catch (error) {
    let lostRace =
      error === lockOccupied ||
      (stagingValidated &&
        (hasErrno(error, 'EEXIST') ||
          hasErrno(error, 'ENOTEMPTY') ||
          hasErrno(error, 'ENOTDIR')))
    let classificationError: unknown
    if (!lostRace && stagingValidated) {
      try {
        await assertSafePresetRoot(presetRoot, dependencies)
        if (await pathExistsNoFollow(lockPath, dependencies)) {
          const stagedOwner = await readOwnerFromLock(
            stagingPath,
            dependencies,
          )
          lostRace = ownersMatch(stagedOwner, owner)
        }
      } catch (inspectionError) {
        classificationError = inspectionError
      }
    }
    if (stagingCreated) {
      try {
        await removeOwnedDirectory(presetRoot, stagingPath, dependencies)
      } catch (cleanupError) {
        throw operationFailure(
          new AggregateError(
            [error, cleanupError],
            'Preset lock publication and cleanup failed.',
          ),
        )
      }
    }
    if (lostRace) return false
    if (classificationError !== undefined) {
      if (isOperationalError(classificationError)) throw classificationError
      throw operationFailure(classificationError)
    }
    if (isOperationalError(error)) throw error
    throw operationFailure(error)
  }
}

function ownersMatch(
  left: PresetLockOwner,
  right: PresetLockOwner,
): boolean {
  return OWNER_KEYS.every((key) => left[key] === right[key])
}

function reclaimClaimsMatch(
  left: PresetReclaimClaim,
  right: PresetReclaimClaim,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.pid === right.pid &&
    left.hostname === right.hostname &&
    left.createdAt === right.createdAt &&
    left.ownerId === right.ownerId &&
    ownersMatch(left.expectedOwner, right.expectedOwner)
  )
}

function reclaimAbandonmentsMatch(
  left: PresetReclaimAbandonment,
  right: PresetReclaimAbandonment,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    reclaimClaimsMatch(left.claim, right.claim)
  )
}

function reclaimAbandonmentPath(
  lockPath: string,
  claim: PresetReclaimClaim,
): string {
  const abandonmentPath = join(
    lockPath,
    `${RECLAIM_ABANDONMENT_PREFIX}${claim.ownerId}`,
  )
  assertContained(lockPath, abandonmentPath)
  return abandonmentPath
}

async function readReclaimAbandonmentIfPresent(
  lockPath: string,
  abandonmentPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetReclaimAbandonment | null> {
  if (!(await pathExistsNoFollow(abandonmentPath, dependencies))) return null
  return readReclaimAbandonment(lockPath, abandonmentPath, dependencies)
}

async function isReclaimClaimAbandoned(
  lockPath: string,
  claim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const abandonmentPath = reclaimAbandonmentPath(lockPath, claim)
  const abandonment = await readReclaimAbandonmentIfPresent(
    lockPath,
    abandonmentPath,
    dependencies,
  )
  if (abandonment === null) return false
  const expected: PresetReclaimAbandonment = { schemaVersion: 1, claim }
  if (!reclaimAbandonmentsMatch(abandonment, expected)) throw invalidLock()
  return true
}

async function removeOwnedReclaimAbandonment(
  lockPath: string,
  claim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  const abandonmentPath = reclaimAbandonmentPath(lockPath, claim)
  const expected: PresetReclaimAbandonment = { schemaVersion: 1, claim }
  try {
    await assertSafeQuarantine(lockPath, dependencies)
    const abandonment = await readReclaimAbandonment(
      lockPath,
      abandonmentPath,
      dependencies,
    )
    if (!reclaimAbandonmentsMatch(abandonment, expected)) {
      throw invalidLock()
    }
    await assertSafeQuarantine(lockPath, dependencies)
    await dependencies.fileSystem.rm(abandonmentPath, {
      force: false,
      recursive: true,
    })
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) return
    if (isOperationalError(error)) throw error
    throw invalidLock(error)
  }
}

async function publishReclaimAbandonment(
  lockPath: string,
  claim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  const abandonmentPath = reclaimAbandonmentPath(lockPath, claim)
  const stagePath = join(
    lockPath,
    `.anban-dsh.reclaim-abandonment-stage-${claim.ownerId}`,
  )
  const documentPath = join(stagePath, RECLAIM_ABANDONMENT_DOCUMENT)
  const expected: PresetReclaimAbandonment = { schemaVersion: 1, claim }
  assertContained(lockPath, stagePath)
  assertContained(stagePath, documentPath)
  let stageCreated = false

  try {
    await assertSafeQuarantine(lockPath, dependencies)
    const currentOwner = await readOwnerFromLock(lockPath, dependencies)
    if (!ownersMatch(currentOwner, claim.expectedOwner)) throw invalidLock()
    const existing = await readReclaimAbandonmentIfPresent(
      lockPath,
      abandonmentPath,
      dependencies,
    )
    if (existing !== null) {
      if (!reclaimAbandonmentsMatch(existing, expected)) throw invalidLock()
      return
    }

    await dependencies.fileSystem.mkdir(stagePath, { mode: 0o700 })
    stageCreated = true
    await dependencies.fileSystem.writeFile(
      documentPath,
      `${JSON.stringify(expected)}\n`,
      { flag: 'wx', mode: 0o600 },
    )
    const staged = await readReclaimAbandonment(
      lockPath,
      stagePath,
      dependencies,
    )
    if (!reclaimAbandonmentsMatch(staged, expected)) throw invalidLock()
    await assertSafeQuarantine(lockPath, dependencies)
    const ownerBeforePublish = await readOwnerFromLock(lockPath, dependencies)
    if (!ownersMatch(ownerBeforePublish, claim.expectedOwner)) {
      throw invalidLock()
    }
    try {
      await dependencies.fileSystem.rename(stagePath, abandonmentPath)
      stageCreated = false
    } catch (error) {
      const published = await readReclaimAbandonmentIfPresent(
        lockPath,
        abandonmentPath,
        dependencies,
      )
      if (
        published === null ||
        !reclaimAbandonmentsMatch(published, expected)
      ) {
        throw invalidLock(error)
      }
    }
    if (stageCreated) {
      await removeOwnedDirectory(lockPath, stagePath, dependencies)
      stageCreated = false
    }
    const published = await readReclaimAbandonment(
      lockPath,
      abandonmentPath,
      dependencies,
    )
    if (!reclaimAbandonmentsMatch(published, expected)) throw invalidLock()
  } catch (error) {
    if (stageCreated) {
      try {
        await removeOwnedDirectory(lockPath, stagePath, dependencies)
      } catch (cleanupError) {
        throw invalidLock(new AggregateError([error, cleanupError]))
      }
    }
    throw isOperationalError(error) ? error : invalidLock(error)
  }
}

async function removeOwnedReclaimClaim(
  presetRoot: string,
  lockPath: string,
  claimPath: string,
  expectedClaim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await assertSafePresetRoot(presetRoot, dependencies)
  try {
    await assertSafeQuarantine(lockPath, dependencies)
    const storedClaim = await readReclaimClaim(
      lockPath,
      claimPath,
      dependencies,
    )
    if (!reclaimClaimsMatch(storedClaim, expectedClaim)) {
      throw invalidLock()
    }
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(lockPath, dependencies)
    await dependencies.fileSystem.rm(claimPath, {
      force: false,
      recursive: true,
    })
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) {
      return
    }
    if (isOperationalError(error)) {
      throw error
    }
    throw invalidLock(error)
  }
}

async function removeAbandonedReclaimClaim(
  lockPath: string,
  claimPath: string,
  expectedClaim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await removeOwnedReclaimClaim(
    lockPath,
    lockPath,
    claimPath,
    expectedClaim,
    dependencies,
  )
  if (await pathExistsNoFollow(claimPath, dependencies)) throw invalidLock()
  await removeOwnedReclaimAbandonment(lockPath, expectedClaim, dependencies)
}

async function restoreRetiredReclaimClaim(
  lockPath: string,
  claimPath: string,
  retiredPath: string,
  expectedClaim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  assertContained(lockPath, claimPath)
  assertContained(lockPath, retiredPath)
  await assertSafeQuarantine(lockPath, dependencies)
  const retiredClaim = await readReclaimClaim(
    lockPath,
    retiredPath,
    dependencies,
  )
  if (!reclaimClaimsMatch(retiredClaim, expectedClaim)) {
    throw invalidLock()
  }
  if (await isReclaimClaimAbandoned(lockPath, expectedClaim, dependencies)) {
    await removeAbandonedReclaimClaim(
      lockPath,
      retiredPath,
      expectedClaim,
      dependencies,
    )
    return false
  }
  try {
    await dependencies.fileSystem.lstat(claimPath)
    throw invalidLock()
  } catch (error) {
    if (!hasErrno(error, 'ENOENT')) {
      if (isOperationalError(error)) throw error
      throw invalidLock(error)
    }
  }
  await assertSafeQuarantine(lockPath, dependencies)
  const claimBeforeRestore = await readReclaimClaim(
    lockPath,
    retiredPath,
    dependencies,
  )
  if (!reclaimClaimsMatch(claimBeforeRestore, expectedClaim)) {
    throw invalidLock()
  }
  if (await isReclaimClaimAbandoned(lockPath, expectedClaim, dependencies)) {
    await removeAbandonedReclaimClaim(
      lockPath,
      retiredPath,
      expectedClaim,
      dependencies,
    )
    return false
  }
  try {
    await dependencies.fileSystem.rename(retiredPath, claimPath)
  } catch (error) {
    throw invalidLock(error)
  }
  const restoredClaim = await readReclaimClaim(
    lockPath,
    claimPath,
    dependencies,
  )
  if (!reclaimClaimsMatch(restoredClaim, expectedClaim)) {
    throw invalidLock()
  }
  if (await isReclaimClaimAbandoned(lockPath, expectedClaim, dependencies)) {
    await removeAbandonedReclaimClaim(
      lockPath,
      claimPath,
      expectedClaim,
      dependencies,
    )
    return false
  }
  return true
}

async function readReclaimClaimIfPresent(
  lockPath: string,
  claimPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetReclaimClaim | null> {
  if (!(await pathExistsNoFollow(claimPath, dependencies))) return null
  return readReclaimClaim(lockPath, claimPath, dependencies)
}

async function waitForExactReclaimClaim(
  lockPath: string,
  claimPath: string,
  expectedClaim: PresetReclaimClaim,
  deadline: number,
  dependencies: ResolvedDependencies,
): Promise<void> {
  let lastMonotonicReading = monotonicNow(dependencies)
  while (true) {
    await assertSafeQuarantine(lockPath, dependencies)
    const storedClaim = await readReclaimClaimIfPresent(
      lockPath,
      claimPath,
      dependencies,
    )
    if (storedClaim !== null) {
      if (!reclaimClaimsMatch(storedClaim, expectedClaim)) {
        throw invalidLock()
      }
      return
    }
    const currentOwner = await readOwnerFromLock(lockPath, dependencies)
    if (!ownersMatch(currentOwner, expectedClaim.expectedOwner)) {
      throw invalidLock()
    }
    const beforeWait = monotonicNow(dependencies)
    if (beforeWait < lastMonotonicReading) throw operationFailure()
    if (beforeWait >= deadline) throw invalidLock()
    const waitMilliseconds = Math.min(
      dependencies.retryIntervalMs,
      deadline - beforeWait,
    )
    try {
      await dependencies.wait(waitMilliseconds)
    } catch (error) {
      throw operationFailure(error)
    }
    const afterWait = monotonicNow(dependencies)
    if (afterWait <= beforeWait) throw operationFailure()
    lastMonotonicReading = afterWait
  }
}

async function abandonPublishedReclaimClaim(
  lockPath: string,
  claimPath: string,
  expectedClaim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await assertSafeQuarantine(lockPath, dependencies)
  const currentOwner = await readOwnerFromLock(lockPath, dependencies)
  if (!ownersMatch(currentOwner, expectedClaim.expectedOwner)) return

  await publishReclaimAbandonment(lockPath, expectedClaim, dependencies)

  await assertSafeQuarantine(lockPath, dependencies)
  const ownerAfterPublish = await readOwnerFromLock(lockPath, dependencies)
  if (!ownersMatch(ownerAfterPublish, expectedClaim.expectedOwner)) return
  const storedClaim = await readReclaimClaimIfPresent(
    lockPath,
    claimPath,
    dependencies,
  )
  if (
    storedClaim === null ||
    !reclaimClaimsMatch(storedClaim, expectedClaim)
  ) {
    return
  }
  await removeAbandonedReclaimClaim(
    lockPath,
    claimPath,
    expectedClaim,
    dependencies,
  )
}

async function reconcilePublishedReclaimClaim(
  presetRoot: string,
  lockPath: string,
  claimPath: string,
  expectedClaim: PresetReclaimClaim,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await assertSafePresetRoot(presetRoot, dependencies)
  if (!(await pathExistsNoFollow(lockPath, dependencies))) return
  await assertSafeQuarantine(lockPath, dependencies)
  const currentOwner = await readOwnerFromLock(lockPath, dependencies)
  if (!ownersMatch(currentOwner, expectedClaim.expectedOwner)) return
  await abandonPublishedReclaimClaim(
    lockPath,
    claimPath,
    expectedClaim,
    dependencies,
  )
}

async function publishReclaimClaim(
  lockPath: string,
  claimPath: string,
  claim: PresetReclaimClaim,
  deadline: number,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const stagePath = join(
    lockPath,
    `.anban-dsh.reclaim-stage-${dependencies.ownerId}`,
  )
  const retiredPath = join(
    lockPath,
    `.anban-dsh.reclaim-retired-${dependencies.ownerId}`,
  )
  const stageDocumentPath = join(stagePath, RECLAIM_CLAIM_DOCUMENT)
  assertContained(lockPath, stagePath)
  assertContained(lockPath, retiredPath)
  assertContained(stagePath, stageDocumentPath)
  let stageCreated = false
  let stageValidated = false
  let claimPublished = false
  const claimRace = Symbol('claim-race')
  const claimOccupied = Symbol('claim-occupied')

  try {
    try {
      await dependencies.fileSystem.mkdir(stagePath, { mode: 0o700 })
      stageCreated = true
      await dependencies.fileSystem.writeFile(
        stageDocumentPath,
        `${JSON.stringify(claim)}\n`,
        { flag: 'wx', mode: 0o600 },
      )
      const staged = await readReclaimClaim(lockPath, stagePath, dependencies)
      if (!reclaimClaimsMatch(staged, claim)) throw invalidLock()
      stageValidated = true
      try {
        await dependencies.fileSystem.lstat(claimPath)
        throw claimOccupied
      } catch (error) {
        if (error === claimOccupied) throw error
        if (!hasErrno(error, 'ENOENT')) throw invalidLock(error)
      }
      await dependencies.fileSystem.rename(stagePath, claimPath)
      stageCreated = false
      claimPublished = true
      return true
    } catch (error) {
      let canonicalOccupied =
        error === claimOccupied ||
        (stageValidated &&
          (hasErrno(error, 'EEXIST') || hasErrno(error, 'ENOTEMPTY')))
      let classificationError: unknown
      if (!canonicalOccupied && stageValidated) {
        try {
          await assertSafeQuarantine(lockPath, dependencies)
          if (await pathExistsNoFollow(claimPath, dependencies)) {
            const stagedClaim = await readReclaimClaim(
              lockPath,
              stagePath,
              dependencies,
            )
            canonicalOccupied = reclaimClaimsMatch(stagedClaim, claim)
          }
        } catch (inspectionError) {
          classificationError = inspectionError
        }
      }
      if (!canonicalOccupied) {
        if (classificationError !== undefined) throw classificationError
        if (hasErrno(error, 'ENOENT')) throw claimRace
        throw isOperationalError(error) ? error : invalidLock(error)
      }
      if (!stageCreated) throw invalidLock(error)
    }

    const existing = await readReclaimClaim(lockPath, claimPath, dependencies)
    const existingAbandoned = await isReclaimClaimAbandoned(
      lockPath,
      existing,
      dependencies,
    )
    if (!existingAbandoned) {
      if (existing.hostname !== dependencies.hostname) throw invalidLock()
      let alive: boolean
      try {
        alive = await dependencies.isPidAlive(existing.pid)
      } catch (error) {
        throw invalidLock(error)
      }
      if (typeof alive !== 'boolean') throw invalidLock()
      if (alive) throw LIVE_CLAIM_CONTENDED
    }

    await assertVacantPath(retiredPath, dependencies)
    try {
      await dependencies.fileSystem.rename(claimPath, retiredPath)
    } catch (error) {
      if (hasErrno(error, 'ENOENT')) throw claimRace
      throw invalidLock(error)
    }
    const retired = await readReclaimClaim(lockPath, retiredPath, dependencies)
    if (!reclaimClaimsMatch(retired, existing)) {
      try {
        const restored = await restoreRetiredReclaimClaim(
          lockPath,
          claimPath,
          retiredPath,
          retired,
          dependencies,
        )
        if (!restored) throw invalidLock()
      } catch (restoreError) {
        throw invalidLock(
          new AggregateError(
            [invalidLock(), restoreError],
            'Preset reclaim claim validation and restoration failed.',
          ),
        )
      }
      throw invalidLock()
    }
    try {
      await dependencies.fileSystem.rename(stagePath, claimPath)
      stageCreated = false
      claimPublished = true
    } catch (error) {
      throw invalidLock(error)
    }
    await removeOwnedReclaimClaim(
      lockPath,
      lockPath,
      retiredPath,
      retired,
      dependencies,
    )
    if (
      existingAbandoned ||
      (await isReclaimClaimAbandoned(lockPath, retired, dependencies))
    ) {
      await removeOwnedReclaimAbandonment(lockPath, retired, dependencies)
    }
    await waitForExactReclaimClaim(
      lockPath,
      claimPath,
      claim,
      deadline,
      dependencies,
    )
    return true
  } catch (error) {
    if (claimPublished) {
      try {
        await abandonPublishedReclaimClaim(
          lockPath,
          claimPath,
          claim,
          dependencies,
        )
      } catch (cleanupError) {
        throw invalidLock(new AggregateError([error, cleanupError]))
      }
    }
    if (stageCreated) {
      try {
        await removeOwnedDirectory(lockPath, stagePath, dependencies)
      } catch (cleanupError) {
        throw invalidLock(
          new AggregateError(
            [error, cleanupError],
            'Preset reclaim claim publication and cleanup failed.',
          ),
        )
      }
    }
    if (error === claimRace) return false
    throw error
  }
}

async function restoreQuarantine(
  presetRoot: string,
  lockPath: string,
  quarantinePath: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  try {
    await dependencies.fileSystem.lstat(lockPath)
    throw invalidLock(undefined)
  } catch (error) {
    if (!hasErrno(error, 'ENOENT')) {
      if (isOperationalError(error)) throw error
      throw invalidLock(error)
    }
  }
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await dependencies.fileSystem.rename(quarantinePath, lockPath)
  } catch (error) {
    throw invalidLock(error)
  }
}

async function reclaimDeadOwner(
  presetRoot: string,
  lockPath: string,
  expectedOwner: PresetLockOwner,
  deadline: number,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const claimPath = join(lockPath, RECLAIM_CLAIM_NAME)
  const quarantinePath = join(
    presetRoot,
    `${LOCK_NAME}.quarantine-${dependencies.ownerId}`,
  )
  assertContained(lockPath, claimPath)
  assertContained(presetRoot, quarantinePath)
  await assertSafePresetRoot(presetRoot, dependencies)
  await assertSafeQuarantine(lockPath, dependencies)
  await assertVacantPath(quarantinePath, dependencies)
  const reclaimClaim: PresetReclaimClaim = {
    schemaVersion: 1,
    pid: dependencies.pid,
    hostname: dependencies.hostname,
    createdAt: creationTime(dependencies),
    ownerId: dependencies.ownerId,
    expectedOwner,
  }

  if (!(await publishReclaimClaim(
    lockPath,
    claimPath,
    reclaimClaim,
    deadline,
    dependencies,
  ))) return false

  let currentOwner: PresetLockOwner
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(lockPath, dependencies)
    await waitForExactReclaimClaim(
      lockPath,
      claimPath,
      reclaimClaim,
      deadline,
      dependencies,
    )
    currentOwner = await readOwnerFromLock(lockPath, dependencies)
  } catch (error) {
    try {
      await reconcilePublishedReclaimClaim(
        presetRoot,
        lockPath,
        claimPath,
        reclaimClaim,
        dependencies,
      )
    } catch (cleanupError) {
      throw invalidLock(new AggregateError([error, cleanupError]))
    }
    throw isOperationalError(error) ? error : invalidLock(error)
  }
  if (!ownersMatch(currentOwner, expectedOwner)) {
    await removeOwnedReclaimClaim(
      presetRoot,
      lockPath,
      claimPath,
      reclaimClaim,
      dependencies,
    )
    return false
  }

  try {
    await dependencies.faults?.beforeQuarantineRename?.(
      lockPath,
      quarantinePath,
    )
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(lockPath, dependencies)
    const ownerBeforeRename = await readOwnerFromLock(lockPath, dependencies)
    const claimBeforeRename = await readReclaimClaim(
      lockPath,
      claimPath,
      dependencies,
    )
    if (
      !ownersMatch(ownerBeforeRename, expectedOwner) ||
      !reclaimClaimsMatch(claimBeforeRename, reclaimClaim)
    ) {
      throw invalidLock()
    }
    await dependencies.fileSystem.rename(lockPath, quarantinePath)
  } catch (error) {
    try {
      await reconcilePublishedReclaimClaim(
        presetRoot,
        lockPath,
        claimPath,
        reclaimClaim,
        dependencies,
      )
    } catch (cleanupError) {
      throw invalidLock(new AggregateError([error, cleanupError]))
    }
    if (hasErrno(error, 'ENOENT')) {
      return false
    }
    if (isOperationalError(error)) {
      throw error
    }
    throw invalidLock(error)
  }

  const quarantinedClaimPath = join(quarantinePath, RECLAIM_CLAIM_NAME)
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(quarantinePath, dependencies)
    const quarantinedOwner = await readOwnerFromLock(
      quarantinePath,
      dependencies,
    )
    const quarantinedClaim = await readReclaimClaim(
      quarantinePath,
      quarantinedClaimPath,
      dependencies,
    )
    if (
      !ownersMatch(quarantinedOwner, expectedOwner) ||
      !reclaimClaimsMatch(quarantinedClaim, reclaimClaim)
    ) {
      throw invalidLock()
    }
  } catch (error) {
    try {
      await restoreQuarantine(
        presetRoot,
        lockPath,
        quarantinePath,
        dependencies,
      )
    } catch (restoreError) {
      throw invalidLock(new AggregateError([error, restoreError]))
    }
    try {
      await reconcilePublishedReclaimClaim(
        presetRoot,
        lockPath,
        claimPath,
        reclaimClaim,
        dependencies,
      )
    } catch (cleanupError) {
      throw invalidLock(new AggregateError([error, cleanupError]))
    }
    throw invalidLock(error)
  }

  try {
    await dependencies.faults?.beforeQuarantineRemove?.(quarantinePath)
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(quarantinePath, dependencies)
    await dependencies.fileSystem.rm(quarantinePath, {
      force: true,
      recursive: true,
    })
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }
  return true
}

async function restoreUnexpectedRelease(
  presetRoot: string,
  releasePath: string,
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await assertSafePresetRoot(presetRoot, dependencies)
  try {
    const existing = await inspectLock(lockPath, dependencies)
    if (existing !== null) {
      return
    }
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }

  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await dependencies.fileSystem.rename(releasePath, lockPath)
  } catch (error) {
    throw operationFailure(error)
  }
}

async function releaseOwnedLock(
  presetRoot: string,
  lockPath: string,
  expectedOwnerId: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  await assertSafePresetRoot(presetRoot, dependencies)
  const releasePath = join(
    presetRoot,
    `${LOCK_NAME}.release-${expectedOwnerId}`,
  )
  assertContained(presetRoot, releasePath)
  let owner: PresetLockOwner | null
  try {
    owner = await inspectLock(lockPath, dependencies)
  } catch (error) {
    throw isOperationalError(error) ? error : invalidLock(error)
  }
  if (owner === null) {
    try {
      const stagedOwner = await inspectLock(releasePath, dependencies)
      if (stagedOwner?.ownerId === expectedOwnerId) {
        await dependencies.faults?.beforeReleaseRemove?.(releasePath)
        await assertSafePresetRoot(presetRoot, dependencies)
        await assertSafeQuarantine(releasePath, dependencies)
        const ownerBeforeRemove = await readOwnerFromLock(
          releasePath,
          dependencies,
        )
        if (ownerBeforeRemove.ownerId !== expectedOwnerId) return
        await dependencies.fileSystem.rm(releasePath, {
          force: true,
          recursive: true,
        })
      }
    } catch (error) {
      if (isOperationalError(error)) throw error
      throw operationFailure(error)
    }
    return
  }
  if (owner.ownerId !== expectedOwnerId) {
    return
  }
  await assertSafePresetRoot(presetRoot, dependencies)
  await assertVacantPath(releasePath, dependencies)
  try {
    await dependencies.faults?.beforeReleaseRename?.(lockPath, releasePath)
    await assertSafePresetRoot(presetRoot, dependencies)
    await dependencies.fileSystem.rename(lockPath, releasePath)
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) {
      return
    }
    throw operationFailure(error)
  }

  let movedOwner: PresetLockOwner
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    movedOwner = await readOwnerFromLock(releasePath, dependencies)
  } catch (error) {
    await restoreUnexpectedRelease(
      presetRoot,
      releasePath,
      lockPath,
      dependencies,
    )
    throw error
  }
  if (movedOwner.ownerId !== expectedOwnerId) {
    await restoreUnexpectedRelease(
      presetRoot,
      releasePath,
      lockPath,
      dependencies,
    )
    return
  }

  try {
    await dependencies.faults?.beforeReleaseRemove?.(releasePath)
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(releasePath, dependencies)
    await dependencies.fileSystem.rm(releasePath, {
      force: true,
      recursive: true,
    })
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }
}

function createLockHandle(
  presetRoot: string,
  lockPath: string,
  ownerId: string,
  dependencies: ResolvedDependencies,
): PresetLock {
  let releasePromise: Promise<void> | undefined
  let released = false
  return {
    release(): Promise<void> {
      if (released) return Promise.resolve()
      releasePromise ??= releaseOwnedLock(
        presetRoot,
        lockPath,
        ownerId,
        dependencies,
      ).then(
        () => {
          released = true
        },
        (error: unknown) => {
          releasePromise = undefined
          throw error
        },
      )
      return releasePromise
    },
  }
}

async function waitForContention(
  deadline: number,
  lastMonotonicReading: number,
  dependencies: ResolvedDependencies,
): Promise<number> {
  const beforeWait = monotonicNow(dependencies)
  if (beforeWait < lastMonotonicReading) {
    throw operationFailure()
  }
  if (beforeWait >= deadline) {
    throw locked()
  }
  const waitMilliseconds = Math.min(
    dependencies.retryIntervalMs,
    deadline - beforeWait,
  )
  try {
    await dependencies.wait(waitMilliseconds)
  } catch (error) {
    throw operationFailure(error)
  }
  const afterWait = monotonicNow(dependencies)
  if (afterWait <= beforeWait) {
    throw operationFailure()
  }
  return afterWait
}

export async function acquirePresetLock(
  presetRoot: string,
  suppliedDependencies: PresetLockDependencies,
): Promise<PresetLock> {
  const dependencies = resolveDependencies(suppliedDependencies)
  let resolvedRoot: string
  try {
    resolvedRoot = resolve(presetRoot)
  } catch (error) {
    throw operationFailure(error)
  }
  const lockPath = join(resolvedRoot, LOCK_NAME)
  assertContained(resolvedRoot, lockPath)
  const startedAt = monotonicNow(dependencies)
  const deadline = startedAt + dependencies.timeoutMs
  let lastMonotonicReading = startedAt
  let raceRetries = 0
  let contended = false

  while (true) {
    await assertSafePresetRoot(resolvedRoot, dependencies)
    if (contended) {
      const current = monotonicNow(dependencies)
      if (current < lastMonotonicReading) throw operationFailure()
      lastMonotonicReading = current
      if (current >= deadline) throw locked()
    }

    if (await tryPublishLock(resolvedRoot, lockPath, dependencies)) {
      return createLockHandle(
        resolvedRoot,
        lockPath,
        dependencies.ownerId,
        dependencies,
      )
    }
    contended = true

    const owner = await inspectLock(lockPath, dependencies)
    if (owner === null) {
      raceRetries += 1
      if (raceRetries > MAX_RACE_RETRIES) {
        throw locked()
      }
      continue
    }
    if (owner.hostname !== dependencies.hostname) {
      throw invalidLock()
    }

    let alive: boolean
    try {
      alive = await dependencies.isPidAlive(owner.pid)
    } catch (error) {
      throw invalidLock(error)
    }
    if (typeof alive !== 'boolean') {
      throw invalidLock()
    }

    if (!alive) {
      let reclaimed: boolean
      try {
        reclaimed = await reclaimDeadOwner(
          resolvedRoot,
          lockPath,
          owner,
          deadline,
          dependencies,
        )
      } catch (error) {
        if (error !== LIVE_CLAIM_CONTENDED) throw error
        lastMonotonicReading = await waitForContention(
          deadline,
          lastMonotonicReading,
          dependencies,
        )
        continue
      }
      raceRetries += 1
      if (raceRetries > MAX_RACE_RETRIES) {
        throw locked()
      }
      void reclaimed
      continue
    }

    lastMonotonicReading = await waitForContention(
      deadline,
      lastMonotonicReading,
      dependencies,
    )
  }
}
