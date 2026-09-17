---
name: article
description: Use when the user asks to create a complete WeChat Official Account article.
---

# /article 微信公众号文章创作命令

这是托管零交互流程，不得调用 `AskUserQuestion`，也不得请求用户协助；需要后续处理的问题通过结构化 warning 和 `resume_from` 交付。

## 强制执行声明

执行完整的创作流水线并生成文件产物；不要把用户给出的主题当作问答请求直接回复。

用户输入 `/article` 后面的内容是创作主题。

---

## 图片运行控制前置（硬性）

公众号文章的封面图与正文配图由 user message 的结构化运行控制 `article_image_mode` 决定。若该键缺失，写入 `output/failure-state.json`（`error_code=article_image_mode_missing`、`resume_from=project_resolution`），保留已有产物并结束当前执行；不得猜测默认值或扫描自然语言禁令来推断开关。所有视觉步骤和交付前验证都必须先判断图片模式：

- `cover_and_content`：封面和正文配图都开启，按完整视觉流程执行。
- `cover_only`：不得生成 `image-plan.md` / `images.json` / 正文 `<img>`；模板 `image_count.min` 不生效；不得把章节缺图、缺 `image-plan.md`、缺 `images.json` 判为失败。
- `content_only`：不得生成 `cover.png` / `cover-prompt.md`；交付包不包含封面媒体字段；不得把缺封面或缺 `media_id` 判为失败；正文图不得把 `ref_image_path` 指向不存在的 `output/cover.png`。
- `text_only`：纯文字文章，不生成任何图片，`visual-rhythm-plan.md` 可存在但所有 `image_url=null`，交付包不包含封面媒体字段，`final-review.md` 记录未生成封面。

**仅在对应图片模式开启该产物时**，封面、正文配图、独立内容审核、正文图片互不相同等图片相关要求才是硬性项；关闭时跳过且不计为失败。
## 必须执行的步骤

按顺序完成以下步骤，并在标明的位置使用对应 Skill 或 MCP 能力。

托管运行时提供任务私有工作区和预先创建的 `output/`。`TASK_ID` 来自结构化运行时上下文。最终产物只写入本文列出的 `output/<filename>` 路径；不创建、发现、移动或重命名 `output/`。

### Phase 1: 信息收集

### 步骤 1：获取项目信息

**项目选择（必须先完成，再调用项目 API）：**

- 优先使用托管上下文提供的项目 ID（包括 `$ANBAN_DEFAULT_PROJECT` 中的 Article `project_id`），非空则直接作为 `$PROJECT_ID`
- 托管上下文未提供项目 ID 时调用 `list_projects(platform="article")`；返回恰好一个归属当前用户的 Article 项目时直接使用其 `project_id`
- 返回零个或多个归属当前用户的 Article 项目时，不做语义猜选，不展示候选项，且不得让用户选择；写入 `output/failure-state.json`：`{"version":"1.0","status":"recoverable_failure","stage":"project_resolution","error_code":"article_project_resolution_failed","message":"托管上下文未提供项目 ID，且无法从唯一 Article 项目解析","resume_from":"project_resolution"}`，结束当前托管执行
- `list_projects` 调用不可用或失败属于必需 MCP 能力失败，按 `article_mcp_call_failed` 终止；不得切换其他项目或连接

**项目选定后，仅对 `$PROJECT_ID` 调用：**

- `get_project_profile(project_id="$PROJECT_ID", scope="article", task_id="$TASK_ID")` → 获取账号定位、受众、风格维度。**同时解析视觉维度的权威来源**：`$VISUAL_STYLE_CONFIGURED` = profile 的 `visual_style` 字段、`$VISUAL_STYLE_SOURCE` = `visual_style_source`（task / project）。`task_id` 让服务端按任务级覆盖解析（`task > project` 两层），不传则只拿到 project 级信息。顶层 `writer` 仅用于选择写作风格资源。
- `list_drafts(project_id="$PROJECT_ID")` 和 `list_published_articles(project_id="$PROJECT_ID")` → 已有文章标题；任一调用失败按必需 MCP 能力失败写结构化失败态并停止，不得用空列表伪装成功
- 使用 runtime 已预创建的 `output/`；不得创建、发现、移动或重命名该目录

**图像参数合同**：读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。`image_ratio != "auto"` 时所有图片必须原样使用 `$EFFECTIVE_ASPECT_RATIO=image_ratio`；`image_ratio == "auto"` 时，Agent 为每张产物从 `allowed_image_ratios` 选择具体比例。每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。

