---
name: profile-builder
description: Use when a managed Anban task analyzes a project's supplied account details, public materials, and answers to create or update its six-dimension profile.
---

# Project Account Profile Builder

Build a project-owned six-dimension profile from the frozen task input. Keep the Easel question order, evidence labels, and template meanings. The project has one profile shared by its selected creation Agents.

## Input

Call `get_task(task_id="$TASK_ID")` and save its frozen `agent_input` to `output/profile-input.json`. Read `project_id`, selected `agent_ids`, `profile_setup`, `platform_accounts`, grouped `answers`, `samples`, `current_profile`, and `expected_revision` from the structured task input. `current_profile` is the last applied snapshot or `null`; `expected_revision` is frozen by the Server and must be passed to `submit_profile_result` unchanged.

When a current profile exists, use it as the baseline. Retain supported existing details and sources unless new user input or evidence justifies a change. A blank new answer is not evidence that a prior value should be erased.

## Question Order

Use the existing grouped answers without asking interactively. Missing answers are allowed and become explicit follow-up questions:

1. Basic account and platform information: account status, platform accounts, account name, homepage, approximate follower range, and optional samples.
2. Operating intent, content direction, goals, strengths/resources, and differentiation.
3. Content preferences, favorite material, formats, tone, reference accounts, and audience.
4. Excluded topics, collaboration boundaries, and compliance red lines.

The user may leave any field blank. Do not stop analysis solely because information is incomplete.

## Evidence And Public Material

Only analyze public pages and samples explicitly supplied for this project. Use a public-browsing capability only when the managed runtime provides one; never write a custom HTTP/MCP client, bypass authentication, or access private material. If a page is unavailable, blocked, requires login, or lacks useful content, record the limit and ask for concrete titles, samples, or a description in `follow_up_questions`.

Use these source labels consistently:

- `[用户确认]` for explicit user answers and supplied account details.
- `[链接分析]` only for facts visible in retrieved public material or provided samples.
- `[推断待确认]` for evidence-backed hypotheses that are not verified facts.
- `[待补充]` for absent or unusable information.
- Preserve `[用户编辑]` when it already exists in the current profile.

Attach evidence to each relevant dimension. Never invent follower counts, audience demographics, engagement results, account claims, or platform rules. Keep weak or conflicting evidence in `analysis_limits` and leave the affected field marked for follow-up.

## Build The Six Dimensions

Use the Easel-compatible names and content meanings:

- `identity`: account positioning, differentiation, and content direction.
- `style`: tone, opening patterns, visual preferences, pacing, and recognizable elements.
- `audience`: supported audience needs, interests, and interaction patterns.
- `platforms`: account details and platform-specific formats or adaptation notes.
- `preferences`: content to create or avoid, collaboration boundaries, and compliance red lines. These are hard constraints for every downstream Agent.
- `memory`: only reusable, evidence-backed experience; leave empty when none exists.

Every dimension must include `content`, `sources`, `evidence`, and `missing_fields`. Put uncertain suggestions under `[推断待确认]`; downstream Agents must not state them as facts. Do not copy analysis into a global memory file.

## Apply Through Server

Submit the complete six-dimension result once through the authenticated Anban MCP `submit_profile_result` capability with `project_id`, the active `task_id`, the frozen `expected_revision`, `dimensions`, `analysis_limits`, and `missing_fields`. The Server validates task ownership and revision, atomically applies the result, and records history. Do not edit project files, prompts, or persistent memory directly.

Wait for the Server result before reporting success. On version conflict or rejected submission, stop and preserve the prior profile; do not retry with a new revision or claim the profile was updated. Missing evidence is a partial profile, not a failed task: apply the supported information and leave concrete gaps for later editing.

## Quality Check

Before submission, verify all six dimensions exist, every source label has evidence or a clear user-provided basis, all inferences remain marked, `preferences` contains the red lines, empty fields appear in `missing_fields`, and no unrelated project's data was used.

For downstream dimension usage see [dimension-usage.md](references/dimension-usage.md). For the question sequence see [onboarding-questions.md](references/onboarding-questions.md). For public-material limits see [social-link-analysis.md](references/social-link-analysis.md).
