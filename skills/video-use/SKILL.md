---
name: video-use
description: Use when a talking-head video needs transcript- and context-aware semantic cleanup after rough cutting, including clear slips, repeated takes, and meaningless filler.
---

# Video Use

Use the pinned `browser-use/video-use` runtime and its Server-provided credentials. Produce a transcript and semantic edit decisions under `output/`. Preserve meaning, order, qualifications, numbers, causality, natural emphasis, and uncertain speech. When a phrase may be intentional, keep it and record the uncertainty.

This Skill may call only registered MCP capabilities. It must not create an HTTP client, expose credentials, or infer successful transcription from a command that exited without an error. If the runtime or transcription credential is unavailable, write a blocking failure state with a resume point.
