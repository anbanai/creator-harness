---
name: performance-review
description: Use when a frozen monthly FeedbackJob needs review of a completed WeChat or Seednote performance window.
---

# Performance Review

Review the completed period, Top/Bottom content, content pillars, formats, month-over-month movement, quality signals, and data coverage supplied by the frozen FeedbackJob context. The Server owns cadence, period selection, queueing, and eligibility.

When fewer than ten valid contents are available, return a data-insufficient review without strong strategy claims. Use only the period, revision, sample count, and status supplied by the Server; do not decide eligibility or create, skip, or retry jobs.

Return the period, revision, sample count, evidence, limitations, and status in the private JSON artifacts for Server validation and persistence. Do not write database records or modify project configuration. The Server may use the persisted review as input to `strategy-advisor`.

## Analysis boundary

With no usable observations, report `skipped` or `data_insufficient`; with weak coverage, retain a low-confidence review and its limitations. Do not modify job state, a profile, prompt, publish state, or global configuration.
