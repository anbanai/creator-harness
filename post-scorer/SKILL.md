---
name: post-scorer
description: Score a draft using the latest frozen advisory strategy before the quality gate.
layer: produce
---

# Post Scorer

Run inside content generation after the draft exists and before final quality
gates. Read `.anban-creator/feedback-strategy.json` and historical caches frozen
by Bootstrap. Record fallback when no strategy exists. Do not enqueue analysis,
rewrite project positioning, or update prompts from a single score. Output a
score with evidence, tradeoffs, and strategy revision used.
