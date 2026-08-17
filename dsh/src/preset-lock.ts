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

export interface PresetLock {
  release(): Promise<void>
}

interface LockStats {
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

async function readOwnerFromLock(
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner> {
  const ownerPath = join(lockPath, OWNER_NAME)
  assertContained(lockPath, ownerPath)

  try {
    const stats = await dependencies.fileSystem.lstat(ownerPath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
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

async function discardUnpublishedLock(
  lockPath: string,
  presetRoot: string,
  dependencies: ResolvedDependencies,
): Promise<void> {
  const failedPath = join(
    presetRoot,
    `${LOCK_NAME}.failed-${dependencies.ownerId}`,
  )
  assertContained(presetRoot, failedPath)
  await assertSafePresetRoot(presetRoot, dependencies)
  await assertVacantPath(failedPath, dependencies)
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await dependencies.fileSystem.rename(lockPath, failedPath)
  } catch (error) {
    if (hasErrno(error, 'ENOENT')) {
      return
    }
    throw operationFailure(error)
  }
  try {
    await assertSafePresetRoot(presetRoot, dependencies)
    await assertSafeQuarantine(failedPath, dependencies)
    await dependencies.fileSystem.rm(failedPath, { force: true, recursive: true })
  } catch (error) {
    if (isOperationalError(error)) {
      throw error
    }
    throw operationFailure(error)
  }
}

async function publishOwner(
  presetRoot: string,
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<PresetLockOwner> {
  const ownerPath = join(lockPath, OWNER_NAME)
  const temporaryOwnerPath = join(
    lockPath,
    `.owner-${dependencies.ownerId}.json.tmp`,
  )
  assertContained(lockPath, ownerPath)
  assertContained(lockPath, temporaryOwnerPath)
  const owner: PresetLockOwner = {
    schemaVersion: 1,
    pid: dependencies.pid,
    hostname: dependencies.hostname,
    createdAt: creationTime(dependencies),
    packageVersion: dependencies.packageVersion,
    ownerId: dependencies.ownerId,
  }

  try {
    await dependencies.fileSystem.writeFile(
      temporaryOwnerPath,
      `${JSON.stringify(owner)}\n`,
      { flag: 'wx', mode: 0o600 },
    )
    await dependencies.faults?.beforeOwnerPublish?.(
      temporaryOwnerPath,
      ownerPath,
    )
    await assertSafePresetRoot(presetRoot, dependencies)
    await dependencies.fileSystem.rename(temporaryOwnerPath, ownerPath)
    return owner
  } catch (publicationError) {
    try {
      await discardUnpublishedLock(lockPath, presetRoot, dependencies)
    } catch (cleanupError) {
      throw operationFailure(
        new AggregateError(
          [publicationError, cleanupError],
          'Preset lock publication and cleanup failed.',
        ),
      )
    }
    throw operationFailure(publicationError)
  }
}

async function reclaimDeadOwner(
  presetRoot: string,
  lockPath: string,
  dependencies: ResolvedDependencies,
): Promise<boolean> {
  const quarantinePath = join(
    presetRoot,
    `${LOCK_NAME}.quarantine-${dependencies.ownerId}`,
  )
  assertContained(presetRoot, quarantinePath)
  await assertSafePresetRoot(presetRoot, dependencies)
  await assertVacantPath(quarantinePath, dependencies)

  try {
    await dependencies.faults?.beforeQuarantineRename?.(
      lockPath,
      quarantinePath,
    )
    await assertSafePresetRoot(presetRoot, dependencies)
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
  let owner: PresetLockOwner | null
  try {
    owner = await inspectLock(lockPath, dependencies)
  } catch (error) {
    throw isOperationalError(error) ? error : invalidLock(error)
  }
  if (owner === null || owner.ownerId !== expectedOwnerId) {
    return
  }

  const releasePath = join(
    presetRoot,
    `${LOCK_NAME}.release-${expectedOwnerId}`,
  )
  assertContained(presetRoot, releasePath)
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
  return {
    release(): Promise<void> {
      releasePromise ??= releaseOwnedLock(
        presetRoot,
        lockPath,
        ownerId,
        dependencies,
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

  while (true) {
    await assertSafePresetRoot(resolvedRoot, dependencies)
    try {
      await dependencies.fileSystem.mkdir(lockPath, { mode: 0o700 })
      await publishOwner(resolvedRoot, lockPath, dependencies)
      return createLockHandle(
        resolvedRoot,
        lockPath,
        dependencies.ownerId,
        dependencies,
      )
    } catch (error) {
      if (!hasErrno(error, 'EEXIST')) {
        if (isOperationalError(error)) {
          throw error
        }
        throw operationFailure(error)
      }
    }

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
        dependencies,
      )
      raceRetries += 1
      if (raceRetries > MAX_RACE_RETRIES) {
        throw locked()
      }
      if (reclaimed) {
        raceRetries = 0
      }
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
