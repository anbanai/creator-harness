# Quality evidence schema

The report is revision-scoped and file-backed:

```json
{
  "schema_version": "1.0",
  "source": "video-production-qc",
  "revision_id": "rev-001",
  "gate": "passed|blocked|degraded",
  "checks": [
    {
      "id": "duration_delta",
      "status": "passed|blocked|unavailable",
      "severity": "blocker|warning",
      "method": "ffprobe",
      "measured": 0.012,
      "threshold": "<= one video frame",
      "evidence_paths": []
    }
  ],
  "measurement": {},
  "listening": {
    "status": "complete|partial|unavailable",
    "windows": []
  },
  "missing": [],
  "evidence_paths": []
}
```

The separate `output/audio-content-check.json` is revision-bound and must
include SHA-256 hashes of `final.mp4`, its decoded first audio stream, the EDL,
and the final-track ASR transcript. The ASR file must declare
`source="independent-final-track-asr"`, the same decoded audio hash, and
per-segment `start_time`/`end_time` on the output timeline. Each EDL segment
must have one row with `segment_id`, expected and ASR text, `dialogue_match`,
`duplicate_phrase_check`, `source_time_alignment`, and an ASR evidence path
that names the supplied transcript. The top level must include
`duplicate_phrase_candidates`, exactly matching QC's recomputation from ASR,
and `duplicate_phrase_reviews`, with one row per candidate containing the same
`phrase` and `segment_ids`, `reviewed=true`, `decision="keep"`, and a non-empty
reason that explains why the repetition is intentional. Accidental or
uncertain repetitions must be removed upstream and ASR regenerated. A summary
boolean alone does not attest
that candidates were reviewed. QC decodes the candidate's first audio
stream and compares its hash with both the transcript and the evidence before
comparing text against the supplied EDL and ASR transcript, checking ASR
output timing against EDL output frames, and recomputing source audio/video
time deltas; the report's
`audio_content_check` is blocked if any segment is missing, stale, or unequal.

`sync-evidence.json` is a compatibility name for transcript-coverage
diagnostics; it is not proof of audiovisual synchronization. It records the
transcription tool and version, command, current revision, candidate and
decoded-audio hashes, EDL and transcript hashes, plus one output interval per
EDL segment. `render_qc.py` recomputes the segment coverage and requires each
ASR speech interval to fall within its assigned EDL output interval, within one
frame. Speech intervals can be shorter than the edit interval. This proves
transcript coverage and attribution to the current candidate, not that the
transcript is correct, that the renderer used the intended source frames, or
that visible mouth motion matches dialogue. QC ignores caller-authored offset
values and does not run ASR or a rendered-lip-sync detector.

`measurement.status` describes deterministic checks only. `listening.status`
describes actual playback or monitored review. Do not collapse them into one
boolean.
