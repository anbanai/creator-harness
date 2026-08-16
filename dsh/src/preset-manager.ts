import type { Context } from '@deepseek-ai/cordis'
import type {
  CommandInvocation,
  CommandResult,
} from '@deepseek-ai/dsh-commands'

import {
  installPresets,
  removePresets,
  statusPresets,
  type PresetStatus,
} from './presets.js'

export const name = 'anban-preset-manager'
export const inject = ['commands']

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

function formatStatuses(statuses: readonly PresetStatus[]): string {
  return statuses
    .map((status) =>
      [
        status.id,
        `state=${status.state}`,
        `source=${digestPrefix(status.sourceDigest)}`,
        `installed=${digestPrefix(status.installedDigest)}`,
        `version=${installedVersion(status.installedVersion)}`,
      ].join(' '),
    )
    .join('\n')
}

function invalidInput(text: string): CommandResult {
  return { kind: 'error', text }
}

function operationFailed(): CommandResult {
  return { kind: 'error', text: 'Anban preset operation failed.' }
}

async function install(invocation: CommandInvocation): Promise<CommandResult> {
  const input = invocation.rawInput.trim()
  if (input !== '' && input !== 'force') {
    return invalidInput('Usage: /anban-presets-install [force]')
  }

  try {
    const statuses = await installPresets(
      input === 'force' ? { force: true } : {},
    )
    return { kind: 'success', text: formatStatuses(statuses) }
  } catch {
    return operationFailed()
  }
}

async function status(invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== '') {
    return invalidInput('Usage: /anban-presets-status')
  }

  try {
    return { kind: 'success', text: formatStatuses(await statusPresets()) }
  } catch {
    return operationFailed()
  }
}

async function remove(invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== 'confirm') {
    return invalidInput('Usage: /anban-presets-remove confirm')
  }

  try {
    return {
      kind: 'success',
      text: `removed=${(await removePresets()).join(',')}`,
    }
  } catch {
    return operationFailed()
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-install',
      description: 'Install Anban agent presets.',
      input: { hint: '[force]' },
      handler: install,
    }),
  )
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-status',
      description: 'Show Anban agent preset status.',
      handler: status,
    }),
  )
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-remove',
      description: 'Remove Anban agent presets.',
      input: { hint: 'confirm' },
      handler: remove,
    }),
  )
}
