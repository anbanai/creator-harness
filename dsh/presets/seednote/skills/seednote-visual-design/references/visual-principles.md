# Seednote 视觉方法论

本参考文件用于图片规划阶段。先把正文蒸馏成页面职责，再为每页确定信息层级、主体、构图、风格和验收标准。

## 内容蒸馏与视觉策略

1. 从 `output/content.md` 提取主题、卖点、情绪、证据、关键短句、目标受众和每页信息密度。
2. 先确定统一色彩、画面主体、标题层级、镜头/场景方向和内容页节奏，再写入 `output/image-plan.md`。
3. 用 editorial 信息层级安排主标题、辅助信息、证据点和视觉主体；用 Swiss/magazine 秩序感控制留白、对齐、分组和对比；让封面负责点击，内容图负责理解，尾图负责收束。
4. 每张图都明确角色、可见文案、视觉主体、构图层级、风格延续和验收标准；prompt 只描述要得到的画面效果和内容关系。
5. `output/image-prompts.md` 每张图片只写文件名、用途和最终创作提示词；`output/image-review.md` 只记录可见主体、文字、构图和合规观察。

## 跨页一致性与中文约束

- 封面、内容图和尾图均按 `image-plan.md` 独立选择 0、1 或多张任务原图；没有相关参考时使用纯文生图。项目风格图只能使用分析得到的文本风格块，原图路径不得进入生成调用。
- 参考素材只约束产品事实、品牌要素、结构、包装、颜色、角度或氛围中的相关维度，不得把某张素材的全部画面元素复制到每一页。
- 没有相关参考素材的页面通过共享文本风格块延续调性，同时保持独立视觉主体、场景和构图。
- 用户使用中文时，图片内所有可见文字必须是简体中文；禁止英文、拼音、乱码、伪词和中英混排。
- 每张图必须围绕 `content.md` 和 `image-plan.md` 的当页主题，不得把尾图预告、其他季节或无关茶类提前画进内容页。
- 健康养生类主题只能表达生活方式建议和传统茶文化语境，禁止承诺治疗、治愈或绝对功效。

## 页面分工

`cover_portrait=required_project_portrait` 时，先读 [人物封面调用合同](../../portrait-cover-design/references/platform-integration.md)，按 Seednote 分支调用 `portrait-cover-design`，使用冻结的人物与精确主文案；覆盖普通封面的字体/背景预设及审核不可用可放行规则。封面仍纳入本 Skill 的计划与逐图记录，不能重复生成。

`disabled` 或未提供时使用 [cover.md](cover.md)，不使用项目人物参考。人物参考及含该人物的封面不传入内容图或尾图，风格以文本延续。内容图见 [content.md](content.md)，尾图见 [tail.md](tail.md)。

当主题为春季花茶/白茶时，封面应出现“春日饮茶指南”和“花茶+白茶”；内容图按正文证据呈现“茉莉花茶”“白牡丹白茶”“85-90°C”“10秒出汤”等锁定文字，禁止英文、“焖泡10秒”、提前出现夏季主题或非茶相关主体。

## 质量与失败合同

`generate_image` 失败或超时时写入 `output/failure-state.json` 并停止图片阶段。每张生成图都必须独立调用 `analyze_image`；调用失败、malformed 或无法可靠判断时标记 `quality_status=unavailable`，在 `image-review.md` 和 `reference-usage-summary.json` 的 `warnings` 中记录“审核不可用”，继续生成剩余计划图片，但不得把该图算作通过。单图质量问题最多重试 3 次，耗尽后标记 `quality_status=failed`；全部计划图片完成后，任一 `failed` 或 `unavailable` 都写结构化失败态并停止成功交付。

所有 JSON 审核或索引文件使用 `schema_version`、有限 `status`、`source`、`data_at`、`missing` 和适用的 `evidence_paths`。失败态固定包含 `version`、`status=recoverable_failure`、`stage`、`error_code`、脱敏 `message` 和 `resume_from`；原始运行错误只保留在服务端观测记录中。
