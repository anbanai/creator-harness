---
name: article-visual-design
description: 'Use when generating or processing images for WeChat articles. Use when user mentions ''封面'', ''配图'', ''插图'', ''视觉设计'', ''图片上传'', ''generate cover'', ''visual rhythm'', ''template'', or when the article pipeline calls for image planning, generation, content review, or uploading.'
---

# 公众号图文图片管理（模板化 + 独立内容审核）

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## 图片比例固定规则

### 任务图像参数合同

- 调用 `get_project_profile(task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，封面和正文图的每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 按每张产物职责从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`；公众号常用宽屏、横版或方形比例只作选择参考。
- 每次生成都必须显式传 `aspect_ratio` 参数。
- `image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## 图片模式与跳过条件（运行控制驱动）

公众号文章的**封面**与**正文配图**由 user message 的结构化运行控制 `article_image_mode` 决定。缺失时按 `cover_and_content`。本 skill 不解析自然语言禁令：

| `article_image_mode` | 受影响阶段 |
|----------------------|-----------|
| `cover_and_content` | Phase 2/3/4 全部执行 |
| `cover_only` | **Phase 3（配图规划）+ Phase 4（配图生成）跳过**——不写 `image-plan.md`/`images.json`；正文不内联 `<img>`；模板 `image_count.min` **不再生效**，不得据此强制生成配图 |
| `content_only` | **Phase 2（封面生成）跳过**——封面已委托 `article-cover-design` skill，见其「跳过条件」；不生成 `output/cover.png`，不取 `media_id`/`$COVER_PATH` |
| `text_only` | Phase 2/3/4 全跳过 |

**封面关·配图开**时，Phase 4 正文图因无封面作 `ref_image_path` 风格锚点，改为各自独立生成（不传 `ref_image_path`，或链到首张已生成图），**严禁**指向不存在的 `output/cover.png`。Phase 0/1（模板选择、节奏规划、三维风格分析）不受开关影响，始终执行。

下方各 Phase 顶部再次标注其跳过条件；质量验证的图片相关项在配图开关关闭时跳过。

## 公众号图片尺寸与展示规则

公众号图片必须遵循任务有效比例，并在 MCP `generate_image` 参数中显式传入。下表中的构图比例只用于智能适配时从当前能力支持范围选值，不得覆盖用户明确比例：

| 图片类型 / slot | MCP `aspect_ratio` | HTML `image_size` | 用途 |
|-----------------|--------------|---------------------|------|
| 封面 / hero | `$EFFECTIVE_ASPECT_RATIO` | `full-bleed` | 用户明确比例原样使用；智能适配时优先考虑能力支持的宽屏比例 |
| `section_opener` / 普通正文配图 | `$EFFECTIVE_ASPECT_RATIO` | `full-width` | 用户明确比例原样使用；智能适配时可考虑横版 |
| `inline_detail` / 段内细节图 | `$EFFECTIVE_ASPECT_RATIO` | `inline` | 用户明确比例原样使用；智能适配时可考虑方形 |
| 信息图 / 流程图 / 对比图 / 清单总结图 | `$EFFECTIVE_ASPECT_RATIO` | `full-width` 或 `inline` | 智能适配时按信息结构从能力支持范围选择 |

`visual-rhythm-plan.md` 中正文图 slot 默认不要滥用 `full-bleed`；正文阅读流优先 `full-width` 或 `inline`。`render_template` 会按 `image_size` 控制展示宽度：`full-bleed=100%`、`full-width=86%`、`inline=68%`。

## 受控文字策略

图片上是否需要文字由场景决定，不再一律纯图：

- 封面：当标题利益点强、系列感明显、教程/清单/杂志编辑风、或用户/项目视觉风格明确需要时，可生成 2-8 个字的短标题/关键词；普通氛围图、真实场景摄影、情绪意象封面默认无字。
- 正文图：真实场景/氛围图默认无字；信息图、流程图、对比图、清单总结图可带少量中文标签或短句。
- 所有可见文字必须写入生成 prompt；独立 `analyze_image` 的审核 prompt 检查文字是否短、清晰、无乱码、无水印、无 logo、无密集排版。
- **反导流视觉禁区**：任何封面和正文图都不得出现二维码、联系方式、外链 URL、扫码提示、跳转图标、加群、加微信、关注领资料或回复关键词等导流元素。若生成结果含上述元素，内容审核必须判为不通过并重试。

## MCP 工具

任何图像 MCP 返回 `execution_identity_required` 或 `execution_identity_mismatch` 时，必须按不可重试的运行时身份故障处理：不得更换 prompt、比例、`image_type` 或工具重复尝试；保留已有产物，只写一次 `output/failure-state.json`：`{"version":"1.0","status":"recoverable_failure","stage":"image_generation","error_code":"execution_identity_unavailable","message":"执行环境未建立，暂时无法生成或结算图片","resume_from":"image_generation"}`，然后结束当前托管执行。身份失败不属于下文的质量或供应商重试预算；失败产物不得包含令牌、密钥或完整环境变量。

| MCP 工具 | 说明 |
|----------|------|
- `upload_image` 失败时保留已生成图片，只重试上传，无需重新生成。
| `analyze_image` (project_id, image_url 或 file_path, prompt) | 分析图片可见内容，供 Agent 作质量判断或创作修订 |
| `upload_image` (project_id, task_id, file_path) | 独立上传已接受图片到微信 CDN，返回 CDN URL 和素材 ID |
| `download_image` (project_id, task_id, url, output_path) | 下载公共 HTTPS 图片并登记为持久任务文件 |
| `compress_image` (task_id, input_path, output_path, max_width?) | 压缩授权任务图并登记新的持久任务文件 |

---

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

读取 `output/03-article.md`，对每个 `##` 章节，分配一个 slot。详细模板和示例见 [references/rhythm.md](references/rhythm.md)。

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

