---
name: erduo-broll-loop-engineering
description: Use when a semantically locked talking-head timeline needs sentence-level B-roll, captions, cards, motion graphics, and transitions with a reviewable sample before final rendering.
---

# Erduo B-roll Loop Engineering

Route the motion package through the installed HyperFrames/Remotion workflow and Shotcraft shot cards. Split work by shot where the runtime supports parallel agents, then run the independent aesthetic review before assembly. Every visual item records its purpose, source and target timecodes, source or generation method, rights state, and dependency on spoken timing.

The first deliverable is a review sample. Do not add sound effects or BGM before the sample is approved by the Server review gate. Do not force unused assets into a timeline. If an asset's purpose is unclear, leave it for review and record the uncertainty. Missing runtime dependencies are blocking failures; do not silently use `video-edit` as a fallback.
