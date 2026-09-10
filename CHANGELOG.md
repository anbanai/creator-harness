# Changelog

## [Unreleased]

## [4.1.17] - 2026-09-08

### Changed

- Added the unified Agent Pack delivery-file contract and regenerated the
  bundled Pack catalog and native manifests.
- Studio and Server now distinguish deliverable files from process artifacts;
  process artifacts remain previewable but are excluded from downloads.
- Prepared the `4.1.17` DSH package metadata for the release workflow. This
  changelog does not claim npm publication; the release operator must complete
  the release workflow before publishing any package or release artifact.

## [4.1.16] - 2026-09-08

### Changed

- Unified Agent Skill startup dependencies for Article and Seednote, with the
  shared Humanizer preloaded for Seednote writing workflows.
- Updated the pinned Humanizer package to `3.0.0`, synchronized DSH presets,
  and removed stale assumptions about a fixed rule count.
- Prepared the `4.1.16` DSH package metadata for the release workflow. This
  changelog does not claim npm publication; the release operator must complete
  the release workflow before publishing any package or release artifact.

## [4.1.15] - 2026-09-07

### Changed

- Added completion metadata hooks and preserved scoped completion metadata
  across managed Agent execution.
- Prepared the `4.1.15` DSH package metadata for the release workflow. This
  changelog does not claim npm publication; the release operator must complete
  the release workflow before publishing any package or release artifact.

## [4.1.14] - 2026-09-01

### Changed

- Replaced the WeChat draft MCP contract with task-bound `create_draft` and its
  durable `draft_media_id`/`status` lifecycle response.
- Prepared the `4.1.14` DSH package metadata for the release workflow. This
  changelog does not claim npm publication; the release operator must complete
  the release workflow before publishing any package or release artifact.

## [4.1.13] - 2026-08-18

### Changed

- Managed Claude execution now derives structured progress from Agent Pack stage
  metadata observed by Agent SDK Hooks and validates file-backed delivery before
  reporting completion.
- Documented the current Codex compatibility boundary: official Codex lifecycle
  Hooks and App Server plan notifications do not yet provide this distributed
  plugin with both stable Agent Pack stage identity and authenticated progress
  transport, so existing Codex progress-enabled subagents retain explicit
  `update_task_progress` calls.
- Explicitly excluded `/btw`, model prompts, title inference, shell polling, and
  custom protocols from progress telemetry.
- Aligned the DSH npm package and lockfile metadata with both native plugin
  manifests and the Claude marketplace at `4.1.13`; this metadata-only change
  does not migrate DSH progress behavior.
- Prepared the `4.1.13` DSH package metadata for the release workflow. This
  changelog does not claim npm publication; a release operator must complete
  the existing automated and manual release gates before public announcement.

## [4.1.12] - 2026-08-17

### Changed

- Clarified the exact Skills-only, Claude Code, Codex, and full DSH support
  matrix, including the Article/Seednote-only Preset scope.
- Documented the official DSH artifact, profile, credential, global Preset,
  upgrade, rollback, removal, and recovery lifecycle.
- Prepared the public npm package and checksummed GitHub Release installation
  guidance for 4.1.12; those artifacts become available only after the matching
  versioned release workflow completes.
- Added the 4.1.12 manual release-operator gate for a real low-privilege Creator
  MCP authentication check without storing credentials in repository assets.
- This metadata release does not claim npm publication or GitHub Release
  availability; a release operator must run the publishing workflow.

## [4.1.11] - 2026-08-16

### Added

- Added DeepSeek Harness Web and Desktop support with generated Article and
  Seednote Presets.
- Added official DSH credential, MCP, and shared Skill adapters without changing
  Anban Server business behavior.

## [4.1.10] - 2026-08-14

- Move Seednote login status, QR login, and logout to the Studio administrator surface.
- Keep Agent MCP access read-only and limited to Seednote search, detail, and public profile research.

## [4.1.9] - 2026-08-14

### Fixed

- Updated Montage runtime guidance to reference the immutable `/opt/montage-template` image template after removing the repository submodule fallback.

## [4.1.8] - 2026-08-14

