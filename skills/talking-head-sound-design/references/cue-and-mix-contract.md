## Cue input

`output/sfx-cues.json` is a JSON object with `schema_version: "1.0"`, `status: "ready"` or `"skipped_no_cues"`, `source: "ip-explainer"`, `data_at`, `missing: []`, and a `cues` array. Each ready cue contains a unique `cue_id`, `time_seconds`, an authorized local `asset_id`, a concise visible `event` and `purpose`, `gain_db` from -36 to -6, and SFXMint evidence: source identifier/page, license, local file path, file SHA-256, and any required listening/approval state. Time values are in the final picture's timeline. A search result or preview is only a candidate, not a local asset. A `skipped_no_cues` file must contain an empty `cues` array and a concise `reason`.

Use SFXMint only for SFX discovery and retrieval. Choose a sound only when a visible transition, movement, appearance, or emphasis benefits from it; do not add one to every cut. Do not use risers as generic background texture. No cue should mask speech or create an unsupported emotional claim.

## Render contract

This file is an input to Sound Director, not a render command. Only OpenMontage's runtime-registered `audio_mixer` may combine SFX with dialogue and BGM. The mixer session records source paths and hashes, cue offsets, gains, and output hash.

Sound Director records per-cue audibility checks and full-mix measurements in `output/audio-qc.json`. Reject inaudible cues or revise/remove them; do not infer unchanged loudness from unchanged dialogue stems.

An empty cue list is valid only when the visual plan has no event that benefits from sound. Record `status: "skipped_no_cues"`, a concise `reason`, and an empty `cues` array. Sound Director still owns the final audio render and QC. Do not synthesize a placeholder sound.
