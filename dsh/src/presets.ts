/// <reference types="node" />

import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

import {
  acquirePresetLock,
  type PresetLockDependencies,
} from './preset-lock.js'
import {
  OperationalError,
  attachOperationalErrorSecondary,
  isOperationalError,
} from './operational-error.js'

export const PRESET_IDS = ['article', 'seednote'] as const
export type PresetId = (typeof PRESET_IDS)[number]

export interface InstallOptions {
  dshHome?: string
  force?: boolean
}

export interface PresetStatus {
  id: PresetId
  state: 'absent' | 'current' | 'outdated' | 'modified' | 'unowned'
  sourceDigest: string
  installedDigest?: string
  installedVersion?: string
}

interface PresetOwnership {
  schemaVersion: 1
  packageName: '@anban/dsh-plugin'
  packageVersion: string
  presetId: string
  sourceDigest: string
}

interface PresetFaults {
  beforeRemoveOperationPath?: (path: string) => Promise<void> | void
  beforeRename?: (source: string, destination: string) => Promise<void> | void
}

interface PresetContext {
  dshHome: string
  faults: PresetFaults | undefined
  force: boolean
  lockDependencies: PresetLockDependencies
  packageVersion: string
  presetIds: readonly PresetId[]
  sourceRoot: string
}

interface TestPresetOptions {
  dshHome: string
  faults?: PresetFaults
  force?: boolean
  lockDependencies?: Omit<PresetLockDependencies, 'packageVersion'>
  packageVersion: string
  presetIds?: readonly string[]
  sourceRoot: string
}

const OWNERSHIP_FILE = '.anban-dsh-preset.json'
const PACKAGE_NAME = '@anban/dsh-plugin'
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const SOURCE_ROOT = fileURLToPath(new URL('../presets/', import.meta.url))
const PACKAGE_URL = new URL('../../package.json', import.meta.url)
const RELEASE_ATTEMPTS = 3
const OWNERSHIP_MAX_BYTES = 64 * 1024

function unownedPreset(cause?: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_UNOWNED',
    'An Anban preset is not owned by this package.',
    {
      cause,
      recovery: 'Review preset status and use force only to replace trusted content.',
    },
  )
}

function modifiedPreset(cause?: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_MODIFIED',
    'An Anban preset has local changes.',
    {
      cause,
      recovery: 'Review local changes and use force only when replacement is intended.',
    },
  )
}

function rollbackFailure(cause: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_ROLLBACK',
    'An Anban preset rollback failed.',
    {
      cause,
      recovery: 'Inspect the preset directory before retrying the operation.',
    },
  )
}

function operationFailure(cause: unknown): OperationalError {
  return new OperationalError(
    'ERR_PRESET_OPERATION',
    'An Anban preset operation failed.',
    {
      cause,
      recovery: 'Review preset status before retrying.',
    },
  )
}

function mapOperationFailure(error: unknown): OperationalError {
  return isOperationalError(error) ? error : operationFailure(error)
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  )
}

function validatePresetIds(ids: readonly string[]): readonly PresetId[] {
  return ids.map((id) => {
    if (!PRESET_ID_PATTERN.test(id)) {
      throw new Error(`Invalid preset id: ${JSON.stringify(id)}`)
    }
    if (!(PRESET_IDS as readonly string[]).includes(id)) {
      throw new Error(`Unsupported preset id: ${id}`)
    }
    return id as PresetId
  })
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
    throw new Error(`Preset path escapes its root: ${child}`)
  }
}

function presetRoot(context: PresetContext): string {
  return resolve(context.dshHome, '.agent-presets')
}

