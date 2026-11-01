# Render gate contract

`render_qc.py` returns one check object per row. A check is `passed`, `blocked`,
or `unavailable`; a blocker cannot be offset by an average quality score.

| ID | Severity | Requirement |
|---|---|---|
| `video_stream` | blocker | At least one decodable video stream |
| `audio_stream` | blocker | Dialogue/audio stream exists |
| `decode` | blocker | Full FFmpeg null decode succeeds |
| `audio_energy_windows` | blocker | Every 10-second window has energy |
| `max_silence_gap` | blocker | No silent interval over 0.5 seconds |
| `tail_voice_energy` | blocker | Final 0.5 seconds contain voice energy, unless explicitly exempted |
| `freeze_detect` | blocker | No frozen-frame interval |
| `duration_delta` | blocker | Audio/video duration difference <= one video frame |
| `sync_evidence` | blocker | Reference checkpoints are present |
| `sync_jitter` | blocker | Maximum absolute offset and jitter <= one video frame |
| `subtitle_stream` | blocker | Matches the declared subtitle mode |

The Pack declares whether the final media contains a subtitle stream. A
sidecar-caption delivery normally uses `subtitle_mode=off` for the MP4 and
must still provide the Pack's caption QC and timing evidence. A burn-in or
embedded-caption delivery may use `required` and must add its own ASR timing
evidence.

`gate=passed` requires all blocker checks to pass and listening status to be
`complete`. A report with passing measurements but incomplete listening is
`degraded` and cannot be reported as a fully verified delivery.
