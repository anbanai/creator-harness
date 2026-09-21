# Plugin developer notes

This file defines development boundaries for the Anban Claude Code, Codex, and
DeepSeek Harness plugin surfaces. It lives under `docs/` because Claude Code
does not load a plugin-root `CLAUDE.md` as plugin context. Runtime workflow
instructions belong in Pack-owned Agent sources or `skills/*/SKILL.md`.

## Project overview

The unified Anban plugin provides autonomous workflows for WeChat articles,
Seednote posts, live slicing, line-art coloring, Montage, Moments, and
ecommerce assets. An external Anban MCP server provides
business data and side effects.

## Ownership model

The table below is the implemented ownership model. Deterministic completion
checks belong to Hooks, final reports and tool-capable side effects belong to
Agents, and phase-specific knowledge is loaded through the `Skill` tool only
when that phase begins.

| Surface | Owns |
|---|---|
| Agent | End-to-end business orchestration, stage routing, recovery, success criteria, final report, and stop behavior |
| Skill | One domain capability, its input/output contract, decision rules, and supporting knowledge |
| Hook | Deterministic lifecycle gates or a bounded decision based only on hook input |
| MCP | Tool schema, validation, persistence, and server-side side effects |
| DSH Host adapter | Official credential resolution, fixed MCP transport, generated Preset installation, and shared Skill exposure |
| Managed runtime | One task-private workspace per execution, structured `TASK_ID`, and the pre-created `output/` |
| Artifact | File-backed state, evidence, failure details, and resume entrypoints across stages |

Agents must use Claude Code MCP tools for Anban product capabilities. Do not
replace MCP calls with ad hoc HTTP clients. For new changes, keep handlers and
Hooks out of business orchestration, and do not copy a full Agent pipeline into
an umbrella Skill.

## Agents

Plugin Agent frontmatter may use supported fields such as `name`, `description`,
`model`, `memory`, `tools`, and `maxTurns`. A subagent starts with a
fresh context. Project memory contributes only its first 200 lines or 25 KB at
startup, so large workflow state belongs in task artifacts.

Treat `maxTurns` as a budget to validate against representative traces. The
managed SDK runtime may also impose a limit; verify effective behavior in this
repository before relying on frontmatter alone.

Do not add a `tools` allowlist to agents that need MCP tools; Claude Code treats `tools` as an allowlist and can hide inherited MCP tools from subagents. Omit `tools` unless you intentionally want to restrict an Agent to a narrow allowlist that includes every required MCP tool.

Do not add `mcpServers` to plugin agent frontmatter. Plugin subagents receive MCP servers from the plugin-level `.mcp.json`; Claude Code ignores `permissionMode`, `mcpServers`, and `hooks` in plugin Agent definitions. Managed lifecycle Hooks are installed by the server SDK path.

The six Agent identities accepted by `submit_agent_feedback` are `article`,
`ecommerce`, `live-slicer`, `moments`, `montage`, and `seednote`.
Each Agent owns exactly one final feedback
call after its delivery report.

## Skills

Every `skills/<name>/SKILL.md` has `name` and `description` frontmatter. Plugin
Skills are discovered automatically. Supporting files are read only when needed;
keep self-authored `SKILL.md` entrypoints under 500 lines and link directly to
one-level references.

Agent frontmatter `skills:` declares startup dependencies and injects each
declared top-level Skill's complete content when the Agent starts. The matching
Agent Pack `agent.skills` list is the canonical dependency set; generated Claude
frontmatter and Codex `[[skills.config]]` declarations must match it. Declare only
specialized capabilities that the Agent actually uses. Do not preload an umbrella
Skill that duplicates the Agent's end-to-end workflow. Progressive disclosure
applies to supporting `references/`, not to top-level Skills already declared by
the Agent, and Agent bodies must not describe a second phase-loading mechanism.

Every distributed top-level Skill must have an Agent owner or be an explicit
user entrypoint. Delete obsolete aliases and orphan Skills instead of retaining
them for compatibility; contract tests enforce this reachability boundary.

Evaluate Skills in fresh sessions with should-trigger, should-not-trigger,
with-Skill, and without-Skill cases.

## MCP and artifacts

`.mcp.json` connects to the fixed official endpoint
`https://creator.anbanai.com/mcp`; the endpoint is a plugin implementation
detail and is not user-configurable. Its Authorization header uses the sensitive
`${user_config.api_key}` value. Never print keys, bearer tokens, private draft
URLs, or authorization headers.

MCP owns tool schemas and server-side side effects. In particular:

- `submit_agent_feedback` accepts `task_id`, `agent_name`, `scores` as a JSON
  string, `errors`, `optimizations`, and `summary`. The server upserts on
  `(task_id, agent_name)` and enforces the exact unique index.
- The managed runtime creates the task-private workspace and `output/` before
  an Agent starts and supplies `TASK_ID` through structured runtime context.
  Agents and Skills write explicit `output/<filename>` artifacts and never
  create, discover, move, or rename the output directory.

