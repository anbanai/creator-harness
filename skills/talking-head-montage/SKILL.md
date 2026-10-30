---
name: talking-head-montage
description: Use for local OpenMontage production of source-led talking-head videos that require independently planned and generated video inserts, image inserts, motion graphics, subtitles, audio, and a file-based review gate.
---

# Talking-head Montage

Use this Skill only with the `talking-head-montage` Agent. It is a local plugin workflow, not an Anban Server task. OpenMontage is the production engine; this Skill owns the stable input, asset, review, recovery, and delivery contract around it.

## Runtime and Inputs

Require:

- `OPENMONTAGE_ROOT`: writable local OpenMontage project root.
- `talking-head-montage-input.json`: the only source-media index and brief.
- `talking-head-montage-policy.json`: non-secret policy and quality settings.
- A pre-created writable `output/` directory.
- FFmpeg and FFprobe.

Optional `OPENMONTAGE_VENV` selects the OpenMontage Python environment. Provider credentials are read only from the environment used by OpenMontage. Never write credentials, full environment dumps, or provider URLs containing secrets to artifacts.

The input file must identify the source video by an explicit path and may include a brief, target duration/aspect ratio, subtitle mode, music policy, source assets, and reference media. Do not discover media from directory listings, filenames, logs, or previous projects.

## Asset Classes

Treat these as independent decisions. They may appear alone or together in the same time window:

- `video_insert`: generated, retrieved, or user-provided motion footage used to show an object, action, process, place, texture, or change.
- `image_insert`: a still used for stable detail, object identity, texture, reference, or a pause in visual rhythm.
- `motion_graphic`: authored graphics, diagrams, captions, charts, transitions, or explanatory animation.

Do not model one class as a fallback for another. A generation failure is a runtime failure or recoverable stage state; it does not change the editorial requirement recorded in `asset-requirements.json`.

## Workflow

1. **Preflight and rough cut.** Read the input and policy, verify every declared source, probe duration/rotation/display dimensions/audio/video streams and both frame-rate fields, and keep originals read-only. Run OpenMontage capability discovery and its `hybrid` pipeline preflight. Use the available silence detector for candidate cuts, then independently run FFmpeg `silencedetect`. Record accepted and rejected candidates with source timecodes. Produce `rough-cut.mp4`, `transcript.json`, `edit-decision-list.json`, and `edit-strategy.md`.
2. **Semantic anchor edit.** Use OpenMontage transcript/scene/edit stages to build an understandable anchor cut before support layers. Preserve meaning, order, qualifications, numbers, causality, negation, and natural emphasis. Do not accept silence candidates without semantic and picture review. Produce `semantic-cut.mp4` and update the transcript, EDL, and strategy.
3. **Asset requirements.** Read the complete semantic transcript and map every information beat to an explicit visual job. Decide independently whether it needs video, image, motion graphics, or a combination. Record source and target timecodes, purpose, subject/action, duration, aspect ratio, camera/motion intent, safe zone, factual boundary, authenticity requirement, rights requirement, and whether generated audio must be muted. Write `output/asset-requirements.json`, `output/visual-plan-draft.json`, and `output/asset-source-policy.json`.
4. **Generate video inserts first.** For every `video_insert`, use OpenMontage `video_selector` and the provider registry from the `hybrid` pipeline. Run `provider_menu_summary()` before generation. Choose text-to-video, image-to-video, reference-to-video, or stock video from the actual capability envelope. Prefer references when object identity or continuity matters. Generate all planned video inserts before the motion sample; do not add an independent per-shot approval gate. Default generated-video audio to muted unless the visual plan explicitly requires ambient sound. Write `generated-video-manifest.json`, `generated-video-review.json`, and `asset-source-manifest.json`, including provider/model/parameters, prompt, output hash, source/target timecodes, rights state, and technical checks. The technical review records readability, duration, resolution, frame rate, corruption, target-description fit, unwanted people/text/brands/factual implications, mute requirement, and target-time usability; it does not reclassify the editorial asset.
5. **Prepare stills and graphics.** After video inserts are available, create or select image inserts and author motion graphics through the OpenMontage asset and composition stages. Graphics must explain or emphasize the spoken content, not invent facts. Keep faces, hands, products, and important actions unobstructed. Write the complete `visual-plan.json` and `motion-source-manifest.json`, retaining the independent asset classes and all provenance.
6. **Render the motion sample.** Give the approved semantic anchor plus all prepared video/image/graphic assets to OpenMontage `hybrid`. Use its source/support balance, subtitle, composition, reframe, audio-prep, and visual-QA guidance. Render `motion-sample.mp4` and write `motion-review.json`. The sample must be a real combined preview; do not substitute a still-only preview when video inserts are planned.
7. **File review gate.** Stop after the sample unless `output/review-decision.json` exists with `source="local-file-review"` and `status="approve"`. The only statuses are `approve` and `revise`; require a non-empty `revision_id` and `data_at`. For `revise`, read `feedback`, preserve verified upstream artifacts, increment the revision, and rerun only affected asset or composition stages. Never produce `final.mp4`, SFX, or BGM artifacts before approval.
8. **Sound and final delivery.** After approval, keep the original dialogue primary. Use `talking-head-sound-design` for restrained bundled CC0 SFX and measured mixing. Use only authorized local or OpenMontage music for BGM. Mute generated-video audio by default. Measure clean and final renders with FFmpeg `ebur128`; check sync, subtitle readability, opening, semantic continuity, occlusion, clipping, and voice clarity. Produce `final-picture.mp4`, `final.mp4`, `sfx-cues.json`, `bgm-plan.json`, `audio-source-manifest.json`, `quality-evidence.json`, `content-tags.json`, and `delivery-manifest.json`.

## Output and Recovery

Every JSON evidence file declares `schema_version`, `status` (`ready|partial|failed`), `source="talking-head-montage"`, `data_at`, `missing`, and applicable `evidence_paths`. Keep paths relative to `output/`.

Any hard stop writes both `output/failure-state.json` and `output/failure-diagnosis.md`. The JSON has `version`, `status="recoverable_failure"`, `stage`, `error_code`, a redacted non-empty `message`, and `resume_from`. Do not clear a failure state until the resumed run validates all required outputs. Preserve successful generations and verified hashes so recovery does not repeat expensive work.

`delivery-manifest.json` must list every final artifact and the source manifest, with relative path, role, byte size, SHA-256, and verification status. A file existing or a command exiting successfully is not sufficient evidence of quality.
