---
name: content-postmortem
description: Use when a frozen content-postmortem FeedbackJob contains a published item at its 7-day or 30-day observation window.
---

# Content Postmortem

Analyze only the single target or batch and evidence frozen in the FeedbackJob context. Explain hook, structure, topic, platform fit, timing, visual treatment, and observed outcomes while separating evidence from interpretation. The Server owns scheduling, maturity checks, publication identity matching, and job eligibility.

At least one valid observation is required for a data-backed postmortem. If the frozen context is insufficient or marks the job skipped, report that status and its reason without changing job state. The default batch-pattern threshold is five contents.

Return an insight candidate with evidence, confidence, and limitations in the private JSON artifacts. The Server validates and persists it. Never write an insight record, profile, or prompt.

## Analysis boundary

If the frozen evidence is unavailable, report `skipped` or `data_insufficient` and mark any partial interpretation low confidence. Never modify a profile, prompt, publish state, job state, or global configuration.
