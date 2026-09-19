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

### 步骤 6/7：视觉阶段路由

按 [article-visual-design](../article-visual-design/SKILL.md) 选择模板并写 `output/visual-rhythm-plan.md`。任务解析后的 visual_style 配置优先于三维分析，writer 不决定图片视觉。text_only 只做排版规划，所有 image_url=null。

- 封面开启时才调用 [article-cover-design](../article-cover-design/SKILL.md)，传最终正文、context-brief.md、SEO 标题/摘要、有效比例和参考状态。保留 cover-plan.md、cover-prompt.md、cover-quality.json，人物参考仅进封面，项目风格图只分析成文本。
- 正文配图开启时由 article-visual-design 负责 image-plan.md、逐图生成/独立审核/上传与原子更新 images.json；封面关闭或人物参考启用时不传 ref_image_path。
- 领域字段、模板、MCP 参数与质量评分卡见 [生成合同](../article-visual-design/references/generation-contract.md)，不在入口复制。只接受审核通过且已上传的图；正文 wechat_url 两两不同且不复用封面。
- 每图最多 3 次生成，上传最多重试一次；耗尽保留本地图和结构化 warning。视觉失败继续生成核心 HTML 和 `output/draft.json`，readiness.status=blocked。

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

按 [article-viral-strategy 审计合同](../article-viral-strategy/references/viral-audit.md) 对最终正文、SEO 结果、摘要和启用的视觉产物做 7 维审计，写入 `output/viral-audit.md`。每维必须给出证据；视觉停留必须读取 `cover_strategy`、`cover_effectiveness_scorecard` 和人物身份结论，不得只凭“风格统一”给高分。缺 `viral-audit.md` 不得标记 ready；整体分低于 7.0 或硬性项未通过时，按审计指向回步骤 3 或 5 修订并复审。

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
- **执行身份错误不可重试**：`generate_image`、`analyze_image` 或 `upload_image` 返回 `execution_identity_required` / `execution_identity_mismatch` 时，这是运行时身份故障，不是 prompt、比例、供应商或创作质量问题。不得更换 prompt、`image_type` 或工具重复尝试；保留全部已有产物，在 `output/final-review.md` 记录 `execution_identity_unavailable` warning 和 `resume_from=image_generation`，跳过剩余视觉步骤并继续生成核心 HTML 和 blocked 交付包。诊断不得包含令牌、密钥或完整环境变量。`submit_completion_metadata` 的身份错误只影响反馈提交，不得改变服务端文件契约判定
- **唯一配置兜底**：仅当 `get_project_profile` 调用成功但缺少可选语义配置（如 `visual_style`、`writer` 或 `theme`）时，才可采用 Agent 默认值并记录来源；只有这种成功响应中的可选字段缺失允许继续，调用失败不属于配置缺失
- **Runtime 工作区边界**：托管 runtime 已预创建任务私有的 `output/`；Agent 只写显式 `output/<filename>`，不得创建、发现、移动或重命名该目录。