### 步骤 2：选题研究

using the topic-research skill 结合账号关键词和用户需求搜索热门话题，创作文章大纲。产出：
- `output/01-research.md` — 选题分析和关键词
- `output/02-outline.md` — 文章大纲（≥3 个二级标题）

### Phase 2: 内容创作

### 步骤 3：撰写文章

using the content-writing skill 基于账号定位和大纲输出 Markdown 格式文章。**写作时不需要插入配图占位符**（配图由步骤 7 专门处理）。产出：
- `output/03-article.md` — 完整文章内容

### 步骤 4：AI 去痕与合规检查

using the content-writing skill 先执行 AI 去痕，覆盖原文全部信息点且不得引入新的违禁词或导流风险，再运行本地确定性营销扫描器。扫描最多自动修订一轮低歧义 CTA，禁止机械修改事实、引用、数字或作者观点。`warning` 记录后继续；阻塞项不伪造为通过。产出：
- `output/04-article-final.md` — 检查后的文章
- `output/content-quality-report.md` — 含导流风险、内容完整性、标题摘要一致性、互动合规、违禁词、AI 痕迹检查；无待调整项后才能进入 SEO 与视觉
- `output/marketing-scan.json` — 含规则 ID、类别、严重级别、行号、脱敏片段、内容哈希和修改建议

### Phase 3: SEO 与视觉

### 步骤 5：SEO 优化

using the seo-optimization skill 优化标题、关键词、摘要。将优化后的标题和摘要保存为 `output/seo-result.md`，供最终验收和交付包使用。

### 步骤 6：模板选择、节奏规划、封面生成（带视觉校验）、配图规划

using the article-visual-design skill 完成以下子步骤。详细规范见 `skills/article-visual-design/SKILL.md` 与 `skills/article-visual-design/references/{cover,content,rhythm}.md`。

#### 6a：选择文章类型模板（配置优先风格）

公众号"模板"由三个**正交**维度组成：图片视觉（`visual_style`）、写作者（`writer`）、排版样式（`theme`）。三者各自独立解析，互不推导——**写作风格绝不决定图片视觉**。

读取 `output/03-article.md`（或 `04-article-final.md`），根据结构特征匹配模板（自动决策，不询问用户）：

| 特征 | 模板 | YAML 路径 |
|------|------|-----------|
| 含"3 个/5 种/N 条" + 并列项 | `listicle` | `templates/article/listicle.yaml` |
| 按步骤序号组织（步骤 1 / step N） | `tutorial` | `templates/article/tutorial.yaml` |
| 情节弧、场景、人物时间线 | `story-narrative` | `templates/article/story-narrative.yaml` |
| 其他（深度观点、评论、分析） | `long-form-essay`（默认） | `templates/article/long-form-essay.yaml` |

加载模板 YAML，提取 `rhythm`（slot 规则）、`image_count`（min/max）、`modules.preferred`（可用 layout module）、`composition_guidance`（构图指南）。记录 `$TEMPLATE_NAME` / `$TEMPLATE_PATH`。特征模糊时优先选 `long-form-essay`。

#### 6b：创建视觉节奏规划

读取 `output/03-article.md`，对每个 `##` 章节分配 slot，创建 `output/visual-rhythm-plan.md`：按模板 `rhythm` 规则把每个 `##` 映射到 `hero` / `section_opener` / `inline_detail` / `footer`；按 `composition_guidance` 为每个图 slot 选 `composition_type`（3+ 图时用 3+ 种构图，`listicle` 模板豁免）；从 `modules.preferred` 选 module；每个 slot 写 1 句 `chapter_anchor`。模板自检：hero 有且仅有 1 个、section_opener 数量符合模板、footer 符合必选/可选规则。模板格式和完整示例见 `skills/article-visual-design/references/rhythm.md`。

#### 6c：视觉风格确定（配置优先，分析兜底）

视觉风格**优先**取自步骤 1 已解析的任务字段（`task > project`）：
- 若 `$VISUAL_STYLE_CONFIGURED` 非空 → 它是**权威视觉锚点**。以它为 `$VISUAL_STYLE` 的核心，三维分析（账号定位 / 内容主题 / 受众）只做**补充细化**（配色、情绪、构图），**绝不可覆盖或偏离**配置的视觉方向。例如配置了"温暖自然的生活摄影"，就不得生成维多利亚木刻/黑白版画等冲突风格。
- 若 `$VISUAL_STYLE_CONFIGURED` 为空（所有层级都未配置视觉）→ 执行完整三维分析兜底。
- **不从 writer YAML 推视觉**（writer 仅决定文字风格，已不再携带任何视觉/封面字段）。

