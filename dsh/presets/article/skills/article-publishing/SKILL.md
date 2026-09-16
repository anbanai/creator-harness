---
name: article-publishing
description: 'Use when explicitly creating or managing WeChat news article drafts, or when a user asks to inspect the 草稿箱. Managed Article executions use this skill only for the handoff package; automatic publication is Server-owned.'
---

# 微信公众号图文文章发布

## Ownership Boundary

There are two deliberately separate modes:

- **Managed Article execution**: do not call `create_draft`, do not decide publication state, and do not write a result file. Produce only `output/draft.json` with `schema_version="1.0"`, final title/digest, fixed `output/05-article.html` path, its lowercase SHA-256, and readiness evidence. Server supplies the frozen author and current cover `media_id`, then owns every WeChat side effect and terminal outcome.
- **Explicit interactive request**: an authenticated user may call the atomic `create_draft` MCP capability with a validated `articles` item. Its lifecycle and reconciliation remain Server-owned; never infer success from logs or local files.

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。


## MCP 工具

| MCP 工具 | 说明 |
|----------|------|
| `upload_image` (project_id, file_path) | 上传图片到微信素材库 |
| `create_draft` (project_id, task_id, articles) | 为当前文章任务创建图文草稿 |
| `list_drafts` (project_id) | 查看已有草稿 |
| `list_published_articles` (project_id) | 查看已发布文章 |

---

适用于：带 HTML 排版的长文、深度文章。

## 草稿管理

查看发布历史：调用 `list_drafts` 和 `list_published_articles` MCP 工具。

## 使用方式

只有显式交互式请求才通过 MCP 工具调用 `create_draft`，传入当前运行上下文中的 `project_id`、`task_id`，并根据本节格式现场组装 `articles` 数组。托管 `output/draft.json` 是 Server 发布包，不含 `articles`，托管 Article 执行禁止调用该能力。

 ## 托管执行发布包格式

 托管 Article 只写入下面的版本化发布包，不把 `articles` 请求直接交给微信，也不写发布结果：

 ```json
 {
   "schema_version": "1.0",
   "article": {
     "title": "最终标题",
     "digest": "最终摘要",
     "content_path": "output/05-article.html",
     "content_sha256": "小写 SHA-256"
   },
   "readiness": {
     "status": "ready",
     "code": "",
     "evidence_paths": [
       "output/marketing-scan.json",
       "output/final-review.md",
       "output/viral-audit.md"
     ]
   }
 }
 ```

 `readiness` 只记录 Agent 的语义审核事实；Server 会重新读取固定产物、校验哈希和安全规则，并从冻结任务快照读取作者、从当前执行封面文件读取 `thumb_media_id`。

 ## 显式交互式请求格式

 只有用户明确要求创建草稿时，才用 `create_draft` 的 `articles` 请求格式：

```json
{
  "articles": [
    {
      "title": "文章标题",
      "content": "<p>HTML 正文...</p>",
      "author": "署名（仅取自 get_project_profile 顶层 author，详见「作者字段来源」）",
      "digest": "摘要（120字符以内）",
      "thumb_media_id": "封面图的 media_id",
      "show_cover_pic": 1
    }
  ]
}
```

自动草稿不得传 `content_source_url` 或 `url`；这两个字段会形成公众号外链入口，服务端按确定性营销规则阻止发布。正文图片的微信 CDN `src` 不属于外链入口。

## 作者字段来源（硬性）

显式交互式请求的 `articles[0].author`（公众号署名）**必须且仅能**取自 `get_project_profile` 返回的**顶层 `author`** 字段（已按 task > project 两层解析；可看返回的 `author_source` 追溯来源）。托管执行不把作者写入 `output/draft.json`，由 Server 从冻结任务快照读取。

- 顶层 `author` 非空 → `articles[0].author = <顶层 author>`，**原样填入，不改写**。
- 顶层 `author` 为空 → **省略 `author` 字段**（或留空），由公众号后台用默认署名。
- **严禁**用下列任一字段顶替 `author`（它们都**不是**署名）：
  - `writer`：writer 资源 key（如 `dan-koe`），决定文风，不决定署名。
  - 写作风格头像/昵称：仅 Studio 展示元数据，不会出现在 `get_project_profile`，不得用于发布。

- **署名污染自检（防回归闸门）**：若顶层 `author` 命中 `get_project_profile` 返回的 `available_writers` 中任一写作风格的**人设名**（`name`，如 "Dan Koe"）或 **key**（`english_name`，如 `dan-koe`），几乎肯定是上游把写作风格误写进了署名字段——真实发布署名不该等于某个写作风格人设。此时**不要盲目发布**：按真实发布者署名修正后再发，并在 `submit_agent_feedback` 里标注「疑似署名污染：author 命中 writer 人设 X」。仅当署名确属真实同名（如作者本人就叫某人设名）才放行。

映射示例：

