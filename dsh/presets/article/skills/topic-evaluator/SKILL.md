---
name: topic-evaluator
description: Use when an unproduced topic needs an evidence-based decision on whether to make it, revise its angle, or replace it.
---

# 选题评估

只评估尚未制作的选题，不评估成稿质量，也不重新认领选题池。依据项目 Profile、历史标题、热点/研究证据和实际产能给出可追溯判断。

## 七维评分

每项 1-10 分并写证据：

| 维度 | 方向 | 默认权重 |
|---|---|---:|
| 流量潜力 | 越高越好 | 25% |
| 账号匹配 | 越高越好 | 20% |
| 竞争差异化 | 竞争越低越高 | 15% |
| 时效价值 | 常青或窗口可控越高 | 10% |
| 变现空间 | 越自然越高 | 15% |
| 制作成本 | 成本越低越高 | 8% |
| 合规风险 | 风险越低越高 | 7% |

综合分按权重换算为 100 分：`sum(score / 10 * weight)`。

- `>=70`：做，进入排期
- `50-69`：改方向，至少给两条具体调整
- `<50`：不做，至少给两个替代方向

## 平台证据

- 公众号可以使用 `list_trends` 的新鲜度、跨平台重复和可写材料作为流量/时效证据；过期快照必须标记 `stale`。
- 种草笔记优先使用认证 MCP 的真实笔记字段。真实互动字段齐全时，保留现有 CES 作为外部信号；七维分只解释定位、差异、时效、成本和合规，不与 CES 机械相加。字段缺失时不得补造互动率。
- 用户明确主题优先于热点建议；选题池和历史标题仍是正式业务输入，不能被热点榜跳过。

## 输出合同

```markdown
## 七维评估
| 维度 | 得分 | 证据 | 缺失数据 |
|---|---:|---|---|
| 流量潜力 | /10 |  |  |
...

综合得分: /100
结论: 做 / 改方向 / 不做
替代或优化方向: ...
来源合同: data_source=...; mcp_tools_used=...; available=...; missing_fields=...; fallback_reason=...
```

平台专属补充规则见 [references/platforms.md](references/platforms.md)。

## Evidence boundary

With no usable topic or platform evidence, return `data_insufficient` and low confidence rather than scoring invented signals. The evaluation is advisory only and must not modify a profile, prompt, publish state, or global configuration.
