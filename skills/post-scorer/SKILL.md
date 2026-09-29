---
name: post-scorer
description: Use when a content generation task has a completed draft and is entering its final quality gate.
---

# Post Scorer

Read the strategy snapshot and historical performance cache frozen in the task's GenerationContext. Score the draft against the applicable platform and task type, and mark whether the score used an active snapshot or a documented baseline fallback.

This is generation-local. It does not enqueue analytics, rebuild observations, call `strategy-advisor`, or create a new snapshot. If no active strategy is available, continue with the baseline and set `strategy_unavailable`; do not create a compensating analysis task. Record which strategy revision and digest were consumed so the result is auditable.
