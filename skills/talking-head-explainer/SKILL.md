---
name: talking-head-explainer
description: Use when planning or editing recorded talking-head explainers, educational videos, or science communication shorts that need raw-source assessment, clear explanations, a reusable semantic master, retention experiments, or independent validation. Do not use for product demos, pure entertainment edits, or video replication.
---

# 口播科普解释

## 适用范围与边界

本 Skill 服务已录制真人口播的知识讲解和科普视频。它负责把原始拍摄、声音、事实资料和反馈整理成可解释、可复用、可验证的编辑计划，并为 Agent 提供降级路径。

仅当任务目标是解释知识、科学概念、机制、过程或误区时使用。普通 IP 宣传、访谈、娱乐剪辑和视频复刻按各自工作流处理；即使 Agent 预加载了本 Skill，也不要为这些任务生成科普专用产物。

它不负责重新拍摄、伪造真人表达、自动发布、修改 Server 状态、替代 Montage、字幕、BGM、构图、封面或平台审核 Skill。生成画面只能作为明确的解释性示意，不能冒充真实证据。

## 输入

优先从只读原始输入开始：所有相机文件和完整录制版本、独立人声音轨、环境声和 room tone、原始转录、录制前提纲、事实/数字/案例及来源、目标观众和账号定位、历史发布数据、评论疑问与误解、收藏/转发反馈、同主题公开样本。整理后的剪辑或摘要只能作为辅助。

先记录媒体元数据和 SHA-256，再做转录、死区检测或重排。缺失历史数据、专家、观众样本或可核验平台规则时保留缺失事实，不补造结论。

## 执行流程

1. 在任何转录校正、死区检测或素材重排前生成 `output/explainer-input-assessment.json`，列出每个输入的来源、哈希、时间、完整性、用途、权利状态和缺失项。
2. 在剪辑前建立主张地图，并把内容拆成解释单元：概念、机制、过程、比较、分类、误区、尺度变化或生活化比喻。每个单元记录核心主张、证据、条件/限定、易误解点、必须保留的数字/否定/因果/免责声明和不应被剪辑强化的推断。
3. 为每个单元生成 `output/explanation-plan.json`。写明观众当前不理解什么、画面要让观众看见什么、视觉锚点、表达方式、比喻、视觉功能、揭示顺序、事实一致性风险、生成素材误认风险和失败替代方案。复杂选择按需读取 `references/explanation-patterns.md`。
4. 至少比较两个来自真实原片或事实资料的 Hook 候选。记录原始时间码、观看理由、后文兑现位置、具体性、语义风险、首次出现的对象/问题和是否立即说明解决什么问题。前三秒和完播是目标，不把固定秒数、镜头数或切换频率当作定律。
5. 创建 `output/semantic-master.json`，固定核心主张、事实证据、解释顺序、主要 Hook、口播语义、核心视觉锚点、结论和必要限定。按需读取 `references/platform-variants.md`，为用户选择的平台生成变体计划；未指定时使用 douyin、wechat_video_account、xiaohongshu 三个平台。仅当现有渲染能力实际生成独立平台文件时，才将其称为平台视频变体；不得复制同一个 MP4 冒充多平台成片。
6. 基于已冻结的语义母版，先做低成本静帧、占位或简单图形预演，生成 `output/explanation-rehearsal.json`，记录母版 revision/hash、使用的素材、帧/时间码或占位依据、每个解释单元的信息揭示顺序、遮挡/碰撞检查、检查方式及结果。预演只证明流程已走查，不等于目标观众理解测试；没有真实观众样本时将理解结果标为 `not_tested`。预演不通过时记录失败原因和回退方案，禁止进入高成本素材生成。
7. 生成 `output/retention-experiment-plan.json`，把 Hook、解释密度、字幕密度、结尾或视觉形式作为可独立测试的变量，写入基线、样本、成功指标、停止条件和未知项。真实发布或实际观众测试存在时，才生成 `output/retention-results.json`。
8. 生成 `output/independent-validation-plan.json`，覆盖技术、语义、事实/专业、观众、平台和复现验证；完成后写 `output/independent-validation.json`，逐项区分已执行、未执行和不可用。Agent 不得声称已做领域专家盲审、目标观众测试或发布后分析，除非存在对应的真实证据。按需读取 `references/independent-validation.md`。
9. 所有产物绑定 `revision_id`。核心内容、最终版本、母版或平台变体变化时递增 revision，重新计算哈希并重做受影响验证；旧 revision 的验证必须标为失效，或从当前交付结论中排除，直到新 revision 的受影响验证完成。交付前由 Agent 核对 `delivery-manifest.json` 中实际存在的媒体路径、角色和哈希；计划中的母版/变体关系保存在 `platform-variant-plan.json`，不得假定交付清单支持尚未声明的关系字段。

