import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'

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
  if (
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
  await child
  return () => child.dispose()
}