详细规范见 [references/cover.md](references/cover.md)。

**产出**：`$VISUAL_STYLE`（含配置锚点 + 细化方向）/ `$COLOR_PALETTE` / `$MOOD` / `$VISUAL_STYLE_SOURCE`

---

## Phase 2：封面生成（委托 article-cover-design skill）

> **封面开关守卫**：当 `article_image_mode` 为 `content_only` 或 `text_only` 时，**Phase 2 整体跳过**——不调 `generate_image`、不生成 `output/cover.png`、不取 `media_id`/`$COVER_PATH`。`article-cover-design` skill 同步跳过（见其「跳过条件」）。封面关·配图开时，Phase 4 正文图改用无锚点独立生成。

封面是全篇风格锚点（产物 `output/cover.png` 供 Phase 4 内容图 `ref_image_path` 继承）。**封面设计已独立成稿**——using the `article-cover-design` skill，它遵循任务有效比例，智能适配时参考公众号展示规格与中心安全区，受控决定是否显式裁剪，并从文章核心隐喻推导视觉概念，由 Agent 用质量评分卡把关。本阶段只交代与本 skill 的衔接：

- **核心规格**：用户明确比例原样生成；智能适配时可参考公众号宽屏构图和转发卡中心安全区。只有用户明确要求精确尺寸，或智能适配时 Agent 判断发布确有需要，才显式调用 `crop_image`。
- **生成调用**：`generate_image(project_id=$PROJECT_ID, task_id=$TASK_ID, prompt=<封面提示词>, image_type="cover", output_path="output/cover.png", aspect_ratio=$EFFECTIVE_ASPECT_RATIO)`；需要精确 900×383 时再显式 `crop_image` 到 `output/cover-exact.png` 并更新 `$COVER_PATH`，否则 `$COVER_PATH="output/cover.png"`；需要质量审核时单独调用 `analyze_image`，通过后调用 `upload_image`。

- **质量评分卡不过** → 根据可见问题锐化 prompt 重试，最多 3 次；耗尽后保留已有产物并写入 `output/failure-state.json`：`{"version":"1.0","status":"recoverable_failure","stage":"image_generation","error_code":"article_cover_quality_failed","message":"封面在限定创作重试后仍未通过质量评分卡","resume_from":"image_generation"}`，结束当前托管执行；不得请求用户协助，**不得**用未通过封面发布。
- 详细推导链、6 维评分卡模板、迭代策略、`cover-prompt.md` 审计见 [article-cover-design/SKILL.md](../article-cover-design/SKILL.md)；三维风格方向参考见 [references/cover.md](references/cover.md)。

**产出**：`output/cover.png`, `media_id`, `$COVER_PATH`

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

详细正反例和规划流程见 [references/content.md](references/content.md)。

**产出**：`output/image-plan.md`

---

## Phase 4：配图生成与独立内容审核

