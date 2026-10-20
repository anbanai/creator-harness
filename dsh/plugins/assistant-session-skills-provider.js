import { cpSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as skillsProvider from '../lib/skills-provider.js'

export const name = 'anban-assistant-session-skills-provider'

const ASSISTANT_PRESETS = new Set(['creation-planner', 'postmortem-review'])

export async function apply(ctx, config) {
  const presetId = config?.presetId
  if (!ASSISTANT_PRESETS.has(presetId)) throw new TypeError('Invalid Assistant session preset')
  const sourceRoot = fileURLToPath(new URL(`../presets/${presetId}/skills`, import.meta.url))
  const destination = dshHomePath('.agent-presets', presetId, 'skills')
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  cpSync(sourceRoot, destination, { recursive: true, force: true })
  return skillsProvider.apply(ctx, {
    presetId,
    providerName: config.providerName,
  })
}
