import { describe, expect, it } from 'vitest'
import { apply } from './assistant-session-restrictions.js'

function setup(preset, child = false) {
  const listeners = new Map()
  const calls = []
  const agent = {
    ctx: {
      get: () => ({ composedPreset: () => preset }),
      tools: {
        restrict: (config) => calls.push(['restrict', config]),
        guard: (guard) => calls.push(['guard', guard]),
      },
    },
    session: { header: child ? { parentSession: 'root' } : {} },
  }
  const ctx = {
    on: (event, listener) => listeners.set(event, listener),
    agents: { list: () => [agent] },
  }
  apply(ctx)
  listeners.get('agent/created')({ agent })
  return { calls }
}

describe('Assistant session tool restrictions', () => {
  it.each(['creation-planner', 'postmortem-review'])(
    'allows only questions, Skills, and draft staging for %s',
    (preset) => {
      const { calls } = setup(preset)
      expect(calls[0]).toEqual(['restrict', { allow: [
        'ask_user_question',
        'skill',
        'mcp__creator__stage_assistant_draft',
      ] }])
      const guard = calls[1][1]
      expect(guard({ name: 'mcp__creator__stage_assistant_draft' })).toBeUndefined()
      for (const name of [
        'mcp__creator__stage_project_creator_draft',
        'mcp__creator__list_projects',
        'mcp__creator__search_web',
        'mcp__creator__create_draft',
        'bash',
      ]) {
        expect(guard({ name })).toContain('allowlist')
      }
    },
  )

  it('denies child tools and ignores unrelated presets', () => {
    const child = setup('creation-planner', true)
    expect(child.calls[0]).toEqual(['restrict', { allow: [] }])
    expect(child.calls[1][1]({ name: 'mcp__creator__stage_assistant_draft' })).toContain('child agents')
    expect(setup('wechat-article').calls).toHaveLength(0)
  })
})
