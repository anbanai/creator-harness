// The interactive runtime ships the Project Creator patch directly instead of
// installing the published Anban plugin package. Materialize its generated
// Skill tree into the session DSH_HOME, then reuse the canonical provider.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import * as skillsProvider from '../lib/skills-provider.js'

export const name = 'anban-project-creator-skills-provider'

export async function apply(ctx, config) {
  const sourceRoot = fileURLToPath(new URL('../presets/project-creator/skills', import.meta.url))
  const destination = dshHomePath('.agent-presets', 'project-creator', 'skills')
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  cpSync(sourceRoot, destination, { recursive: true, force: true })
  return skillsProvider.apply(ctx, config)
}