产出 `$VISUAL_STYLE`（含配置锚点 + 细化方向）/ `$COLOR_PALETTE` / `$MOOD` / `$VISUAL_STYLE_SOURCE`。映射关系见 `skills/article-visual-design/references/cover.md`。

#### 6d：生成封面（委托 article-cover-design skill）

封面是标题-摘要-正文-用户画像的点击承诺载体；未启用人物参考时还可作为正文配图风格锚点。**封面设计已独立成稿**——using the `article-cover-design` skill：用户明确比例优先，智能适配时从能力允许比例中选择宽横图，并使用中心分享卡安全区构图、受控文字策略、`cover_strategy`、三选一概念评审、`visual_quality_scorecard` 与 `cover_effectiveness_scorecard` 双评分卡把关。本步骤只交代与本流水线的衔接：

1. 从 `output/context-brief.md`、`output/seo-result.md`、digest 和 `output/04-article-final.md` 提取最终标题、目标读者、读者痛点/任务、文章承诺、正文证据和最强视觉素材。
2. 交给 `article-cover-design` skill 先写 `cover_strategy`：`target_reader`、`reader_pain_or_job`、`article_promise`、`content_proof_points`、`click_trigger`、至少 3 个 `cover_concept_candidates`、`selected_cover_concept`。
3. 三选一概念评审必须先过 `generic_swap_test`、`promise_proof_test`、`audience_motivation_test`；任何“换到其他方法论文章也成立”的封面概念不得进入生成。
4. 调用 `generate_image` 生成并登记封面：
   ```
   generate_image(
     project_id=$PROJECT_ID,
     prompt=<article-cover-design skill 构建的封面提示词>,
     image_type="cover",
     output_path="output/cover.png",
     task_id=$TASK_ID,
     aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
     ref_image_paths=$COVER_REFERENCE_PATHS
   )
   ```
5. 单独调用 `analyze_image`，把实际审核结果写入 `output/cover-quality.json`。Agent 根据可见主体、文字、构图、人物身份和合规结果决定接受、重构概念或锐化 prompt，最多 3 次生成。
6. 质量通过后先令 `$COVER_PATH="output/cover.png"`。仅在用户明确要求精确尺寸，或智能适配时 Agent 判断输出确有需要，才显式调用 `crop_image` 生成 `output/cover-exact.png` 并更新 `$COVER_PATH`；不得按平台或 `image_type` 隐式裁剪。
7. 单独调用 `upload_image(project_id=$PROJECT_ID, task_id=$TASK_ID, file_path=$COVER_PATH)`，记录 `$COVER_MEDIA_ID` 与 `$COVER_CDN_URL`（供后续排版和交付记录使用）。上传失败只重试上传，不重新生成；按「MCP 工具使用规则」耗尽后记录 `article_image_upload_failed` warning，保留本地封面并继续。
8. **原子写封面审计产物**：`output/cover-prompt.md` 记录比例来源、可选裁剪参数、实际上传的 `$COVER_PATH`、封面创作决策和最终 prompt；`output/cover-quality.json` 记录两张评分卡、可见内容结论及人物启用时的身份结论。

详细推导链、评分卡模板、迭代策略见 `skills/article-cover-design/SKILL.md` 与 `skills/article-cover-design/references/cover-effectiveness.md`；三维风格方向参考见 `skills/article-visual-design/references/cover.md`。

#### 6e：创建配图内容规划（升级 schema）

按 `output/visual-rhythm-plan.md` 中每个需要图的 slot，规划配图内容，写入 `output/image-plan.md`。**新 schema 强制要求**：
- `visual_brief`：1-2 句白话"这张图必须画什么"
- `required_entities`：必须出现的具体物体列表（内容审核依据）
- `must_match_excerpts`：章节中支撑这些实体的原句
- 沿用字段：`slot_id`、`section_index`、`chapter_title`、`core_point`、`composition_type`、`source_excerpt`、`prompt_strategy`

详细正反例和填写规范见 `skills/article-visual-design/references/content.md`。

**产出**：`output/visual-rhythm-plan.md`, `output/cover-prompt.md`, `output/cover.png`, `media_id`, `$COVER_CDN_URL`, `$VISUAL_STYLE`/`$COLOR_PALETTE`/`$MOOD`/`$VISUAL_STYLE_SOURCE`, `$TEMPLATE_NAME`, `output/image-plan.md`