async function assertSafePresetRoot(context: PresetContext): Promise<void> {
  const root = presetRoot(context)

  try {
    const stats = await lstat(root)
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic link is not allowed for preset root: ${root}`)
    }
    if (!stats.isDirectory()) {
      throw new Error(`Preset root is not a directory: ${root}`)
    }
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) {
      throw error
    }
  }
}

function presetSource(context: PresetContext, id: PresetId): string {
  const source = resolve(context.sourceRoot, id)
  assertContained(context.sourceRoot, source)
  return source
}

function presetDestination(context: PresetContext, id: PresetId): string {
  const root = presetRoot(context)
  const destination = resolve(root, id)
  assertContained(root, destination)
  return destination
}

function operationPath(
  context: PresetContext,
  id: PresetId,
  kind: 'backup' | 'temporary' | 'remove',
): string {
  const root = presetRoot(context)
  const path = resolve(root, `.${id}.anban-${kind}-${randomUUID()}`)
  assertContained(root, path)
  return path
}

function modeClass(mode: number): 'executable' | 'file' {
  return (mode & 0o111) === 0 ? 'file' : 'executable'
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function listFiles(
  root: string,
  excludedRelativePath?: string,
): Promise<
  Array<{
    absolutePath: string
    device: number
    inode: number
    mode: number
    relativePath: string
    size: number
  }>
> {
  const rootStats = await lstat(root)
  if (rootStats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed in preset tree: ${root}`)
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Preset tree root is not a directory: ${root}`)
  }

  const files: Array<{
    absolutePath: string
    device: number
    inode: number
    mode: number
    relativePath: string
    size: number
  }> = []

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory)
    entries.sort(comparePaths)

    for (const name of entries) {
      const absolutePath = join(directory, name)
      const relativePath = prefix === '' ? name : `${prefix}/${name}`
      assertContained(root, absolutePath)
      const stats = await lstat(absolutePath)

      if (stats.isSymbolicLink()) {
        throw new Error(
          `Symbolic link is not allowed in preset tree: ${relativePath}`,
        )
      }
      if (stats.isDirectory()) {
        await visit(absolutePath, relativePath)
        continue
      }
      if (!stats.isFile()) {
        throw new Error(`Non-regular file is not allowed: ${relativePath}`)
      }
      if (relativePath === excludedRelativePath) {
        continue
      }

      files.push({
        absolutePath,
        device: stats.dev,
        inode: stats.ino,
        mode: stats.mode,
        relativePath,
        size: stats.size,
      })
    }
  }

  await visit(root, '')
  files.sort((left, right) => comparePaths(left.relativePath, right.relativePath))
  return files
}

async function digestDirectory(
  root: string,
  excludedRelativePath?: string,
): Promise<string> {
  const digest = createHash('sha256')
  const files = await listFiles(root, excludedRelativePath)

  for (const file of files) {
    const pathBytes = Buffer.from(file.relativePath, 'utf8')
    digest.update('file')
    digest.update('\0')
    digest.update(String(pathBytes.byteLength))
    digest.update('\0')
    digest.update(pathBytes)
    digest.update('\0')
    digest.update(modeClass(file.mode))
    digest.update('\0')
    digest.update(String(file.size))
    digest.update('\0')

    const handle = await open(file.absolutePath, 'r')
    try {
      const openedStats = await handle.stat()
      if (
        !openedStats.isFile() ||
        openedStats.dev !== file.device ||
        openedStats.ino !== file.inode ||
        openedStats.size !== file.size
      ) {
        throw new Error(`Preset file changed while hashing: ${file.relativePath}`)
      }

      let bytesRead = 0
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        bytesRead += chunk.byteLength
        if (bytesRead > file.size) {
          throw new Error(`Preset file changed while hashing: ${file.relativePath}`)
        }
        digest.update(chunk)
      }

      const finalStats = await handle.stat()
      if (
        bytesRead !== file.size ||
        finalStats.dev !== file.device ||
        finalStats.ino !== file.inode ||
        finalStats.size !== file.size
      ) {
        throw new Error(`Preset file changed while hashing: ${file.relativePath}`)
      }
    } finally {
      await handle.close()
    }
    digest.update('\0')
  }

  return digest.digest('hex')
}

async function readBoundedOwnershipFile(path: string): Promise<string> {
  const pathStats = await lstat(path)
  if (pathStats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed in preset tree: ${OWNERSHIP_FILE}`)
  }
  if (!pathStats.isFile()) {
    return ''
  }
  if (pathStats.size > OWNERSHIP_MAX_BYTES) {
    throw new Error(`Preset ownership manifest exceeds ${OWNERSHIP_MAX_BYTES} bytes`)
  }

  const handle = await open(path, 'r')
  try {
    const openedStats = await handle.stat()
    if (
      !openedStats.isFile() ||
      openedStats.dev !== pathStats.dev ||
      openedStats.ino !== pathStats.ino ||
      openedStats.size !== pathStats.size
    ) {
      throw new Error('Preset ownership manifest changed while opening')
    }

    const buffer = Buffer.alloc(OWNERSHIP_MAX_BYTES + 1)
    let total = 0
    while (total < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        total,
        buffer.byteLength - total,
        total,
      )
      if (bytesRead === 0) break
      total += bytesRead
    }
    const finalStats = await handle.stat()
    if (total > OWNERSHIP_MAX_BYTES || finalStats.size !== total) {
      throw new Error(`Preset ownership manifest exceeds ${OWNERSHIP_MAX_BYTES} bytes or changed while reading`)
    }
    return buffer.subarray(0, total).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  const sourceStats = await lstat(source)
  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed in preset tree: ${source}`)
  }
  if (!sourceStats.isDirectory()) {
    throw new Error(`Preset source is not a directory: ${source}`)
  }

  await mkdir(destination)
  const entries = await readdir(source)
  entries.sort(comparePaths)

  for (const name of entries) {
    const sourcePath = join(source, name)
    const destinationPath = join(destination, name)
    const stats = await lstat(sourcePath)

    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic link is not allowed in preset tree: ${sourcePath}`)
    }
    if (stats.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath)
      continue
    }
    if (!stats.isFile()) {
      throw new Error(`Non-regular file is not allowed: ${sourcePath}`)
    }

    await copyFile(sourcePath, destinationPath)
    await chmod(destinationPath, stats.mode & 0o777)
  }
}