### Changed

- Removed the standalone Designer Agent Pack, line-art coloring Skill, and Codex subagent registration for the MVP product cut.
- Kept Montage as a first-class Agent workflow with image, audio, and video source material support.

## [4.1.7] - 2026-08-14

### Changed

- Documented Montage managed execution against the immutable OpenMontage runtime-image template while preserving the writable `/workspace/openmontage` task contract.

## [4.1.6] - 2026-08-11

### Fixed

- Replaced the Seednote completion gate's Python dependency with the Node runtime shipped in every Seednote image.
- Applied the Seednote completion gate to viral-analysis tasks and validated their dedicated analysis artifacts.

## [4.1.5] - 2026-08-11

### Changed

- Replaced the Seednote third-party CLI research path with authenticated Anban MCP login, search, feed-detail, and user-profile tools.
- Kept original-mode research recoverable without fabricated metrics and made source-only replicate failures file-backed and resumable.
- Reduced the distributed Skill count to 27 and the Seednote pack to its four owned phase Skills with a 20-turn runtime limit.

## [4.1.4] - 2026-08-02

### Changed

- Kept Seednote viral templates task-local and removed global template persistence from the Agent workflow.
- Removed `template-meta.json` from Seednote viral-analysis deliverables while retaining `viral-template.json`.

### Fixed

- Removed the remaining ecommerce `ratio:tier` guidance so task image generation always passes a pure business `aspect_ratio` and keeps clarity targets in prompts and asset plans.

## [4.1.3] - 2026-08-02

### Changed

- Replaced task image size selection with explicit semantic `aspect_ratio` instructions constrained by each business platform.
- Kept Designer generation on exact fixed size presets, separate from task Agent image generation.
- Added the Moments semantic-ratio image workflow and required image deliverables.

## [4.1.2] - 2026-08-01

### Changed

- Made task image ratios authoritative across every image-generating workflow, including Article, Seednote, ecommerce, line-art, portrait, and short-video covers.
- Limited intelligent aspect-ratio selection to the current image capability's public supported sizes.
- Replaced implicit WeChat cover cropping with the explicit atomic `crop_image` workflow.

## [4.1.1] - 2026-08-01

### Fixed

- Excluded checkout-specific `.git` metadata from Agent Pack digests so the generated Catalog remains stable across repositories and worktrees.

## [4.1.0] - 2026-07-31

### Added

- Added versioned Agent Packs as the canonical source for native Claude Code Agents, Codex subagents, Skills, business bindings, runtime metadata, progress stages, and artifact contracts.
- Added a generated Server Catalog with explicit project-platform and task-type bindings plus optional restricted JSON Schemas for scenario-specific project and task input.
- Added the generated runtime Catalog consumed by both Go and TypeScript managed Agent images.

### Changed

- Generated the native Claude and Codex Agent distributions from Pack-owned canonical sources while preserving their existing workflow semantics.
- Bound managed execution to immutable Pack ID, version, digest, runtime profile, and runtime adapter identity.
- Separated native Agent turn limits from managed runtime defaults while preserving the existing Server budgets.

## [4.0.9] - 2026-07-31

- Unified task and plan materials: Agents resolve global and per-type attachment ordinals from `input-attachments/index.json` and decide file usage from Prompt semantics.

All notable changes to the Anban Creator Claude Code plugin are documented here.

This project follows semantic versioning for the plugin package. Patch releases cover documentation, compatibility, hook, and workflow contract fixes that do not change the public agent or MCP behavior.

## [4.0.8] - 2026-07-30

### Changed

- Moved live-slicing semantic decisions into the Live Slicer Agent while keeping transcription and clip planning as deterministic MCP capabilities.
- Added the explicit `viral_analysis` workflow to the Seednote Agents with managed-task artifact requirements.
- Documented `analyze_video` as the atomic native-video understanding capability for workflows that need complete visual context.

### Removed

- Removed the four legacy live semantic generation MCP calls from Agent and Skill contracts.

## [4.0.7] - 2026-07-25

### Removed

