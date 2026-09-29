---
name: trending-topics
description: Use when a content workflow needs current public hot topics, a platform trend snapshot, or trend candidates for topic discovery.
---

# 热点发现

只通过 Anban MCP 的 `list_trends` 获取公共热点。该 Skill 负责发现和整理证据，不负责决定最终选题或创作正文。

## 规则

- 调用 `list_trends` 时只把项目平台或用户指定的平台映射到 `platforms` 参数；未指定时使用公众号可用的微博、抖音、知乎、B 站、百度、头条组合。账号关键词只能用于调用后的相关度排序，不能伪装成 MCP 参数或返回字段。
- 禁止直接访问热搜网站、第三方热搜 API、网页抓取工具、自定义 HTTP 客户端或脚本绕过 MCP。
- 保留每个平台返回的 `title`、`hot`、`url`、`rank`、`fetched_at`、`expires_at`、`stale`、`source`、`last_error`。没有的字段写 `unknown`，不补造热度。
- `stale=true` 只能作为过期快照证据，不能描述为实时热搜；刷新失败时保留旧数据并记录失败原因。
- 跨平台重复话题可以合并，但必须保留原平台和原始标题，不能把推断写成 MCP 返回值。

## 输出

输出 5-10 个候选或用户要求的数量，按相关度、热度证据和时效排序。每个候选包含：

```text
topic=<原始标题>
platform=<平台>
rank=<排名>
hot=<热度或 unknown>
url=<链接或 unknown>
fetched_at=<时间或 unknown>
expires_at=<时间或 unknown>
freshness=<fresh|stale|unknown>
source=<Server source 或 unknown>
last_error=<错误或 none>
evidence=<仅基于返回字段的简短说明>
```

需要生成内容方向时，把候选交给 `trend-rider`；不要在本 Skill 内替代借势判断。公众号和种草笔记的额外筛选规则见 [references/platforms.md](references/platforms.md)。
