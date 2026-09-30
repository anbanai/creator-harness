---
name: article-publishing
description: Use when a user explicitly asks to create a WeChat article draft or inspect WeChat draft and publication history.
---

# 微信公众号草稿管理

本节只适用于用户在交互会话中明确要求立即创建草稿，或查询草稿与已发布文章。文章创作、排版和图片生成不属于本 Skill。

## MCP 能力

| 工具 | 用途 |
|------|------|
| `create_draft` (project_id, task_id, articles) | 创建图文草稿 |
| `upload_image` (project_id, file_path) | 上传已有封面并取得 `media_id` |
| `list_drafts` (project_id) | 查询草稿箱 |
| `list_published_articles` (project_id) | 查询已发布文章 |

只使用当前认证上下文中的 `project_id` 与 `task_id`。不要编造标识，也不要用日志或本地文件推断微信已收到请求。

## 创建草稿

调用前确认：

- HTML 正文已准备完成，CSS 内联，且不含 `script`、`iframe`、`form`、`input`、`style`、`link`。
- 标题不超过 64 字符，摘要不超过 120 字符，正文不超过接口限制。
- 正文图片使用各自的微信 CDN URL；不得用同一图片顶替多个正文图片。
- 有封面时使用已通过审核的封面 `media_id`；只有本地封面时先调用一次 `upload_image`。上传失败只重试上传，不重新生成图片。

### 作者

`articles[0].author` 只取 `get_project_profile` 的顶层 `author`：

- 非空时原样写入。
- 为空时省略。
- 不得使用 `writer`、写作风格名称、头像或昵称顶替。

若顶层 `author` 与 `available_writers` 中的风格名称或 key 相同，先确认它确实是实际署名；无法确认时停止创建，并说明字段冲突。

### 封面

- 有封面：设置 `thumb_media_id`，并令 `show_cover_pic=1`。
- 无封面：省略 `thumb_media_id`，不得用正文图片的 `media_id` 顶替。

### 请求格式

```json
{
  "articles": [
    {
      "title": "文章标题",
      "content": "<p>HTML 正文...</p>",
      "author": "可选署名",
      "digest": "摘要",
      "thumb_media_id": "可选封面 media_id",
      "show_cover_pic": 1
    }
  ]
}
```

不得传 `content_source_url` 或 `url`。正文图片的微信 CDN `src` 不属于外链入口。

现场组装并校验 `articles` 后，调用一次 `create_draft(project_id=$PROJECT_ID, task_id=$TASK_ID, articles=<articles>)`。调用后不在 Agent 侧重试；幂等、安全重试、对账和终态由调用方返回的服务端状态决定。结果不明确时，原样呈现状态，不宣称成功。

成功响应示例：

```json
{
  "draft_media_id": "draft_media_id_xxx",
  "status": "drafted"
}
```

## 查询

- 用户询问草稿箱时调用 `list_drafts(project_id=$PROJECT_ID)`。
- 用户询问发布历史时调用 `list_published_articles(project_id=$PROJECT_ID)`。
- 只呈现工具返回的状态，不根据标题或本地文件补全结果。

## 常见失败

| 问题 | 处理 |
|------|------|
| 封面 `media_id` 无效或过期 | 重新上传已有封面后再提交一次新请求 |
| HTML 不安全或超限 | 返回内容流程修复后，再发起新的创建请求 |
| 标题或摘要超限 | 缩短后重新校验 |
| 返回结果不明确 | 展示原始状态，不在 Agent 侧重试 |

接口字段或错误码需要核对时，读取 [references/wechat-api.md](references/wechat-api.md)。
