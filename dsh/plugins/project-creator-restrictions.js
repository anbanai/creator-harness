// Enforce the Project Creator capability boundary in the DSH tool runtime.
// The persona prompt documents the policy; this plugin makes it effective for
// both model-visible schemas and execution, including tools registered later.
export const name = 'project-creator-tool-restrictions'
export const inject = ['agents']

const ASK_USER_QUESTION = 'ask_user_question'
const STAGE_DRAFT = 'mcp__creator__stage_project_creator_draft'
const ROOT_ALLOW = [ASK_USER_QUESTION, STAGE_DRAFT]

export function apply(ctx) {
  const installed = new WeakSet()

  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)

    const child = agent.session.header.parentSession !== undefined
    const allow = child ? [] : ROOT_ALLOW
    agent.ctx.tools.restrict({ allow })
    agent.ctx.tools.guard((execution) => {
      if (child) {
        return 'Project Creator child agents cannot call user-facing or draft tools'
      }
      if (!ROOT_ALLOW.includes(execution.name)) {
        return 'Project Creator tool is outside the session capability allowlist'
      }
      return undefined
    })
  }

  ctx.on('agent/created', ({ agent }) => { install(agent) })
  for (const agent of ctx.agents.list()) install(agent)
}
