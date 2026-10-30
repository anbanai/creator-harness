---
name: erduo-broll-loop-engineering
description: Use when a semantically locked talking-head timeline needs sentence-level B-roll, captions, cards, motion graphics, and transitions with a reviewable sample before final rendering.
---

# Erduo B-roll Loop Engineering

Route the motion package through the available HyperFrames CLI and auditable shot-card JSON. HyperFrames is the only motion runtime for this workflow; do not substitute Shotcraft, Remotion, or an ad hoc runtime installation. Confirm the CLI works and record its observed version; an exact version match is not a workflow requirement. Split work by shot only where the managed runtime supports it, then run the bounded aesthetic review before assembly. Every visual item records its purpose, source and target timecodes, source or generation method, rights state, and dependency on spoken timing. Record slot duration, visual-change count, static hold duration, repeated-asset count and a density-risk summary; use these as warnings for rhythm review, not as a fixed module quota.

The first deliverable is a review sample. Do not add sound effects or BGM before the sample is approved by the Server review gate. Do not force unused assets into a timeline or add factual claims that are absent from the source. If an asset's purpose is unclear, leave it for review and record the uncertainty. Missing runtime dependencies are blocking failures; do not silently use `video-edit` as a fallback.

Run HyperFrames lint before each sample render and use the fixed remediation table in [references/hyperframes-lint.md](references/hyperframes-lint.md). The independent aesthetic review has a 10-minute limit and checks fixed opening, card, transition, and ending frames plus a registered `analyze_video` review of the sample; on timeout write `aesthetic_review: "degraded"`, the concrete risk and continue only with a self-review marked as such.
