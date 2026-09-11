---
name: live-slice
description: Use when working on live video slicing, 直播切片, 剪直播, 智能切片, 听悟 transcription, or live video slicing workflows that turn long livestream videos into transcript-backed short-video clips.
---

# 直播切片

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。


Use this skill to convert a local livestream video into transcript-backed short-video clip plans and exports. Local media work uses direct `ffmpeg`/`ffprobe` commands only; MCP tools handle OSS upload, TingWu analysis, and LLM JSON planning.

## Default Artifacts

The managed runtime provides a task-private workspace and a pre-created `output/` directory. `TASK_ID` and `PROJECT_ID` come from structured runtime context (`PROJECT_ID` is also exposed as `ANBAN_DEFAULT_PROJECT`). Use the explicit paths below; do not create, discover, move, or rename `output/` or its parent directories.

| File | Purpose |
| --- | --- |
| `output/metadata.json` | `ffprobe` metadata |
| `output/cover.jpg` | first-frame global cover (fallback) |
| `output/cover-NN.jpg` | per-clip smart keyframe cover (scene-change) |
| `output/decision-log.md` | auto-decision log (orientation, fill, loudnorm, padding) |
| `output/audio.mp3` | extracted audio for TingWu |
| `output/analysis.json` | normalized TingWu result |
| `output/invalid-sentences.json` | unusable sentence indexes |
| `output/segments.json` | slicing plan |
| `output/clip-plan.json` | deterministic clip timings and ffmpeg commands |
| `output/subject-clip-plan.json` | deterministic topic-script clip parts and concat commands |
| `output/clip_results.json` | local ffmpeg execution results |
| `output/clip-manifest.json` | JSON array of delivered clips |
| `output/clip-draft-results.json` | CapCut draft creation results (optional) |
| MCP-planned `output/exports/...` paths | cut videos and text exports |

## Workflow

1. Check media tools:
   `command -v ffmpeg && command -v ffprobe`

   If either command is missing, tell the operator to install FFmpeg. Python is not required.

2. Prepare media artifacts:

   ```bash
   ffprobe -v error -show_format -show_streams -of json "$VIDEO" > "output/metadata.json"
   ffmpeg -y -i "$VIDEO" -vn -ac 1 -ar 16000 -codec:a libmp3lame -q:a 4 "output/audio.mp3"
   ffmpeg -y -ss 0 -i "$VIDEO" -frames:v 1 -q:v 2 "output/cover.jpg"
   ```

3. Upload audio:
   Call `get_media_pipeline_status` first. TingWu is the required transcription backend; if `oss_direct_upload` or `tingwu_configured` is false, stop and report the missing items.
   Set `AUDIO_SIZE=$(wc -c < output/audio.mp3 | tr -d ' ')`, then call `prepare_file_upload` with `project_id="$PROJECT_ID"`, `task_id="$TASK_ID"`, `purpose="live_audio"`, `filename="audio.mp3"`, `content_type="audio/mpeg"`, and `size=$AUDIO_SIZE`. Upload `output/audio.mp3` to the returned `upload_url` with `curl --fail -X PUT -H "Content-Type: audio/mpeg" -H "Content-Length: $AUDIO_SIZE" --upload-file "output/audio.mp3" "$UPLOAD_URL"`.

4. Create TingWu task:
   Call `create_live_analysis_task(audio_key=..., auto_chapters_enabled=true, summarization_enabled=true, meeting_assistance_enabled=true, diarization_enabled=false, script_template_enable=true)`.

5. Poll analysis:
   Call `query_live_analysis_task(task_id=...)` until `status` is `COMPLETED`, then save the JSON to `output/analysis.json`.

6. Plan cleanup and cuts:
   - Read `analysis.sentences`, directly identify unusable sentences, and save `output/invalid-sentences.json` as `{"invalid":[{"index":3,"reason":"与直播主题无关的广告口播"}]}`.
   - Remove invalid indexes from `analysis.sentences`.
   - Directly create `output/segments.json` as `{"segments":[{"title":"核心演示","description":"展示产品的主要操作流程","thoughts":"保留连续操作和结果反馈","start":4,"end":18}]}`.
   - Detect source orientation with `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$VIDEO"` (store `$SRC_W`/`$SRC_H`; `$SRC_W > $SRC_H` is landscape).
   - Call `build_live_clip_plan(sentences=analysis.sentences, segments=segments.segments, invalid=invalid.invalid, video_path="$VIDEO", output_dir="output", target_mode="vertical", vertical_fill="blur", source_width=$SRC_W, source_height=$SRC_H, target_width=1080, target_height=1920, normalize_audio_loudness=true, head_padding_seconds=0.15, tail_padding_seconds=0.30, min_duration_seconds=5, max_duration_seconds=120)` and save `output/clip-plan.json`.
   - For topic-driven clips, directly create `output/subjects.json` and `output/subject-completions.json`, then call `build_live_subject_clip_plan(sentences=analysis.sentences, completions=subject_completions, invalid=invalid.invalid, video_path="$VIDEO", output_dir="output", target_mode="vertical", vertical_fill="blur", source_width=$SRC_W, source_height=$SRC_H, target_width=1080, target_height=1920, normalize_audio_loudness=true, head_padding_seconds=0.15, tail_padding_seconds=0.30, min_duration_seconds=5, max_duration_seconds=120)` and save `output/subject-clip-plan.json`.
   - Never hand-convert non-contiguous subject scripts into `segments.json`; use `build_live_subject_clip_plan`.

