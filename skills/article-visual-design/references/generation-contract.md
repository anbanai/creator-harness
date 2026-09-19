## 目录

- 五阶段流程
- Phase 0：模板选择与节奏规划
- 步骤 0a：选择文章类型模板
- 步骤 0b：创建 visual-rhythm-plan.md
- Phase 1：视觉风格确定（配置优先，分析兜底）
- 步骤 1a：读取任务已解析的视觉风格（权威来源）
- 步骤 1b：三维风格分析（细化 / 兜底）
- Phase 2：封面生成（委托 article-cover-design skill）
- Phase 3：配图内容规划（升级 schema）
- 新 schema：visual_brief + required_entities + must_match_excerpts
- Phase 4：配图生成与独立内容审核
- 步骤 4a：构建 prompt
- 步骤 4b：构建内容审核 prompt
- 步骤 4c：生成图片

## 五阶段流程

```
Phase 0: 模板选择 + 节奏规划
  └─ 读取 03-article.md → 选模板 → 写 visual-rhythm-plan.md

Phase 1: 三维风格分析
  └─ 账号定位 + 内容主题 + 受众 → $VISUAL_STYLE / $COLOR_PALETTE / $MOOD

Phase 2: 封面生成
  └─ 基于风格分析 + 文章核心隐喻 → 生成 + 上传

Phase 3: 配图规划
  └─ 逐章节提取 visual_brief + required_entities + must_match_excerpts → 写 image-plan.md

Phase 4: 配图生成与独立内容审核
  └─ 按 rhythm-plan slot 顺序生成 → 独立审核 → 失败重试 → 写 images.json
```

---

## Phase 0：模板选择与节奏规划

### 步骤 0a：选择文章类型模板

读取 `output/03-article.md`（或 `04-article-final.md`），根据结构特征匹配模板：

| 特征 | 模板 | 文件 |
|------|------|------|
| 标题/大纲含"3 个/5 种/N 条"+ 并列项 | `listicle` | `templates/article/listicle.yaml` |
| 按步骤序号组织（步骤 1 / 步骤 2 / step N） | `tutorial` | `templates/article/tutorial.yaml` |
| 情节弧、场景描写、人物/时间线 | `story-narrative` | `templates/article/story-narrative.yaml` |
| 其他（深度观点、评论、分析） | `long-form-essay` | `templates/article/long-form-essay.yaml`（默认） |

**自动决策原则**：不向用户询问。特征模糊时优先选 `long-form-essay`。

### 步骤 0b：创建 visual-rhythm-plan.md

读取 `output/03-article.md`，对每个 `##` 章节，分配一个 slot。详细模板和示例见 [references/rhythm.md](rhythm.md)。

每个 slot 必须包含：
- `slot_id`：hero / section_opener / inline_detail / footer
- `section_index`：对应 `##` 章节的 0-based 序号（footer 用 -1）
- `image_size`：full-bleed / full-width / inline（正文阅读流优先 full-width / inline，避免正文图撑满）
- `module`：从模板的 `modules.preferred` 中选，可为 null
- `composition_type`：从 8 种构图类型中选（参见 references/content.md）
- `chapter_anchor`：对应章节的标题或核心论点（1 句话）

**产出**：`output/visual-rhythm-plan.md`

---

## Phase 1：视觉风格确定（配置优先，分析兜底）

### 步骤 1a：读取任务已解析的视觉风格（权威来源）

公众号"模板"由三个**正交**维度组成：图片视觉（`visual_style`）、写作者（`writer`）、排版样式（`theme`）。三者各自独立解析，互不推导——**写作者绝不决定图片视觉**。

`get_project_profile` 已按 `task > project` 两层解析并返回视觉维度的最终值：
- `$VISUAL_STYLE_CONFIGURED` = profile 的 `visual_style` 字段（解析后的视觉风格描述/关键词）
- `$VISUAL_STYLE_SOURCE` = profile 的 `visual_style_source`（task / project）

**关键规则**：
- 若 `$VISUAL_STYLE_CONFIGURED` 非空 → 它是**权威视觉锚点**。以它为 `$VISUAL_STYLE` 的核心，三维分析只做**补充细化**（配色、情绪、构图），**绝不可覆盖或偏离**配置的视觉方向。例如配置了"温暖自然的生活摄影"，分析就只能往暖色调、自然光、真实场景细化，**不得**生成维多利亚木刻/黑白版画等冲突风格。
- 若 `$VISUAL_STYLE_CONFIGURED` 为空（所有层级都未配置视觉）→ 执行完整三维分析兜底。

### 步骤 1b：三维风格分析（细化 / 兜底）

基于 `get_project_profile` 返回的 `$ACCOUNT_POSITIONING` / `$ACCOUNT_KEYWORDS` / `$ACCOUNT_AUDIENCE` 和 `output/04-article-final.md` 内容，执行三维分析。当步骤 1a 有配置锚点时，分析必须向该锚点收敛（即用账号/内容主题来**充实**已指定的视觉方向），而非另起炉灶。

