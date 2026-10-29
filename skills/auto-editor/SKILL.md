---
name: auto-editor
description: Use when a talking-head video needs an audio-driven rough cut that removes dead air and long pauses while preserving natural breathing and delivery rhythm.
---

# Auto Editor

Use the available `auto-editor` runtime to produce a rough-cut candidate. Confirm the command works and record its observed version; an exact version match is not required. Keep source media read-only. Record the version, detection threshold, stream, margins, original-timecode candidates, accepted/rejected decisions, rotation matrix, `avg_frame_rate`, `r_frame_rate`, and output paths in JSON evidence under the declared `output/` directory.

The tool proposes silence edits; it does not decide semantic edits. Preserve normal breathing, emphasis, comprehension pauses, and meaningful silence. After rendering, run an independent ffmpeg `silencedetect` pass and compare its intervals with auto-editor's evidence. Treat `-ex clip-sequence` as a multi-file output: enumerate every segment and record the deterministic concatenation order instead of assuming one output file.

A missing or incompatible executable, failed analysis, failed independent check, or unverified frame/time-base conversion is a blocking runtime error with a resumable failure artifact. Never claim silence detection succeeded from a file-exists check.

When joining audio from multiple source streams, inspect codec, sample rate, channel layout, and time base first. Normalize only where the chosen join method requires compatible streams, preserve source media, and identify normalized intermediates in evidence. After assembly, verify duration, sample rate, channel layout, discontinuities or clicks, and dialogue level against source measurements before accepting the cut.

For the frame/time-base and independent silence-check procedure, read [references/verification.md](references/verification.md).
