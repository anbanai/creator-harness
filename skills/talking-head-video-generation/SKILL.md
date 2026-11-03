---
name: talking-head-video-generation
description: Use when producing knowledge-led talking-head shorts where AI-generated video must be an actual core visual, not an optional or planned asset.
---

# Talking-Head Video Generation

This Skill owns generation and adoption of AI video in the talking-head Montage workflow. Read [references/asset-contract.md](references/asset-contract.md) before generation, then run `scripts/validate_generated_video.py` before composition and final QC.

## Required outcome

- Generate at least one AI-video asset that carries a core explanation unit. Prefer multiple distinct clips when they materially improve the story; do not pad the edit with irrelevant generations.
- Invoke a registered OpenMontage video-generation capability and record its actual result. A registry entry, prompt, queued job, failed request, stock clip, still, or motion graphic is not a generated-video success.
- Review the rendered asset for decodeability, subject/action match, continuity, artifacts, factual implication, and fit to the planned shot. Reject and regenerate or revise the shot when it fails.
- Reference each approved asset by stable `asset_id` in the current EDL. The final candidate must derive from that EDL and contain those generated shots. The current validator verifies asset provenance, full decodeability, revision binding, review, and EDL adoption; it does not inspect final-render frames for generated-shot presence, so do not claim that its pass proves final-render inclusion.

## Workflow

1. Read the explanation plan and select the core unit where movement clarifies a process, transformation, spatial relation, or otherwise hard-to-see concept. Keep claims grounded in the source evidence. Label illustrative generations so they cannot be mistaken for documentary evidence.
2. Probe actual registered generation capability and execute through the OpenMontage-native pipeline. Save the request/result identifiers, provider/model, parameters, prompt or prompt hash, generation status, asset path, SHA-256, intended unit, and rights/provenance in `output/generated-video-manifest.json`.
3. Decode and inspect each candidate. Record review outcome, revision, inspected ranges, and defects in `output/generated-video-review.json`. Failed or merely queued assets do not count.
4. Add accepted generated assets to the EDL's visual asset references and run the validator. The validator fails closed on absent/failed generation, stale revision, missing file/hash, failed full decode, unapproved review, or an asset not referenced by a core EDL segment.
5. Re-run the gate after any EDL, asset, or render revision change. Never hand-edit a gate report to pass.

## Failure and evidence

If registered generation is unavailable, generation fails, no candidate passes review, or no approved candidate is adopted into the EDL, write the owning Agent's recoverable failure artifacts with `resume_from=video_generation` (or the producing review/composition stage). Do not substitute still images, HTML animation, ordinary B-roll, or a claim that generation was attempted.

The machine gate recomputes internal consistency of the declared generation metadata, file integrity, decodability, revision binding, review state, and EDL adoption. It cannot authenticate provider execution or reviewer identity; those require Server/provider evidence or an independent review record. It does not prove aesthetic quality, explanatory clarity, factual truth, audience retention, or virality; keep those as separate reviews and evidence.
