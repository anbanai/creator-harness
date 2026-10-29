---
name: auto-editor
description: Use when a talking-head video needs an audio-driven rough cut that removes dead air and long pauses while preserving natural breathing and delivery rhythm.
---

# Auto Editor

Use the task image's pinned `auto-editor` `29.3.1` runtime to produce a rough-cut candidate. Keep source media read-only. Record the version, detection threshold, stream, margins, original-timecode candidates, accepted/rejected decisions, rotation matrix, `avg_frame_rate`, `r_frame_rate`, and output paths in JSON evidence under the declared `output/` directory.

The tool proposes silence edits; it does not decide semantic edits. Preserve normal breathing, emphasis, comprehension pauses, and meaningful silence. After rendering, run an independent ffmpeg `silencedetect` pass and compare its intervals with auto-editor's evidence. Treat `-ex clip-sequence` as a multi-file output: enumerate every segment and record the deterministic concatenation order instead of assuming one output file.

A missing executable, version mismatch, failed analysis, failed independent check, or unverified frame/time-base conversion is a blocking runtime error with a resumable failure artifact. Never claim silence detection succeeded from a file-exists check.

For the frame/time-base and independent silence-check procedure, read [references/verification.md](references/verification.md).
