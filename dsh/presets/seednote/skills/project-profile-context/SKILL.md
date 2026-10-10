---
name: project-profile-context
description: Use when an Anban creation Agent needs to read and apply a project's confirmed or system-applied six-dimension account profile.
---

# Project Profile Context

Use the Server-owned project profile as a versioned creative constraint. The profile is shared across all creation Agents selected for the project; platform-specific blocks only shape adaptation and delivery.

## Inputs

- `$PROJECT_ID` and `$TASK_ID` from structured managed runtime context.
- The scope assigned by the owning Agent Pack: `wechat`, `wechat-picture`, `seednote`, `montage`, `hypit`, or `whiteboard-animation`.
- The authenticated Anban MCP `get_project_profile` capability.

## Read And Apply

1. Call `get_project_profile(project_id="$PROJECT_ID", task_id="$TASK_ID", scope="<pack scope>")` before planning or producing content. Reuse the returned frozen task snapshot for this execution.
2. Read `account_profile` and its application status/source when present. Both `user_confirmation` and `system_analysis` profiles are active context. Do not require an extra approval step for a system-applied profile.
3. Use the dimensions according to their role:

| Dimension | Use |
| --- | --- |
| `identity` | Project positioning, topic discovery, and fit with the account direction. |
| `style` | Writing, visual choices, rhythm, and tone. |
| `audience` | Audience fit, examples, terminology, and expression depth. |
| `platforms` | Platform-specific format, publishing, and adaptation only. |
| `preferences` | Hard constraints across research, planning, production, review, and delivery. |
| `memory` | Reusable project experience and attribution, subject to its evidence and source. |

4. Preserve source and evidence metadata when using a profile statement. `[用户确认]`, `[用户编辑]`, and `[链接分析]` can support factual context within their stated evidence. Treat `[推断待确认]` only as a hypothesis; do not present it as a verified fact or use it as the sole basis for a diagnosis. Keep `[待补充]` fields explicitly unresolved.
5. Check `preferences` before and after creation. If a hard constraint conflicts with a lower-priority creative preference, follow `preferences` and record the relevant constraint in the task output.

## Missing Or Incomplete Profile

- If `account_profile` is absent, continue production using explicit task input and record `profile_missing` where the task has a warning channel. Do not invent profile facts.
- If the task is diagnostic and a missing dimension is necessary for a conclusion, report the gap and limit the conclusion to observed evidence. Do not fabricate a diagnosis.
- If a dimension is partial, use only supported fields and keep every inference labeled.

## Boundaries

- The Server is the persistence source. Never write profile files, project prompts, task input, or global `MEMORY.md`.
- Do not read or write Easel, OpenClaw, or other host-global runtime files.
- Do not treat `platforms` as creative positioning or `preferences` as optional stylistic suggestions.
- Do not modify a profile from a content-creation task. Profile changes use the dedicated profile workflow and Server MCP capability.
