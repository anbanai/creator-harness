# 复用产物合同 v1

复用 JSON 节点使用下列公共字段：schema_version（整数 1），status（ready/warning/blocked），asset_id、reuse_run_id、task_id、target_platform（非空字符串），source（Server 来源说明），data_at（RFC3339 或 null），missing、evidence_paths（字符串数组），confidence（low/medium/high）。data_at 未知须在 missing 中列出 data_at。证据缺失不得 high。

Brief 另含：source_content（kind/id 引用，可为 null），angle、semantic_kernel（字符串），core_points、replaceable_examples（字符串数组），format_requirements（对象，包含 form、title_strategy、opening_strategy、length、visual_or_spoken_requirements），cost_level（L1/L2/L3/L4，建议而非授权），material_requirements、compliance_constraints（字符串数组）。

Lineage 另含 relation="derived_from"，source_content（kind/id 引用或 null），target_content={"kind":"task","id":"当前 task_id"}。不记录 Agent 推测的发布成功。

质量节点另含 checks 数组，每项包括 id、status（passed/warning/blocked）、reason、evidence_paths。必需检查 ID 为 fact_sources（事实来源）、core_consistency（观点一致）、platform_fit（平台适配）、compliance（合规）和 material_rights（素材权利），每项恰好一次，禁止重复 ID。任何必需检查 blocked 时总状态必须 blocked；无法检查不得 passed。Hypit 节点放在 semantic-report.json.content_reuse，其他已有报告放在 quality-report.json.content_reuse，保留平台原检查；没有既有合同的平台使用该节点作为 quality-report.json 根对象。

外部研究缺失示例：status="warning", confidence="low", missing=["external_research"]；无足够可核验事实则 status="blocked", missing 包含 data_insufficient。这些报告只是证据，不能改变 Server 的生产状态、预算或发布决定。
