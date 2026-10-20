---
name: content-tagging
description: Use when a stable article or Seednote content artifact needs shared Anban metadata tagging.
---

# 通用内容标签

内容稳定、最终交付文件写入 `output/` 后执行，输出 `output/content-tags.json`，使用 `schema_version` 和 `taxonomy_version` `2.0`。只写证据充分的标签；不确定维度写入 `omitted_dimensions`。

`subjects` 中的角色字段必须使用 Pack 声明的 `artifact_role`（例如 `final_markdown`、`content` 或 `copywriting`）。每个语义标签的证据必须放在 `evidence` 数组中，数组元素包含 `source_file`、`line_start`、`line_end`、`quote` 和 `evidence_kind`。

不要因为全文偶然出现一个词就贴标签。没有明确受众不贴 `audience`，没有 CTA 或购买路径不贴 `funnel_stage`，只有真实反问结构才贴 `presentation_device`。风险只记录实际发现的风险，不写“未发现风险”。公开话题标签写入交付文件的 `public_tags`，不进入内部标签。

Server 负责 `content_type`、`platform`、`artifact_role`、`performance` 和 `media_form`；Agent 不得声明或覆盖。允许空维度，不输出未知词或猜测值。
