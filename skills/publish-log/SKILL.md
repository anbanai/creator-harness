---
name: publish-log
description: Use when the Server has confirmed a WeChat article or Seednote publication and must record the immutable publication fact.
---

# Publish Log

This is a lightweight, deterministic fact-recording step. It runs only after the Server publication state machine has confirmed success. Record the project, platform, account, content identity, provider evidence, published time, and observation-window metadata with an idempotency key.

Do not call an LLM and do not start `publish-analytics`, `performance-review`, `content-postmortem`, or `strategy-advisor`. Failed or ambiguous publication is not a successful publish fact. The Server remains authoritative; Agent logs and local files are not evidence of external delivery.

Output status is `recorded`, `already_recorded`, or a structured failure. A failure must not change publication state. Downstream consumers are the daily eligibility scan and later analytics imports.