## 解释性视觉判定

每个视觉元素必须至少承担解释、证明、强调、比较、转场或注意力重置之一，并说明它降低了什么理解成本。优先让观众看见对象、过程、变量、关系或统一比较轴；动效的验收标准是理解提升，不是画面数量。生成素材可能被误认为真实证据时，标记并改用示意标签、实拍、静态图形或真人讲解。

## 平台与数据边界

平台变体只能调整标题/封面包装、开场包装层、字幕安全区和位置、节奏细节、CTA、界面遮挡区域和交付格式。不得改变事实、因果、限制条件或结论。规则无法核验时使用保守配置并标记 `platform_rules_unavailable`。发布后指标只能消费 Server 提供的冻结 analytics revision；Agent 日志和本地文件不能证明效果。

## 输出合同

以下科普专用 JSON 均包含 `schema_version`、`status`、`source`、`workflow="talking-head-explainer"`、`data_at`、`missing` 和 `evidence_paths`。`source` 必须是当前执行 Agent 的 ID（`viral-ip-video-editor` 或 `talking-head-montage`），`data_at` 使用 UTC ISO 8601 时间；专用产物的 `status` 为 `ready|partial|missing|failed`。其中 `missing` 表示产物所需输入不足以形成有意义的记录，`failed` 表示生成或验证过程出错；缺少历史数据、专家、观众样本或平台规则时应列入 `missing`，但仍可产出有用计划并标为 `partial`。凡引用视频、母版或变体的产物还须记录 `revision_id` 和对应哈希。没有真实数据时不得写成功验证结论。

- `output/explainer-input-assessment.json`
- `output/semantic-master.json`
- `output/explanation-plan.json`
- `output/explanation-rehearsal.json`
- `output/platform-variant-plan.json`
- `output/retention-experiment-plan.json`
- `output/independent-validation-plan.json`
- `output/independent-validation.json`
- `output/retention-results.json`：仅在真实观众测试或 Server analytics revision 存在时生成。

`semantic-master.json` 的 `semantic_master` 对象必须包含 `core_claims`、`evidence`、`explanation_order`、`primary_hook`、`spoken_semantics`、`visual_anchors`、`conclusion` 和 `qualifications`。`revision_id` 绑定本轮母版；`content_sha256` 是按稳定 JSON 序列化后对 `semantic_master` 对象计算的 SHA-256，不包含外层信封。`platform-variant-plan.json` 必须引用该 revision 和哈希。

`explanation-rehearsal.json` 必须含 `revision_id`、`semantic_master_sha256`、`rehearsal_mode`（`still_frames|placeholders|simple_graphics`）、`units`、`collision_checks`、`decision`（`proceed|fallback|blocked`）和 `expensive_generation_allowed`。每个 unit 记录理解问题、揭示顺序、证据路径、走查方法、走查结果及低风险回退。只有全部关键单元通过走查才能设置 `proceed` 和 `expensive_generation_allowed=true`；这仍不代表目标观众理解已验证。若关键单元的主方案走查失败，可以把已经实际应用、重新走查并通过的静态对比、真人讲解或简单图形记录为 `applied_fallback`，并将 `decision` 设为 `fallback`、`expensive_generation_allowed=false`；每个失败单元都必须有 `method`、`applied=true`、说明、`walkthrough_result="passed"` 和指向 `output/` 内真实证据的 `evidence_paths`。`fallback` 不能只写“计划回退”，不能在没有失败单元时使用，也不能启用高成本生成。`blocked` 始终不可交付。

## 失败与降级

原始素材不可读、事实主张无法区分或语义风险未解决时，停止并写入现有失败合同，`resume_from` 指向可恢复阶段。预演显示解释不成立时，先应用低风险替代方案并重新走查；替代方案通过后可按 `fallback` 继续，但不得进入高成本生成。若替代方案仍未通过、没有真实证据或无法保持语义，则使用 `blocked` 并停止交付。数据不足允许继续，但必须是 `partial` 或 `missing`，并明确限制。不得把编辑判断写成数据已证明。

## 质量检查

交付前确认：原始输入仍只读；关键主张有来源或明确缺失；否定、条件、数字、因果和限定在独立转录中保持；至少两个 Hook 已比较且后文兑现；解释性视觉与事实一致且不遮挡真人/字幕；用户选择的每个平台版本均与语义母版等价，未选择的平台不要求生成或验证；母版、实际渲染变体、EDL、资产和验证结果使用相符 revision；每类独立验证都记录覆盖范围、缺失证据和限制。

复杂方法按需读取：

- `references/raw-input-and-evidence.md`
- `references/explanation-patterns.md`
- `references/platform-variants.md`
- `references/retention-experiments.md`
- `references/independent-validation.md`