```
get_project_profile 返回            → 交互式 articles[0].author
author = "张三"                      → "张三"
writer = "dan-koe"                  → 不入 author（仅用于正文口吻）
author 为空                         → 省略 author 字段（切勿用 writer 顶替）
```

## thumb_media_id 来源（按图片开关，硬性）

公众号文章的封面可由用户在创建任务/计划时关闭。`thumb_media_id`（封面 media_id）的填法**严格取决于结构化运行控制 `article_image_mode`**。缺少该键时写入 `output/failure-state.json`（`error_code=article_image_mode_missing`、`resume_from=project_resolution`），保留已有产物并结束当前执行，不得猜测默认值：

| `article_image_mode` | 封面开关 | `thumb_media_id` 填法 |
|----------------------|----------|------------------------|
| `cover_and_content` | 开 | 填步骤 6 封面的 `media_id` |
| `cover_only` | 开 | 填步骤 6 封面的 `media_id` |
| `content_only` | 关 | **省略 `thumb_media_id` 字段**（即使有正文配图也**不复用**作封面） |
| `text_only` | 关 | **省略 `thumb_media_id` 字段**；在 `final-review.md` 记录「未生成封面，公众号后台可能不显示封面/需手动设置」 |

**关键约束**：封面开关关闭 → 一律不设 `thumb_media_id`，**绝不**用任何正文配图的 `media_id` 顶替。服务端 `create_draft` 对 `thumb_media_id` 是可选的，省略它不会导致发布失败——公众号后台只是不显示封面（用户已知情选择）。封面开关开启但封面 `media_id` 缺失（生成失败）才是真正的发布阻塞，需回到 `article-cover-design` skill 重新生成。

## 响应格式

```json
{
  "draft_media_id": "draft_media_id_xxx",
  "status": "drafted"
}
```

## 显式交互式发布工作流

本节只适用于用户在交互会话中明确要求立即创建草稿；托管 Article 执行只使用前述发布包格式，不执行本节。

1. 调用 `render_template`（带 `layout_plan`）将 Markdown + 节奏计划确定性渲染为 WeChat HTML（替代旧的 `convert_markdown`）
2. 调用 `generate_image` 生成封面；如需质量审核则单独调用 `analyze_image`。**流水线场景**：已有封面 `media_id` 时直接复用，跳过本步
3. 质量通过后调用 `upload_image` 取得 `media_id` + `wechat_url`。上传失败只重试上传，不重新生成
4. 按「显式交互式请求格式」现场组装 `articles`，调用一次 `create_draft(project_id=$PROJECT_ID, task_id=$TASK_ID, articles=<组装后的数组>)` 创建草稿。不要从托管 `output/draft.json` 读取 `articles`。调用后不在 Agent 侧重试；幂等、安全重试、对账和终态均由 Server 负责。结果不明确时只展示 Server 返回的状态

## 流水线集成

托管 article 流水线只使用本 skill 的发布包格式；显式交互式发布使用本节。前置条件：

| 前置产出 | 来源 | 用途 |
|----------|------|------|
| `output/05-article.html` | content-writing skill（通过 `render_template` 生成） | 作为 articles[0].content |
| `output/cover.png` 的 `media_id` | article-visual-design skill（已通过内容审核） | 作为 articles[0].thumb_media_id |
| `output/seo-result.md` | seo-optimization skill | 提取优化后的标题和摘要 |
| `output/visual-rhythm-plan.md` | article-visual-design skill | 渲染审计参考（HTML 应已按 plan 渲染） |
| `output/images.json` | article-visual-design skill | 视觉审计参考（含可见内容质量结论） |

## 发布前验证

创建草稿前，确认以下所有项（封面 `media_id` 项**仅在封面开关开启时**要求；关闭时不带 `thumb_media_id`，见「thumb_media_id 来源」）：

- [ ] HTML 文件存在且内容完整
- [ ] 封面 `media_id` 已获取（非空，**仅封面开关开启时**）
- [ ] 标题使用 SEO 优化标题（来自 seo-result.md）
- [ ] 摘要使用 SEO 优化摘要（来自 seo-result.md）
- [ ] 内容大小 < 20,000 字符或 1MB

## 注意事项

- 内容格式为 HTML，所有 CSS 必须内联
- 封面图需通过 thumb_media_id 指定
- 内容大小限制：< 20,000 字符或 1MB
- 安全标签：section, p, span, strong, em, h1-h6, ul, ol, li, blockquote, pre, code, table, img, br, hr

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 草稿创建失败 | media_id 无效或过期 | 重新上传封面图获取新 media_id |
| 内容超限 | HTML 超过 20,000 字符 | 精简文章内容或拆分为多篇 |
| 标题过长 | 超过 64 字符 | 缩短标题 |
| 摘要过长 | 超过 120 字符 | 缩短摘要 |

## 参考文档

- 微信API参考：[wechat-api.md](references/wechat-api.md)
