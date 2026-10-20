export const name = 'assistant-session-tool-restrictions'
export const inject = ['agents']

const PRESET_ALLOWLISTS = new Map([
  ['creation-planner', ['ask_user_question', 'skill', 'mcp__creator__stage_assistant_draft']],
  ['postmortem-review', ['ask_user_question', 'skill', 'mcp__creator__stage_assistant_draft']],
])

export function apply(ctx) {
  const installed = new WeakSet()
  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    const preset = agent.ctx.get?.('agentPresets')?.composedPreset(agent.ctx)
    const rootAllowlist = PRESET_ALLOWLISTS.get(preset)
    if (!rootAllowlist) return

    const child = agent.session.header.parentSession !== undefined
    const allow = child ? [] : rootAllowlist
    agent.ctx.tools.restrict({ allow })
    agent.ctx.tools.guard((execution) => {
      if (child) return 'Assistant session child agents cannot call user-facing or draft tools'
      if (!rootAllowlist.includes(execution.name)) {
        return 'Assistant session tool is outside the session capability allowlist'
      }
      return undefined
    })
  }

  ctx.on('agent/created', ({ agent }) => { install(agent) })
  for (const agent of ctx.agents.list()) install(agent)
}
