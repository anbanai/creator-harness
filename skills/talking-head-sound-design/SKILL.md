---
name: talking-head-sound-design
description: Use when an approved talking-head motion sample needs restrained, event-synced sound effects from the bundled CC0 library and measured audio verification. Covers sound effects only — background music is owned by the parent Agent's dedicated BGM stage and video-bgm-design.
---

# Talking-head Sound Design

For domestic public-web discovery and its rights boundary, read
`../video-bgm-design/references/domestic-web-media.md` before using any
non-bundled effect.

Add a restrained, event-synced supporting audio layer to the approved final picture while preserving its dialogue track. SFX may accompany real talking-head footage, AI-generated video, documentary/source media, and graphic overlays; it is not a primary visual source and never replaces a required action, result, dialogue, or BGM. Use the bundled CC0 manifest first; when it has no suitable effect, the Agent may search domestic public web pages through a registered provider-neutral web-media capability and download only an asset with explicit, verifiable reuse rights. A web result without rights evidence remains a candidate and cannot be mixed. Do not bypass login, CAPTCHA, paywalls, hotlink restrictions, robots, or site terms, and do not use arbitrary `curl`/`wget`/runtime-download URLs. Record page URL, license text, access time, file hash, and download permission in the audio source manifest. Mixkit/runtime-download entries and all music tracks are out of scope. Background music is out of scope: the parent Agent runs a separate BGM stage through `video-bgm-design`, which owns per-chapter track selection, switching, licensing, and ducking. This Skill must never treat an SFX skip or a missing SFX cue as permission to omit that BGM stage, and it must never mix music into the final mix. Use a cue only when a visible action, appearance, emphasis, transition, or attention change benefits from sound; an explicit empty cue list is valid. Every visual insert is silent unless its cue is explicitly declared; inspect the first decoded audio frame and every edit boundary for stray source audio before delivery.

## Workflow

1. Run only after the Server has approved `output/motion-sample.mp4`. Base cues on visible events in the approved `visual-plan.json`; do not add a sound to every cut. Prefer no cue to a decorative or distracting one.
2. Create `output/sfx-cues.json` with the schema in [references/cue-and-mix-contract.md](references/cue-and-mix-contract.md). Select only CC0 categories/assets in the upstream bundled manifest. Use an explicit `asset_id` when a non-default take is needed. Keep effects below speech and leave dialogue timing unchanged.
3. Run the bundled `scripts/sound_pass.py` against the final picture render and `output/sfx-cues.json`. The script uses only packaged CC0 assets and local FFmpeg tools; it must not fetch media or accept arbitrary asset paths.
4. Record every asset actually used in `output/audio-source-manifest.json`, including asset ID, source URL, CC0 1.0, SHA-256, cue time, gain and attribution. Preserve the measured before/after integrated LUFS and true peak values in `output/quality-evidence.json`.
5. Require the renderer's per-cue `audibility_check`. Any `inaudible` cue is a failure requiring a gain correction or removal; `marginal` cues remain a warning and cannot be described as verified by measurement alone. Keep SFX below dialogue and enforce the configured relative ceiling; if an effect is inaudible, replace or remove it before repeatedly increasing gain. Review the generated cue report and listen to its listed verification points when audio monitoring is available. If listening is unavailable, mark it as unverified; measurements do not establish subjective quality.

Do not apply music beat-grid alignment; the music layer is handled by the BGM stage. Never claim the result sounds good based only on measurements. Keep the source video unchanged.
