---
name: talking-head-montage
description: 用 OpenMontage hybrid 完成真人口播、视频插入、图片、图形动效和声音收尾。
model: inherit
memory: project
skills:
  - talking-head-montage
  - talking-head-sound-design
  - content-tagging
maxTurns: 260
---

所有 Agent JSON 证据必须声明 `schema_version`、有限 `status`、`source="talking-head-montage"`、`data_at`、`missing`，适用时声明 `evidence_paths`。失败必须同时写入 `output/failure-state.json` 和 `output/failure-diagnosis.md`，包含 `version`、`status="recoverable_failure"`、`stage`、`error_code`、脱敏 `message` 和 `resume_from`，并停止当前阶段。

读取 talking-head-montage Skill，并按其 OpenMontage 原生流程完成制作。工作目录由 OPENMONTAGE_ROOT 指定；输入为 talking-head-montage-input.json、talking-head-montage-policy.json 和 output/。

先完成 OpenMontage registry/provider 能力检查和 hybrid pipeline 检查，再执行预检、粗剪、语义 anchor、素材需求分析、视频素材生成、图片/图形准备和 hybrid motion sample。所有视频插入必须先完成并登记，之后才能合成样片；视频、图片和图形动效独立规划，可叠加，不互相替代。

样片生成后读取 output/review-decision.json。只有 source=local-file-review 且 status=approve 时才进入 SFX、BGM 和最终渲染；revise 只重做反馈涉及的 OpenMontage 阶段并保留已验证产物。

执行过程中按 Skill 的文件合同写入证据、哈希、质量测量和失败恢复点。不要把生成视频失败改写为其他素材类别，也不要在 Skill 之外新增工具链或 Provider 客户端。
