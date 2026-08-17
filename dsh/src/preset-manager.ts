import type { Context } from '@deepseek-ai/cordis'
import type {
  CommandInvocation,
  CommandResult,
} from '@deepseek-ai/dsh-commands'

import { formatPresetStatus } from './cli.js'
import {
  formatOperationalError,
  isDshDebugEnabled,
  type OperationalDiagnosticsOptions,
} from './operational-error.js'
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

function operationFailed(
  error: unknown,
  options: OperationalDiagnosticsOptions,
): CommandResult {
  return {
    kind: 'error',
    text: formatOperationalError(error, {
      debug: isDshDebugEnabled(options.environment),
    }),
  }
}

async function install(
  invocation: CommandInvocation,
  options: OperationalDiagnosticsOptions,
): Promise<CommandResult> {
  const input = invocation.rawInput.trim()
  if (input !== '' && input !== 'force') {
    return invalidInput('Usage: /anban-presets-install [force]')
  }

  try {
    const statuses = await installPresets(
      input === 'force' ? { force: true } : {},
    )
    return { kind: 'success', text: formatStatuses(statuses) }
  } catch (error) {
    return operationFailed(error, options)
  }
}

async function status(
  invocation: CommandInvocation,
  options: OperationalDiagnosticsOptions,
): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== '') {
    return invalidInput('Usage: /anban-presets-status')
  }

  try {
    return { kind: 'success', text: formatStatuses(await statusPresets()) }
  } catch (error) {
    return operationFailed(error, options)
  }
}

async function remove(
  invocation: CommandInvocation,
  options: OperationalDiagnosticsOptions,
): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== 'confirm') {
    return invalidInput('Usage: /anban-presets-remove confirm')
  }

  try {
    return {
      kind: 'success',
      text: `removed=${(await removePresets()).join(',')}`,
    }
  } catch (error) {
    return operationFailed(error, options)
  }
}

export function apply(
  ctx: Context,
  options: OperationalDiagnosticsOptions = {},
): void {
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-install',
      description: 'Install Anban agent presets.',
      input: { hint: '[force]' },
      handler: (invocation) => install(invocation, options),
    }),
  )
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-status',
      description: 'Show Anban agent preset status.',
      handler: (invocation) => status(invocation, options),
    }),
  )
  ctx.effect(() =>
    ctx.commands.register({
      name: 'anban-presets-remove',
      description: 'Remove Anban agent presets.',
      input: { hint: 'confirm' },
      handler: (invocation) => remove(invocation, options),
    }),
  )
}
