## Cue input

`output/sfx-cues.json` is a JSON object with `schema_version: "1.0"`, `status: "ready"` or `"skipped_no_cues"`, `source: "talking-head-editor"`, `data_at`, `missing: []`, and a `cues` array. Each ready cue contains a unique `cue_id`, `time_seconds`, a bundled `category`, a concise visible `event` and `purpose`, and optional `gain_db` from -36 to -18. Time values are in the final picture's timeline. Supported categories are `whoosh`, `click`, `pop`, `riser`, `impact`, and `tick`. A `skipped_no_cues` file must contain an empty `cues` array and a concise `reason`.

Use `whoosh` sparingly for a substantial transition or movement, `pop` for a card appearing, `impact` for a meaningful reveal, and `click` or `tick` only for a clear interface-like action. Do not use risers as generic background texture. No cue should mask speech or create an unsupported emotional claim.

## Render contract

Invoke the packaged script with the final picture render as input and `output/final.mp4` as destination. It preserves the first dialogue audio stream, mixes the selected bundled effect at its cue time, and starts whooshes up to two frames before their visual event. It writes the applied asset identity, cue offsets, gains, source and destination hashes, integrated LUFS and true peak measurements into the same `sfx-cues.json` file.

The script retries with quieter effects if the mix raises true peak above both the source peak and -1 dBTP. It fails rather than replacing the destination when validation, rendering, or measurement fails. Inspect the final MP4 with FFprobe and include pre-render and post-render measurements in `quality-evidence.json`; do not infer unchanged loudness from copied dialogue.

An empty cue list is valid only when the visual plan has no event that benefits from sound. Record `status: "skipped_no_cues"`, a concise `reason`, and an empty `cues` array; the renderer copies the approved picture without re-encoding and records the measured before/after evidence. Do not synthesize a placeholder sound.
