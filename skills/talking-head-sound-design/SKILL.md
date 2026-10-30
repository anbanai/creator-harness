---
name: talking-head-sound-design
description: Use when an approved talking-head motion sample needs restrained, event-synced sound effects from the bundled CC0 library and measured audio verification.
---

# Talking-head Sound Design

Add sound effects to the approved final picture while preserving its dialogue track. The bundled manifest is read from the read-only `third_party/motion-graphics` reference when present; only its CC0 bundled files are eligible. Mixkit/runtime-download entries and music are out of scope. This Skill does not select or provide background music; use only an authorized user-supplied track when the task explicitly includes BGM.

## Workflow

1. Run only after the Server has approved `output/motion-sample.mp4`. Base cues on visible events in the approved `visual-plan.json`; do not add a sound to every cut. Prefer no cue to a decorative or distracting one.
2. Create `output/sfx-cues.json` with the schema in [references/cue-and-mix-contract.md](references/cue-and-mix-contract.md). Select only CC0 categories/assets in the upstream bundled manifest. Use an explicit `asset_id` when a non-default take is needed. Keep effects below speech and leave dialogue timing unchanged.
3. Run the bundled `scripts/sound_pass.py` against the final picture render and `output/sfx-cues.json`. The script uses only packaged CC0 assets and local FFmpeg tools; it must not fetch media or accept arbitrary asset paths.
4. Record every asset actually used in `output/audio-source-manifest.json`, including asset ID, source URL, CC0 1.0, SHA-256, cue time, gain and attribution. Preserve the measured before/after integrated LUFS and true peak values in `output/quality-evidence.json`.
5. Require the renderer's per-cue `audibility_check`. Any `inaudible` cue is a failure requiring a gain correction or removal; `marginal` cues remain a warning and cannot be described as verified by measurement alone. Review the generated cue report and listen to its listed verification points when audio monitoring is available. If listening is unavailable, mark it as unverified; measurements do not establish subjective quality.

Do not apply music beat-grid alignment without a user-provided, authorized music track. Never claim the result sounds good based only on measurements. Keep the source video unchanged.
