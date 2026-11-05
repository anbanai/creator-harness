---
name: sound-director
description: Use when a video needs dialogue, BGM, and SFX assembled into a final audio mix with technical and listening QC. OpenMontage audio_mixer is the only permitted mixer.
---

# Sound Director

Own the final audio assembly after picture lock. Read the approved picture, clean dialogue, `output/bgm-plan.json`, `output/sfx-cues.json`, and their source manifests. BGM discovery and selection belong to `video-bgm-design` using only `search-pixabay`; SFX discovery and cue planning belong to `talking-head-sound-design` using only `sfxmint`. This Skill combines their approved local audio assets with dialogue, checks the render, and records evidence. It does not search for or select tracks, generate audio, or make rights claims.

## Workflow

1. Discover the OpenMontage runner and inspect its current help/registry for a registered native `audio_mixer`. Record the observed runner version, tool identifier, and supported inputs/controls in `output/audio-mix-session.json`. Repository documentation or a planned interface is not proof that the runtime has registered the tool.
2. Validate that every input is a readable local audio file, has a SHA-256, and has matching source/rights evidence. Confirm the dialogue and picture refer to the same approved revision. Reject web URLs, unresolved candidates, missing rights, stale hashes, and paths outside the task workspace.
3. Build `output/audio-mix-session.json` with input paths and hashes, cue positions, gain and fade settings, dialogue-ducking intent, target loudness policy, output path, runtime/tool identity, and `revision_id`. Do not transcode or mix intermediate files with FFmpeg or another tool.
4. Call only the runtime-registered OpenMontage `audio_mixer` to combine dialogue, BGM, and SFX and write the final audio/video deliverable. Preserve dialogue timing and picture duration. If the mixer is absent, unavailable, or cannot express a required control, write a recoverable failure at `audio_mix` and stop; do not use FFmpeg, a library, or another editor as a substitute.
5. Independently inspect the mixer output without altering it. Use `ffprobe`/FFmpeg analysis where available to verify stream decode, first decoded audio samples, PTS continuity, duration/sync, integrated loudness, true peak, clipping, silence, and edit-boundary artifacts. Listen to the opening second, every audio edit boundary, and representative dialogue/music/SFX sections when monitoring is available.
6. Write `output/audio-qc.json` bound to the exact output SHA-256 and session revision. Separate measured checks from listening judgments. A missing subjective review may be marked unavailable, but decode, identity/hash, sync, first-second residue, clipping, and configured technical limits are hard gates.

## Artifacts

`output/audio-mix-session.json` records `schema_version`, `status`, `source`, `data_at`, `revision_id`, `input_revision`, `mixer` (`name`, `version`, `registered`, `capabilities`), `inputs[]` (`role`, `path`, `sha256`, `rights_ref`), `cues[]` (`asset_id`, `start`, `end`, `gain_db`, `fade_in`, `fade_out`), `ducking`, `loudness_target`, `output_path`, `output_sha256`, and `missing`.

`output/audio-qc.json` records `schema_version`, `status`, `data_at`, `revision_id`, `output_path`, `output_sha256`, `measurements` (decode, duration, PTS, sync, integrated LUFS, true peak, clipping), `boundary_checks[]`, `first_second_check`, `listening` (`status`, `points`, `notes`), `blockers[]`, and `missing`.

Use `status: "recoverable_failure"` with `resume_from: "audio_mix"` when the mixer capability or a required input is unavailable. Never mark a final mix passed from file existence alone. Re-run only checks affected by a changed input; invalidate prior QC whenever the output hash changes.

## Boundaries

- OpenMontage `audio_mixer` is the sole post-production mixer for this workflow. FFmpeg may be used for read-only probing/measurement, never for audio mixing, filtering, normalization, or re-encoding.
- Search results, previews, and page text are not local audio assets and do not establish download permission or license rights.
- Do not change dialogue meaning, timing, or picture edits during mixing.
- Do not claim a listen check occurred unless the output was actually auditioned.