7. Cut clips:
   Read each item in the selected plan (`output/clip-plan.json` or `output/subject-clip-plan.json`). Use the planned `output`, `parts[].output`, and `concat_list_path` exactly as returned; do not create or manage parent directories. If a planned path is not writable, record a runtime-contract failure for that clip. For single-part clips, run `fast_cut_shell` first, then use `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT"` to read output duration. If the command fails, the output is missing or empty, `ffprobe` fails, or actual duration differs from planned duration by more than `max(1.0s, duration*0.05)`, run `accurate_cut_shell` and read duration again. For multi-part clips, run every `parts[].accurate_cut_shell`, write `concat_list_content` to `concat_list_path`, run `concat_shell`, then read the final duration. Save one execution result per clip to `output/clip_results.json` with `actual_duration_seconds`; include `part_results` only for multi-part clips. When `fast_cut_shell` is empty (the tool set `method="encode"` because the source is landscape and must be verticalized with a filter), skip straight to `accurate_cut_shell` — the vertical blur/scale filter requires re-encoding and `-c copy` is invalid. The tool-generated `accurate_cut_args` already include `-pix_fmt yuv420p`, `-crf 20`, `-movflags +faststart`, the vertical `-vf` filter, and `-af loudnorm`.

8. Build delivery files:
   Call `build_live_clip_manifest(source_video="$VIDEO", tingwu_task_id="$TINGWU_TASK_ID", analysis_title=analysis.title, sentences=analysis.sentences, invalid=invalid.invalid, warnings=plan.warnings, rejected=plan.rejected, clips=plan.clips, clip_results=clip_results)` and write:
   - `clip_manifest` to `output/clip-manifest.json` as a JSON array with each clip transcript.
   - `transcript_markdown` to `output/transcript.md`.
   - `summary_markdown` to `output/summary.md`.
   - `clip_notes_markdown[].markdown` to `clip_notes_markdown[].markdown_path`.

9. Export to CapCut (optional):
   For each successful clip in `clip_results.json`, create a CapCut/JianYing draft using the `capcut-draft` skill. Each clip becomes its own draft with:
   - Video segment: the clip's MP4 file (`type: "video"`). The exported MP4 is already 1080×1920, so place it at `scale=1.0` (no hard upscale).
   - Subtitles: from the clip's `transcript` array, applying the **Short-Video Captions** style from the `capcut-draft` skill (font_size≈10, `bold_width=0.1` for weight, white with `#FFD60A` for selling points/numbers, 0.12 black stroke, 0.8 shadow, `transform.y=-0.78` lower-third, `<size=10.0>...</size>` content — do NOT use `<b>` tags, they render literally). Split sentences >8 chars into ≤2 chunks at natural pauses, each its own text segment; time offsets are relative to the clip's start (`subtitle_start = (chunk.start - clip.start) × 1,000,000` microseconds).
   - Cover: the clip's smart keyframe `cover-NN.jpg` (see Smart Cover below), falling back to `output/cover.jpg`.
   - Canvas: vertical 9:16 (1080×1920) for short videos
   - No effects, transitions, or background music added automatically (audio is already loudness-normalized)
   Save results to `output/clip-draft-results.json`. Skip this step entirely if CapCut draft root directory is not found.

## Cutting Commands

Fast cut:

```bash
ffmpeg -y -ss "$START" -i "$VIDEO" -t "$DURATION" -c copy "$OUT"
```

Accurate fallback when copy-mode cuts poorly or fails:

```bash
ffmpeg -y -ss "$START" -i "$VIDEO" -t "$DURATION" -c:v libx264 -c:a aac "$OUT"
```

The templates above are the conceptual minimums. In practice, prefer the `accurate_cut_args` returned by `build_live_clip_plan`/`build_live_subject_clip_plan` — when the source is landscape and `target_mode="vertical"`, the tool emits a full re-encode: the chosen vertical `-vf` filter (blur-fill by default), `-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p`, `-c:a aac -b:a 128k`, `-af loudnorm=I=-16:TP=-1.5:LRA=11`, and `-movflags +faststart`. In that case `fast_cut_shell` is empty and `method="encode"`; run `accurate_cut_shell` directly (filtering is incompatible with `-c copy`). The multi-part concat final pass stays `-c copy` because every part is already yuv420p.

Single clip example:

```bash
START="12.300"
DURATION="38.700"
OUT="output/exports/01-product-proof.mp4"
ffmpeg -y -ss "$START" -i "$VIDEO" -t "$DURATION" -c copy "$OUT"
```

