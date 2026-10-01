---
name: profile-builder
description: Use when building or reviewing an Anban project account profile; reuse Easel six-dimension semantics, question order, source labels, and public-material fallback rules.
---

# Project Account Profile

Generate a structured six-dimension result for the current project and submit it with `submit_profile_result`. Keep the six dimensions fixed: `identity`, `style`, `audience`, `platforms`, `preferences`, and `memory`.

Collect in this order: basic platform and account information; operating intent, direction, and differentiation; content preferences, format, tone, and audience; excluded content, collaboration boundaries, and compliance red lines. In a managed run, record unavailable answers as `follow_up_questions` and continue without asking interactively. Sources must use `[用户确认]`, `[链接分析]`, `[推断待确认]`, or `[待补充]`.

Only analyze public material supplied by the user. When a homepage cannot be read, ask for titles, samples, or a description. Unsupported claims go into `missing_fields` or `follow_up_questions`. Never access Easel or OpenClaw runtime files, `web_fetch`, global memory files, or modify the formal Server profile.

The result must contain all six dimensions with `content`, `sources`, `evidence`, and `missing_fields`, plus `analysis_limits` and `follow_up_questions`. `preferences` are hard constraints in every downstream stage.

Usage check: `identity` for topic discovery and positioning; `style` for writing, visuals, and tone; `audience` for audience fit and depth; `platforms` for format, publishing, and adaptation; `preferences` for hard constraints; `memory` for reusable experience and attribution.

## Analysis boundary

When source material is absent or too thin, keep confidence low and list `missing_fields` without inventing claims. This Skill submits only through the Server MCP capability; it must not modify persistent memory, the formal profile, prompt, publish state, or global configuration.
