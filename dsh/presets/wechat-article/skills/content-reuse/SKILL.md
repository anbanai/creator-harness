---
name: content-reuse
description: Use when a managed content task should reuse a validated topic or source content across WeChat, Seednote, or video formats.
---

# 跨平台复用

## 适用范围与边界

把 Server 提供的选题资产和来源内容转换成当前平台的生产 Brief。保留核心观点和证据边界，重写标题、开头、结构、节奏和视觉要求。不要复制原文，不要直接调用外部平台，不要修改任务状态、排期、发布状态、计费或 Profile。

仅当 Server 运行控制同时包含非空 `reuse_run_id` 与 `asset_id` 时触发；普通文章、笔记或视频任务跳过。不得从用户自由文本或目录名推断这些身份。

## 输入

- 当前任务的 `project_id`、`task_id`、平台和任务类型。
- Server 返回的选题资产、来源内容、历史分析摘要和目标项目 Profile。
- 用户明确要求、目标形式、预算和运行控制。

## 执行流程

1. 调用原子 MCP `get_content_reuse_context(project_id, task_id)`，核对返回的 run.id、asset.id 和 task_id 与 Server 运行控制一致。工具拒绝访问、资产不存在或必需 MCP 不可用时写失败产物并停止，不能当作“没有外部研究”。区分真实指标、推断和缺失字段。
2. 提取不可改变的核心问题、关键观点、事实和合规限制。
3. 按目标平台选择表达角度：公众号扩展论证，种草笔记压缩成可收藏结构，视频转换成场景化口播和分镜。
4. 记录制作成本层级、素材需求、数据新鲜度和迁移风险。
5. 将 Brief 和证据路径写入 `output/content-reuse-brief.json`，将研究解释写入 `output/topic-analysis.md`。
6. 写入 `output/content-lineage.json`，只记录来源引用和目标内容关系，不复制整篇正文。
7. 完成语义和合规检查后，将事实、检查项、缺失项和可恢复建议写入 `output/quality-report.json`。已有平台质量报告时保留原检查并增加 `content_reuse` 节点。Hypit 的客观质量报告由 Runtime 拥有，严禁覆盖；复用语义检查只合并到 Hypit Pack 声明的语义报告的 `content_reuse` 节点，保持其原有 passed/checks/unmet_requirements 合同。

## 输出合同

具体字段、类型、枚举和平台报告合并规则见 [产物合同](references/artifact-contract.md)。复用合同版本固定为整数 `schema_version: 1`；平台已有报告的外层版本不变。状态仅使用 `ready | warning | blocked`，置信度仅使用 `low | medium | high`。所有复用节点带 asset_id、reuse_run_id、task_id、target_platform，来源由 Server 返回，不能自行填造。

`output/content-reuse-brief.json` 必须包含 `schema_version`、`status`、`source`、`data_at`、`missing`、`asset_id`、`source_content`、`target_platform`、`angle`、`semantic_kernel`、`format_requirements`、`cost_level`、`material_requirements`、`compliance_constraints` 和 `evidence_paths`。

`output/content-lineage.json` 必须包含 `schema_version`、`asset_id`、`relation`、`source_content` 和 `target_content`。发布结果只能读取 Server 返回的事实，不能从文件存在推断发布成功。

复用质量节点必须包含 `schema_version`、`status`、`source`、`data_at`、`missing`、`checks` 和 `evidence_paths`。节点位置以产物合同的平台映射为准；检查无法完成时使用 `blocked` 或 `warning`，不得宣称通过。

## 失败与降级

- 选题资产不存在或不属于当前用户：按 Pack 合同写 `output/failure-state.json`，状态为 `recoverable_failure`。
- 仅外部研究缺失且内部事实足够：使用 warning、confidence=low、missing=["external_research"]，继续保守的平台适配，不补造热度。必需事实不足时 blocked，记录 data_insufficient，停止依赖该事实的创作。
- 来源内容无法安全复用：生成原创角度 Brief，并记录原因。
- 目标平台能力不可用：保留研究和 Brief，状态为 `blocked`，不得伪造任务或发布成功。

恢复时读取同一 run/task 的既有 Brief、链路和失败文件，核对身份与证据引用后复用已完成研究；不得重复制作已验证素材。失败文件字段固定为 version="1.0"、status="recoverable_failure"、stage="content_reuse"、error_code、脱敏 message、resume_from="content_reuse"。只有全部必需检查通过才清除失败文件。

## 质量检查

- 核心观点没有被目标平台改写成相反结论。
- 每个外部事实都有来源或明确标记为待核验。
- 目标平台结构、长度、视觉和口播要求具体可执行。
- Brief 没有 API Key、Cookie、私有 URL 或绝对宿主路径。