详细规范见 [references/cover.md](cover.md)。

**产出**：`$VISUAL_STYLE`（含配置锚点 + 细化方向）/ `$COLOR_PALETTE` / `$MOOD` / `$VISUAL_STYLE_SOURCE`

---

## Phase 2：封面生成（委托 article-cover-design skill）

> **封面开关守卫**：当 `article_image_mode` 为 `content_only` 或 `text_only` 时，**Phase 2 整体跳过**——不调 `generate_image`、不生成 `output/cover.png`、不取 `media_id`/`$COVER_PATH`。`article-cover-design` skill 同步跳过。封面关闭或人物参考启用时，Phase 4 正文图改用文本风格块独立生成。

封面在未启用人物参考时可作为正文配图风格锚点；启用人物参考时只保留为封面产物。**封面设计已独立成稿**——using the `article-cover-design` skill，它遵循任务有效比例，智能适配时参考公众号展示规格与中心安全区，受控决定是否显式裁剪，并从文章核心隐喻推导视觉概念，由 Agent 用质量评分卡把关。本阶段只交代与本 skill 的衔接：

- **核心规格**：用户明确比例原样生成；智能适配时可参考公众号宽屏构图和转发卡中心安全区。只有用户明确要求精确尺寸，或目标展示规格确有需要，才显式调用 `crop_image`。
- **生成调用**：`generate_image(project_id=$PROJECT_ID, task_id=$TASK_ID, prompt=<封面提示词>, image_type="cover", output_path="output/cover.png", aspect_ratio=$EFFECTIVE_ASPECT_RATIO)`；只有用户明确要求精确像素时再显式 `crop_image` 到 `output/cover-exact.png` 并更新 `$COVER_PATH`，否则 `$COVER_PATH="output/cover.png"`；需要质量审核时单独调用 `analyze_image`，通过后调用 `upload_image`。

- **质量评分卡不过** → 根据可见问题锐化 prompt 重试，最多 3 次；耗尽后保留已有产物，在 `output/final-review.md` 记录 `article_cover_quality_failed` warning，返回 Article Agent 继续核心交付；不得请求用户协助，也不得把未通过封面标记为可用。
- 详细推导链、双评分卡、迭代策略、`cover-prompt.md` 与 `cover-quality.json` 审计见 [article-cover-design/SKILL.md](../../article-cover-design/SKILL.md)；三维风格方向参考见 [references/cover.md](cover.md)。

**产出**：`output/cover-plan.md`, `output/cover-prompt.md`, `output/cover-quality.json`, `output/cover.png`, `media_id`, `$COVER_PATH`

---

## Phase 3：配图内容规划（升级 schema）

> **配图开关守卫**：当 `article_image_mode` 为 `cover_only` 或 `text_only` 时，**Phase 3 整体跳过**——不创建 `image-plan.md`；模板 `image_count.min` **不再生效**，不得据此强制规划配图。节奏规划（Phase 0b）仍创建，所有非 hero slot 的 `image_url=null`。

### 新 schema：visual_brief + required_entities + must_match_excerpts

旧 schema 的 `visual_subject` 字段过于抽象（"商务场景"、"科技背景"），已废弃。新 schema 强制要求三个具体字段：

| 字段 | 含义 | 示例 |
|------|------|------|
| `visual_brief` | 1-2 句白话描述"这张图必须画什么" | "一颗石头路上的裂缝中钻出嫩绿新芽，背景是虚化的晨光。" |
| `required_entities` | 必须出现的具体物体列表 | `["stone path with crack", "tender green shoots", "soft morning light (background blur)"]` |
| `must_match_excerpts` | 章节中支撑这些实体的原句 | `["他说，'你看这条石板路的缝里，不也长出了新芽？'"]` |

详细正反例和规划流程见 [references/content.md](content.md)。

**产出**：`output/image-plan.md`

---

## Phase 4：配图生成与独立内容审核

> **配图开关守卫**：当 `article_image_mode` 为 `cover_only` 或 `text_only` 时，**Phase 4 整体跳过**——不生成任何正文图、不写 `images.json`、正文不内联 `<img>`。封面关闭或人物参考启用时本 Phase 仍执行，但所有正文图都不传 `ref_image_path`。

按 `output/visual-rhythm-plan.md` 中 slot 的顺序生成。每个 slot 执行：

### 步骤 4a：构建 prompt

基于 image-plan.md 中对应章节的：
- `visual_brief`（主体描述）
- `required_entities`（必须出现的实体清单）
- `composition_type`（构图约束）
- 叠加 `$VISUAL_STYLE` / `$COLOR_PALETTE` 风格语言

### 步骤 4b：构建内容审核 prompt

