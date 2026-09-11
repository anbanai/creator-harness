# CODEX.md

This file provides guidance to OpenAI Codex (codex CLI / IDE) when working with code in this repository.

## Project Overview

This directory is the unified Anban plugin source for Claude Code and Codex. Codex uses the shared workflows below through native TOML subagents and Codex-specific adapters:

- **WeChat Official Account articles** (微信公众号图文)
- **SeedNote posts** (种草笔记)
- **Moments posts** (朋友圈)
- **Live video slicing** (直播切片)
- **E-commerce product imagery** (电商出图：主图/详情/封面/分享/SKU，多产品图输入保一致)

Both hosts connect to the same `anban-creator` MCP server. Skills, themes, writers, layouts, and content contracts exist once in this directory.

## Architecture

The plugin follows Codex's **Skill + Subagent + MCP** model:

- **Skills** (`skills/`) — the canonical shared Skill tree auto-discovered by both hosts
- **Subagents** (`agents/`) — six TOML files installed to `~/.codex/agents/` and registered in `~/.codex/config.toml` (Codex plugins cannot bundle subagents directly — see GitHub issue #18988)
- **MCP server** (`install/agents-registration.toml`) — installed into Codex config with `ANBAN_API_KEY`; each TOML subagent also declares its MCP dependency
- **Completion checks** — embedded in TOML subagent instructions because Anban does not yet ship a Codex Hook-based completion or progress reporter adapter

### Subagents (`agents/`)

| Subagent | Triggers | Pipeline |
|----------|----------|----------|
| `article` | "写文章", "发文章", "公众号文章" | Research → Write → De-AI → SEO → Cover → Illustrations → HTML → Draft |
| `seednote` | "种草笔记", "种草", "复刻", "仿写" | Research → Viral analysis (replicate) → Content → image-plan/runtime mode output → Compliance → Delivery validation → `output/` delivery |
| `live-slicer` | "直播切片", "剪直播", "听悟" | ffmpeg prep → TingWu transcription → Invalid sentence filter → Segment/subject planning → Batch cuts/concat → CapCut export → Report |
| `ecommerce` | "电商出图", "商品图", "主图", "详情页", "商详", "SKU图" | Product Bible → Selling points → Asset plan → Provider-adaptive generation → Vision self-check → Delivery validation → `output/` delivery |

**Codex-specific behavior**:
- Subagents only spawn when the user **explicitly** asks ("use the article subagent to ...", "delegate to X"). Codex does not auto-spawn subagents.
- Each subagent declares its own `[mcp_servers.creator]` and `[[skills.config]]` — it does **not** inherit MCP servers or skills from the parent session.
- Multi-agent mode requires `[features] multi_agent = true` in `~/.codex/config.toml` (the install script adds this automatically).
- `[agents] max_threads = 6` bounds concurrent subagent execution.

### Skills (`skills/`)

Each shared skill has a `SKILL.md` with YAML frontmatter (`name` + `description`). The main agent discovers plugin Skills from the plugin manifest; every subagent declares its startup dependencies explicitly through `[[skills.config]]`. There is no second Codex Skill copy.

Key skill groups:
- **Content**: `content-writing`, `topic-research`, `seo-optimization`
- **WeChat article**: `article`, `article-visual-design`, `article-publishing`
- **SeedNote**: `seednote`, `seednote-research`, `seednote-viral-analysis`, `seednote-writing`, `seednote-visual-design`
- **Live slicing**: `live-slice`, `capcut-draft`
- **Media and design**: `short-video-cover`, `portrait-pose-variants`, `capcut-draft`
- **Setup**: `anban-setup` (first-time API Key setup and connectivity verification; Codex-specific — does not auto-write `~/.codex/config.toml`, documents manual setup steps instead)

### MCP Server

The installer registers the fixed official endpoint `https://creator.anbanai.com/mcp` with Bearer token auth via `ANBAN_API_KEY`. The endpoint is an implementation detail, not a user or installer option; users configure only the API key. Key MCP tools:

- `list_projects`, `get_project_profile`, `list_drafts`, `list_published_articles`, `list_project_titles`
- `render_template`, `convert_markdown`
- `generate_image`、`analyze_image` 与任务级文件工具：`upload_image(project_id, task_id, file_path)`、`download_image(project_id, task_id, url, output_path)`、`compress_image(task_id, input_path, output_path, max_width?)`
- `create_draft` (WeChat draft box)
- `get_feed_detail` (SeedNote source note fetching)
- `upload_live_audio`, `create_live_analysis_task`, `query_live_analysis_task`, `build_live_clip_plan`, `build_live_subject_clip_plan`, `build_live_clip_manifest`
- `prepare_file_upload`

### Themes (Server-managed)

Themes define visual styling for article排版. Themes are managed server-side via the MCP server's `convert_markdown` tool. Each project has a configured theme applied automatically during Markdown-to-WeChat-HTML conversion.

### Writers (`skills/writers/`)

YAML files defining **writing** styles (the writer dimension only). Each has `name`, `english_name`, `writing_prompt` (required), plus optional `core_beliefs`, `title_formulas`, `quote_templates`. Writers **do not** carry visual identity — image visual style is an orthogonal dimension configured per project/task (resolved at runtime as the `visual_style` field; see `article-visual-design` skill). Built-in styles: `dan-koe`, `cultural-depth`, `casual-science`.

### Completion Checks

Codex supports plugin-bundled lifecycle Hooks, including `PostToolUse`,
`SubagentStop`, and `Stop`. Plugins can load them from the default
`hooks/hooks.json` location or a manifest `hooks` entry. The current Anban
`hooks/hooks.json` uses the Claude Code adapter schema. To prevent Codex's
default plugin-root discovery from loading that unvalidated adapter, the Codex
manifest explicitly sets `"hooks": []`. Each TOML subagent therefore continues
to own delivery validation and its final quality summary in
`developer_instructions`.

### Progress Compatibility Boundary

Managed Claude execution derives progress from Task metadata and Agent SDK
Hooks. The Runner observes the stable `metadata.anban_progress_stage` declared
by Agent Packs, validates required file-backed artifacts, and sends structured
events through the authenticated managed progress endpoint.

Codex has official lifecycle surfaces, but the current Anban integration is a
distributed plugin and subagent installation, not an App Server host:

- Official `PostToolUse` can observe `update_plan` and other local tools. Its
  structured input exposes `tool_name`, `tool_input`, and `tool_response`, but
  it provides no stable Agent Pack stage identifier equivalent to Claude Task
  metadata.
- An App Server host can consume `turn/*` and `item/*` notifications, including
  `turn/plan/updated`, but plan entries contain only `step` and `status`.
- This Codex plugin does not currently include an authenticated reporter adapter
  that combines either official event surface with Anban's managed progress
  endpoint.

For that reason, existing Codex TOML agents that publish business-stage progress
retain explicit `update_task_progress` calls as a temporary compatibility path.
`/btw` and model prompts are not telemetry. Do not infer stages from plan/task
titles, add shell polling, or introduce a custom Codex protocol. A future
migration should build on official `PostToolUse`/`Stop` Hooks or App Server plan
notifications once stable stage identity and authenticated transport are both
available.

Official references: [Codex Hooks](https://learn.chatgpt.com/docs/hooks) and
[Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Key Conventions

- **Zero user interaction**: All subagents run autonomously. Decisions are recorded in `output/*.md` files, never by asking the user.
- **Runtime-owned workspace**: Every managed execution receives a task-private workspace, a pre-created `output/`, and `TASK_ID` in structured runtime context. Agents and Skills write named `output/<filename>` artifacts and never create, discover, move, or rename the output directory.
- **File naming**: Subagents use numbered prefixes (`01-research.md`, `02-outline.md`...) or semantic names (`cover.png`, `content.md`, `image-plan.md`).
- **Image reference chain**: First image establishes visual style; subsequent images use the first as reference to maintain consistency.
- **Skill dependencies**: Agent Pack `agent.skills` is the canonical list. Generated Codex subagents preload the same dependencies through `[[skills.config]]`; their instructions refer to the loaded method with `using the <skill-name> skill` phrasing.
- **Content is Chinese**: All generated content targets Chinese social media platforms. Prohibited words lists (违禁词) are in `references/prohibited-words.md`.
- **Live media dependency**: `live-slicer` and `live-slice` require local `ffmpeg` and `ffprobe`; TingWu provides transcription.
- **Subagent invocation**: Codex subagents do NOT auto-spawn. To run a full pipeline, the user must explicitly invoke: "use the article subagent to write an article about X".

## Modifying This Plugin

- **Adding a new skill**: Create `skills/<name>/SKILL.md` with YAML frontmatter `name` + `description`. Add `references/` for detailed guides. The main agent auto-discovers it through the plugin manifest; add it to the owning Agent Pack so generated subagents preload it.
- **Adding a new subagent**: Create `agents/<name>.toml` with required fields (`name`, `description`, `developer_instructions`) and optional `[mcp_servers.*]` / `[[skills.config]]` sections. Update `install/agents-registration.toml` to add the `[agents.<name>]` block. Re-run `install/install-subagents.sh`.
- **Adding a new theme**: Themes are managed server-side. Contact the server admin to add new themes.
- **Adding a new writer style**: Add `skills/writers/<name>.yaml` with required `name`, `english_name`, `writing_prompt`.

## Codex vs Claude Code Differences

| Aspect | Claude Code adapter | Codex adapter |
|--------|------------------------------|------------------|
| Plugin manifest | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` (camelCase fields) |
| Subagent format | `agents/*.md` with YAML frontmatter | `~/.codex/agents/*.toml` (TOML) + registration in `~/.codex/config.toml` |
| Subagent auto-spawn | Not applicable (parent calls subagent) | Never — must be explicit (`use the X subagent`) |
| Skills startup | Agent Pack dependencies are generated into Agent frontmatter `skills:` | Agent Pack dependencies are generated into per-subagent `[[skills.config]]` entries |
| Lifecycle checks | `hooks/hooks.json` plus managed runtime Hooks | Embedded in each TOML subagent instruction until Anban ships a Codex reporter adapter |
| Bundled Hooks | Supported by Claude Code manifest | Supported officially; Anban's Codex manifest explicitly suppresses default discovery with `"hooks": []` until a validated reporter adapter exists |
| MCP server list | `mcpServers` in frontmatter | `[mcp_servers.X]` table in TOML |
| Tools allowlist | `tools:` frontmatter field | `sandbox_mode` field (read-only / workspace-write / danger-full-access) |
| Model override | `model: inherit` | Omit `model` field to inherit parent session |
| Max turns | `maxTurns: 300` | No direct equivalent — subagents run to completion or until the user cancels (optionally bounded by Codex's global `job_max_runtime_seconds`, which this plugin does not set) |

## Installation

See [docs/codex-installation.md](docs/codex-installation.md) for end-user installation instructions.
