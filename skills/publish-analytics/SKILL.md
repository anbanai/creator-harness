---
name: publish-analytics
description: Use when the weekly feedback queue analyzes mature, non-empty publication observations for WeChat articles or Seednote posts.
---

# Publish Analytics

Run on the weekly project schedule, normally Monday 04:00-06:00 in the project timezone. Consume the frozen analytics revision and content set produced by the daily tracker. Aggregate publish time, content type, writer, theme, visual style, title and body length, image count, tags, and valid engagement metrics.

Eligibility requires a new revision, mature content, at least one valid observation, no successful result for the same fingerprint, no running duplicate, and an active project. Use a minimum of five valid contents for grouped comparisons; below that threshold save an explainable insufficient-sample result or skip according to the operation policy. Do not rerun for every import when the fingerprint is unchanged.

Deterministic aggregation may write an insight. LLM interpretation is optional and only runs after the queued job is eligible. Never mutate profile, writer, theme, prompt, or an active task snapshot. Downstream consumers are `performance-review`, `content-postmortem`, and the monthly strategy candidate.

## Analysis boundary

No valid observations produce `skipped` or `data_insufficient`; partial evidence must be labeled low confidence with explicit limitations. This Skill never modifies profile, prompt, publish state, or global configuration.
