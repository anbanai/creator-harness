---
name: montage
description: Use when handling Anban video generation tasks that convert montage-input.json into an adapter manifest, run the managed video pipeline, and prepare normalized deliverables for Runtime registration.
---

# Montage Skill

Use this skill only for Anban `montage` tasks.

遇到素材映射、pipeline 选择或交付格式不确定时，先读 [references/examples.md](references/examples.md)。

## Inputs

- `$TASK_ID`
- `$PROJECT_ID`
- `$ANBAN_MONTAGE_SUBMODULE_PATH` (fixed to the writable `/workspace/openmontage` project root for managed tasks)
- `montage-input.json`
- `montage-tool-policy.json`
- `montage-pipeline-defaults.json`
- project profile from Anban MCP
- OpenMontage provider secrets from environment variables only
- Runtime identity: complete Server context (`$TASK_ID`, `$PROJECT_ID`, `/workspace/openmontage`, all three Montage input JSON files, and pre-created `output/`) establishes `managed`; otherwise the caller must explicitly provide `runtime_mode=local_test`. Missing/partial managed context without that explicit local-test declaration is invalid.

## Required Files

- `output/montage-project.json`: adapter manifest sent to Montage
- `montage-tool-policy.json`: non-secret capability preferences configured by the server
- `montage-pipeline-defaults.json`: non-secret pipeline defaults configured by the server
- `output/delivery-manifest.json`: normalized Anban delivery manifest
- `output/final.mp4`: final video when the pipeline succeeds
- `output/failure-state.json` and `output/failure-diagnosis.md`: machine-readable failure and human-readable diagnosis when the pipeline cannot complete; use the invoking Agent’s failure/recovery contract.

## Rules

- A complete Server runtime context is the production contract; do not require a redundant `runtime_mode` field from the caller. If MCP, credentials, the required directory, input, provider capability, or render capability is unavailable, write both failure artifacts and stop. Never silently substitute local Whisper, an ad-hoc FFmpeg workflow, a fixture, or a repository checkout.
- `runtime_mode=local_test` is allowed only when explicitly set by the caller. Record every degradation in `output/progress-state.json`, write `output/failure-diagnosis.md` when the degradation affects delivery, and never label a degraded local test as managed success.
- Run all creative pipeline work through the bundled OpenMontage adapter and its provider registry.
- Treat `montage-input.json` as the frozen, Server-validated creation contract. Use its selected `pipeline_key`, `preferences.playbook_key`, `output_profile_key`, and complete `output_profile` exactly as supplied; do not infer or replace them from the brief, task message, project profile, or local defaults. An empty playbook key means automatic selection by OpenMontage.
- The output profile is one indivisible specification: preserve its key, width, height, and aspect ratio in the adapter input and configure rendering to match all four values. Do not infer aspect ratio from message text or silently fall back to another platform format.
- If a required selection is absent, unknown, or internally inconsistent with the frozen capability catalog, write `output/failure-state.json` with error code `invalid_montage_configuration`, write `output/failure-diagnosis.md` with the invalid field and a concise reason, then stop before starting the pipeline. Do not substitute a default pipeline, playbook, or output profile.
- The managed runtime provides a task-private workspace, structured `TASK_ID`, and a pre-created `output/`. Do not create, discover, move, or rename the output directory.
- Run managed Montage commands from `/workspace/openmontage`, with `$ANBAN_MONTAGE_SUBMODULE_PATH` fixed to that project root, and write final or resume-critical artifacts through its runtime-provided `output` link.
- Do not expose raw Montage pipeline internals as Anban stable schema.
- Do not modify the immutable image template at `/opt/montage-template`.
- Do not fall back to a repository checkout during managed execution.
- Secrets only arrive through environment variables. Never write provider keys to `output/montage-project.json`, task files, logs, MCP feedback, or failure diagnosis.
- Before production, run the OpenMontage registry capability check (`provider_menu_summary()` or the equivalent registry command) and compare the selected pipeline's required/optional tools with the configured provider envelope.
- Let OpenMontage selectors/registry choose concrete providers from the configured policy and real availability; do not hardcode Anban-side provider routing.
- Use Anban MCP for project profile and feedback. Write final files to explicit output paths and verify them against delivery-manifest.json; the Runtime uploads and registers files after execution. There is no generic file-registration MCP tool.
- 托管任务自动批准常规 creative gate，但不得跳过 checkpoint；每个 checkpoint 仍执行，并在 Montage decision log 中记录 `anban_managed_task` 预授权来源、自动选择和结果。
- Authentication, required capability, hard budget, safety, source corruption, or impossible-delivery blockers must write both failure artifacts and terminate. Full-run preauthorization never overrides these blockers.
- Do not expose the Backlot page directly. Retain only stable delivery files and structured checkpoint, timeline, and run-log artifacts required by Anban.
- Treat the following as delivery gates, not advisory checks: the final audio/video duration difference is at most one video frame (about 33 ms at 30 fps); every cut boundary is on the video frame grid; and no segment is assembled through repeated per-segment AAC encoding. Prefer one `filter_complex` pass for `trim`/`atrim`/`concat`, with `tpad` plus `trim` enforcing exact frame counts. Also measure sync at each segment's start and end, every 30 seconds within longer continuous segments, and across the beginning, middle, and end of the full video. Record source and composition timestamps, the observable sync anchor and measurement method, measured offset, and maximum absolute offset in `quality-evidence.json`; each observable anchor must be within one video frame. Snapped cut points and matching total durations do not prove sync throughout the video. Repair and re-render any out-of-tolerance segment; if the runtime cannot produce or verify the checkpoints, stop with a recoverable failure.
- A complete run must produce and verify every delivery artifact the owning Pack declares. Music: the Pack's BGM plan with its per-chapter cue map, authorized sources (path/source/license/SHA-256/time range/gain/fades), and a final video containing the reviewed BGM track. Multiple tracks per video are expected when chapters change emotion or purpose; each switch needs its reason, its transition decision, and its licensing evidence. BGM may be skipped only when the user explicitly requests silence; an Agent or Plan Review cannot waive this gate, and `skipped_no_cues` is never a valid BGM status. Subtitles: the Pack's caption artifacts together with their QC gate. Cover: when the Pack declares a cover, it is the final production step and gates the final delivery manifest. The craft rules for music and subtitles live in `video-bgm-design` and `video-subtitle-design`; this Skill only enforces that the Pack-declared artifacts exist and pass.

## Adapter Manifest

Write `output/montage-project.json` with:

```json
{
  "task_id": "$TASK_ID",
  "project_id": "$PROJECT_ID",
  "brief": "",
  "pipeline_key": "<pipeline_key from montage-input.json>",
  "output_profile_key": "<output_profile_key from montage-input.json>",
  "output_profile": {
    "key": "<key>",
    "display_name": "<display_name>",
    "width": 1080,
    "height": 1920,
    "aspect_ratio": "9:16"
  },
  "assets": [],
  "preferences": { "playbook_key": "<playbook_key from montage-input.json, or empty for automatic selection>" },
  "limits": {},
  "tool_policy": {},
  "pipeline_defaults": {},
  "env_keys": {},
  "approval_policy": {
    "mode": "auto",
    "source": "anban_managed_task",
    "scope": "full_run"
  },
  "output_dir": "output"
}
```

The adapter maps this stable manifest into the current upstream Montage project format. Keep every upstream checkpoint and decision log, while using `approval_policy` as full-run authorization for ordinary creative choices.
