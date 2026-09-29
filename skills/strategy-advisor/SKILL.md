---
name: strategy-advisor
description: Use when the monthly strategy queue, or an explicitly enabled weekly candidate run, has enough revised performance evidence.
---

# Strategy Advisor

Combine completed weekly insights, the closed-month performance review, content postmortems, and coverage metadata into an advisory Strategy Snapshot. The default trigger is monthly; weekly runs produce candidates only when the project explicitly enables them. A formal snapshot requires at least ten valid contents and traceable source analytics revisions.

When evidence is insufficient, persist a data-insufficient status without strong recommendations, without extra LLM interpretation, and without replacing the last valid active snapshot. Recommendations use `keep`, `increase`, `reduce`, and `test` categories and include confidence and limitations. Activate a new revision atomically, retire the prior active revision, and never mutate profile, writer, theme, prompt, or running task snapshots.

New tasks freeze the active snapshot ID, revision, and digest at bootstrap. Running tasks continue using their frozen GenerationContext. Downstream consumer is the next generation's `post-scorer`.
