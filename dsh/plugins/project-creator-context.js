// Inject the Server-owned existing-project snapshot through DSH's
// runtime-context channel before the first message-free turn. This keeps the
// snapshot out of the visible chat transcript and avoids fabricating a user
// prompt. The value is process-scoped and only the root Project Creator agent
// receives it; child agents never inherit a user-facing context injection.
import { readFileSync } from 'node:fs'

export const name = 'project-creator-context'
export const inject = ['agents']

const MAX_CONTEXT_BYTES = 256 * 1024

function isProjectCreatorAgent(agent) {
  return agent.ctx.get?.('agentPresets')?.composedPreset(agent.ctx) === 'project-creator'
}

export function apply(ctx) {
  const path = process.env.ANBAN_DSH_BRIDGE_INITIAL_CONTEXT_FILE ?? ''
  let context = ''
  if (path) {
    try { context = readFileSync(path, 'utf8') } catch { return }
  }
  if (!context || Buffer.byteLength(context, 'utf8') > MAX_CONTEXT_BYTES) return
  const installed = new WeakSet()
  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    if (!isProjectCreatorAgent(agent)) return
    if (agent.session.header.parentSession !== undefined) return
    agent.ctx.systemPrompt.context({
      name: 'anban-project-creator',
      order: 1000,
      text: context,
      interpolate: false,
      required: true,
    })
  }
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  for (const agent of ctx.agents.list()) install(agent)
}
