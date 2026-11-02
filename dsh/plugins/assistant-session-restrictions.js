export const name = 'assistant-session-tool-restrictions'
export const inject = ['agents']

const PRESET_ALLOWLISTS = new Map([
  ['creation-planner', ['ask_user_question', 'skill', 'mcp__creator__stage_assistant_draft']],
  ['postmortem-review', ['ask_user_question', 'skill', 'mcp__creator__stage_assistant_draft']],
])

export function apply(ctx) {
  const installed = new WeakSet()
  const creationQuestions = new WeakMap()
  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    const preset = agent.ctx.get?.('agentPresets')?.composedPreset(agent.ctx)
    const rootAllowlist = PRESET_ALLOWLISTS.get(preset)
    if (!rootAllowlist) return

    const child = agent.session.header.parentSession !== undefined
    const allow = child ? [] : rootAllowlist
    agent.ctx.tools.restrict({ allow })
    const asked = creationQuestions.get(agent.session) ?? new Set()
    if (preset === 'creation-planner') creationQuestions.set(agent.session, asked)
    agent.ctx.tools.guard((execution) => {
      if (child) return 'Assistant session child agents cannot call user-facing or draft tools'
      if (!rootAllowlist.includes(execution.name)) {
        return 'Assistant session tool is outside the session capability allowlist'
      }
      if (preset === 'creation-planner' && execution.name === 'ask_user_question') {
        const questions = execution.arguments?.questions
        if (!Array.isArray(questions) || questions.length !== 1) {
          return '每次只能提出一个关键问题；整个创作需求最多 5 个问题。'
        }
        if (!asked.has(execution.callId) && asked.size >= 5) {
          return '已达到最多 5 个问题。停止追问，使用已有信息和明确标注的建议调用 stage_assistant_draft；信息足够时 ready=true，由用户点击“开始创作”确认。仍缺必要事实时用 missing_inputs 说明，不编造事实，不改用文字继续提问。'
        }
        asked.add(execution.callId)
      }
      return undefined
    })
  }

  ctx.on('agent/created', ({ agent }) => { install(agent) })
  for (const agent of ctx.agents.list()) install(agent)
}