### 步骤 7：配图生成与独立内容审核

using the article-visual-design skill 按 `output/visual-rhythm-plan.md` 中 slot 顺序生成。每个需要图的 slot 执行：

#### 7a：构建 prompt 并生成

- 生成成功后按本文章质量闸门单独调用 `analyze_image`；Agent 接受图片后再调用 `upload_image`，三个能力互不隐式触发。

```
generate_image(
  project_id=$PROJECT_ID,
  prompt=<构建的 prompt>,
  image_type="content",
  output_path="output/img_N.png",
  task_id=$TASK_ID,
  ref_image_path=$CONTENT_STYLE_REFERENCE_PATH,
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO
)
```

**关键**：每次 `generate_image` 必须显式传 `aspect_ratio`。用户明确比例时所有图片原样使用 `$EFFECTIVE_ASPECT_RATIO`；智能适配时每张可从 `resolved_profile.allowed_image_ratios` 分别选择。仅当封面开启且人物参考未启用时，令 `$CONTENT_STYLE_REFERENCE_PATH="output/cover.png"`；封面关闭或人物参考启用时不传 `ref_image_path`，只使用文本风格块。即使使用封面，也只能传递风格语言，不得复刻封面主体、构图或核心物件。每张正文图的 `<img src>` 必须来自该图的独立 `upload_image` 调用，严禁复用封面或其他正文图 URL。

#### 7b：独立内容质量审核与失败重试

生成成功后，按质量要求单独调用 `analyze_image`。传输或运行时失败按「独立分析调用」记录警告；调用成功时，Agent 根据可见内容审核结果决定接受或锐化 prompt 重试：
- 必须实体、章节相关性、文字、构图和合规均满足 → 接受，继续下一 slot
- 存在可修订的可见问题 → 根据缺失实体或构图问题锐化 prompt 重试（最多 2 次，共 3 次生成）
- 3 次生成的可见内容质量仍未通过 → 标记 `quality_status=failed`，继续后续 slot

**锐化 prompt 策略**：在 prompt 开头加 `MUST CONTAIN: ` + 独立内容审核指出的缺失实体列表；把 `visual_brief` 改写得更具体（加入材质、颜色、方位、数量）；加强主体权重 "MAIN SUBJECT: <具体物体>"。

#### 7c：独立上传并立即原子落盘

- 图片通过 Agent 的质量判断后调用 `upload_image`，从返回值取得 `wechat_url` 和 `media_id`；上传失败只重试上传，不重新生成，按「MCP 工具使用规则」耗尽后记录 `article_image_upload_failed` warning，保留本地图片并继续。
- **原子写** `output/images.json`：先写 `output/.images.json.tmp` → `fsync` → `rename` 覆盖。**绝不要"攒齐所有图再一次性写"**——每张图返回即落盘。
- 每条记录必须含：`index`、`slot_id`、`section_index`、`image_type`、`chapter_title`、`composition_type`、`visual_brief`、`required_entities`、`must_match_excerpts`、`prompt`、可见内容质量结论、`ref_image_path`、`file_path`、`url`、`wechat_url`、`media_id`、`quality_status`。

#### 7d：插入到文章并回填 rhythm-plan

按 slot 的 `slot_id` + `section_index` 把 `![描述](CDN_URL)` 插入 `output/04-article-final.md`：
- `section_opener`：紧跟 `## 章节标题` 之后
- `inline_detail`：在 `after_paragraph_index` 指定的段落之后
- `hero`：在文章开头（如有 hero module 文字，则在 hero module 之后）

把所有 CDN URL 回填到 `output/visual-rhythm-plan.md` 的 `layout_plan` JSON 块中。

#### 7e：质量验证

生成完成后执行检查：
- [ ] **节奏完整性**：`visual-rhythm-plan.md` 中每个 `##` 都映射到一个 slot
- [ ] **模板一致性**：所选模板的 rhythm 规则被遵守（listicle 的 inline_detail 必须为空、tutorial 的 footer 必填等）
- [ ] **文件完整性**：所有图片文件存在且可访问
- [ ] **风格一致性**：未启用人物参考且封面开启时，内容图可记录 `ref_image_path="output/cover.png"`；封面关闭或人物参考启用时无 `ref_image_path`，并通过文本风格块保持一致
- [ ] **视觉多样性**：3+ 配图使用 3+ 种不同 `composition_type`（`listicle` 模板豁免）
- [ ] **内容审核通过率**：至少 80% 的内容图 `quality_status=passed`
- [ ] **审计完整性**：`images.json` 每条含 `visual_brief` / `required_entities` / `must_match_excerpts` / 可见内容质量结论 / `slot_id` / `section_index` / `wechat_url` / `media_id`
- [ ] **CDN 持久化**：`images.json` 每条都有非空 `wechat_url`（即每张图已上微信 CDN）
- [ ] **正文图片互不相同**：`images.json` 中所有内容图的 `wechat_url` 两两不同，且没有任何一张等于封面 `$COVER_CDN_URL`（封面 URL 仅用于封面记录，**不得复用为正文图**）；Server 最终校验会硬拦截"正文 ≥2 图但唯一 URL==1"的交付包，配图失败时宁可缺图降级也不得用封面/他图顶替

