// Enforce the Project Creator capability boundary in the DSH tool runtime.
// The persona prompt documents the policy; this plugin makes it effective for
// both model-visible schemas and execution, including tools registered later.
export const name = 'project-creator-tool-restrictions'
export const inject = ['agents']

const ASK_USER_QUESTION = 'ask_user_question'
const LOAD_SKILL = 'skill'
const STAGE_DRAFT = 'mcp__creator__stage_project_creator_draft'
// Project Creator sessions do not have a task/execution identity. Keep their
// MCP surface to user-scoped reads plus the session's draft staging capability.
// Search, fetch, media, billing, task, and publication tools
// remain unavailable even though the MCP server advertises them globally.
const ROOT_MCP_READS = [
  'mcp__creator__list_projects',
  'mcp__creator__get_project',
  'mcp__creator__get_project_profile',
  'mcp__creator__list_project_titles',
  'mcp__creator__list_drafts',
  'mcp__creator__list_published_articles',
  'mcp__creator__list_topics',
  'mcp__creator__list_trends',
  'mcp__creator__list_resources',
  'mcp__creator__get_resource',
]
const ROOT_ALLOW = [ASK_USER_QUESTION, LOAD_SKILL, STAGE_DRAFT, ...ROOT_MCP_READS]

function isProjectCreatorAgent(agent) {
  return agent.ctx.get?.('agentPresets')?.composedPreset(agent.ctx) === 'project-creator'
}

export function apply(ctx) {
  const installed = new WeakSet()

  const install = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    if (!isProjectCreatorAgent(agent)) return

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