function parseOwnership(value: unknown, expectedId: PresetId): PresetOwnership | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const ownership = value as Partial<PresetOwnership>
  if (
    ownership.schemaVersion !== 1 ||
    ownership.packageName !== PACKAGE_NAME ||
    typeof ownership.packageVersion !== 'string' ||
    ownership.packageVersion === '' ||
    ownership.presetId !== expectedId ||
    typeof ownership.sourceDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownership.sourceDigest)
  ) {
    return null
  }

  return ownership as PresetOwnership
}

async function readOwnership(
  destination: string,
  id: PresetId,
): Promise<PresetOwnership | null> {
  const ownershipPath = join(destination, OWNERSHIP_FILE)

  try {
    return parseOwnership(
      JSON.parse(await readBoundedOwnershipFile(ownershipPath)) as unknown,
      id,
    )
  } catch (error) {
    if (isNodeError(error, 'ENOENT') || error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

async function statusPreset(
  context: PresetContext,
  id: PresetId,
): Promise<PresetStatus> {
  const sourceDigest = await digestDirectory(presetSource(context, id))
  const destination = presetDestination(context, id)

  let destinationStats
  try {
    destinationStats = await lstat(destination)
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return { id, sourceDigest, state: 'absent' }
    }
    throw error
  }

  if (destinationStats.isSymbolicLink()) {
    throw new Error(`Symbolic link destination is not allowed: ${id}`)
  }
  if (!destinationStats.isDirectory()) {
    return { id, sourceDigest, state: 'unowned' }
  }

  const ownership = await readOwnership(destination, id)
  if (ownership === null) {
    return { id, sourceDigest, state: 'unowned' }
  }

  const installedDigest = await digestDirectory(destination, OWNERSHIP_FILE)

  if (installedDigest !== ownership.sourceDigest) {
    return {
      id,
      installedDigest,
      installedVersion: ownership.packageVersion,
      sourceDigest,
      state: 'modified',
    }
  }

  return {
    id,
    installedDigest,
    installedVersion: ownership.packageVersion,
    sourceDigest,
    state:
      sourceDigest === ownership.sourceDigest &&
      ownership.packageVersion === context.packageVersion
        ? 'current'
        : 'outdated',
  }
}

async function statusWithContext(
  context: PresetContext,
): Promise<PresetStatus[]> {
  await assertSafePresetRoot(context)
  return Promise.all(context.presetIds.map((id) => statusPreset(context, id)))
}

async function assertSafeReplacementTarget(
  context: PresetContext,
  id: PresetId,
): Promise<void> {
  const destination = presetDestination(context, id)
  const stats = await lstat(destination)
  if (stats.isSymbolicLink()) {
    throw new Error(`Symbolic link destination cannot be replaced: ${id}`)
  }
  if (stats.isDirectory()) {
    await listFiles(destination)
    return
  }
  if (!stats.isFile()) {
    throw new Error(`Non-regular destination cannot be replaced: ${id}`)
  }
}

async function removeOperationPath(
  context: PresetContext,
  path: string,
): Promise<void> {
  assertContained(presetRoot(context), path)
  await context.faults?.beforeRemoveOperationPath?.(path)
  await rm(path, { force: true, recursive: true })
}

async function renameOperationPath(
  context: PresetContext,
  source: string,
  destination: string,
): Promise<void> {
  await context.faults?.beforeRename?.(source, destination)
  await rename(source, destination)
}

async function installPreset(
  context: PresetContext,
  id: PresetId,
  expectedStatus: PresetStatus,
): Promise<void> {
  const destination = presetDestination(context, id)
  const temporary = operationPath(context, id, 'temporary')
  const backup = operationPath(context, id, 'backup')
  let backupMayContainOnlyOriginal = false
  let deferredBackupCleanupError: unknown
  let hasDeferredBackupCleanupError = false
  let operationError: unknown
  let operationFailed = false
  const cleanupErrors: unknown[] = []

  try {
    await copyDirectory(presetSource(context, id), temporary)
    const copiedDigest = await digestDirectory(temporary)
    if (copiedDigest !== expectedStatus.sourceDigest) {
      throw new Error(`Preset source changed while copying: ${id}`)
    }

    const ownership: PresetOwnership = {
      schemaVersion: 1,
      packageName: PACKAGE_NAME,
      packageVersion: context.packageVersion,
      presetId: id,
      sourceDigest: copiedDigest,
    }
    await writeFile(
      join(temporary, OWNERSHIP_FILE),
      `${JSON.stringify(ownership, null, 2)}\n`,
      { flag: 'wx' },
    )

    let destinationExists = true
    try {
      await lstat(destination)
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        destinationExists = false
      } else {
        throw error
      }
    }

    if (destinationExists) {
      const currentStatus = await statusPreset(context, id)
      if (
        !context.force &&
        currentStatus.state !== 'outdated' &&
        currentStatus.state !== 'current'
      ) {
        if (currentStatus.state === 'unowned') {
          throw unownedPreset()
        }
        if (currentStatus.state === 'modified') {
          throw modifiedPreset()
        }
        throw operationFailure(
          new Error(`Preset ${id} changed while preparing installation`),
        )
      }
      if (context.force) {
        await assertSafeReplacementTarget(context, id)
      }

      await renameOperationPath(context, destination, backup)
      backupMayContainOnlyOriginal = true
    } else if (expectedStatus.state !== 'absent' && !context.force) {
      throw new Error(`Preset ${id} changed while preparing installation`)
    }

    try {
      await renameOperationPath(context, temporary, destination)
      backupMayContainOnlyOriginal = false
    } catch (error) {
      if (backupMayContainOnlyOriginal) {
        try {
          await renameOperationPath(context, backup, destination)
          backupMayContainOnlyOriginal = false
        } catch (rollbackError) {
          throw rollbackFailure(
            new AggregateError(
              [error, rollbackError],
              `Preset ${id} replacement and rollback both failed`,
            ),
          )
        }
      }
      throw error
    }

    try {
      await removeOperationPath(context, backup)
    } catch (error) {
      deferredBackupCleanupError = error
      hasDeferredBackupCleanupError = true
    }
  } catch (error) {
    operationError = error
    operationFailed = true
  } finally {
    try {
      await removeOperationPath(context, temporary)
    } catch (error) {
      cleanupErrors.push(error)
    }

    if (!backupMayContainOnlyOriginal) {
      try {
        await removeOperationPath(context, backup)
        hasDeferredBackupCleanupError = false
      } catch (error) {
        if (hasDeferredBackupCleanupError) {
          cleanupErrors.push(deferredBackupCleanupError)
        }
        cleanupErrors.push(error)
      }
    }
  }

  if (operationFailed) {
    if (cleanupErrors.length > 0) {
      const cleanupFailure = new AggregateError(
        cleanupErrors,
        `Preset ${id} installation cleanup was incomplete`,
      )
      if (isOperationalError(operationError)) {
        throw attachOperationalErrorSecondary(operationError, cleanupFailure)
      }
      throw new AggregateError(
        [operationError, cleanupFailure],
        `Preset ${id} installation failed and cleanup was incomplete`,
      )
    }
    throw operationError
  }
  if (cleanupErrors.length === 1) {
    throw cleanupErrors[0]
  }
  if (cleanupErrors.length > 1) {
    throw new AggregateError(
      cleanupErrors,
      `Preset ${id} cleanup failed more than once`,
    )
  }
}

async function installWithContext(
  context: PresetContext,
): Promise<PresetStatus[]> {
  await assertSafePresetRoot(context)
  await mkdir(presetRoot(context), { recursive: true })
  await assertSafePresetRoot(context)
  const before = await statusWithContext(context)

  for (const status of before) {
    if (
      !context.force &&
      (status.state === 'modified' || status.state === 'unowned')
    ) {
      throw status.state === 'unowned'
        ? unownedPreset()
        : modifiedPreset()
    }
    if (context.force && status.state === 'unowned') {
      await assertSafeReplacementTarget(context, status.id)
    }
  }

  for (const status of before) {
    if (status.state !== 'current') {
      await installPreset(context, status.id, status)
    }
  }

  return statusWithContext(context)
}

async function removeWithContext(context: PresetContext): Promise<PresetId[]> {
  const statuses = await statusWithContext(context)

  for (const status of statuses) {
    if (status.state === 'unowned') {
      throw unownedPreset()
    }
  }

  const removed: PresetId[] = []
  for (const status of statuses) {
    if (status.state === 'absent') {
      continue
    }

    const destination = presetDestination(context, status.id)
    const ownership = await readOwnership(destination, status.id)
    if (ownership === null) {
      throw unownedPreset()
    }
    await listFiles(destination)

    const removalPath = operationPath(context, status.id, 'remove')
    await renameOperationPath(context, destination, removalPath)
    try {
      await removeOperationPath(context, removalPath)
    } catch (removalError) {
      try {
        await renameOperationPath(context, removalPath, destination)
      } catch (rollbackError) {
        throw rollbackFailure(
          new AggregateError(
            [removalError, rollbackError],
            `Preset ${status.id} removal and rollback failed; inspect recovery path ${removalPath}`,
          ),
        )
      }
      throw removalError
    }
    removed.push(status.id)
  }

  return removed
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(PACKAGE_URL, 'utf8')) as unknown
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string' ||
    manifest.version === ''
  ) {
    throw new Error('Package manifest has no valid version')
  }
  return manifest.version
}

