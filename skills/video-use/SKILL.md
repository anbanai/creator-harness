---
name: video-use
description: Use when a talking-head video needs transcript- and context-aware semantic cleanup after rough cutting, including clear slips, repeated takes, and meaningless filler.
---

# Video Use

Use the image-installed `browser-use/video-use` helpers under `ANBAN_VIDEO_USE_ROOT` with the Server-provided transcription credential. Produce a transcript and semantic edit decisions under `output/`. Preserve meaning, order, qualifications, numbers, causality, natural emphasis, and uncertain speech. When a phrase may be intentional, keep it and record the uncertainty. Discover supported helper arguments from the installed helper's `--help`; record the helper and observed package/source revision in evidence when available, without making an exact revision a workflow requirement.

The managed image injects the upstream helper's expected `ELEVENLABS_API_KEY` environment variable from Server configuration. Do not print, copy, serialize, or otherwise expose it. Do not create an HTTP client, substitute another ASR provider, install temporary runtimes, or infer successful transcription from a file or process exit code. Verify the transcript content and report upstream/helper failures as a blocking failure state with a resume point.
