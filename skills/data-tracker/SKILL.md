---
name: data-tracker
description: Use when the daily low-peak feedback scan finds new analytics observations or mature content for deterministic projections.
---

# Data Tracker

Run once per project day in the configured timezone, normally between 03:00 and 05:00. Process only new or revised analytics observations and content that reached a 24-hour, 7-day, or 30-day observation point. Recompute coverage, lifecycle buckets, and revision fingerprints deterministically.

Skip without creating an Agent or LLM task when there is no new revision, no mature content, no valid metric, a revoked import with no replacement revision, or an identity mismatch. Preserve a `skipped` audit row with the reason. This Skill may write projections and audit rows, but never writes a strategy or changes a project profile.

Downstream consumers are the weekly analytics and postmortem queues. The result must expose the analytics revision, valid sample count, coverage, and content-set digest.

## Analysis boundary

When observations are absent or insufficient, emit `skipped` or `data_insufficient`, preserve the reason and use low confidence for any partial projection. Do not modify a project profile, prompt, publish state, or global configuration.