- Removed the obsolete read-only `config` Skill; project profiles remain available directly through `list_projects` and `get_project_profile` in each business workflow.

### Fixed

- Made managed runtimes materialize successful `generate_image` results at the declared `output_path` without Agent-side downloads or base64 transfer.
- Made the Seednote quality gate reject empty files and non-PNG bytes masquerading as generated images.

## [4.0.6] - 2026-07-24

### Fixed

- Connected every official Claude Code and Codex adapter directly to the fixed hosted MCP endpoint.
- Made Codex subagent upgrades replace an existing creator endpoint while preserving unrelated user configuration.
- Removed the service-address installation option so users configure only their API Key.

## [4.0.5] - 2026-07-24

### Fixed

- Required the Seednote quality summary to list every generated image exactly once and reject missing, duplicate, or extra entries.
- Aligned the Claude and Codex Article workflows on the managed project ID context wording used by the server contract.

## [4.0.4] - 2026-07-24

### Fixed

- Canonicalized the Seednote quality-gate recovery instruction to write structured failures at `output/failure-state.json`.

## [4.0.3] - 2026-07-23

### Fixed

- Made Seednote image-count quality rules explicitly allow zero content images in `cover_only` and `cover_tail` modes.
- Restricted Seednote content images to the contiguous `image_01.png` through `image_03.png` naming contract and made the quality gate reject other `image_*` filenames or skipped indices.

## [4.0.2] - 2026-07-23

### Fixed

- Aligned the Claude and Codex Seednote Agents on the same explicit, mode-dependent output image paths for the cover, up to three content images, and optional tail image.

## [4.0.1] - 2026-07-23

### Fixed

- Made the Seednote quality gate fail closed when managed runtime workspace injection is absent instead of falling back to the process working directory.
- Kept recoverable Seednote research failures at the canonical `output/failure-state.json` path.
- Removed residual `.task-context` discovery and canonicalized Agent/Skill failure artifacts under `output/`.

## [4.0.0] - 2026-07-23

### Changed

- Moved image workflow sequencing, retries, content-quality decisions, and publishing uploads into Agents and Skills.
- Made `generate_image`, `analyze_image`, and `upload_image` independent capabilities instead of one combined MCP workflow.
- Reduced image prompt and review artifacts to creative intent, semantic reference choices, and visible content-quality observations.
- Adopted the runtime-owned, pre-created `output/` contract and removed Agent/Skill workspace discovery and directory lifecycle ownership.

### Removed

- Removed generation routing, response metadata, embedded verification, and upload controls from Agent and Skill contracts.

## [3.0.1] - 2026-07-22

### Changed

- Replaced the copied Humanizer Skill with the official `blader/humanizer` repository pinned directly at `skills/humanizer` as a nested submodule.
- Kept Humanizer inside the Anban plugin for offline, reproducible Agent images and moved its manual update command into Creator Skills.
- Documented recursive local checkout as a Codex installation prerequisite because Codex marketplace Git clones do not initialize nested submodules.

## [3.0.0] - 2026-07-22

### Changed

- Renamed the WeChat article Agent and Codex subagent from `wechatarticle` to `article`, including the scoped `anban:article` invocation, installer registration, feedback identity, and documentation. The former Agent name is removed rather than retained as an alias.

## [2.12.1] - 2026-07-22

### Changed

- Materialized the complete OpenMontage runtime as a writable `/workspace/montage` task directory and aligned the managed Agent working directory and runtime environment with it.
- Removed the image revision-marker requirement from the managed Montage workflow.

## [2.12.0] - 2026-07-22

### Changed

- Flattened the canonical plugin distribution from `plugins/anban/` to `plugins/`.
- Updated Claude Code, Codex, Docker, desktop, and repository installation paths to use the new plugin root.
- Renamed the minimal managed runtime from `creator-agent-content` to `creator-agent-article`; Seednote and Montage remain dedicated dependency images.

## [2.11.0] - 2026-07-21

### Changed

- Consolidated the Claude Code and Codex distributions under `plugins/` with one shared Skill tree.
- Kept native manifests, Agent formats, MCP authentication, Hooks, and Codex subagent installation as thin host adapters.
- Moved repository, Docker, desktop packaging, runtime discovery, tests, and maintenance scripts to the unified plugin root.

