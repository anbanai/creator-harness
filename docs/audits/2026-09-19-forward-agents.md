# Harness agent forward test (reverification)

Scope: read-only simulation of the revised canonical packs under `harness/packs`,
their referenced skills, and the managed runtime finalizer. No MCP call, upload,
media command, or repository mutation was made.

## Result

The corrected contracts now handle the requested forward paths consistently across
Claude and Codex:

| Scenario | Forward result | Assessment |
| --- | --- | --- |
| Moments: runtime project differs from default | Both variants resolve `PROJECT_ID` before `ANBAN_DEFAULT_PROJECT` | Correct. `harness/packs/moments/agent.claude.md` and `agent.codex.toml` prohibit default override. |
| Moments: no ID and multiple unrelated projects | Both write `output/failure-state.json` with `stage=project_resolution` and stop | Correct, host-consistent ambiguity failure. |
| Live-slicer: usable local video and accepted presigned PUT | Probe/extract, signed upload, TingWu analysis, deterministic plan, local exports, optional CapCut, manifest/report | Correct. `curl` is limited to the signed blob transfer and is not a custom Server API client. |
| Live-slicer: PUT rejected | No TingWu task is created; both write the sanitized `output/failure-state.json` with `stage=audio_upload`, retain local audio, and resume by obtaining a new authorization | Correct. See both agents at `:138`/`:119`. |
| Live-slicer: CapCut root is absent or outside the sandbox | Both distinguish unconfigured, missing, and non-writable roots in `output/decision-log.md`, skip drafts, and continue video delivery | Correct. `CAPCUT_DRAFT_ROOT` is preferred; see `agent.claude.md` and `agent.codex.toml`. |
| Montage: first message lacks a valid ratio | Both create `output/failure-state.json` and `output/failure-diagnosis.md` before reading alternate ratio sources and stop | Correct ratio-isolation behavior; see `agent.claude.md` and `agent.codex.toml`. |
| Montage: pipeline failure | Project manifest plus `failure-state.json` and `failure-diagnosis.md` are retained; cover and successful delivery files are not produced | Correct recoverable workflow failure. |
| Montage: successful video, cover, and delivery | Freeze one ratio, run pipeline, invoke cover design exactly once, locally validate final video/project/cover/delivery manifest, then Runtime uploads and registers output files | Correct. Agent instructions and skill no longer require a nonexistent generic MCP registration call. |

## Resolved issues verified

- Moments now prioritizes the structured task project and gives both hosts the same
  safe ambiguity-failure path.
- Codex live-slicer removed concrete `TaskCreate`/`TaskUpdate` instructions. It
  uses `set_task_progress_plan` and `update_task_progress`, while its
  `progress-state.json` records stage metadata for recovery
  (`harness/packs/live-slicer/agent.codex.toml, 66, 72-74`).
- Live audio upload rejection has a proper sanitized recoverable failure artifact.
- CapCut availability and write permission are treated as a non-blocking optional
  branch in both host packs.
- Montage artifacts are runtime-finalized rather than generically registered by
  MCP. The runtime scans `output/`, uploads files, reports the artifact manifest,
  then completes the execution (`agent-ts/src/main.ts:131-159`;
  `agent-ts/src/artifacts.ts:51-81`). The corrected skill matches this behavior
  (`harness/skills/montage/SKILL.md`).
- The Montage agent now explicitly rejects non-managed host launches rather than
  assuming a desktop Codex workspace contains `/workspace/openmontage`
  (`harness/packs/montage/agent.codex.toml`).

## Final conclusion

No remaining contradiction was found in the rechecked areas. Both Montage agents
and the referenced skill now require the dual failure artifacts. Their required JSON
fields match `applyFailureState` exactly: `version="1.0"`,
`status="recoverable_failure"`, nonempty `message`, and 1-64 character lower-case
snake_case `stage`, `error_code`, and `resume_from`
(`harness/packs/montage/agent.claude.md`;
`harness/packs/montage/agent.codex.toml`; `agent-ts/src/main.ts:185-210`).
For a missing/invalid ratio, both use
`stage=resume_from=input_validation` and
`error_code=invalid_video_aspect_ratio`, so the runner produces a recoverable
workflow failure instead of a generic delivery-validation failure.

The Montage skill mirrors the dual-artifact and Runtime-finalization contracts
(`harness/skills/montage/SKILL.md`), and the project profile now says that
the Runtime uploads and registers files after local validation
(`server/service/agent_project_profile.go:217`).

## Codex host-tool check

| Tool or environment | Applies | Evidence |
| --- | --- | --- |
| Direct lifecycle MCP | Yes | Codex uses `set_task_progress_plan` / `update_task_progress`; no Claude lifecycle tool invocation remains. |
| `ffmpeg`, `ffprobe`, signed-upload `curl`, and local inspection commands | Yes when installed | Explicitly allowed only for local media and returned signed PUT URLs. |
| CapCut draft writes | Conditional and safely degradable | Configured root must exist and be writable within the host allowance; otherwise video delivery continues. |
| `/workspace/openmontage` and registry | Managed Runtime only | The Montage pack now makes this precondition explicit. |
| Generic MCP artifact registration | Not applicable | Runtime artifact finalization owns uploads and registration. |