未通过检查时按问题类型处理：单图可见内容质量未通过则降级、节奏/模板违规回步骤 6a/b、内容审核通过率 <80% 回步骤 6e。超过一半章节配图在各自限定重试后仍失败时，记录 `article_content_images_failed` warning 和缺失章节，将交付包 readiness 标记为 `blocked` 并继续生成核心 HTML。

**产出**：更新后的 `output/04-article-final.md`（含 CDN 图片链接）、`output/images.json`、回填后的 `output/visual-rhythm-plan.md`

### Phase 4: 组装交付

### 步骤 8：HTML 渲染（render_template）

using the content-writing skill 渲染 HTML。**不再使用 `convert_markdown` 自由发挥**，改用 `render_template` MCP 工具按节奏计划确定性渲染：

```
render_template(
  project_id=$PROJECT_ID,
  markdown=<output/04-article-final.md 全文>,
  layout_plan=<output/visual-rhythm-plan.md 中的 layout_plan JSON 块>,
  theme=<可选，默认用 project theme>
)
```

`render_template` 服务端按 `layout_plan` 中的 slot 顺序确定性渲染 HTML 骨架，图片占位符按 slot 位置精确插入，layout module 按 `module_vars` 渲染。返回 `{ html, slots_rendered }`。把返回的 `html` 字段保存为 `output/05-article.html`，把 `slots_rendered` 写入 `output/final-review.md` 作为渲染审计。

> **图片单一路径（避免重复 `<img>`）**：`render_template` 按 `layout_plan` 的 slot 自动注入配图 `![alt](image_url)`。若传入的 `markdown`（`04-article-final.md`）里已内联同一张图，服务端**按 URL 去重**——同一 URL 只渲染一个 `<img>`，**无需手动 Edit 清理重复 img**。配图位置以 `layout_plan` 为单一权威路径；`04-article-final.md` 的内联图仅作人工可读 markdown 产物。

> `render_template` 是唯一渲染调用路径；调用不可用或失败时按 `article_mcp_call_failed` 写结构化失败态并停止，不得改用 `convert_markdown` 绕过必需能力。

产出：
- `output/05-article.html`（含 CDN 图片 + 结构化 slot）

### 步骤 9：最终质量验收

创建 `output/final-review.md`，汇总并判定以下硬性项（**图片开关守卫**：封面/配图相关项在对应开关关闭时跳过且不计为失败；纯文字文章时记录「未生成封面，封面记录为空」）：
- 内容质量：`content-quality-report.md` 全部通过，文章贴合用户需求、账号定位和上下文
- **导流风险**：无二维码、联系方式、外链 URL、跳小程序、其他公众号/服务号/视频号、进群、加微信、关注/点赞/留言/转发领资料、回复关键词或多重跳转交易；文章在当前页面提供完整信息
- **模板与节奏**：`visual-rhythm-plan.md` 存在；所选模板的 rhythm 规则被遵守；每个 `##` 章节映射到 slot；封面/配图开启时 `layout_plan` JSON 块的对应 `image_url` 已用 CDN URL 回填（关闭时对应 slot `image_url=null`）
- **配图内容贴切**（仅正文配图开启时）：`image-plan.md` 每张图含 `visual_brief` + `required_entities` + `must_match_excerpts`；`images.json` 中至少 80% 的内容图 `quality_status=passed`
- **封面质量闸门**（仅封面开关开启时）：`cover-prompt.md` 含 `cover_strategy`；`cover-quality.json` 含 `visual_quality_scorecard`、`cover_effectiveness_scorecard` 和人物启用时的身份结论；缺项、任一 `overall_pass=false` 或仅有旧的 6 维视觉评分全为 high 不得通过，并在 `final-review.md` 写入 `cover_quality_gate`
- 视觉一致性（配图开关开启时）：未启用人物参考且封面开启时内容图可使用 `ref_image_path="output/cover.png"`；封面关闭或人物参考启用时内容图不传 `ref_image_path`，只使用文本风格块
- SEO：`seo-result.md` 包含优化后的标题和摘要
- 合规：违禁词和平台合规检查无高风险未处理项
- HTML：`05-article.html` 由 `render_template` 生成（记录在 `final-review.md` 的 `render_audit` 段），图片链接有效，内容未超过平台限制
- 交付字段：title、digest、content 可从前序产物读取；图片元数据按图片模式记录