### Removed

- Removed the standalone `claudecode` and `codex` submodules and their duplicated Skill copies.

## [2.10.72] - 2026-07-21

### Removed

- Removed the `videocreator` and `videoeditor` Agents, their quality gates, and the five dedicated video editing and overlay Skills.

## [2.10.71] - 2026-07-21

### Changed

- Restored official Agent `skills:` declarations for specialized capabilities and removed duplicated runtime Skill-loading boilerplate.
- Made `videocreator` own its MCP planning and generation workflow directly.

### Removed

- Removed the unused Seedance 2.0 Skill OS distribution and its nested reference, example, schema, eval, and script assets.

## [2.10.70] - 2026-07-21

### Removed

- Removed the duplicate top-level `seednote` Skill and `/anban:seednote` command; `anban:seednote` Agent is now the only top-level Seednote workflow entry and delegates to isolated phase Skills.

## [2.10.69] - 2026-07-21

### Fixed

- Added explicit file-backed contracts for Seednote research, analysis, writing, and visual phases.
- Folded Seednote-specific de-AI editing into `seednote-writing` so the managed workflow no longer loads the large general Humanizer Skill between writing and image generation.

## [2.10.68] - 2026-07-21

### Removed

- Removed the unused `dreamina-video` compatibility Skill; video generation requests use the `videocreator` workflow directly.

## [2.10.67] - 2026-07-21

### Fixed

- Removed ignored plugin-Agent `permissionMode` declarations; managed zero-interaction enforcement remains owned by the Agent SDK runtime policy.

## [2.10.66] - 2026-07-21

### Changed

- Moved internal Agent, prompt, and Hook engineering documents to the parent repository so the distributed plugin contains only plugin-owned development documentation.

## [2.10.65] - 2026-07-21

### Changed

- Replaced dynamic video credit estimates with immutable fixed-SKU selection and durable-output settlement contracts for video generation workflows.

## [2.10.64] - 2026-07-17

### Changed

- Removed legacy workspace archive tool and kept managed task deliverables in canonical `output/` for server-side artifact collection.
- Required `task_id` for workspace preparation and removed standalone local workspace fallback behavior.

## [2.10.63] - 2026-07-17

### Changed

- Declared official agent-level `permissionMode: dontAsk` and a deterministic zero-interaction fallback contract for every managed Claude Code workflow.
- Added full-run managed preauthorization for ordinary Montage creative gates while preserving checkpoints, decision logs, and hard operational blockers.

## [2.10.62] - 2026-07-16

### Changed

- Renamed the Montage runtime environment contract to `env`/`env_keys` and allowed upstream-defined environment variable names without a provider allowlist.

## [2.10.61] - 2026-07-15

### Fixed

- Replaced tool-incapable completion prompt hooks with deterministic command gates, removed per-task whole-workflow feedback, and ran Seednote/video gates for managed main agents.
- Moved valid final feedback and Seednote title finalization into tool-capable Agent stages, made feedback/template writes idempotent, and finalized titles before visuals.
- Added verified Seednote archive staging with candidate reservations, atomic publication, recoverable failures, and source retention.

### Added

- Added GPT-5.6 prompt guidance, the Agent/Skill optimization audit, and the final Hook lifecycle implementation record.

## [2.10.60] - 2026-07-14

### Changed

- Removed execution-time credit-balance gates from video workflow contracts so accepted tasks continue while operation usage is recorded.

## [2.10.59] - 2026-07-14

### Changed

- Preserved exact `generate_image` verification dependency errors instead of relabeling billing or configuration failures as image API timeouts.
- Stopped Seednote image retries immediately when vision verification is operationally unavailable, and prohibited bypass retries with `verify_with_vision=false`.

## [2.10.58] - 2026-07-14

### Changed

- Made Agent-Reach an optional enhancement for original Seednote research: unavailable Xiaohongshu backends now fall back to the task topic, topic pool, project profile, and title deduplication without fabricating external trend evidence.
- Kept recoverable research failures only for replicate tasks whose required external source content cannot be resolved.