按下方模板构建独立 `analyze_image` 的审核 prompt：

```
这张图用于文章《$ARTICLE_TITLE》的章节《$CHAPTER_TITLE》。
章节核心论点：$CORE_POINT
必须出现的视觉元素：$REQUIRED_ENTITIES（逐项列出）
视觉简报：$VISUAL_BRIEF
请按 JSON 格式回答：
{
  "all_entities_present": true/false,
  "missing_entities": ["缺的实体 1", ...],
  "relevance_score": "high" | "medium" | "low",
  "has_forbidden_content": true/false,
  "forbidden_notes": "文字/水印/低俗/二维码/联系方式/外链 URL/扫码提示/加群/加微信等问题描述",
  "overall_pass": true/false,
  "sharper_prompt_hint": "如不通过，给出更锐化的 prompt 建议"
}
```

### 步骤 4c：生成图片

```
generate_image(
  project_id=$PROJECT_ID,
  prompt=<步骤 4a 构建的 prompt>,
  image_type="content",
  output_path="output/img_N.png",
  task_id=$TASK_ID,
  ref_image_path=$CONTENT_STYLE_REFERENCE_PATH,
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO
)
```

**关键**：
- `aspect_ratio`：必须显式传入。用户明确比例时每张都使用同一个 `$EFFECTIVE_ASPECT_RATIO`；智能适配时每张可分别从 `resolved_profile.allowed_image_ratios` 选择。
- `ref_image_path`：仅当封面开启且人物参考未启用时令 `$CONTENT_STYLE_REFERENCE_PATH="output/cover.png"`；封面关闭或人物参考启用时不传，改用 `$VISUAL_STYLE` / `$COLOR_PALETTE` 文本风格块。
- `ref_image_path` 只传递"风格语言"，不得复刻封面主体；正文图必须按章节 `visual_brief` / `required_entities` 独立表达。
- `generate_image` 成功后单独调用 `analyze_image` 执行评分卡；通过后再单独调用 `upload_image` 取得 `media_id` 和 `wechat_url`。上传失败只重试上传。

生成、内容质量分析和 CDN 上传始终作为三个独立调用执行：

```
analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path=output/img_N.png,
  prompt=<步骤 4b 构建的校验 prompt>
)
```

### 步骤 4d：失败重试策略

读取独立 `analyze_image` 的审核结果，由 Agent 映射为通过、修订或失败：
- 必须实体、章节相关性、文字、构图和合规均满足 → 接受，继续下一步
- 存在可修订的可见问题 → 根据缺失实体或构图问题锐化 prompt 重试（最多 2 次，共 3 次生成）
- 3 次仍失败 → 标记 `quality_status=failed`，继续后续 slot

**锐化 prompt 策略**：
- 在 prompt 开头加 "MUST CONTAIN: " + 独立内容审核指出的缺失实体列表
- 把 visual_brief 改写得更具体（加入材质、颜色、方位）
- 移除任何抽象风格词，只保留具体场景描述

### 步骤 4e：独立上传并立即原子落盘

- 图片通过 Agent 的质量判断后单独调用 `upload_image`，从其返回值取得 `wechat_url` 和 `media_id`。上传失败时保留已生成图片，只重试上传，不重新生成。
- **原子写** `output/images.json`：先写临时文件 `output/.images.json.tmp` → `fsync` → `rename` 覆盖 `output/images.json`。绝不要"攒齐所有图再一次性写"——那是丢失窗口。
- 每条记录必须包含：
  ```json
  {
    "index": 1,
    "slot_id": "section_opener",
    "section_index": 1,
    "image_type": "content",
    "chapter_title": "...",
    "composition_type": "三分法",
    "visual_brief": "...",
    "required_entities": ["..."],
    "must_match_excerpts": ["..."],
    "prompt": "Final prompt used",
    "quality_review": {
      "visible_subjects": ["..."],
      "text_observations": ["..."],
      "composition_observations": ["..."],
      "compliance_observations": []
    },
    "ref_image_path": "output/cover.png 或 null（封面关·配图开时）",
    "file_path": "output/img_01.png",
    "url": "https://cdn.../img_01.png",
    "wechat_url": "https://cdn.../img_01.png",
    "media_id": "媒体素材ID（来自独立 upload_image）",
    "quality_status": "passed"
  }
  ```
  `quality_review` 由 Agent 根据独立 `analyze_image` 的可见内容审核结果维护。

### 步骤 4f：插入到文章

按 `slot_id` 和 `section_index` 把 `![描述](CDN_URL)` 插入到 `output/04-article-final.md`：
- `section_opener`：紧跟 `## 章节标题` 之后
- `inline_detail`：在 `after_paragraph_index` 指定的段落之后
- `hero`：紧跟文章第一个 `##` 之前（如有 hero module 文字，则在 hero module 之后）

---
