---
name: talking-head-video-generation
description: Use when IP 知识讲解 or 科普口播 needs AI 演示镜头 (generated explainer footage) to show a process, action or state change. Generates, reviews and adopts core video assets for the ip-explainer Agent and other knowledge-editing workflows; does not own end-to-end editing or generic text-to-video tasks.
---

# 讲解镜头生成 · Explainer Footage

This Skill owns generation and adoption of AI video for knowledge explainers, including 知识 IP 剪辑 / IP Explainer. Read [references/asset-contract.md](references/asset-contract.md) before generation, then run `scripts/validate_generated_video.py` before composition and final QC.

## Required outcome

- Generate an AI-video asset only when the selected visual unit is `demonstration` and available real video cannot show the required action or state change. Do not generate merely to satisfy a quota; zero generated clips is valid when real footage, source images/documents, or graphics express the unit more clearly.
- Invoke a registered OpenMontage video-generation capability and record its actual result. A registry entry, prompt, queued job, failed request, stock clip, still, or motion graphic is not a generated-video success.
- Review the rendered asset for decodeability, exact object count/identity, visible action and result, continuity, contact/physics, tail-frame motion, semantic reversal, artifacts, factual implication, and fit to the planned shot. Reject and regenerate or revise the shot when any hard check fails.
- Reference each approved asset by stable `asset_id` in the current EDL. The final candidate must derive from that EDL and contain those generated shots. The current validator verifies asset provenance, full decodeability, revision binding, review, and EDL adoption; it does not inspect final-render frames for generated-shot presence, so do not claim that its pass proves final-render inclusion.

## Workflow

1. Read the explanation plan and select only a unit whose `fallback_reason` says real footage cannot show the needed action. Specify the visible subject, exact object count, starting state, action, end state, tail-frame behavior, and continuity with adjacent shots in the existing visual plan. Approve composition/keyframes before expensive generation; a camera move around a static object does not satisfy a required demonstration. Keep claims grounded in the source evidence. Label illustrative generations so they cannot be mistaken for documentary evidence.
2. Probe actual registered generation capability and execute through the OpenMontage-native pipeline. Save the request/result identifiers, provider/model, parameters, prompt or prompt hash, generation status, asset path, SHA-256, intended unit, and rights/provenance in `output/generated-video-manifest.json`.
3. Decode and inspect each candidate. Check whether the intended action and result are actually visible at playback speed, including exact object count/identity, contact, direction, continuity, tail-frame motion, and semantic direction; attractive first/last frames alone are insufficient. Record review outcome, revision, inspected ranges, and defects in `output/generated-video-review.json`. Failed or merely queued assets do not count.
4. Add accepted generated assets to the EDL's visual asset references and run the validator. The validator fails closed on absent/failed generation, stale revision, missing file/hash, failed full decode, unapproved review, or an asset not referenced by a core EDL segment.
5. Re-run the gate after any EDL, asset, or render revision change. Never hand-edit a gate report to pass.

## Failure and evidence

If registered generation is unavailable, generation fails, no candidate passes review, or no approved candidate is adopted into the EDL, write the owning Agent's recoverable failure artifacts with `resume_from=video_generation` (or the producing review/composition stage). Do not substitute still images, HTML animation, ordinary B-roll, or a claim that generation was attempted.

The machine gate recomputes internal consistency of the declared generation metadata, file integrity, decodability, revision binding, review state, and EDL adoption. It cannot authenticate provider execution or reviewer identity; those require Server/provider evidence or an independent review record. It does not prove aesthetic quality, explanatory clarity, factual truth, audience retention, or virality; keep those as separate reviews and evidence.