## [2.10.57] - 2026-07-14

### Changed

- Replaced the customized Humanizer with the byte-identical `blader/humanizer` v2.8.2 skill and moved Seednote, Article, and ecommerce constraints into their owning workflows.
- Made managed Seednote execution use Agent SDK MCP readiness, SDK lifecycle hooks, atomic image verification, and structured recoverable failure states instead of Bash-side MCP clients or unverified visual fallbacks.
- Injected managed MCP and completion-gate contracts for Seednote, including atomic `generate_image` vision verification, structured recoverable failures, and complete trace-artifact validation.

## [2.10.56] - 2026-07-14

### Changed

- Required Agent-Reach channel status to be `ok` before Seednote research invokes the selected backend, and separated managed-runtime packaging failures from local installation guidance.

## [2.10.55] - 2026-07-10

### Changed

- Documented Montage provider-env, tool-policy, and pipeline-default runtime files for upstream OpenMontage execution.

## [2.10.54] - 2026-07-09

### Changed

- Clarified that Montage agents prefer `$ANBAN_MONTAGE_SUBMODULE_PATH` for production runtime resolution.

## [2.10.53] - 2026-07-09

### Changed

- Renamed the Anban Montage agent and skill distribution to the canonical Montage product name.

## [2.10.52] - 2026-07-09

### Added

- Added Montage agent and skill distribution contracts for Claude Code, Codex, and OpenClaw plugins.

## [2.10.51] - 2026-07-09

### Changed

- Strengthened WeChat article cover strategy gates around reader relevance, information scent, three-concept review, click promise proof, viral audit enforcement, and anti-generic examples across agent and skill distributions.

## [2.10.50] - 2026-07-08

### Changed

- Renamed cover scoring references to the WeChat cover quality scorecard across article visual design skill docs.

## [2.10.49] - 2026-07-08

### Changed

- Strengthened WeChat article cover quality gates with title/digest alignment, thumbnail readability, anti-generic constraints, screenshot-derived failure cases, and final review / viral audit enforcement.

## [2.10.48] - 2026-07-08

### Changed

- Clarified videocreator native video-understanding contracts so reference videos preserve deep intent, meaning boundaries, and business subtext.

## [2.10.47] - 2026-07-08

### Changed

- Treat Seednote image API and quality failures as recoverable image-stage failures with explicit provider, model, output path, error, and next-step records.

## [2.10.45] - 2026-07-08

### Changed

- Clarified videoeditor delivery gates so rendered MP4 output and CapCut draft packages are validated as separate acceptable delivery modes.

## [2.10.44] - 2026-07-08

### Changed

- Renamed video generation profile references from `video.*` to `videocreator.*` across distributed agent and skill contract docs.

## [2.10.43] - 2026-07-08

### Changed

- Fully separated video creator/editor contracts so Studio/API/Skill docs use `video_creator_input`, `video_creator_config`, `video_editor_input`, and `video_editor_config` instead of a unified video intake.

## [2.10.42] - 2026-07-08

### Changed

- Synchronized the Seednote visual methodology contract across Claude and Codex distributions, including content distillation, visual strategy, Prompt blueprints, generation records, quality review, and recoverable image API failure reporting.
- Kept `videocreator` scoped to Seedance generation by removing post-production draft tooling from the creator agent.

## [2.10.41] - 2026-07-08

### Changed

- Split the unified video agent into dedicated `videocreator` and `videoeditor` agents with separate hooks, quality gates, and feedback identities.
- Refined the Seednote visual workflow into a model-image-first methodology with content distillation, visual strategy, Prompt blueprints, generation records, quality review, and recoverable image API failure reporting.

## [2.10.40] - 2026-07-08

### Changed

- Added Stable Video Generation V2 guardrails to the video generation workflow and Seedance 2.0 Skill OS: `prepare_video_generation_inputs`, strict remake triggers, fail-closed user references, reference timelines, and multi-segment compose-before-delivery.

## [2.10.39] - 2026-07-08

### Changed

