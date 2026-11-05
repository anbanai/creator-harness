---
name: publish-analytics
description: Use when a frozen weekly FeedbackJob needs analysis of mature publication observations for WeChat articles or Seednote posts.
---

# Publish Analytics

Consume only the frozen analytics revision and content set in the FeedbackJob context. Aggregate publish time, content type, writer, theme, visual style, title and body length, image count, tags, and valid engagement metrics into evidence-backed analysis.

The Server owns scheduling, eligibility, fingerprint deduplication, project status, and dispatch. Use a minimum of five valid contents for grouped comparisons; below that threshold report an explainable insufficient-sample result. Do not create, restart, or enqueue jobs.

Return any insight as a private JSON candidate with evidence, confidence, and limitations. State correlations and limitations without claiming causation. The Server validates and persists the result. Never write database records or mutate a profile, writer, theme, prompt, or active task snapshot.

## Analysis boundary

No valid observations produce `skipped` or `data_insufficient`; partial evidence must be labeled low confidence with explicit limitations. This Skill never modifies profile, prompt, publish state, or global configuration.