async function publicContext(
  options: InstallOptions | Pick<InstallOptions, 'dshHome'> = {},
): Promise<PresetContext> {
  const resolvedPackageVersion = await packageVersion()
  return {
    dshHome: resolveDshHome(options.dshHome),
    faults: undefined,
    force: 'force' in options && options.force === true,
    lockDependencies: { packageVersion: resolvedPackageVersion },
    packageVersion: resolvedPackageVersion,
    presetIds: PRESET_IDS,
    sourceRoot: SOURCE_ROOT,
  }
}

function testContext(options: TestPresetOptions): PresetContext {
  return {
    dshHome: resolveDshHome(options.dshHome),
    faults: options.faults,
    force: options.force === true,
    lockDependencies: {
      ...options.lockDependencies,
      packageVersion: options.packageVersion,
    },
    packageVersion: options.packageVersion,
    presetIds: validatePresetIds(options.presetIds ?? PRESET_IDS),
    sourceRoot: resolve(options.sourceRoot),
  }
}

export async function installPresets(
  options: InstallOptions = {},
): Promise<PresetStatus[]> {
  return mapPublicOperation(async () =>
    mutateWithContext(await publicContext(options), installWithContext),
  )
}

export async function statusPresets(
  options: Pick<InstallOptions, 'dshHome'> = {},
): Promise<PresetStatus[]> {
  return mapPublicOperation(async () =>
    statusWithContext(await publicContext(options)),
  )
}