Live slicing keeps only deterministic planning and manifest construction in MCP: use
`build_live_clip_plan` for segment-based clip plans,
`build_live_subject_clip_plan` for subject-based plans,
and `build_live_clip_manifest` for the server-backed delivery manifest. The Agent
owns semantic JSON, local `ffmpeg` execution, and file-backed evidence. Dedicated
single-call `analyze_image` and `analyze_video` tools provide media understanding
without taking over workflow orchestration.

Task artifacts are the resume contract. Store generated content, manifests,
quality evidence, and structured `output/failure-state.json` files at their
declared `output/<filename>` paths.
Do not place transient logs, large payloads, or secrets in project memory.

Managed Claude sessions load the native `claude_code` system-prompt preset and
use each Agent's `memory: project` declaration. The project-scoped shared volume
is mounted at `.claude/agent-memory` under the runtime working directory
(`/workspace`, or `/workspace/openmontage` for Montage); Claude namespaces files by Agent
type, for example `anban-article/MEMORY.md`. Studio reads this same shared tree.
Auto memory is configured to the same Agent directory, so there is no second
memory store. Each runtime mounts this directory directly, without symlinks or
additional SDK permissions. Before invoking the model, the runner verifies the mounted
directory and tests writing; storage failures terminate with
`project_memory_unavailable` instead of silently losing memory. Memory updates
remain the Agent's decision, not a mandatory artifact of every task.

This layout requires runtime contract version 3. Build and deploy the Server and
all selected Agent images together; version 2 workers are rejected at bootstrap.
Use immutable image digests for deployment. There is no legacy-directory
migration. A completed task alone does not prove a memory file was written.

## Hook lifecycle

Use Hooks according to the event they actually observe:

- Plugin `SubagentStop` applies to plugin Agents spawned as subagents. Its
  matchers use anchored scoped names such as `^anban:seednote$`.
- Managed main sessions launched with `--agent` are not covered by plugin
  `SubagentStop`; the server installs equivalent Claude Agent SDK `Stop` Hooks.
- Command Hooks perform deterministic file, schema, quantity, and consistency
  checks. Production completion gates should fail closed on script or output
  errors.
- Prompt Hooks make one LLM call and return `ok` or `reason` from hook input.
  They cannot read workspace files or call MCP tools.
- Agent Hooks can use tools and read files, but this project does not use them
  for critical production acceptance. Prefer auditable command gates.
- `TaskCompleted` fires when an individual task item is marked completed and
  does not support matchers. It is not a whole-workflow completion event.

Final summaries, Seednote title finalization, template eligibility decisions,
and `submit_agent_feedback` belong to tool-capable Agent stages. Hooks must not
attempt those side effects.

Command Hooks that reference plugin paths use `command` plus `args`.

## Seednote finalization and delivery

Seednote finalizes the accepted title after writing/humanization and before any
image plan or generation. If final compliance would change that title, it writes
a recoverable failure and resumes from `title_finalization`; it does not deliver
visuals produced for a different title.

The Agent validates content, visual verification evidence, manifests, and all
planned files at their explicit `output/<filename>` paths. A recovered
`output/failure-state.json` is removed only after delivery validation passes
and immediately before reporting success.
Clone analysis keeps `output/viral-template.json` task-local for later writing
and visual steps; final summaries report `output/`.

## Content and runtime conventions

- All workflows are autonomous. Record decisions in artifacts instead of using
  `AskUserQuestion` from the business Agents.
- Server-appended `运行控制：` keys are structured state. Agents route stages;
  Skills own detailed domain behavior.
- Local live/video processing uses `ffmpeg` and `ffprobe`.
- WeChat HTML must use inline CSS and avoid unsafe tags.
- Number or semantically name task files so delivery and recovery are explicit.

## Asset governance

Classify a Skill before editing it:

- Self-authored assets follow this repository's prompt lint, progressive
  disclosure, eval, ownership, manifest, and changelog rules.
- Upstream submodules preserve upstream history and bytes and are updated
  through source, version, and gitlink checks. `skills/humanizer` points
  directly to the official `blader/humanizer` repository; business rules
  belong in the owning Agent or Skill.
- Third-party runtime assets use their own update and verification process.
  OpenMontage is pinned and verified by the independently built runtime image;
  it is not stored in this repository or copied into Agent text.

## Modifying the plugin

- Add Agents under `agents/<name>.md`; keep workflow/recovery ownership there.
- Add Skills under `skills/<name>/SKILL.md`; move long details into direct
  `references/` files.
- Treat `packs/*/agent.dsh.yml` as a Pack source and `dsh/presets/` as generated
  output. Only Article and Seednote currently declare `dsh_source`; do not edit
  generated Presets by hand.
- Keep DSH credentials in the official credential adapter, configure only
  `ANBAN_API_KEY`, and keep the MCP endpoint fixed at
  `https://creator.anbanai.com/mcp`. Presets must not embed MCP clients,
  credential values, or host-specific adapter files.
- Keep deterministic validation in scripts or server tests.
- Bump `package.json`, the `pnpm-lock.yaml` root importer metadata,
  `.claude-plugin/plugin.json`, the marketplace plugin entry, and
  `.codex-plugin/plugin.json` together, and update `CHANGELOG.md` for any
  distributed runtime or documentation change.
- Validate metadata, run affected contract tests, run `claude plugin validate`,
  run `make dsh-check dsh-smoke`, and check the final diff before release.
