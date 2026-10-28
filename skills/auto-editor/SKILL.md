---
name: auto-editor
description: Use when a talking-head video needs an audio-driven rough cut that removes dead air and long pauses while preserving natural breathing and delivery rhythm.
---

# Auto Editor

Use the installed, pinned `auto-editor` runtime to produce a rough-cut candidate. Keep the source media read-only. Record the tool version, detection threshold, margins, original-timecode candidates, accepted/rejected decisions, and the output path in a JSON evidence file under the task's declared `output/` directory.

The tool proposes silence edits; it does not decide semantic edits. Preserve normal breathing, emphasis, comprehension pauses, and meaningful silence. A missing executable or failed analysis is a blocking runtime error with a resumable failure artifact. Never claim silence detection succeeded from a file-exists check.