**审阅闭环**：任一项审阅未通过时标记为待调整，自动回到正文、标题摘要、互动诱因、视觉 prompt 或 HTML 渲染步骤修订，并重新写入 `final-review.md`。全部通过后才可把文章交付包 `readiness.status` 写为 `ready`。

### 步骤 9b：成品互动质量审计

按 `article-viral-strategy` 的 `references/viral-audit.md` 对最终正文、SEO 结果、摘要和启用的视觉产物做 7 维审计，写入 `output/viral-audit.md`。每维必须给出证据；视觉停留必须读取 `cover_strategy`、`cover_effectiveness_scorecard` 和人物身份结论，不得只凭“风格统一”给高分。缺 `viral-audit.md` 不得交付；整体分低于 7.0 或硬性项未通过时，按审计指向回步骤 3 或 5 修订并复审。

### 步骤 10：生成文章交付包

创建版本化 `output/draft.json` 文章交付包：
- `schema_version`：固定为 `1.0`
- `article.title`：步骤 5 优化后的标题（从 `output/seo-result.md` 读取）
- `article.digest`：步骤 5 优化后的摘要
- `article.content_path`：固定为 `output/05-article.html`
- `article.content_sha256`：步骤 8 HTML 原始字节的小写 SHA-256
- `readiness.evidence_paths`：必须恰好且各出现一次地包含 `output/marketing-scan.json`、`output/final-review.md`、`output/viral-audit.md`，不得重复或追加其他路径

全部语义闸门通过时写 `readiness.status="ready"`、`readiness.code=""`，ready 状态严禁携带任何非空 code。营销扫描或审阅仍阻塞时写 `readiness.status="blocked"` 和稳定、非空的 code；内容与 HTML 仍正常交付。

## MCP 工具使用规则

- **必须使用 MCP 工具调用服务端接口**（如 `list_projects`、`generate_image`、`render_template` 等）
- **禁止编写 JavaScript/Node.js/Python 脚本或创建自定义 HTTP 客户端来调用 MCP 接口**
- **必需 MCP 能力调用不可用或失败**：`list_projects`、`get_project_profile`、`list_drafts`、`list_published_articles` 或 `render_template` 任一调用不可用或失败时，写结构化失败诊断并保留已有产物
- **上传调用**：`upload_image` 调用失败时只重试上传（不重新生成），最多重试一次；仍失败在 `output/final-review.md` 记录 `article_image_upload_failed` warning，保留本地图片并继续。视觉失败不得阻止核心 Markdown 与 HTML 继续生成
- **独立分析调用**：`analyze_image` 的传输或运行时失败记录为警告，不得阻塞后续已规划的图片生成，也不得伪造分析结果；最终质量判断由 Agent 负责，并继续受交付前质量闸门约束
- **执行身份错误不可重试**：`generate_image`、`analyze_image` 或 `upload_image` 返回 `execution_identity_required` / `execution_identity_mismatch` 时，这是运行时身份故障，不是 prompt、比例、供应商或创作质量问题。不得更换 prompt、`image_type` 或工具重复尝试；保留全部已有产物，在 `output/final-review.md` 记录 `execution_identity_unavailable` warning 和 `resume_from=image_generation`，跳过剩余视觉与交付包步骤并继续生成核心 HTML。诊断不得包含令牌、密钥或完整环境变量。`submit_completion_metadata` 的身份错误只影响反馈提交，不得改变服务端文件契约判定
- **唯一配置兜底**：仅当 `get_project_profile` 调用成功但缺少可选语义配置（如 `visual_style`、`writer` 或 `theme`）时，才可采用 Agent 默认值并记录来源；只有这种成功响应中的可选字段缺失允许继续，调用失败不属于配置缺失
- **Runtime 工作区边界**：托管 runtime 已预创建任务私有的 `output/`；Agent 只写显式 `output/<filename>`，不得创建、发现、移动或重命名该目录。
