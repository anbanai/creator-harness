---
name: strategy-advisor
description: Use when a frozen strategy-advisor FeedbackJob contains revised performance evidence for advisory analysis.
---

# Strategy Advisor

Combine the completed weekly insights, closed-month performance review, content postmortems, and coverage metadata available in the frozen FeedbackJob context into an advisory strategy candidate. The Server owns cadence, dispatch, and eligibility. A formal recommendation candidate requires at least ten valid contents and traceable source analytics revisions.

When evidence is insufficient, return `data_insufficient` without strong recommendations. Recommendations use `keep`, `increase`, `reduce`, and `test` categories and include confidence and limitations. Return the candidate in private JSON for Server validation and persistence. Only the Server may create or activate a Strategy Snapshot revision, retire a prior revision, or decide whether an existing snapshot remains active. Never mutate profile, writer, theme, prompt, or running task snapshots.

New tasks freeze the active snapshot ID, revision, and digest at bootstrap. Running tasks continue using their frozen GenerationContext. Downstream consumer is the next generation's `post-scorer`.

## Analysis boundary

If the frozen context contains no eligible evidence, return `data_insufficient` with low confidence and no strong recommendations. Never modify job state, a profile, prompt, publish state, an active snapshot, or global configuration.
