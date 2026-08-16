/// <reference types="node" />

import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

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

interface PresetContext {
  dshHome: string
  force: boolean
  packageVersion: string
  presetIds: readonly PresetId[]
  sourceRoot: string
}

interface TestPresetOptions {
  dshHome: string
  force?: boolean
  packageVersion: string
  presetIds?: readonly string[]
  sourceRoot: string
}

const OWNERSHIP_FILE = '.anban-dsh-preset.json'
const PACKAGE_NAME = '@anban/dsh-plugin'
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const SOURCE_ROOT = fileURLToPath(new URL('../presets/', import.meta.url))
const PACKAGE_URL = new URL('../../package.json', import.meta.url)

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
): Promise<Array<{ absolutePath: string; mode: number; relativePath: string }>> {
  const rootStats = await lstat(root)
  if (rootStats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed in preset tree: ${root}`)
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`Preset tree root is not a directory: ${root}`)
  }

  const files: Array<{
    absolutePath: string
    mode: number
    relativePath: string
  }> = []

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory)
    entries.sort(comparePaths)

    for (const name of entries) {
      const absolutePath = join(directory, name)
      const relativePath = prefix === '' ? name : `${prefix}/${name}`
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

      files.push({ absolutePath, mode: stats.mode, relativePath })
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
    digest.update(file.relativePath)
    digest.update('\0')
    digest.update(modeClass(file.mode))
    digest.update('\0')
    digest.update(await readFile(file.absolutePath))
    digest.update('\0')
  }

  return digest.digest('hex')
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
    const stats = await lstat(ownershipPath)
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic link is not allowed in preset tree: ${OWNERSHIP_FILE}`)
    }
    if (!stats.isFile()) {
      return null
    }
    return parseOwnership(
      JSON.parse(await readFile(ownershipPath, 'utf8')) as unknown,
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
  await rm(path, { force: true, recursive: true })
}

async function installPreset(
  context: PresetContext,
  id: PresetId,
  expectedStatus: PresetStatus,
): Promise<void> {
  const destination = presetDestination(context, id)
  const temporary = operationPath(context, id, 'temporary')
  const backup = operationPath(context, id, 'backup')
  let backupContainsOriginal = false

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
        throw new Error(
          `Preset ${id} became ${currentStatus.state}; rerun with force to replace it`,
        )
      }
      if (context.force) {
        await assertSafeReplacementTarget(context, id)
      }

      await rename(destination, backup)
      backupContainsOriginal = true
    } else if (expectedStatus.state !== 'absent' && !context.force) {
      throw new Error(`Preset ${id} changed while preparing installation`)
    }

    try {
      await rename(temporary, destination)
    } catch (error) {
      if (backupContainsOriginal) {
        await rename(backup, destination)
        backupContainsOriginal = false
      }
      throw error
    }

    if (backupContainsOriginal) {
      await removeOperationPath(context, backup)
      backupContainsOriginal = false
    }
  } finally {
    await removeOperationPath(context, temporary)
    if (!backupContainsOriginal) {
      await removeOperationPath(context, backup)
    }
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
      throw new Error(
        `Preset ${status.id} is ${status.state}; rerun with force to replace it`,
      )
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
      throw new Error(`Refusing to remove unowned preset: ${status.id}`)
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
      throw new Error(`Preset ownership changed before removal: ${status.id}`)
    }
    await listFiles(destination)

    const removalPath = operationPath(context, status.id, 'remove')
    await rename(destination, removalPath)
    try {
      await removeOperationPath(context, removalPath)
    } catch (error) {
      try {
        await rename(removalPath, destination)
      } catch {
        // Keep the original removal error; any remaining path retains ownership.
      }
      throw error
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
  return {
    dshHome: resolveDshHome(options.dshHome),
    force: 'force' in options && options.force === true,
    packageVersion: await packageVersion(),
    presetIds: PRESET_IDS,
    sourceRoot: SOURCE_ROOT,
  }
}

function testContext(options: TestPresetOptions): PresetContext {
  return {
    dshHome: resolveDshHome(options.dshHome),
    force: options.force === true,
    packageVersion: options.packageVersion,
    presetIds: validatePresetIds(options.presetIds ?? PRESET_IDS),
    sourceRoot: resolve(options.sourceRoot),
  }
}

export async function installPresets(
  options: InstallOptions = {},
): Promise<PresetStatus[]> {
  return installWithContext(await publicContext(options))
}

export async function statusPresets(
  options: Pick<InstallOptions, 'dshHome'> = {},
): Promise<PresetStatus[]> {
  return statusWithContext(await publicContext(options))
}

export async function removePresets(
  options: Pick<InstallOptions, 'dshHome'> = {},
): Promise<PresetId[]> {
  return removeWithContext(await publicContext(options))
}

/** @internal Test boundary for isolated source fixtures; not part of package exports. */
export const presetTestInternals = {
  install(options: TestPresetOptions): Promise<PresetStatus[]> {
    return installWithContext(testContext(options))
  },
  remove(options: TestPresetOptions): Promise<PresetId[]> {
    return removeWithContext(testContext(options))
  },
  status(options: TestPresetOptions): Promise<PresetStatus[]> {
    return statusWithContext(testContext(options))
  },
}