- Removed the experimental rendered-card visual route from Claude, Codex, and OpenClaw distributions so image workflows use the standard platform visual-design skills.
- Simplified the moments workflow contract around the three required text artifacts: `material-analysis.md`, `content.md`, and `quality-review.md`.

## [2.10.38] - 2026-07-07

### Changed

- Documented the earlier unified Studio video intake experiment, leaving business playbook, mode, subject, audience, and message decisions to the Seedance skills.
- Documented that video task creation charges only the base task fee; `video_gen` provider costs are deducted by MCP execution.

## [2.10.37] - 2026-07-07

### Changed

- Normalized distributed Skill descriptions to start with explicit invocation conditions so Claude can decide when to load them from frontmatter.
- Added contents sections to long Skill references and linked long top-level references directly from each Skill entrypoint for one-level progressive disclosure.

## [2.10.36] - 2026-07-07

### Changed

- Added the `moments` completion review hook so 朋友圈素材包 runs verify required artifacts, evidence boundaries, and feedback submission.

## [2.10.35] - 2026-07-07

### Changed

- Moved auxiliary skill README content into `references/` files so shipped skills follow Agent Skills progressive-disclosure packaging guidance.
- Added a mirrored `agent-reach` boundary skill and tightened plugin agent skill-path contracts so Seednote research uses real Agent-Reach backends without missing local skill references.

## [2.10.34] - 2026-07-07

### Added

- Added the independent `moments` Agent and mirrored `moments` skill for WeChat Moments / 朋友圈素材包 generation.
- Documented the Caihui public-method reference boundary and fixed required artifacts.

## [2.10.33] - 2026-07-07

### Changed

- Added an experimental rendered-card skill for Seednote/WeChat visual workflows.
- Documented the upstream adapter posture without vendoring external templates, scripts, validators, or assets.

## [2.10.32] - 2026-07-07

### Changed

- Expanded the video editing workflow around file-based video transcripts, local `anban video` rendering, overlay/subtitle QC, and no nested agent delegation.
- Added contract coverage that keeps the Claude Code plugin manifest version represented in this changelog.

## [2.10.31] - 2026-07-07

### Documentation

- Added a Skill upstream-source and batch-update index to the README, covering copied/adapted open-source skills, structural references, mirror synchronization, and validation commands.

## [2.10.30] - 2026-07-07

### Changed

- Added a human-readable Claude Code plugin display name for plugin UI surfaces.
- Removed `AskUserQuestion` from the humanizer skill's preapproved tools so autonomous writing pipelines stay zero-interaction by default.
- Added contract coverage for Claude Code plugin, agent, hook, and skill best-practice constraints.

## [2.10.27] - 2026-07-06

### Changed

- Moved WeChat article preflight ownership into skills and agents, with anti-diversion review, automatic adjustment loops, and visual prompt guards for QR/contact/link cues.
- Removed the `inspect_article` MCP preflight path from the article workflow.
- Routed Seednote external Xiaohongshu research through Agent-Reach doctor/backend selection, with Anban-managed OpenCLI/xiaohongshu-mcp install guidance removed from the main flow.

## [2.10.24] - 2026-07-06

### Documentation

- Added progressive `references/examples.md` case libraries for complex workflow skills, following Anthropic Skill disclosure patterns and GitHub high-star skill repository structures.

## [2.10.23] - 2026-07-06

### Changed

- Switched Claude Code hook commands that reference plugin paths to exec-form command declarations with `args`.
- Marked the bootstrap hook as asynchronous so Claude Code session startup is not blocked by background binary preparation.
- Updated SubagentStop hook matchers to use plugin-scoped Claude Code agent names.
- Updated agent diagnostics to test whether `ANBAN_API_KEY` exists without printing the secret value.
- Added GitHub health files for contribution and vulnerability reporting.
- Trimmed the line-art coloring skill entrypoint to stay under the official Claude Code Skill size guideline while keeping detailed guidance in `references/`.

### Documentation

- Clarified release, security, and plugin-maintenance practices for the Claude Code distribution.

## [2.10.22] - 2026-07-05

### Changed

- Previous Claude Code plugin release.
