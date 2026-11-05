---
name: talking-head-explainer
description: Use when planning or reviewing IP 知识讲解、专家口播、科普短视频 (creator or expert knowledge explainers) from recorded talking-head footage. Owns fact grounding, explanation structure, visual plans and independent validation. For end-to-end 知识 IP 剪辑 / IP Explainer, use the ip-explainer Agent. Not for ordinary interviews, livestream clipping, product demos, entertainment montages or video replication.
---

# 知识讲解策划 · Explainer Planning

## 适用范围与边界

本 Skill 服务已录制真人口播的知识讲解和科普视频。它负责把原始拍摄、声音、事实资料和反馈整理成可解释、可复用、可验证的编辑计划，并为 Agent 提供降级路径。IP 自己的观点只记录为 `content_owner_assertion`；本 Skill 不因观点真伪阻塞剪辑。

仅当任务目标是解释知识、科学概念、机制、过程或误区时使用。普通 IP 宣传、访谈、娱乐剪辑和视频复刻按各自工作流处理；即使 Agent 预加载了本 Skill，也不要为这些任务生成科普专用产物。

它不负责重新拍摄、伪造真人表达、自动发布、修改 Server 状态、替代 Montage、字幕、BGM、构图、封面或平台审核 Skill。生成画面只能作为明确的解释性示意，不能冒充真实证据。

## 输入

优先从只读原始输入开始：所有相机文件和完整录制版本、独立人声音轨、环境声和 room tone、原始转录、录制前提纲、事实/数字/案例及来源、目标观众和账号定位、历史发布数据、评论疑问与误解、收藏/转发反馈、同主题公开样本。整理后的剪辑或摘要只能作为辅助。

先记录媒体元数据和 SHA-256，再做转录、死区检测或重排。缺失历史数据、专家、观众样本或可核验平台规则时保留缺失事实，不补造结论。

## 执行流程

1. 在任何转录校正、死区检测或素材重排前生成 `output/explainer-input-assessment.json`，列出每个输入的来源、哈希、时间、完整性、用途、权利状态和缺失项。
2. 在剪辑前建立主张地图，并把内容拆成解释单元：概念、机制、过程、比较、分类、误区、尺度变化或生活化比喻。每个单元记录核心主张、证据、条件/限定、易误解点、必须保留的数字/否定/因果/免责声明和不应被剪辑强化的推断。
3. 为每个单元生成 `output/explanation-plan.json`。写明观众当前不理解什么、画面要让观众看见什么、视觉锚点、表达方式、比喻、视觉功能、揭示顺序、事实一致性风险、生成素材误认风险和失败替代方案。复杂选择按需读取 `references/explanation-patterns.md`。提供参考片或要求达到参考品质时，先按 [references/reference-video-review.md](references/reference-video-review.md) 拆解对象、动作、状态变化和声画对应，将少量可迁移目标写入现有 explanation plan；不能只模仿字体、色调或镜头数量。
4. 至少比较两个来自真实原片或事实资料的 Hook 候选。记录原始时间码、观看理由、后文兑现位置、具体性、语义风险、首次出现的对象/问题和是否立即说明解决什么问题。前三秒和完播是目标，不把固定秒数、镜头数或切换频率当作定律。
5. 创建 `output/semantic-master.json`，固定核心主张、事实证据、解释顺序、主要 Hook、口播语义、核心视觉锚点、结论和必要限定。按需读取 `references/platform-variants.md`，为用户选择的平台生成变体计划；未指定时使用 douyin、wechat_video_account、xiaohongshu 三个平台。仅当现有渲染能力实际生成独立平台文件时，才将其称为平台视频变体；不得复制同一个 MP4 冒充多平台成片。
6. 基于已冻结的语义母版，先做低成本静帧、占位或简单图形预演，生成 `output/explanation-rehearsal.json`，记录母版 revision/hash、使用的素材、帧/时间码或占位依据、每个解释单元的信息揭示顺序、遮挡/碰撞检查、检查方式及结果。优先先做最难的演示单元和前后衔接；预演只证明流程已走查，不等于目标观众理解测试；没有真实观众样本时将理解结果标为 `not_tested`。预演不通过时记录失败原因和回退方案，禁止进入高成本素材生成。
7. 生成 `output/retention-experiment-plan.json`，把 Hook、解释密度、字幕密度、结尾或视觉形式作为可独立测试的变量，写入基线、样本、成功指标、停止条件和未知项。真实发布或实际观众测试存在时，才生成 `output/retention-results.json`。
8. 生成 `output/independent-validation-plan.json`，覆盖技术、语义、事实/专业、观众、平台和复现验证；完成后写 `output/independent-validation.json`，逐项区分已执行、未执行和不可用。Agent 不得声称已做领域专家盲审、目标观众测试或发布后分析，除非存在对应的真实证据。按需读取 `references/independent-validation.md`。
9. 所有产物绑定 `revision_id`。核心内容、最终版本、母版或平台变体变化时递增 revision，重新计算哈希并重做受影响验证；旧 revision 的验证必须标为失效，或从当前交付结论中排除，直到新 revision 的受影响验证完成。交付前由 Agent 核对 `delivery-manifest.json` 中实际存在的媒体路径、角色和哈希；计划中的母版/变体关系保存在 `platform-variant-plan.json`，不得假定交付清单支持尚未声明的关系字段。

## 解释性视觉判定

