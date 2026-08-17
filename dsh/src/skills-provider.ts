import { types } from 'node:util'

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

import { OperationalError } from './operational-error.js'

export interface Config {
  presetId: string
  providerName: string
}

interface ResolvedConfig {
  presetId: 'article' | 'seednote'
  providerName: string
}

const CONFIG_KEYS = new Set<PropertyKey>(['presetId', 'providerName'])
const PROVIDER_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const name = 'anban-skills-provider'

function invalidConfig(): never {
  throw new TypeError('Invalid skills provider config')
}

function validateConfig(config: Config): ResolvedConfig {
  try {
    if (
      types.isProxy(config) ||
      typeof config !== 'object' ||
      config === null ||
      Array.isArray(config) ||
      Object.getPrototypeOf(config) !== Object.prototype
    ) {
      return invalidConfig()
    }

    const keys = Reflect.ownKeys(config)
    if (
      keys.length !== CONFIG_KEYS.size ||
      keys.some((key) => !CONFIG_KEYS.has(key))
    ) {
      return invalidConfig()
    }

    const presetId = Object.getOwnPropertyDescriptor(config, 'presetId')
    const providerName = Object.getOwnPropertyDescriptor(config, 'providerName')
    if (
      presetId === undefined ||
      !('value' in presetId) ||
      providerName === undefined ||
      !('value' in providerName)
    ) {
      return invalidConfig()
    }

    if (presetId.value !== 'article' && presetId.value !== 'seednote') {
      return invalidConfig()
    }
    if (
      typeof providerName.value !== 'string' ||
      !PROVIDER_NAME_PATTERN.test(providerName.value)
    ) {
      return invalidConfig()
    }

    return {
      presetId: presetId.value,
      providerName: providerName.value,
    }
  } catch {
    return invalidConfig()
  }
}

export async function apply(
  ctx: Context,
  config: Config,
): Promise<() => Promise<void>> {
  const resolved = validateConfig(config)
  const child = ctx.plugin(skillFilesystem, {
    providerName: resolved.providerName,
    includeDefaultRoots: false,
    customSkillDirs: [
      dshHomePath('.agent-presets', resolved.presetId, 'skills'),
    ],
  })

  let disposal: Promise<void> | undefined
  const disposeChild = (): Promise<void> => {
    if (disposal === undefined) {
      try {
        disposal = Promise.resolve(child.dispose())
      } catch (error) {
        disposal = Promise.reject(error)
      }
    }
    return disposal
  }

  try {
    await child
  } catch (readinessFailure) {
    try {
      await disposeChild()
    } catch (disposalFailure) {
      throw new OperationalError(
        'ERR_PRESET_OPERATION',
        'Anban preset Skills failed to become ready and cleanup also failed.',
        {
          cause: new AggregateError(
            [readinessFailure, disposalFailure],
            'Anban preset Skills readiness and cleanup failed.',
          ),
        },
      )
    }
    throw readinessFailure
  }

  let cleanup: Promise<void> | undefined
  return () => {
    if (cleanup === undefined) {
      cleanup = disposeChild().catch((disposalFailure: unknown) => {
        throw new OperationalError(
          'ERR_PRESET_OPERATION',
          'Unable to dispose Anban preset Skills.',
          { cause: disposalFailure },
        )
      })
    }
    return cleanup
  }
}
