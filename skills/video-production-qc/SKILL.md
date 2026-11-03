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
3. Run `scripts/generate_audio_content_check.py --video output/final.mp4 --edl output/edit-decision-list.json --transcript output/final-audio-transcript.json --revision-id <revision> --output output/audio-content-check.json` after independent final-track ASR. If repeated phrases are found, supply the reviewed decisions through `--duplicate-reviews`; missing or rejected decisions block. Then run `scripts/render_qc.py` against the actual candidate file. Do not infer
   media quality from a successful renderer exit code or file existence.
4. Supply the exact EDL and final-track ASR transcript. The script recomputes
   segment text and source-time checks and validates the revision-bound
   `output/audio-content-check.json`; caller-authored status booleans are not
   sufficient. Keep
   measured checks separate from listening evidence.
   The script verifies the transcript is bound to the decoded final audio and
   recomputes its text/timeline checks. It does not invoke or attest the ASR
   engine; record the actual OpenMontage transcription stage, engine/version,
   command and transcript hash in `progress-state.json`, and do not describe
   the QC as cryptographic proof of ASR provenance.
5. Treat transcript-to-EDL timing as a content/timeline check, not as proof
   that rendered mouth motion matches rendered dialogue. This QC does not
   detect rendered lip sync or generated-shot presence. Do not claim that its
   `gate=passed` proves either; complete the separate current-revision visual
   review of the actual candidate and record unsupported measurements as
   unavailable rather than inventing offsets.
6. Continue to platform Final Review, cover generation, and delivery only when
   the gate is `passed`. `degraded` is an explicit incomplete result, not a
   success claim; `blocked` requires recovery from the producing stage.

## Command contract

The independently generated `output/final-audio-transcript.json` must declare
`source="independent-final-track-asr"` and an `audio_sha256` computed from the
decoded first audio stream of the current candidate. Repeat that hash in
`output/audio-content-check.json`; QC decodes the candidate stream and rejects
stale or unrelated transcript evidence.

```bash
python3 skills/video-production-qc/scripts/render_qc.py \
  --video output/final.mp4 \
  --output output/quality-evidence.json \
  --revision-id "$REVISION_ID" \
  --subtitle-mode off \
  --listening-status unavailable \
  --edl output/edit-decision-list.json \
  --asr-transcript output/final-audio-transcript.json \
  --audio-content-check output/audio-content-check.json \
  --sync-evidence output/sync-evidence.json \
  --generated-video-manifest output/generated-video-manifest.json \
  --progress-state output/progress-state.json \
  --require-generated-video \
  --require-stage-lineage \
  --root .
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
- `sync-evidence.json` records transcript-coverage provenance; its filename
  does not mean it measures picture-to-dialogue synchronization. It records the actual transcription tool, version,
  command, candidate audio hash, EDL hash, revision, and per-segment output-time
  intervals. QC recomputes whether each ASR speech interval falls within its
  assigned EDL interval; it does not accept authored offsets or claim that this
  proves lip-sync or visual source correspondence.
- `audio-content-check.json` must cover every EDL segment and match the
  independent final-track ASR transcript. Each ASR segment must include
  `start_time`/`end_time` on the output timeline; each content row must set
  `dialogue_match`, `duplicate_phrase_check`, and `source_time_alignment` to
  true and name the exact transcript path. The report must include
  `duplicate_phrase_candidates` exactly as recomputed by QC and one
  `duplicate_phrase_reviews` record per candidate with matching `phrase` and
  `segment_ids`, `reviewed=true`, `decision="keep"`, and a non-empty
  reason explaining why the repetition is intentional. Accidental or uncertain
  repetitions block delivery and must be removed in an upstream edit before
  rerunning ASR; a summary
  boolean cannot replace per-candidate review. The QC script rechecks text, ASR
  output timing, source timing, revision, and input hashes.
- For the talking-head Montage Pack, pass `--require-generated-video` and the
  current manifest. QC recomputes asset provenance, revision, hash, decode and
  EDL-reference checks; it does not trust `generated-video-lint.json` alone.
  At least one reviewed AI-video asset must map to a core explanation unit.
- For the talking-head Montage Pack, pass `--require-stage-lineage` and the
  current `output/progress-state.json`. The lineage check recomputes event
  ordering, revision binding, and SHA-256 values for current required artifacts.
  It verifies internal consistency of Agent-authored records only; it is not an
  authenticated execution log and cannot be strengthened by file timestamps.
- This proves EDL adoption, not that the renderer included the shot in
  `final.mp4`; review the motion sample and final candidate for that separately.
- For the talking-head Montage Pack, QC recomputes the generated-video asset
  gate against the current EDL, revision, on-disk SHA-256 values, and `ffprobe`
  decodeability. At least one approved generated-video asset must be referenced
  by a core explanation segment; a standalone lint report is not trusted.
  Other Packs must provide their own equivalent contract rather than being
  forced to generate AI video.
- EDL-boundary versus ASR offset and jitter are timeline diagnostics only and
  must stay within one video frame under this contract. They do not establish
  picture-to-dialogue sync. Constant codec delay must be recorded instead of
  hidden by a second timing calculation.
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
