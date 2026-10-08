---
name: profile-builder
description: Use when building or reviewing an Anban project account profile; reuse Easel six-dimension semantics, question order, source labels, and public-material fallback rules.
---

# Project Account Profile

Generate a structured six-dimension result for the current project and submit it with `submit_profile_result`. Keep the six dimensions fixed: `identity`, `style`, `audience`, `platforms`, `preferences`, and `memory`.

Consume the structured `answers` input in this order: `basic` (`project_name`, `account_status`); `platform_accounts` (`platform`, `account_name`, `profile_url`); `intent` (`goals`, `direction`, `differentiation`); `content` (`preferences`, `formats`, `tone`, `audience`); and `boundaries` (`exclusions`, `collaboration`, `compliance`). Empty strings and an empty account list are valid and mean the user did not provide that information. These account platforms describe profile metadata only; never infer or change the project's executable platform or available task types. Record missing information as `follow_up_questions` and continue without asking interactively. Sources must use `[用户确认]`, `[链接分析]`, `[推断待确认]`, or `[待补充]`.

Only analyze public material supplied by the user. When a homepage cannot be read, record that limitation and add titles, samples, or a description to `follow_up_questions`; do not request input interactively. Unsupported claims go into `missing_fields` or `follow_up_questions`. Never access Easel or OpenClaw runtime files, `web_fetch`, global memory files, or modify the formal Server profile.

The result must contain all six dimensions with `content`, `sources`, `evidence`, and `missing_fields`, plus `analysis_limits` and `follow_up_questions`. The first submitted result remains a draft until the user confirms it; only confirmed profile data can enter later task context. A later user-requested refresh replaces an already confirmed profile only after successful submission. `preferences` are hard constraints in every downstream stage.

Usage check: `identity` for topic discovery and positioning; `style` for writing, visuals, and tone; `audience` for audience fit and depth; `platforms` for format, publishing, and adaptation; `preferences` for hard constraints; `memory` for reusable experience and attribution.

## Analysis boundary

When source material is absent or too thin, keep confidence low and list `missing_fields` without inventing claims. This Skill submits only through the Server MCP capability; it must not modify persistent memory, the formal profile, prompt, publish state, or global configuration.
