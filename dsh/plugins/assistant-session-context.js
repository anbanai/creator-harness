import { readFileSync } from 'node:fs'

export const name = 'assistant-session-context'
export const inject = ['agents']

const ASSISTANT_PRESETS = new Set(['creation-planner', 'postmortem-review'])
const MAX_CONTEXT_BYTES = 256 * 1024

export function apply(ctx) {
  const path = process.env.ANBAN_DSH_BRIDGE_INITIAL_CONTEXT_FILE ?? ''
  if (!path) return
  let context
  try {
    context = readFileSync(path, 'utf8')
  } catch {
    return
  }
  if (!context || Buffer.byteLength(context, 'utf8') > MAX_CONTEXT_BYTES) return

  const installed = new WeakSet()
  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    const preset = agent.ctx.get?.('agentPresets')?.composedPreset(agent.ctx)
    if (!ASSISTANT_PRESETS.has(preset) || agent.session.header.parentSession !== undefined) return
    agent.ctx.systemPrompt.context({
      name: `anban-${preset}-context`,
      order: 1000,
      text: context,
      interpolate: false,
      required: true,
    })
  }

  ctx.on('agent/created', ({ agent }) => { install(agent) })
  for (const agent of ctx.agents.list()) install(agent)
}
