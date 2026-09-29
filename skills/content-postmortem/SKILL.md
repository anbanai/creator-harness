---
name: content-postmortem
description: Use when the weekly feedback queue finds a published item at its 7-day or 30-day observation window with valid metrics.
---

# Content Postmortem

Support single-content and batch-pattern review. The weekly scheduler selects only content that has reached a configured lifecycle window and can be matched to a stable publication identity. Explain hook, structure, topic, platform fit, timing, visual treatment, and observed outcomes while separating evidence from interpretation.

At least one valid observation is required for a data-backed postmortem. Before maturity, return `pending_maturity` in the deterministic projection and do not start an Agent. With no valid observations, an identity conflict, or an unchanged fingerprint, save an auditable `skipped` result and do not call an LLM. The default batch-pattern threshold is five contents.

Write an insight with evidence, confidence, and limitations. Never rewrite a profile or prompt. Downstream consumers are the monthly review and advisory strategy snapshot.

## Analysis boundary

If the content is not mature or evidence is unavailable, use `pending_maturity`, `skipped`, or `data_insufficient` as applicable and mark any partial interpretation low confidence. Never modify a profile, prompt, publish state, or global configuration.