每个视觉单元必须声明 `visual_class`（`expression|demonstration|evidence`）、`primary_media`、`source_priority`、`object`、`action`、`result`、`graphic_role` 和 `fallback_reason`。`visual_class` 是沟通任务，不是素材来源：`expression` 让观众看到 IP 的身份、情绪、判断、强调或直接交流；`demonstration` 让观众看到对象、动作、变化和结果；`evidence` 让观众看到真实图片、原始文档、档案或其他可追溯来源。IP 实拍和 AI 生成视频都是主力视频素材，按每个镜头希望观众看到的内容选择；AI 生成能更清楚呈现对象、动作、变化、尺度或视觉隐喻时直接使用，不因镜头归为 expression 就默认选择实拍。证据型以可追溯真实来源为主素材，不能用 AI 画面冒充证据。先选定主力素材，再按需要在实拍或生成视频上叠加图形动效，例如字幕、标注、箭头、示意、对比、结构化信息、强调、转场或注意力引导；图形动效是辅助层，不是生成失败后的默认回退。只有改变已选主素材、放弃必需的动作/结果，或省略已声明的辅助层时才填写 `fallback_reason`。每个视觉元素必须至少承担解释、证明、强调、比较、转场或注意力重置之一，并说明它降低了什么理解成本。动效的验收标准是理解提升，不是画面数量。生成素材可能被误认为真实证据时，标记为示意并改用真实来源或明确说明其示意性质。

比较类内容保持同一比较轴和主体身份，过程类内容保留起始状态→可见动作→结果；生成提示要描述变化，不只描述漂亮物体。示意画面不能证明历史来源，参考片也不能替代事实核验。字幕、人物小窗、配乐和暗色蒙版不能挤掉解释主体。样片与终片按同一参考片段检验，技术通过与参考品质达标分别记录到现有审查产物。具体审片动作和未达标处理见上述 reference。

## 平台与数据边界

平台变体只能调整标题/封面包装、开场包装层、字幕安全区和位置、节奏细节、CTA、界面遮挡区域和交付格式。不得改变事实、因果、限制条件或结论。规则无法核验时使用保守配置并标记 `platform_rules_unavailable`。发布后指标只能消费 Server 提供的冻结 analytics revision；Agent 日志和本地文件不能证明效果。

## 输出合同

以下科普专用 JSON 均包含 `schema_version`、`status`、`source`、`workflow="talking-head-explainer"`、`data_at`、`missing` 和 `evidence_paths`。`source` 必须是当前执行 Agent 的 ID（`viral-ip-video-editor` 或 `ip-explainer`），`data_at` 使用 UTC ISO 8601 时间；专用产物的 `status` 为 `ready|partial|missing|failed`。其中 `missing` 表示产物所需输入不足以形成有意义的记录，`failed` 表示生成或验证过程出错；缺少历史数据、专家、观众样本或平台规则时应列入 `missing`，但仍可产出有用计划并标为 `partial`。凡引用视频、母版或变体的产物还须记录 `revision_id` 和对应哈希。没有真实数据时不得写成功验证结论。

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

`explanation-rehearsal.json` 必须含 `revision_id`、`semantic_master_sha256`、`rehearsal_mode`（`still_frames|placeholders|simple_graphics`）、`units`、`collision_checks`、`decision`（`proceed|fallback|blocked`）和 `expensive_generation_allowed`。每个 unit 记录理解问题、揭示顺序、证据路径、走查方法、走查结果及低风险回退。预演用于验证镜头逻辑、信息揭示顺序、构图和前后衔接；它不是要求先制作静态/图形替代方案，也不是目标观众理解测试。关键镜头的预演通过后即可按效果选择并启动 AI 视频生成；若简单预演已足以确认生成方案，不要求额外完成所有单元或先证明低成本替代方案。将 `expensive_generation_allowed=true` 限定为已通过镜头逻辑预演且符合 `talking-head-video-generation` 门禁的单元。若某主方案确实失败，可把已实际应用、重新走查并通过的替代方案记录为 `applied_fallback`；每个失败单元都必须有 `method`、`applied=true`、说明、`walkthrough_result="passed"` 和指向 `output/` 内真实证据的 `evidence_paths`。`fallback` 不能只写“计划回退”；`blocked` 始终不可交付。

## 失败与降级

原始素材不可读、事实主张无法区分或语义风险未解决时，停止并写入现有失败合同，`resume_from` 指向可恢复阶段。预演发现镜头逻辑或信息揭示不成立时，先修正该镜头方案并复核；不得仅因尚无静态/图形替代方案而阻止效果更好的 AI 视频生成。主方案确实失败后，可记录实际应用并通过走查的替代方案；仍无法表达必要对象、动作、结果或证据时，使用 `blocked` 并停止交付。数据不足允许继续，但必须是 `partial` 或 `missing`，并明确限制。不得把编辑判断写成数据已证明。

## 质量检查

交付前确认：原始输入仍只读；关键主张有来源或明确缺失；否定、条件、数字、因果和限定在独立转录中保持；至少两个 Hook 已比较且后文兑现；解释性视觉与事实一致且不遮挡真人/字幕；用户选择的每个平台版本均与语义母版等价，未选择的平台不要求生成或验证；母版、实际渲染变体、EDL、资产和验证结果使用相符 revision；每类独立验证都记录覆盖范围、缺失证据和限制。

复杂方法按需读取：

- `references/raw-input-and-evidence.md`
- `references/explanation-patterns.md`
- `references/platform-variants.md`
- `references/retention-experiments.md`
- `references/independent-validation.md`
