---
name: article-cover-design
description: 'Use when a user requests a WeChat Official Account article cover, 公众号封面、公众号头图、封面图、cover、封面设计, or when the article workflow reaches its cover step.'
---

# 微信公众号封面设计

## 目标与边界

本 Skill 是公众号文章封面的唯一设计入口。封面首先是“标题与正文承诺的缩略图”，其次才是风格锚点。必须做到：主题具体、缩略图可读、中心分享卡裁切安全、视觉媒介匹配、参考图语义明确、未通过质量闸门不得上传。

当结构化运行控制 `article_image_mode` 为 `content_only` 或 `text_only` 时跳过整个 Skill：不生成、审核或上传封面。其他模式继续执行。

按需完整读取以下 references，不能只凭本文件中的摘要执行：

- 生成 `cover_strategy` 前读 [references/cover-effectiveness.md](references/cover-effectiveness.md)。
- 生成 `output/cover-plan.md` 和 prompt 前读 [references/art-direction.md](references/art-direction.md)。
- 任务存在人物参考时读 [references/portrait-reference.md](references/portrait-reference.md)。
- 生成前准备审核、生成后验收时读 [references/quality-gate.md](references/quality-gate.md)。
- 需要判断场景分支和失败边界时读 [references/examples.md](references/examples.md)。

## 输入合同

先调用 `get_project_profile(project_id=$PROJECT_ID, scope="article", task_id=$TASK_ID)`，读取：

- `resolved_profile.image_ratio`
- `resolved_profile.allowed_image_ratios`
- `resolved_profile.visual_style`
- `resolved_profile.task_reference_path`
- `resolved_profile.project_style_reference_path`

同时读取 `output/context-brief.md`、`output/seo-result.md`、digest、`output/04-article-final.md`。不得从 writer YAML 推导视觉风格。

### 图像参数合同：比例与展示派生

- 用户明确比例：当 `resolved_profile.image_ratio != "auto"` 时，原样作为 `$EFFECTIVE_ASPECT_RATIO`。
- 智能适配：当 `resolved_profile.image_ratio == "auto"` 时，从 `resolved_profile.allowed_image_ratios` 选择具体比例；公众号封面优先选择支持的最宽横向比例，通常为 `16:9`。
- 每次 `generate_image` 都必须显式传 `aspect_ratio`，取值为 `$EFFECTIVE_ASPECT_RATIO`。`image_type="cover"` 不隐式决定比例或裁剪。
- 公众号分享卡可能中心裁成 1:1。关键人脸、主体、短文字必须位于“以画面高度为边长”的中心正方形安全区，并避开底部 20%。
- 默认上传生成结果，不宣称“零裁剪”。只有用户明确要求精确像素成品时，才调用 `crop_image(`，显式提供目标宽高与锚点，并把裁后文件作为 `$COVER_PATH`。

### 人物图与风格图

人物参考是可选任务参数，默认关闭。只有任务明确选择人物图并存在 `resolved_profile.task_reference_path` 时才启用；具体合同见 `references/portrait-reference.md`。

项目视觉参考 `resolved_profile.project_style_reference_path` 只能先用 `analyze_image` 提取色彩、材质、光线和构图语言，原图路径不得传入 `generate_image`。人物参考只用于封面，正文配图不得使用人物参考图。

## 工作流

### 1. 建立点击承诺

按 `references/cover-effectiveness.md` 写出 `cover_strategy`：

- `final_title`、`digest_hook`
- `target_reader`、`reader_pain_or_job`
- `article_promise`、`content_proof_points`、`click_trigger`
- 至少 3 个 `cover_concept_candidates` 与 `selected_cover_concept`
- `cover_hook`、`visual_metaphor`、`thumbnail_strategy`
- `required_entities`、`anti_generic_constraints`

候选必须通过 `generic_swap_test`、`promise_proof_test`、`audience_motivation_test`。通用养生水墨背景、无主体山水、无内容证据的陌生人像、只靠氛围成立的空泛概念直接淘汰。

### 2. 写 `output/cover-plan.md`

按 `references/art-direction.md` 写出 8 要素视觉导演合同：

1. 比例与展示派生
2. 标题策略
3. 人物或主体
4. 背景与场景
5. 色彩与光线
6. 媒介与质感
7. 视觉层级与动线
8. 禁止事项

计划必须给出可执行的景别、主体位置、画面占比、视线方向、负空间和中心安全区，不得只写“高级、电影感、有质感”。先定媒介，再使用该媒介自己的语言；不得给所有方案固定追加摄影术语。

### 3. 解析参考图

