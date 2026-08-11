---
name: seednote-research
description: 'Use when analyzing Seednote topics, scoring engagement, researching trending seednote content, or fetching source note details for replicate mode. Also use when user mentions ''种草笔记选题'', ''热门笔记'', ''竞品分析'', ''笔记分析'', or when the seednote pipeline calls for topic discovery or source note fetching. Analyzes Seednote (种草笔记) topics, trending notes (热门笔记), and scores engagement potential (互动率评分).'
---

# 种草笔记选题研究

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## 已认证的小红书数据入口

小红书真实外部数据只通过已认证的 Anban MCP 工具获取，固定顺序为：

1. 调用 `check_seednote_login_status` 检查服务端登录态。
2. 已登录后调用 `search_seednote_feeds` 搜索真实笔记。
3. 从搜索结果或输入的完整签名 URL 取得真实 `feed_id` 与 `xsec_token`，再调用 `get_seednote_feed_detail`。
4. 需要作者公开画像时，使用详情或搜索结果中的真实用户标识调用 `get_seednote_user_profile`。

`get_seednote_login_qrcode` 仅用于操作员恢复登录：登录失效时可取得二维码并把恢复方式写入诊断，但托管任务不得等待扫码、轮询人工操作或把二维码当成自动研究步骤。

本 skill 只读：允许登录状态、搜索、笔记详情和用户公开资料查询；禁止发布、删除、关注、取关、点赞、收藏、评论写入等写操作。禁止直连 sidecar、私有端口、浏览器抓取器，禁止编写 Python、JavaScript/Node.js 或自定义 HTTP 客户端，也禁止调用任何外部小红书客户端。不得绕过 Anban MCP 的认证、审计与协议边界。

原创模式外部研究不可用时，原创模式不得失败、不得写 `output/failure-state.json`：改用用户明确主题、选题池、账号画像和已有标题完成保守选题，并如实记录缺失数据。不得把本地判断描述成热门数据或互动率证据。复刻模式若只提供外部笔记 ID/链接且无法取得任何源内容，才属于无法满足核心输入的可恢复失败。

## Anban MCP 工具

| MCP 工具 | 说明 |
|----------|------|
| `claim_topic` (project_id, task_id?) | 从项目选题池认领下一个未用选题；原创模式选题池非空时优先使用 |
| `list_project_titles` (project_id) | 查看系统内已有标题；定标题前必调 |
| `check_seednote_login_status` | 检查已认证的小红书服务端登录态 |
| `get_seednote_login_qrcode` | 仅在需要操作员恢复登录时取得二维码 |
| `search_seednote_feeds` | 按关键词搜索真实笔记并返回可追溯标识 |
| `get_seednote_feed_detail` | 使用真实 `feed_id` 与 `xsec_token` 获取详情和互动字段 |
| `get_seednote_user_profile` | 获取搜索或详情结果对应的公开用户资料 |

传输错误、超时或临时 MCP 不可达时，原调用只重试一次。认证失败、参数错误、未登录和业务拒绝不是传输失败，不得盲目重试；未登录时仅记录操作员恢复方式。每次调用都保留原始结构化错误摘要，不得通过其他通道补取数据。

## xsec_token 与来源合同

`feed_id` 和 `xsec_token` 只能从 `search_seednote_feeds` 返回结果、`get_seednote_feed_detail` 返回结果或用户提供的完整签名 URL 中提取，不能凭空构造。裸 note ID 不足以证明 token；复刻模式必须保留 token 来源。

研究产物必须记录：

```text
data_source=xiaohongshu-mcp
token_source=<search|detail|signed_url|missing>
missing_fields=<缺失字段列表；无缺失时写 none>
fallback_reason=<无降级则写 none>
```

`data_source=xiaohongshu-mcp` 表示数据经过已认证的 Anban MCP 能力取得；当外部数据未取得时仍保留该目标来源，并用 `missing_fields` 与 `fallback_reason` 准确说明降级，绝不伪造成成功采集。

## 完整研究流程

### 步骤 0：确定选题来源（仅原创模式）

复刻模式不做选题，直接进入「复刻模式源笔记获取」。原创模式先检查任务 user prompt：