export async function removePresets(
  options: Pick<InstallOptions, 'dshHome'> = {},
): Promise<PresetId[]> {
  return mapPublicOperation(async () =>
    mutateWithContext(await publicContext(options), removeWithContext),
  )
}

async function mapPublicOperation<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation()
  } catch (error) {
    throw mapOperationFailure(error)
  }
}

async function releaseWithRetries(
  lock: Awaited<ReturnType<typeof acquirePresetLock>>,
): Promise<void> {
  let lastFailure: unknown
  for (let attempt = 0; attempt < RELEASE_ATTEMPTS; attempt += 1) {
    try {
      await lock.release()
      return
    } catch (error) {
      lastFailure = error
    }
  }
  throw mapOperationFailure(lastFailure)
}

async function mutateWithContext<Result>(
  context: PresetContext,
  operation: (context: PresetContext) => Promise<Result>,
): Promise<Result> {
  let lock: Awaited<ReturnType<typeof acquirePresetLock>> | undefined
  let releaseFailure: OperationalError | undefined
  let outcome:
    | { error: OperationalError; kind: 'failure' }
    | { kind: 'success'; value: Result }
  try {
    await assertSafePresetRoot(context)
    await mkdir(presetRoot(context), { recursive: true })
    await assertSafePresetRoot(context)
    lock = await acquirePresetLock(presetRoot(context), context.lockDependencies)
    outcome = { kind: 'success', value: await operation(context) }
  } catch (error) {
    outcome = { error: mapOperationFailure(error), kind: 'failure' }
  } finally {
    if (lock !== undefined) {
      try {
        await releaseWithRetries(lock)
      } catch (error) {
        releaseFailure = mapOperationFailure(error)
      }
    }
  }

  if (outcome.kind === 'failure') {
    throw releaseFailure === undefined
      ? outcome.error
      : attachOperationalErrorSecondary(outcome.error, releaseFailure)
  }
  if (releaseFailure !== undefined) {
    throw releaseFailure
  }
  return outcome.value
}

/** @internal Test boundary for isolated source fixtures; not part of package exports. */
export const presetTestInternals = {
  install(options: TestPresetOptions): Promise<PresetStatus[]> {
    return mutateWithContext(testContext(options), installWithContext)
  },
  remove(options: TestPresetOptions): Promise<PresetId[]> {
    return mutateWithContext(testContext(options), removeWithContext)
  },
  status(options: TestPresetOptions): Promise<PresetStatus[]> {
    return statusWithContext(testContext(options))
  },
}
