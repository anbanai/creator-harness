---
name: trend-rider
description: Use when a specific hot topic or event must be judged for creator relevance and converted into platform-appropriate content angles.
---

# 热点借势

输入一个明确热点、`trending-topics` 候选或用户给出的事件，结合 Anban `get_project_profile` 返回的定位、关键词、平台和 `agent_config`，判断是否值得借势，并给出可执行方向。不要在本 Skill 内发现热点、抓取外部数据或写完整正文。

## 判断顺序

1. 记录热点来源：`list_trends`、用户主题、认证种草笔记研究或本地上下文。没有来源证据时标 `unknown`。
2. 判断生命周期：爆发（0-4 小时）、高峰（4-24 小时）、衰退（1-3 天）或长尾（3 天以上）。无法确定时标 `unknown`，不要伪造剩余窗口。
3. 判断与账号定位和受众的关联度：高、中、低、无。低或无必须建议不借势，并给至少一个常青替代方向。
4. 选择 2-3 个互不重复的切入角度：专业解读、经验关联、工具方法、反向观点、情绪共鸣、延伸联想。负面事件优先事实、影响和关怀角度，避免消费受害者。
5. 为每个角度给出平台形式、标题方向、核心要点、制作成本、发布窗口和风险。标题方向不得承诺未证实事实。

## 输出合同

```markdown
## 热点借势判断
- 热点与证据:
- 关联度: 高/中/低/无
- 生命周期: 爆发/高峰/衰退/长尾/unknown
- 借势结论: 适合借势/谨慎借势/不建议借势
- 证据新鲜度: fresh/stale/unknown

### 方案 A
- 切入角度:
- 平台与形式:
- 标题方向:
- 核心要点:
- 发布窗口:
- 风险与规避:
```

平台规则见 [references/article.md](references/article.md) 和 [references/seednote.md](references/seednote.md)。完成借势判断后，尚未制作的候选交给 `topic-evaluator`；不要评估已完成稿件。

## Evidence boundary

If the event source or account context is missing, return `data_insufficient`, set evidence freshness to `unknown`, and use low confidence. This Skill gives advisory angles only and must not modify a profile, prompt, publish state, or global configuration.