> **配图开关守卫**：当 `article_image_mode` 为 `cover_only` 或 `text_only` 时，**Phase 4 整体跳过**——不生成任何正文图、不写 `images.json`、正文不内联 `<img>`。封面关·配图开时本 Phase 仍执行，但步骤 4c 的 `ref_image_path` 不得指向未生成的 `output/cover.png`（改不传或链首图）。

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
  ref_image_path=<封面开关开启时 "output/cover.png"；封面关时省略或链到首张已生成图>,
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO
)
```

**关键**：
- `aspect_ratio`：必须显式传入。用户明确比例时每张都使用同一个 `$EFFECTIVE_ASPECT_RATIO`；智能适配时每张可分别从 `resolved_profile.allowed_image_ratios` 选择。
- `ref_image_path`：**封面开关开启时**用 `output/cover.png`（风格锚点）；**封面关·配图开时**不传（或链到首张已生成图），**严禁**指向不存在的 `output/cover.png`。
- `ref_image_path` 只传递"风格语言"，不得复刻封面主体；正文图必须按章节 `visual_brief` / `required_entities` 独立表达。
- `generate_image` 成功后单独调用 `analyze_image` 执行评分卡；通过后再单独调用 `upload_image` 取得 `media_id` 和 `wechat_url`。上传失败只重试上传。

生成、内容质量分析和 CDN 上传始终作为三个独立调用执行：

```
analyze_image(
  project_id=$PROJECT_ID,
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

## 质量验证

> **配图开关守卫**：配图开关关闭时，下方所有图片相关检查项（文件完整性/风格一致性/视觉多样性/内容审核通过率/审计完整性/CDN 持久化）跳过，不计为失败；节奏完整性、模板一致性（slot 映射）仍执行。封面关·配图开时，「风格一致性」改为"无 `ref_image_path` 或链首图"。

生成完成后执行 7 项检查：

- [ ] **节奏完整性**：`visual-rhythm-plan.md` 中每个 `##` 都映射到一个 slot
- [ ] **模板一致性**：所选模板的 rhythm 规则被遵守（如 listicle 的 section_opener 必填、inline_detail forbidden）
- [ ] **文件完整性**：所有图片文件存在且可访问
- [ ] **风格一致性**：封面+配图均开启时，`images.json` 中所有内容图 `ref_image_path="output/cover.png"`；封面关·配图开时无 `ref_image_path` 或链首图，且不得指向不存在的 `output/cover.png`
- [ ] **视觉多样性**：3 张以上配图使用 3 种以上不同 `composition_type`（清单模板可豁免，因要求统一构图）
- [ ] **反同质化**：不得连续 3 张正文图复用同主体/同远近景/同色调重心；正文图不得复刻封面主体
- [ ] **内容审核通过率**：至少 80% 的内容图 `quality_status=passed`
- [ ] **审计完整性**：`images.json` 每条含 `visual_brief` / `required_entities` / `must_match_excerpts` / `quality_review` / `slot_id` / `section_index` / `wechat_url` / `media_id`
- [ ] **CDN 持久化**：`images.json` 每条都有非空 `wechat_url`（每张图已独立上传到 CDN）；缺 URL 的 slot 只调用 `upload_image` 重传，禁止重新生成

未通过检查时：
- 单图失败 → 重试或降级标记
- 节奏/模板违规 → 回到 Phase 0 重新规划
- 内容审核通过率 < 80% → 检查 prompt 构建逻辑，必要时回退到 Phase 3 重新规划
- 超过一半章节配图在各自限定重试后仍失败 → 保留已有产物并写入 `output/failure-state.json`：`{"version":"1.0","status":"recoverable_failure","stage":"image_generation","error_code":"article_content_images_failed","message":"超过一半章节配图在限定重试后仍失败","resume_from":"image_generation"}`，结束当前托管执行，不得请求用户协助

---

## 保存结果

- 含 CDN 图片链接的文章覆盖写回 `output/04-article-final.md`
- 所有配图信息保存为 `output/images.json`

---

## 技术规范

**微信图片限制**：
- 最大尺寸：10MB（超出自动压缩）
- 最大宽度：1920px（保持比例压缩）
- 支持格式：JPG、PNG、GIF、WebP

**公众号常用比例**：
- 封面图（公众号封面）：2.35:1（900x383px 标准）
- 正文配图（section_opener）：显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`
- 章节内细节图（inline_detail）：显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`
- Hero slot：full-bleed 2.35:1

---

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 内容审核持续失败 | prompt 过于抽象 | 锐化 visual_brief，明确每个 required_entity 的材质、颜色、方位 |
| 配图与章节无关 | required_entities 与章节原文脱节 | 回到 Phase 3 重新提取，确保 must_match_excerpts 是章节原句 |
| 所有配图构图雷同 | 未在 rhythm-plan 中分配不同 composition_type | 重新规划 rhythm-plan，强制 3+ 种构图（清单模板除外） |
| 风格漂移 | 封面开启时未使用封面作为参考图；或封面关闭时错误引用不存在的封面 | 封面+配图均开启时确保内容图 `ref_image_path="output/cover.png"`；封面关·配图开时不传或链首图 |
| 封面与文章脱节 | 封面 prompt 缺少内容隐喻 | 在封面 prompt 中加入文章核心论点的视觉隐喻 |
| 节奏违反模板规则 | 未读模板 YAML 的 rhythm 字段 | 重新加载模板，按 rhythm 字段约束 slot 分配 |

---

## 参考文档

- [references/cover.md](references/cover.md) — 封面设计规范（三维风格分析 + prompt 模板）
- [references/content.md](references/content.md) — 配图规划与生成（新 schema + 独立内容审核循环）
- [references/rhythm.md](references/rhythm.md) — 节奏规划与模板选择（visual-rhythm-plan.md 模板）