令 `$COVER_REFERENCE_PATHS=[]`。

- 人物参数关闭：保持空数组。
- 人物参数开启：先验证 `.anban-creator/task-reference.png` 可访问，再按 `references/portrait-reference.md` 分析身份锚点并加入 `$COVER_REFERENCE_PATHS`。
- 项目风格图只进入分析，不进入 `$COVER_REFERENCE_PATHS`。
- 若能力元数据可用，生成前检查 `supports_reference` 与 `max_reference_images`；不支持或超限时记录 `article_cover_reference_unsupported` warning，跳过该封面并返回 Article Agent，不得静默改为无参考图生成。
- 若能力元数据未提前暴露，仍必须把人物图传给 `generate_image`；工具返回“不支持参考图/超限”时按同一 warning 处理，不得移除人物图重试。

### 4. 写 prompt 与审核合同

根据 `output/cover-plan.md` 组合最终 prompt，写入 `output/cover-prompt.md`。必须包含：文章承诺、选中概念、正文证据、明确实体、构图坐标、媒介语言、色彩、光线、缩略图策略、中心安全区、文字策略和禁止事项。

受控文字策略：

- 人物、真实场景、氛围意象默认无字。
- 教程、清单、栏目或编辑设计只有在短文字能明显增强信息气味时才带字。
- 最多 2-8 个中文字或一个短标签，精确写入 prompt；文字必须位于安全区且避开底部 20%。
- 始终禁止乱码、伪文字、水印、logo、二维码、联系方式、外链 URL、扫码提示、加群、加微信等导流元素。

审核结构按 `references/quality-gate.md`，至少包含 `visual_quality_scorecard` 与 `cover_effectiveness_scorecard`，以及这些字段：`information_scent_alignment`、`audience_motivation`、`content_specificity`、`thumbnail_attention`、`truthfulness_not_clickbait`、`brand_style_fit`、`visual_distinctiveness`、`safe_zone_text_policy`、`title_cover_digest_alignment`、`thumbnail_readability`、`contrast_focus`、`specificity_not_generic`、`series_distinctiveness`、`hard_no_forbidden_cues`。

### 5. 生成、审核、上传

```
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<output/cover-prompt.md 中的最终 prompt>,
  image_type="cover",
  output_path="output/cover.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
  ref_image_paths=$COVER_REFERENCE_PATHS
)
```

默认 `$COVER_PATH="output/cover.png"`。仅在用户明确要求目标像素时执行：

```
crop_image(
  task_id=$TASK_ID,
  input_path="output/cover.png",
  output_path="output/cover-exact.png",
  target_width=<目标宽度>,
  target_height=<目标高度>,
  anchor="center"
)
```

裁剪后令 `$COVER_PATH="output/cover-exact.png"`，并重新验收安全区。然后独立审核：

```
analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path=$COVER_PATH,
  prompt=<references/quality-gate.md 的审核 prompt>
)
```

Agent 必须结合可见内容作最终判断，并把结构化结果写入 `output/cover-quality.json`。全部通过后才调用：

```
upload_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path=$COVER_PATH
)
```

上传失败只重试上传，不重新生成。

### 6. 有界迭代与失败

单张封面最多 3 次生成尝试。失败时先修复概念、主体、构图或媒介选择，再重写 prompt；不得只堆风格形容词。人物参考启用时，身份一致性是硬闸门，不能用“构图好看”抵消。

3 次仍未通过时，在 `output/final-review.md` 记录结构化 warning：`stage=image_generation`、`error_code=article_cover_quality_failed`、安全摘要和可继续的 `resume_from=image_generation`。参考图能力不支持时使用 `article_cover_reference_unsupported`；人物文件缺失或损坏时使用 `article_cover_portrait_unavailable`。保留已有产物并返回 Article Agent 继续核心交付；不得请求用户协助，不得上传未通过封面。视觉失败不得阻止核心 Markdown 与 HTML 继续生成。

## 完成条件

- `output/cover-plan.md` 已记录 8 要素导演合同和参考图角色。
- `output/cover-prompt.md` 已记录最终 prompt、比例来源、裁剪决定、`required_entities` 和参考路径用途。
- `output/cover-quality.json` 中两个评分卡均通过；人物启用时身份字段也通过。
- `cover_effectiveness_scorecard.overall_pass=true` 且 `visual_quality_scorecard.overall_pass=true`。仅有旧的 6 维视觉评分全为 high 不得通过。
- `final-review.md` 与 `viral-audit.md` 读取本次结果；缺 `viral-audit.md` 时质量验收不通过。