1. 任务已指定主题：直接采用主题，禁止调用 `claim_topic`，将其作为搜索关键词；外部评分仅作参考。
2. 任务未指定主题：先调用 `claim_topic(project_id="$PROJECT_ID", task_id="$TASK_ID")`。返回非空 `topic` 则采用；返回 `null` 时再结合账号画像、已有标题和可用外部数据选题。

项目 profile 的 keywords 不是已经指定的主题。选题池是正式业务输入，不得因为外部搜索可用而跳过。

### 步骤 1：查重

调用 `list_project_titles(project_id="$PROJECT_ID")` 查看已有标题，后续标题必须避开重复和近似表达。

### 步骤 2：采集真实热门笔记

根据账号定位和用户需求确定 2-3 个搜索关键词。先检查登录态；已登录后搜索笔记，再选择 Top 3-5 条结果获取详情，需要作者画像时查询公开用户资料。所有详情调用必须使用搜索结果或完整签名 URL 给出的真实 `feed_id` / `xsec_token`。

任一传输失败只重试一次。登录不可用、工具不可用或重试后仍无外部数据时，跳过后续外部调用并继续原创流程。`output/topic-analysis.md` 必须记录 `data_source=xiaohongshu-mcp`、`token_source=missing`、`missing_fields=external_hot_data` 和具体 `fallback_reason`。

### 步骤 3：分析热门笔记

只有取得真实外部数据时才提取：标题句式和情绪词、封面信息层级、正文钩子和段落结构、评论信号、标签组合。缺失的评论或作者字段必须进入 `missing_fields`，不得推测补齐。

### 步骤 4：评分与选题

只有取得真实互动字段时才使用 2026 小红书 CES 互动评分模型：

```text
topic_score = engagement_rate × recency_weight × novelty_bonus
engagement_rate = (like_count×1 + collect_count×1 + comment_count×4 + share_count×4) / max(total, 1)
recency_weight: 24h→1.0, 7d→0.8, 30d→0.5, 更早→0.3
novelty_bonus: 同角度笔记<3 → 1.2, 否则 → 1.0
```

字段缺失时按 0 计入并在 `missing_fields` 中记录；不要补造数据。无外部数据时不得套用 CES 或伪造互动率，改按“用户主题匹配度、账号定位匹配度、与已有标题差异度、内容具体性”记录定性依据。评分明细或降级依据、最终选题理由和来源合同写入 `output/topic-analysis.md`。

## 复刻模式源笔记获取

当用户提供笔记 ID 或链接时，本 skill 只负责获取源笔记详情，不做爆款模板分析：

1. 先调用 `check_seednote_login_status`；未登录时可调用 `get_seednote_login_qrcode` 记录操作员恢复方式，然后进入可恢复失败判断，不等待扫码。
2. 已登录时，通过 `search_seednote_feeds` 或用户输入的完整签名 URL 获取真实 `feed_id` 与 `xsec_token`。
3. 调用 `get_seednote_feed_detail`；需要作者公开资料时调用 `get_seednote_user_profile`。传输失败时原调用重试一次。
4. 将原始详情、互动数据、评论摘要、`data_source=xiaohongshu-mcp`、`token_source`、`missing_fields` 和 `fallback_reason` 写入 `output/source-note.md`。
5. 后续由 `seednote-viral-analysis` skill 读取 `output/source-note.md`，生成 `output/source-analysis.md` 和任务内 `output/viral-template.json`。

**边界**：不要在本 skill 中提取爆款模板、持久化全局模板或生成改写正文。若任务仅有外部 ID/链接，且登录恢复提示或一次传输重试后仍无法取得源内容，写结构化 `output/failure-state.json`，字段包含 `version`、`status=recoverable_failure`、`stage=research`、稳定 `error_code`、原始错误摘要和 `resume_from=research`；这条失败规则不适用于原创模式。

## 产出要求

| 模式 | 产出文件 |
|------|----------|
| 原创模式 | `output/topic-analysis.md`（候选话题、真实外部评分或降级依据、最终选题理由、来源合同） |
| 复刻模式 | `output/source-note.md`（源笔记原始详情、互动数据、评论摘要、来源合同、数据缺失项） |
