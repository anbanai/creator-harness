---
name: seednote-research
description: 'Use when researching Seednote topics or retrieving a user-provided source note. Do not trigger for writing, visual generation, or generic competitor research.'
---

# 种草笔记选题研究

## 意图路由

先判断用户是否在询问当前公共热点。明确的热点请求先调用 `trending-topics` 获取公共榜单；普通原创选题遵循选题池、项目资料、已有标题和公开资料的顺序。研究失败时原创流程继续，不得编造热度、互动或作者数据。

## 数据入口

只使用 Anban MCP 提供的业务能力和通用公开网页能力：

1. 已指定主题时直接采用用户主题，不能因为外部研究可用而改写主题。
2. 未指定主题时优先调用 `claim_topic(project_id="$PROJECT_ID", task_id="$TASK_ID")`；没有可认领主题时再使用项目画像和公开资料。
3. 定标题前必须调用 `list_project_titles(project_id="$PROJECT_ID")`，避免重复表达。
4. 公共热点使用 `list_trends`，一般事实和产品背景使用 `search_web`，核验具体页面使用 `fetch_web_page`。保留 URL、域名、引用 ID、抓取时间和缺失字段。
5. 复刻模式只处理用户提供的公开 URL、分享文本或源内容。用 `fetch_web_page` 读取实际可访问页面；不能从链接拼接隐藏参数、调用登录接口、请求用户资料或猜测互动数据。

本 skill 只读。禁止登录、扫码、退出登录、点赞、收藏、评论、关注、发布、删除、直连私有服务或编写自定义 HTTP 客户端。MCP 工具失败时保留结构化错误摘要；传输错误最多重试一次，认证或参数错误不得盲目重试。

## 研究流程

### 原创模式

1. 确定主题来源：用户主题、选题池、项目画像或公开热点。
2. 调用 `list_project_titles` 做查重。
3. 用 `list_trends`、`search_web` 和 `fetch_web_page` 补充可验证的公开证据。
4. 记录候选角度、证据、缺失字段、风险和最终选题理由。没有外部数据时按用户主题匹配度、账号定位匹配度、与历史标题差异度和内容具体性做定性判断。

### 复刻模式

1. 读取用户提供的公开 URL、分享文本或已附带的源内容。
2. 对可访问页面保存标题、正文、图片线索、公开标签、页面时间和引用 URL；页面未提供的互动或作者字段记入缺失项。
3. 页面不可访问且任务只有外部链接或 ID 时，写 `output/failure-state.json`，状态为 `recoverable_failure`，阶段为 `research`，并设置 `resume_from=research`。
4. 后续由 `seednote-viral-analysis` 读取 `output/source-note.md`，生成模板和分析，不在本 skill 中改写正文。

## 产出合同

研究产物记录以下字段，值必须与实际调用一致：

```text
data_source=<task_topic|topic_pool|project_context|public_trends|public_web|user_source|missing>
mcp_tools_used=<实际调用工具列表；未调用写 none>
available=<true|false|unknown>
missing_fields=<缺失字段列表；无缺失时写 none>
fallback_reason=<无降级则写 none>
```

公共热点还要记录 `trend_source`、平台、`rank`、`hot`、`fetched_at`、`expires_at`、`stale`、`source` 和 `last_error`。只有页面明确提供互动字段时才可引用互动数据；不得套用 CES 或推测互动率。

原创模式写 `output/topic-analysis.md`，包括候选话题、证据、查重结果、最终选题理由和来源合同。复刻模式写 `output/source-note.md`，包括源内容、引用 URL、缺失字段和来源合同。研究 JSON 如有，必须包含 `schema_version`、`status`、`source`、`data_at`、`missing` 和 `evidence_paths`。
