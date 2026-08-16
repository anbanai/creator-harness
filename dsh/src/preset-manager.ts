import type { Context } from '@deepseek-ai/cordis'
import type {
  CommandInvocation,
  CommandResult,
} from '@deepseek-ai/dsh-commands'

import { formatPresetStatus } from './cli.js'
import { installPresets, removePresets, statusPresets } from './presets.js'

export const name = 'anban-preset-manager'
export const inject = ['commands']

function formatStatuses(
  statuses: Awaited<ReturnType<typeof statusPresets>>,
): string {
  return statuses.map(formatPresetStatus).join('\n')
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
