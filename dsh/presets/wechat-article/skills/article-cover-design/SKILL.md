---
name: article-cover-design
description: 'Use for a WeChat Official Account article cover when explicitly requested or when the Article workflow reaches its cover stage. Do not trigger for general article images or unrelated platform covers.'
---

# 微信公众号封面设计

## 目录

- [目标与边界](#目标与边界)
- [输入合同](#输入合同)
- [工作流](#工作流)
- [完成条件](#完成条件)

## 目标与边界

本 Skill 是公众号文章封面的唯一设计入口。封面首先是“标题与正文承诺的缩略图”，其次才是风格锚点。必须做到：主题具体、缩略图可读、中心分享卡裁切安全、视觉媒介匹配、参考图语义明确、未通过质量闸门不得上传。

当结构化运行控制 `article_image_mode` 为 `content_only` 或 `text_only` 时跳过整个 Skill：不生成、审核或上传封面。其他模式继续执行。

按需完整读取以下 references，不能只凭本文件中的摘要执行：

- 生成 `cover_strategy` 前读 [references/cover-effectiveness.md](references/cover-effectiveness.md)。
- 生成 `output/cover-plan.md` 和 prompt 前读 [references/art-direction.md](references/art-direction.md)。
- 选择封面呈现方式和编译视觉 prompt 时读 [references/presentation-strategy.md](references/presentation-strategy.md)。
- 人物参考说明见 [references/portrait-reference.md](references/portrait-reference.md)；启用人物封面时以共用调用合同为准。
- 生成前准备审核、生成后验收时读 [references/quality-gate.md](references/quality-gate.md)。
- 需要判断场景分支和失败边界时读 [references/examples.md](references/examples.md)。
- 执行双封面规格或解释微信上传边界时读 [references/wechat-cover-spec.md](references/wechat-cover-spec.md)。

## 输入合同

先调用 `get_project_profile(project_id=$PROJECT_ID, scope="wechat", task_id=$TASK_ID)`，读取：

- `resolved_profile.visual_style`
- `resolved_profile.project_portrait_reference_path`
- `resolved_profile.task_reference_path`
- `resolved_profile.project_style_reference_path`

同时读取 `output/context-brief.md`、`output/seo-result.md`、digest、`output/04-article-final.md`。不得从 writer YAML 推导视觉风格。

### 图像参数合同：固定双封面例外

`resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios` 仍随 Profile 返回并记录到审核上下文，但公众号文章封面不采用“用户明确比例”或“智能适配”分支；它们不能覆盖本 Skill 的固定双封面规则。每次 `generate_image` 都必须显式传 `aspect_ratio`。

每篇文章固定生成两种官方展示比例，不读取、不继承项目或任务的图片比例，不询问用户选择，也不允许模板、人物分支或参考图覆盖：

| 版本 | 比例 | 路径 | 用途 |
| --- | --- | --- | --- |
| 横版封面 | `2.35:1` | `output/cover.png` | 公众号文章主封面，作为草稿 `thumb_media_id` 来源 |
| 方形封面 | `1:1` | `output/cover-square.png` | 方形封面展示素材 |

两张图分别按目标比例独立构图和生成，不从另一张图裁切或拉伸；不得改变比例、按能力范围替换比例或将用户设置作为例外。关键主体和必要文字在两种构图中都须完整可读，并避开底部 20%。`crop_image(` 仅用于其他任务的显式目标宽高与锚点合同，本双封面流程不得调用裁剪来替代任一版本。

`upload_image` 可分别上传两张审核通过的图片，记录各自返回的 `media_id` 与 URL。公众号文章草稿的 `thumb_media_id` 字段只接受一个素材 ID；自动草稿固定引用横版图，方形图上传为独立素材，不得声称它已同时绑定到同一草稿。不得把两个 ID 塞进 `thumb_media_id` 或伪造草稿 API 字段。

### 人物图与风格图

结构化运行控制 `cover_portrait=required_project_portrait` 时，先读 [人物封面调用合同](../portrait-cover-design/references/platform-integration.md)，按 Article 分支调用 [portrait-cover-design](../portrait-cover-design/SKILL.md)，生成人物＋精确短标题封面；本文件下方的普通封面概念、文字策略与生成步骤不再执行。保留本 Skill 的双评分卡和上传交付要求，人物分支的质量与失败规则以调用合同为准。

`cover_portrait=disabled` 或未提供时，记录 `portrait_decision.use=false`，继续普通封面流程；不能因参考图存在或内容适合而自行使用人物参考。`portrait_decision` 记录 available、required_by_user、use、selected_path、reason。

项目视觉参考 `resolved_profile.project_style_reference_path` 只能先用 `analyze_image` 提取色彩、材质、光线和构图语言，原图路径不得传入 `generate_image`。人物参考只用于封面，正文配图不得使用人物参考图。

## 工作流

### 1. 建立点击承诺

形成 `portrait_decision.use=false` 后，选择与正文证据匹配的普通封面主体概念；已启用人物封面的任务由上方共用 Skill 负责，不执行本分支。

按 `references/cover-effectiveness.md` 写出 `cover_strategy`：

- `final_title`、`digest_hook`
- `target_reader`、`reader_pain_or_job`
- `article_promise`、`content_proof_points`、`click_trigger`
- 至少 3 个 `cover_concept_candidates` 与 `selected_cover_concept`
- `cover_hook`、`visual_metaphor`、`thumbnail_strategy`
- `selected_visual_treatment`：呈现方式、版式意图及选择理由，与概念分开决策
- `required_entities`、`anti_generic_constraints`

候选必须通过 `generic_swap_test`、`promise_proof_test`、`audience_motivation_test`。通用养生水墨背景、无主体山水、无内容证据的陌生人像、只靠氛围成立的空泛概念直接淘汰。概念回答“画什么”，`selected_visual_treatment` 回答“怎样呈现”；分别评估，避免把有效概念默认做成无字静物照片。不要把候选概念所列的每个实体都提升为同等重要的硬性主体，明确一个主视觉锚点，其余只在确实增强信息表达时保留。

### 2. 写 `output/cover-plan.md`

按 `references/art-direction.md` 写出 8 要素视觉导演合同：

1. 固定双比例构图（`2.35:1` 横版与 `1:1` 方版）
2. 标题策略
3. 人物或主体
4. 背景与场景
5. 色彩与光线
6. 媒介与质感
7. 视觉层级与动线
8. 禁止事项

计划必须给出可执行的层级、主体/文字位置、画面占比、视线方向、负空间和中心安全区，不得只写“高级、电影感、有质感”。按 presentation-strategy 决定标题是只由公众号 UI 承担，还是在图上呈现准确短标题/标签；无字不是默认值。先定媒介和版式，再使用相匹配的语言；不得给所有方案固定追加摄影术语。

### 3. 解析参考图

令 `$COVER_REFERENCE_PATHS=[]`；普通封面只加入已确认角色的任务实体素材，逐张声明职责并去重，不加入人物参考或项目风格图。

非空参考集合须校验 `supports_reference` 与 `max_reference_images`。能力未提前暴露时完整传入所选路径，由工具校验；不支持或超限则记录 `article_cover_reference_unsupported` warning 并跳过封面，不移除参考图重试。空集合正常文生图。

### 4. 写 prompt 与审核合同

根据 `output/cover-plan.md` 组合最终 prompt，写入 `output/cover-prompt.md`。必须包含：文章承诺、选中概念、选中呈现方式、一个主视觉锚点、正文证据、构图/版式层级、媒介语言、色彩、光线、缩略图策略、中心安全区、文字策略和禁止事项。按 [references/presentation-strategy.md](references/presentation-strategy.md) 保留明确的信息层级，避免把所有约束写成同等权重的物件清单。

受控文字策略：

- 根据标题与选中呈现方式决定文字。可采用纯画面、短标签、封面式大标题/副标题或精简图解；这些是可选手段，不是模板。若字能让冲突/主题在缩略图上更快读懂，明确使用文字，不因“避免乱码”而自动删掉。
- 图中文字应从标题/摘要/正文证据中准确摘取，控制为一个主标题和必要的少量标签；写明逐字白名单、层级、断行、对齐、字重/字形气质、文字区与留白区。不要将整篇标题机械塞入画面，也不要编造数据或标签。
- 文字必须位于对应展示形态的安全区并避开底部 20%；若启用中心 1:1 分享裁切，标题、主体和必要标签都须在中心安全区内。
- 始终禁止乱码、伪文字、水印、logo、二维码、联系方式、外链 URL、扫码提示、加群、加微信等导流元素。

审核结构按 `references/quality-gate.md`，至少包含 `visual_quality_scorecard` 与 `cover_effectiveness_scorecard`，以及这些字段：`information_scent_alignment`、`audience_motivation`、`content_specificity`、`thumbnail_attention`、`truthfulness_not_clickbait`、`brand_style_fit`、`visual_distinctiveness`、`safe_zone_text_policy`、`title_cover_digest_alignment`、`thumbnail_readability`、`first_glance_hierarchy`、`layout_finish`、`treatment_fit`、`contrast_focus`、`specificity_not_generic`、`series_distinctiveness`、`hard_no_forbidden_cues`。

### 5. 生成、审核、上传

横版和方版分别生成，各自使用同一已选概念和呈现方式，但按比例重排主体、文字和留白，不复用同一构图坐标。

```
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<output/cover-prompt.md 中的最终 prompt>,
  image_type="cover",
  output_path="output/cover.png",
  aspect_ratio="2.35:1",
  ref_image_paths=$COVER_REFERENCE_PATHS
)
```

随后独立生成方版：

```
generate_image(
	project_id=$PROJECT_ID,
  task_id=$TASK_ID,
	prompt=<按方版重排后的 prompt>,
	image_type="cover",
	output_path="output/cover-square.png",
	aspect_ratio="1:1",
	ref_image_paths=$COVER_REFERENCE_PATHS
)
```

分别调用 `analyze_image` 审核 `output/cover.png` 与 `output/cover-square.png`，并把两份比例、尺寸、审核结果写入 `output/cover-quality.json`。任一变体未通过时，只针对该变体按有界迭代规则重新生成和审核；不得用另一比例替代。

```
analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path="output/cover.png",
  prompt=<references/quality-gate.md 的审核 prompt>
)
```

全部通过后分别上传：

```
upload_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
	file_path="output/cover.png"
)
upload_image(
	project_id=$PROJECT_ID,
	task_id=$TASK_ID,
	file_path="output/cover-square.png"
)
```

Agent 结合可见内容分别作最终判断。将两次上传结果分别记录为 `wide` 与 `square`；横版的路径和 `media_id` 是草稿主封面输入。上传失败只重试对应上传，不重新生成；任一变体未成功上传时封面交付标为 warning/blocked，不得谎报双封面齐备。

### 6. 有界迭代与失败

单张封面最多 3 次生成尝试。失败时先修复概念、主体、构图或媒介选择，再重写 prompt；不得只堆风格形容词。人物参考启用时，身份一致性是硬闸门，不能用“构图好看”抵消。

3 次仍未通过时，在 `output/final-review.md` 记录结构化 warning：`stage=image_generation`、`error_code=article_cover_quality_failed`、安全摘要和可继续的 `resume_from=image_generation`。参考图能力不支持时使用 `article_cover_reference_unsupported`；人物文件缺失或损坏时使用 `article_cover_portrait_unavailable`。保留已有产物并返回 Article Agent 继续核心交付；不得请求用户协助，不得上传未通过封面。视觉失败不得阻止核心 Markdown 与 HTML 继续生成。

## 完成条件

封面审核 JSON 必须包含 `schema_version`、有限 `status`（`ready`、`warning`、`blocked`、`failed`、`skipped`）、`source`、`data_at`、`missing` 和 `evidence_paths`。生成、裁剪、审核或上传失败时保留已有文件并写 `output/failure-state.json`，字段为 `version`、`status`、`stage`、`error_code`、脱敏 `message`、`resume_from`；上传状态仍以 Server 返回为准。

- `output/cover.png` 与 `output/cover-square.png` 均存在，实际比例分别为 `2.35:1` 与 `1:1`。
- 两个变体均有独立审核结果和上传记录；横版是草稿主封面素材。
- `output/cover-plan.md` 已记录 8 要素导演合同、两种比例的构图调整和参考图角色。
- `output/cover-plan.md` 已记录概念与呈现方式的独立选择；文字策略与呈现方式相符。
- `output/cover-prompt.md` 已记录两种固定比例的最终 prompt、`required_entities` 和参考路径用途；未设置比例选择或裁剪决定。
- `output/cover-quality.json` 中两个评分卡均通过；人物启用时身份字段也通过。
- `cover_effectiveness_scorecard.overall_pass=true` 且 `visual_quality_scorecard.overall_pass=true`。仅有旧的 6 维视觉评分全为 high 不得通过。
- `final-review.md` 与 `viral-audit.md` 读取本次结果；缺 `viral-audit.md` 时质量验收不通过。
