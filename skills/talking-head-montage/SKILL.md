---
name: talking-head-montage
description: Use when OpenMontage must turn a recorded talking-head source into a hybrid video with independently planned video inserts, images, graphics, subtitles, and final audio.
---

# OpenMontage Talking-Head Production

This Skill owns the media workflow. OpenMontage is the editor, compositor, provider selector, and renderer. Use its native hybrid pipeline; do not substitute another editing workflow.

## Inputs

- OPENMONTAGE_ROOT: the writable OpenMontage project root and working directory.
- Optional OPENMONTAGE_VENV: the Python environment for that checkout.
- talking-head-montage-input.json: source video, brief, references, and output preferences.
- talking-head-montage-policy.json: non-secret provider, quality, and rights policy.
- A writable output/ directory.

Read the two JSON inputs as structured data. Do not discover source media from directory listings or prior runs. Keep declared source media read-only.

## Native OpenMontage Toolchain

Run these checks from OPENMONTAGE_ROOT before editing:

~~~bash
OM_PYTHON=python3
[ -z "${OPENMONTAGE_VENV:-}" ] || OM_PYTHON="$OPENMONTAGE_VENV/bin/python"
"$OM_PYTHON" -c 'from tools.tool_registry import registry; registry.discover(); print(registry.provider_menu_summary())'
"$OM_PYTHON" -c 'from lib.pipeline_loader import load_pipeline; print(load_pipeline("hybrid"))'
~~~

The first command is the provider capability source of truth. The second confirms that the installed revision contains hybrid. Use the OpenMontage runner exposed by this checkout: discover its --help, pyproject, or project command if the entry point differs. Do not invent a second runner or call provider HTTP APIs. Record the exact runner command and observed revision in output/progress-state.json.

Use OpenMontage transcript, scene, edit, video_selector, asset, composition, audio-prep, and visual-QA stages. Use local ffprobe for source inspection, local FFmpeg for independent silence verification and final audio measurement, and OpenMontage for all timeline and render decisions.

## Asset Planning

After the semantic anchor is understandable, plan each information beat independently. asset_classes may contain one or more of:

- video_insert: motion that shows an object, action, process, place, texture, or change.
- image_insert: a stable object, detail, reference, or texture.
- motion_graphic: a diagram, comparison, caption treatment, process explanation, or transition.

Record source and target timecodes, visual job, duration, framing, movement, safe zone, factual boundary, authenticity requirement, rights state, and audio policy. Never turn a failed video generation into an image or graphic requirement.

## Workflow

1. Inspect and rough cut. Use ffprobe to record streams, duration, rotation, display dimensions, both frame-rate fields, time base, and audio layout. Run the OpenMontage silence/transcript stages to produce candidate cuts, then run FFmpeg silencedetect independently. Compare candidates on source timecodes; silence is evidence, not an automatic deletion decision. Produce rough-cut.mp4, transcript.json, edit-decision-list.json, and edit-strategy.md.
2. Semantic anchor. Use OpenMontage transcript, scene, and edit stages to preserve meaning, order, negation, numbers, conditions, causality, and uncertain speech. Keep the source/sequence time mapping in the EDL. Produce semantic-cut.mp4 and update the transcript, EDL, and strategy.
3. Plan support assets. Write asset-requirements.json, visual-plan-draft.json, and asset-source-policy.json. Keep video, image, and graphic decisions independent; a time window may contain any combination.
4. Generate video inserts. Call provider_menu_summary first. For each video_insert, use the registered OpenMontage video_selector operation that matches the available capability: text-to-video, image-to-video, reference-to-video, or authorized stock. Prefer references when identity or continuity matters. Generate every planned video insert before composition. Record provider, model, parameters, prompt, output hash, rights, source/target timecodes, and technical review in generated-video-manifest.json, generated-video-review.json, and asset-source-manifest.json. Mute generated audio unless the plan explicitly requires ambient sound.
5. Prepare images and graphics. Use OpenMontage asset and composition stages after video inserts are present. Keep faces, hands, products, and important actions visible. Write visual-plan.json and motion-source-manifest.json with provenance for the source video, generated videos, user media, images, and graphics.
6. Render the sample. Give the semantic anchor and all prepared assets to the hybrid pipeline. Render a combined motion-sample.mp4 with subtitles and the planned visual hierarchy, then write motion-review.json. A still-only preview is invalid when a video insert is planned.
7. Review and resume. Stop until output/review-decision.json has source=local-file-review, status=approve, a non-empty revision_id, and data_at. For revise, read feedback, increment the revision, preserve verified upstream files, and rerun only affected OpenMontage stages.
8. Finish audio and delivery. After approval, use talking-head-sound-design only for event-synced local CC0 SFX. Use an authorized local/OpenMontage music source when BGM is requested. Keep source dialogue primary and generated-video audio muted by default. Measure clean and final renders with FFmpeg ebur128, then write the final video, audio evidence, tags, and delivery manifest.

## Outputs

The sample gate requires:

rough-cut.mp4, semantic-cut.mp4, transcript.json, edit-decision-list.json, edit-strategy.md, asset-requirements.json, visual-plan-draft.json, asset-source-policy.json, generated-video-manifest.json, generated-video-review.json, asset-source-manifest.json, visual-plan.json, motion-sample.mp4, motion-review.json, and motion-source-manifest.json.

After approval, also produce final-picture.mp4, final.mp4, sfx-cues.json, bgm-plan.json, audio-source-manifest.json, content-tags.json, delivery-manifest.json, and quality-evidence.json.

Every JSON evidence file has schema_version, a finite status, source=talking-head-montage, data_at, missing, and relevant evidence_paths. delivery-manifest.json records relative paths, roles, byte sizes, SHA-256 hashes, and verification status.

## Failure

On a missing input, unavailable registry capability, provider failure, corrupt media, failed render, or missing verification, write both output/failure-state.json and output/failure-diagnosis.md. The JSON includes version, status=recoverable_failure, stage, error_code, a redacted non-empty message, and resume_from. Preserve verified outputs and resume from the named stage; never change an editorial asset class merely because a provider failed.
