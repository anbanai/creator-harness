---
name: montage
description: Use when handling Anban Montage tasks that convert montage-input.json into an Montage adapter manifest, run the upstream Montage pipeline, and prepare normalized deliverables for Runtime registration.
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

## Required Files

- `output/montage-project.json`: adapter manifest sent to Montage
- `montage-tool-policy.json`: non-secret capability preferences configured by the server
- `montage-pipeline-defaults.json`: non-secret pipeline defaults configured by the server
- `output/delivery-manifest.json`: normalized Anban delivery manifest
- `output/final.mp4`: final video when the pipeline succeeds
- `output/failure-state.json` and `output/failure-diagnosis.md`: machine-readable failure and human-readable diagnosis when the pipeline cannot complete; use the invoking Agent’s failure/recovery contract.

## Rules

- Run all creative pipeline work through the bundled OpenMontage adapter and its provider registry.
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

## Adapter Manifest

Write `output/montage-project.json` with:

```json
{
  "task_id": "$TASK_ID",
  "project_id": "$PROJECT_ID",
  "brief": "",
  "pipeline_key": "default",
  "assets": [],
  "preferences": {},
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
