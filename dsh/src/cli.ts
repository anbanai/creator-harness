import {
  installPresets,
  removePresets,
  statusPresets,
  type PresetStatus,
} from './presets.js'

const DIGEST_PREFIX_LENGTH = 12
const DIGEST_PATTERN = /^[a-f0-9]{64}$/
const VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function digestPrefix(digest: string | undefined): string {
  if (digest === undefined) {
    return 'none'
  }
  return DIGEST_PATTERN.test(digest)
    ? digest.slice(0, DIGEST_PREFIX_LENGTH)
    : 'invalid'
}

function installedVersion(version: string | undefined): string {
  if (version === undefined) {
    return 'none'
  }
  return VERSION_PATTERN.test(version) ? version : 'invalid'
}

function formatStatus(status: PresetStatus): string {
  return [
    status.id,
    `state=${status.state}`,
    `source=${digestPrefix(status.sourceDigest)}`,
    `installed=${digestPrefix(status.installedDigest)}`,
    `version=${installedVersion(status.installedVersion)}`,
  ].join(' ')
}

function invalidCommand(io: Pick<Console, 'error'>): number {
  io.error('anban-dsh: invalid command')
  return 2
}

export async function runCLI(
  argv: readonly string[],
  io: Pick<Console, 'log' | 'error'> = console,
): Promise<number> {
  try {
    if (argv.length === 1 && argv[0] === 'install-presets') {
      const statuses = await installPresets({})
      for (const status of statuses) {
        io.log(formatStatus(status))
      }
      return 0
    }

    if (
      argv.length === 2 &&
      argv[0] === 'install-presets' &&
      argv[1] === '--force'
    ) {
      const statuses = await installPresets({ force: true })
      for (const status of statuses) {
        io.log(formatStatus(status))
      }
      return 0
    }

    if (argv.length === 1 && argv[0] === 'status') {
      const statuses = await statusPresets()
      for (const status of statuses) {
        io.log(formatStatus(status))
      }
      return 0
    }

    if (argv.length === 1 && argv[0] === 'remove-presets') {
      const removed = await removePresets()
      io.log(`removed=${removed.join(',')}`)
      return 0
    }

    return invalidCommand(io)
  } catch {
    io.error('anban-dsh: preset operation failed')
    return 1
  }
}
