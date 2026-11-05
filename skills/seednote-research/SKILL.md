---
name: seednote-research
description: 'Use for Seednote topic research/source-note retrieval, not writing, visuals or competitor research.'
---

# 种草笔记选题研究

## 范围与边界

通过 Anban MCP 只读研究公开资料。禁止登录、扫码、退出登录、点赞、收藏、评论、关注、发布、删除、直连私有服务或自定义 HTTP 客户端。失败留结构化错误；传输错误最多重试一次，认证或参数错误不盲重试。原创研究失败可继续，不编造热度、互动或作者数据。

## 输入与选题约束

结合本轮请求、画像、选题池及历史；明确主题不得因外部研究改题。长期定位和明确禁区是约束；普通主题/形式偏好只用于候选排序，不排除其他合适选题。首批/活动方向仅在明确范围内有效，到期或满足复核条件后重评；范围缺失不视为长期条件。

## 原创流程

1. 明确询问当前公开热点时，先调用 `trending-topics` 获取榜单；普通选题依次考虑用户主题、选题池、项目画像和公开资料。
2. 未指定主题时调用 `claim_topic(project_id="$PROJECT_ID", task_id="$TASK_ID")`；无可认领主题再用画像和公开资料。该工具要求现有任务，返回规范选题 ID `asset_id`；研究产物保留此引用，重试返回同一选题，禁止用队列行 ID 代替。
3. 定题前调用 `list_project_titles(project_id="$PROJECT_ID")` 查重。
4. 热点用 `list_trends`，事实/产品背景用 `search_web`，页面核验用 `fetch_web_page`。保存 URL、域名、引用 ID、抓取时间及缺失字段。
5. 写 `output/topic-analysis.md`：候选角度、证据、查重、风险、最终选题理由及下述来源合同。无外部数据时按主题/定位匹配、历史差异和内容具体性定性判断。

## 复刻流程

1. 仅处理用户提供的公开 URL、分享文本或源内容；用 `fetch_web_page` 读取可访问页面。禁止拼接隐藏参数、调用登录接口、请求用户资料或猜测互动数据。
2. 写 `output/source-note.md`：源标题、正文、图片线索、公开标签、页面时间、引用 URL、缺失的互动/作者字段及来源合同。
3. 页面不可访问且输入仅有外链或 ID 时，写 `output/failure-state.json`：`status=recoverable_failure`、`stage=research`、`resume_from=research`。
4. 交给 `seednote-viral-analysis` 读取源文件生成模板和分析；本 Skill 不改写正文。

## 来源合同与检查

按实际调用填写；未知保留缺失：

```text
data_source=<task_topic|topic_pool|project_context|public_trends|public_web|user_source|missing>
mcp_tools_used=<实际工具列表；未调用为 none>
available=<true|false|unknown>
missing_fields=<缺失列表；无则 none>
fallback_reason=<无降级则 none>
```

热点另记 `trend_source`、平台、`rank`、`hot`、`fetched_at`、`expires_at`、`stale`、`source`、`last_error`。互动数据仅引用页面明示值，不得套用 CES 或推测互动率。研究 JSON 如有，包含 `schema_version`、`status`、`source`、`data_at`、`missing`、`evidence_paths`。
