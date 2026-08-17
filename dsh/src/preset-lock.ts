/// <reference types="node" />

import { randomUUID } from 'node:crypto'
import {
  lstat as realLstat,
  mkdir as realMkdir,
  readFile as realReadFile,
  rename as realRename,
  rm as realRm,
  writeFile as realWriteFile,
} from 'node:fs/promises'
import { hostname as realHostname } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

import { OperationalError } from './operational-error.js'

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

export interface PresetLock {
  release(): Promise<void>
}

interface LockStats {
  size: number
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

export interface PresetLockFileSystem {
  lstat(path: string): Promise<LockStats>
  mkdir(path: string, options?: { mode?: number }): Promise<unknown>
  readFile(path: string, encoding: 'utf8'): Promise<string>
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
const MAX_TIMEOUT_MS = 60_000
const MAX_RETRY_INTERVAL_MS = 5_000
const MAX_RACE_RETRIES = 64
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RETRY_INTERVAL_MS = 50
const SAFE_TOKEN_PATTERN = /^[\x21-\x7e]+$/
const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const DEFAULT_FILE_SYSTEM: PresetLockFileSystem = {
  lstat: realLstat,
  mkdir: realMkdir,
  readFile: realReadFile,
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

function isOperationalError(error: unknown): error is OperationalError {
  try {
    return error instanceof OperationalError
  } catch {
    return false
  }
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

async function readOwnerFile(
  directoryPath: string,
  ownerPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner> {
  assertContained(directoryPath, ownerPath)

  try {
    const stats = await dependencies.fileSystem.lstat(ownerPath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw invalidLock()
    }
    if (stats.size < 0 || stats.size > MAX_OWNER_DOCUMENT_LENGTH) {
      throw invalidLock()
    }
    const contents = await dependencies.fileSystem.readFile(ownerPath, 'utf8')
    if (contents.length > MAX_OWNER_DOCUMENT_LENGTH) {
      throw invalidLock()
    }
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
    const stats = await dependencies.fileSystem.lstat(documentPath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw invalidLock()
    }
    if (stats.size < 0 || stats.size > MAX_CLAIM_DOCUMENT_LENGTH) {
      throw invalidLock()
    }
    const contents = await dependencies.fileSystem.readFile(documentPath, 'utf8')
    if (contents.length > MAX_CLAIM_DOCUMENT_LENGTH) {
      throw invalidLock()
    }
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
    const lostRace =
      error === lockOccupied ||
      (stagingValidated &&
        (hasErrno(error, 'EEXIST') ||
          hasErrno(error, 'ENOTEMPTY') ||
          hasErrno(error, 'ENOTDIR')))
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

async function publishReclaimClaim(
  lockPath: string,
  claimPath: string,
  claim: PresetReclaimClaim,
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
      return true
    } catch (error) {
      const canonicalOccupied =
        error === claimOccupied ||
        (stageValidated &&
          (hasErrno(error, 'EEXIST') || hasErrno(error, 'ENOTEMPTY')))
      if (!canonicalOccupied) {
        if (hasErrno(error, 'ENOENT')) throw claimRace
        throw isOperationalError(error) ? error : invalidLock(error)
      }
      if (!stageCreated) throw invalidLock(error)
    }

    const existing = await readReclaimClaim(lockPath, claimPath, dependencies)
    if (existing.hostname !== dependencies.hostname) throw invalidLock()
    let alive: boolean
    try {
      alive = await dependencies.isPidAlive(existing.pid)
    } catch (error) {
      throw invalidLock(error)
    }
    if (typeof alive !== 'boolean') throw invalidLock()
    if (alive) throw locked()

    await assertVacantPath(retiredPath, dependencies)
    try {
      await dependencies.fileSystem.rename(claimPath, retiredPath)
    } catch (error) {
      if (hasErrno(error, 'ENOENT')) throw claimRace
      throw invalidLock(error)
    }
    const retired = await readReclaimClaim(lockPath, retiredPath, dependencies)
    if (!reclaimClaimsMatch(retired, existing)) {
      throw invalidLock()
    }
    try {
      await dependencies.fileSystem.rename(stagePath, claimPath)
      stageCreated = false
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
    const published = await readReclaimClaim(lockPath, claimPath, dependencies)
    if (!reclaimClaimsMatch(published, claim)) throw invalidLock()
    return true
  } catch (error) {
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
    dependencies,
  ))) return false

  let storedClaim: PresetReclaimClaim
  let currentOwner: PresetLockOwner
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(lockPath, dependencies)
    storedClaim = await readReclaimClaim(lockPath, claimPath, dependencies)
    if (!reclaimClaimsMatch(storedClaim, reclaimClaim)) {
      throw invalidLock()
    }
    currentOwner = await readOwnerFromLock(lockPath, dependencies)
  } catch (error) {
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
      const reclaimed = await reclaimDeadOwner(
        resolvedRoot,
        lockPath,
        owner,
        dependencies,
      )
      raceRetries += 1
      if (raceRetries > MAX_RACE_RETRIES) {
        throw locked()
      }
      void reclaimed
      continue
    }

    const beforeWait = monotonicNow(dependencies)
    if (beforeWait < lastMonotonicReading) {
      throw operationFailure()
    }
    lastMonotonicReading = beforeWait
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
    lastMonotonicReading = afterWait
  }
}
