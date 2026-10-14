import { describe, expect, it } from 'vitest'
import { apply } from './project-creator-restrictions.js'

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

describe('Project Creator tool restrictions', () => {
  it('installs the root allowlist for Project Creator', () => {
    const { calls } = setup('project-creator')
    expect(calls[0]).toEqual(['restrict', { allow: ['ask_user_question', 'mcp__creator__stage_project_creator_draft'] }])
    expect(calls[1][0]).toBe('guard')
  })

  it('denies all child tools and enforces the root execution guard', () => {
    const root = setup('project-creator')
    const guard = root.calls[1][1]
    expect(guard({ name: 'ask_user_question' })).toBeUndefined()
    expect(guard({ name: 'mcp__creator__stage_project_creator_draft' })).toBeUndefined()
    expect(guard({ name: 'bash' })).toContain('allowlist')
    const child = setup('project-creator', true)
    expect(child.calls[0]).toEqual(['restrict', { allow: [] }])
    expect(child.calls[1][1]({ name: 'ask_user_question' })).toContain('child agents')
    expect(child.calls).toHaveLength(2)
  })

  it('ignores agents bound to another preset', () => {
    expect(setup('wechat-article').calls).toHaveLength(0)
  })
})
