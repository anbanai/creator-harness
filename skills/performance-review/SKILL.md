---
name: performance-review
description: Use when the monthly closed-period queue reviews a project's completed WeChat or Seednote performance window.
---

# Performance Review

Run on the first business day of the month, normally 04:00-07:00 in the project timezone, for the previous closed month. Review Top/Bottom content, content pillars, formats, month-over-month movement, quality signals, and data coverage.

Require a completed period, at least one valid content observation, and a changed analytics revision or no prior successful review for that period. A project with fewer than ten valid contents may receive a data-insufficient review, but must not receive strong strategy claims or an extra LLM interpretation. A duplicate fingerprint, paused project, rebuilding analytics state, revoked-only batch, or empty/null metrics is `skipped` and consumes no Agent budget.

Persist the period, revision, sample count, evidence, limitations, and status. This Skill does not modify project configuration. Its output feeds the monthly `strategy-advisor` snapshot.

## Analysis boundary

With no usable observations, return `skipped` or `data_insufficient`; with weak coverage, retain a low-confidence review and its limitations. Do not modify a profile, prompt, publish state, or global configuration.