For automated batches, prefer the `fast_cut_shell` and `accurate_cut_shell` fields returned by `build_live_clip_plan`; do not hand-calculate durations.

Multi-part subject clips use planned part commands and concat fields:

```bash
# for each part
ffmpeg -y -ss "$START" -i "$VIDEO" -t "$DURATION" -c:v libx264 -c:a aac "$PART_OUT"

# after writing concat_list_content to concat_list_path
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$OUT"
```

Duration probe:

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT"
```

## Smart Cover

`cover.jpg` is the global first-frame fallback. For each clip, grab a representative keyframe instead of frame 0: sample near the clip's ~40% point with scene-change detection, falling back to the midpoint:

```bash
PIVOT=$(awk 'BEGIN{printf "%.2f", '"$CLIP_START"' + '"$CLIP_DURATION"' * 0.4}')
ffmpeg -y -ss "$PIVOT" -i "$CLIP_PATH" -vf "select=gt(scene\,0.3)" -frames:v 1 -q:v 2 "output/cover-NN.jpg" || \
  ffmpeg -y -ss "$(awk 'BEGIN{printf "%.2f", '"$CLIP_DURATION"' / 2}')" -i "$CLIP_PATH" -frames:v 1 -q:v 2 "output/cover-NN.jpg"
```

`NN` is the two-digit clip index. Use `cover-NN.jpg` as that clip's CapCut draft cover; fall back to `cover.jpg` if generation fails.

## Text Export

For Markdown transcript exports, write the content directly from `analysis.sentences`:

```markdown
# {analysis.title}

- [1] 0.00-3.20s 字幕
- [2] 3.20-7.80s 字幕
```

For clip notes, write the `clip_notes_markdown` returned by `build_live_clip_manifest`; do not invent note content by hand.

## JSON Shapes

Before either deterministic planning call, validate that every index is unique and exists, every range is monotonic with `start <= end`, and every source ID comes from `analysis.json`. If MCP validation rejects the files, fix them in the current Agent loop and retry; do not seek another model tool. Use `analyze_video(project_id, task_id, task_file_id|video_url, prompt)` only when complete visual context is needed; it does not replace the TingWu transcript.

`analysis.json` uses:
`chapters`, `sentences`, `subjects`, `segments`, `invalid`, `qas`, `topics`, `words`, `silents`, `keywords`, `key_sentences`, `templates`, `audio_info`.

Sentence objects:
`{"index":1,"start":0.0,"end":3.2,"text":"字幕"}`

Segment objects:
`{"title":"片段标题","description":"说明","thoughts":"剪辑思路","start":1,"end":8}`

Invalid objects:
`{"index":1,"reason":"直播间欢迎语"}`

Clip plan objects:
`{"index":1,"title":"片段标题","sentence_start":1,"sentence_end":8,"start":12.3,"end":51.0,"duration":38.7,"output":"...mp4","fast_cut_shell":"ffmpeg ...","accurate_cut_shell":"ffmpeg ...","parts":[...],"transcript":[...]}`

Multi-part subject clip fields:
`parts`, `concat_list_path`, `concat_list_content`, `concat_shell`, `concat_args`, `script_notes`.

Clip manifest is a JSON array of delivered clip objects with status, method, output, duration, actual_duration_seconds, transcript, and optional error fields. `clip_notes_markdown` contains ready-to-write Markdown notes for each clip: `{"index":1,"title":"片段","markdown_path":"...md","markdown":"..."}`.

## Cutting Rules

- Keep transcript index boundaries intact; never invent timestamps.
- Prefer valid sentences after removing `invalid` indexes.
- Pass `head_padding_seconds=0.15, tail_padding_seconds=0.30` to the plan tools so cuts don't clip the first or last word.
- Target short-video sweet spots: pass `max_duration_seconds=120` (15-60s is ideal for livestream hooks). Treat clips >120s as too long and record a warning; drop clips shorter than 5s — the MIN is 5s everywhere (draft-skip and red-flag thresholds agree).
- Aim for semantic diversity across clips (distinct sentence ranges or topics) so the batch is not a set of near-duplicates.
- Favor segments whose first sentence is a conclusion, opinion, pain-point, or contrast (a hook); subject completions should directly place a 3-5s opening hook.
- Verticalize for the target platform: pass `target_mode="vertical"` and `vertical_fill="blur"`. Landscape sources get a blur-fill re-encode; already-vertical sources get only `scale`. Audio is loudness-normalized (EBU R128) on re-encode paths, never on `-c copy`.
- Use `-c copy` first for speed only when `fast_cut_shell` is non-empty; retry with re-encoding (or go straight to it) if a filter is needed or timestamp accuracy is poor.
- For subject clips, preserve selected sentence order unless the LLM explicitly provides a better narrative order.
- Do not cut live-only greetings, thanks, countdowns, real-time stock claims, or room-specific promos into short videos unless the user explicitly asks.
