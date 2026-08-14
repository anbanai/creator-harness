# Montage Examples

### Case 1: Social Short From Brand Brief

Input: `montage-input.json` contains a launch brief, `pipeline_key="social-short"`, vertical aspect ratio, and several product image assets.

Process: write `output/montage-project.json` with task/project IDs, normalized assets, selected pipeline, preferences, limits, and `output_dir="output"`. Run Montage from `/workspace/openmontage`, then register `final_video` and `output/delivery-manifest.json`.

### Case 2: Local Runner With Existing Media

Input: the task was system-routed to local execution and includes uploaded task files for source footage plus a short creative direction.

Process: use the complete writable OpenMontage copy already materialized at `/workspace/openmontage` with `$ANBAN_MONTAGE_SUBMODULE_PATH` fixed to that path. Resolve source assets from task-provided input files, leave the immutable `/opt/montage-template` image template untouched, write through the runtime-provided `output` link, and require non-empty final video plus `output/delivery-manifest.json` before completion.

### Case 3: Pipeline Failure

Input: Montage exits without a renderable final video, or the runner returns partial timeline/subtitle artifacts only.

Process: write `output/failure-diagnosis.md`, upload run logs and partial artifacts, register no successful `final_video`, and report failure through `submit_agent_feedback` with the failing stage and next action.
