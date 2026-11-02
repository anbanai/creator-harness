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
  return { calls, agent, listeners }
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


describe('Creation clarification budget', () => {
  const ask = (callId, count = 1) => ({
    name: 'ask_user_question', callId,
    arguments: { questions: Array.from({ length: count }, (_, i) => ({ id: `q-${i}`, question: '选择本次方向？' })) },
  })

  it('allows five questions across turns, then directs the agent to stage instead of asking a sixth', () => {
    const { calls, agent, listeners } = setup('creation-planner')
    const guard = calls[1][1]
    for (let i = 1; i <= 5; i++) expect(guard(ask(`call-${i}`))).toBeUndefined()
    listeners.get('agent/created')({ agent })
    expect(guard(ask('call-6'))).toContain('stage_assistant_draft')
    expect(guard({ name: 'mcp__creator__stage_assistant_draft' })).toBeUndefined()
    expect(guard(ask('call-7'))).toContain('5')
  })

  it('rejects multi-question batches without using the budget and counts a retried call once', () => {
    const guard = setup('creation-planner').calls[1][1]
    expect(guard(ask('batch', 6))).toContain('一个')
    expect(guard(ask('empty', 0))).toContain('一个')
    for (let i = 1; i <= 5; i++) {
      expect(guard(ask(`call-${i}`))).toBeUndefined()
      expect(guard(ask(`call-${i}`))).toBeUndefined()
    }
    expect(guard(ask('call-6'))).toContain('5')
  })

  it('keeps independent creation sessions and review questions outside each other’s budget', () => {
    const first = setup('creation-planner').calls[1][1]
    for (let i = 1; i <= 5; i++) first(ask(`call-${i}`))
    expect(setup('creation-planner').calls[1][1](ask('new-call'))).toBeUndefined()
    const review = setup('postmortem-review').calls[1][1]
    for (let i = 1; i <= 8; i++) expect(review(ask(`review-${i}`))).toBeUndefined()
  })
})
