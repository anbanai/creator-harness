---
name: video-production-qc
description: Use when a talking-head or Montage render needs deterministic media, timeline, sync, subtitle, freeze, silence, duration, and evidence checks before editorial review or delivery.
---

# Video Production QC

This Skill owns the post-render quality gate. The invoking Agent owns stage
orchestration and recovery; Montage owns rendering; Server owns task identity,
publication, billing, and external side effects.

Read [references/gate-contract.md](references/gate-contract.md) for the check
IDs and thresholds. Read [references/evidence-schema.md](references/evidence-schema.md)
before writing `output/quality-evidence.json`.

## Required order

1. Run composition lint before rendering with the shared
   `talking-head-composition` contract.
2. Render the candidate from the frozen, validated timeline produced by the composition stage.
3. Run `scripts/render_qc.py` against the actual candidate file. Do not infer
   media quality from a successful renderer exit code or file existence.
4. Merge the returned checks into the current `revision_id` evidence. Keep
   measured checks separate from listening evidence.
5. Continue to platform Final Review, cover generation, and delivery only when
   the gate is `passed`. `degraded` is an explicit incomplete result, not a
   success claim; `blocked` requires recovery from the producing stage.

## Command contract

```bash
python3 skills/video-production-qc/scripts/render_qc.py \
  --video output/final.mp4 \
  --output output/quality-evidence.json \
  --revision-id "$REVISION_ID" \
  --subtitle-mode off \
  --listening-status unavailable \
  --sync-evidence output/sync-evidence.json
```

The command must use `ffprobe` for stream and duration inspection and FFmpeg
for full decode, silence, and freeze checks. Missing tools, malformed evidence,
or an unreadable media file are blocking failures. The script writes a
machine-readable report even when it exits non-zero.

## Evidence rules

- A ten-second window must contain measurable audio energy.
- No silence interval may exceed `0.5s`.
- No `freezedetect` interval is allowed.
- Audio/video duration difference must be at most one video frame.
- The last `0.5s` must contain voice energy unless the frozen timeline
  explicitly records a non-speech ending.
- Sync evidence must include checkpoints at the start, middle, end, every
  segment boundary, and every 30 seconds inside longer continuous segments.
- Absolute offset and jitter must stay within one video frame. Constant codec
  delay must be recorded instead of hidden by a second timing calculation.
- Subtitle streams are forbidden when `subtitle_mode=off`; when subtitles are
  required, their stream and timing evidence must be present.
- Audio measurements never imply that the result was listened to. Use
  `complete`, `partial`, or `unavailable` for listening and keep that state in
  the report.

## Recovery and cleanup

Only retry idempotent render or provider operations when the error is explicitly
retryable. Use at most three attempts with bounded exponential backoff and write
each attempt to the evidence. Do not retry identity, permission, schema, rights,
or semantic failures by changing creative parameters.

Before an expensive render, record available disk space. Remove regenerable
intermediates after the candidate and its evidence are validated, while keeping
source media, the frozen project, the current render, and failure evidence.

Never edit the final report to make a failed check appear passed. Write the
failure contract and a recoverable `resume_from` stage instead.
