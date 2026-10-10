import { readFile } from 'node:fs/promises'

import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const inputSchemaUrl = new URL(
  '../../packs/profile-analysis/schemas/task-input.json',
  import.meta.url,
)
const outputSchemaUrl = new URL(
  '../../packs/profile-analysis/schemas/output.json',
  import.meta.url,
)
const profileAgentUrl = new URL(
  '../../packs/profile-analysis/agent.claude.md',
  import.meta.url,
)
const profileUsageSkillUrl = new URL(
  '../../skills/project-profile-context/SKILL.md',
  import.meta.url,
)
const consumerPackUrls = [
  '../../packs/wechat-article/agent-pack.yaml',
  '../../packs/wechat-picture/agent-pack.yaml',
  '../../packs/seednote/agent-pack.yaml',
  '../../packs/montage/agent-pack.yaml',
  '../../packs/hypit/agent-pack.yaml',
  '../../packs/whiteboard-animation/agent-pack.yaml',
].map((path) => new URL(path, import.meta.url))

describe('profile analysis Pack contract', () => {
  it('freezes selected objects, per-account provenance, answers, and the current profile', async () => {
    const input = JSON.parse(await readFile(inputSchemaUrl, 'utf8')) as {
      required: string[]
      properties: Record<string, any>
    }

    expect(input.required).toEqual(expect.arrayContaining([
      'project_id',
      'agent_ids',
      'profile_setup',
      'current_profile',
      'expected_revision',
    ]))
    expect(input.properties.agent_ids.items.enum).toEqual([
      'wechat-article',
      'wechat-picture',
      'seednote',
      'montage',
      'hypit',
      'whiteboard-animation',
    ])
    expect(input.properties.profile_setup.properties.platform_accounts.items.required).toEqual(
      expect.arrayContaining(['platform', 'profile_url', 'source']),
    )
    expect(input.properties.answers.properties).toHaveProperty('basic')
    expect(input.properties.profile_setup.properties.answers.properties).toHaveProperty('intent')
    expect(input.properties.profile_setup.properties.answers.properties).toHaveProperty('content')
    expect(input.properties.profile_setup.properties.answers.properties).toHaveProperty('boundaries')
    expect(input.properties.current_profile.oneOf.map((branch: { type: string }) => branch.type)).toEqual(['object', 'null'])
    expect(input.properties.expected_revision.minimum).toBe(0)
  })

  it('requires complete source-aware dimensions and documents atomic Server application', async () => {
    const output = JSON.parse(await readFile(outputSchemaUrl, 'utf8')) as {
      required: string[]
      properties: Record<string, any>
    }
    const agent = await readFile(profileAgentUrl, 'utf8')

    expect(output.required).toContain('expected_revision')
    expect(output.properties.expected_revision.type).toBe('integer')
    expect(output.properties.expected_revision.minimum).toBe(0)
    expect(output.properties.dimensions.required).toEqual([
      'identity', 'style', 'audience', 'platforms', 'preferences', 'memory',
    ])
    expect(agent).toContain('submit_profile_result')
    expect(agent).toContain('expected_revision')
    expect(agent).toContain('current_profile')
    expect(agent).toContain('preferences')
    expect(agent).toContain('不写入全局 `MEMORY.md`')
  })

  it('binds the same project profile rules into every supported creation Agent', async () => {
    const skill = await readFile(profileUsageSkillUrl, 'utf8')
    const packs = await Promise.all(consumerPackUrls.map(async (url) => {
      const parsed = load(await readFile(url, 'utf8')) as {
        agent?: { skills?: string[] }
      }
      return parsed.agent?.skills ?? []
    }))

    expect(skill).toContain('preferences')
    expect(skill).toContain('[推断待确认]')
    expect(skill).toContain('get_project_profile')
    expect(packs).toHaveLength(6)
    for (const skills of packs) {
      expect(skills).toContain('project-profile-context')
    }
  })
})
