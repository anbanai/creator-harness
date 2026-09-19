---
name: article-viral-strategy
description: "Use only for the Article workflow's viral strategy checkpoints: selected-topic framing, retention writing, title audit, and final viral audit. Do not trigger for generic SEO or copy editing."
---

# 微信公众号爆款互动引擎

> **证据边界**：互动信号与平台分发描述是可验证前提下的工作假设，不是平台承诺。缺少来源、核验日期或适用范围时，只作为实验性优化；发布前以当前平台规则和实际数据为准。

## 作用与证据范围

为已选题文章提出可实验的开头、结构、标题与互动方案；不替代选题、正文、SEO 或封面 Skill。完读、转发、收藏、评论与打开率用于观察读者反应，不声称它们是微信推荐池的门槛或已知算法权重。情绪、悬念和数字仅在正文有证据支持时使用。

当前未取得可核验的平台算法来源（审计日期 2026-09-19，范围：公众号文章）；所有数量/评分阈值均为内部编辑启发式，可按用户体裁调整。平台规则发生变化或实测无收益时停用相关建议，不据此阻断合规的用户明确要求。法律/营销风险交由 content-writing 扫描与上下文判断，单个词命中不等于违法结论。

## 五维爆款要素总览

| 维度 | 驱动指标 | 关键手法 | 详见 |
|------|----------|----------|------|
| 选题社交货币 | 转发率 | 判货币类型（谈资/实用/身份认同/自我表达/利他）+ 核心情绪 + 时效借势 | [viral-elements.md](references/viral-elements.md) |
| 标题 CTR | 打开率 | 好奇心缺口+情绪+数字+反差+痛点；22–25字；核心词前置；3变体打分 | [title-psychology.md](references/title-psychology.md) |
| 完读率结构 | 完读率 | 黄金三秒6种钩子；情绪弧；金句密度；移动端节奏；悬念留白 | [retention-design.md](references/retention-design.md) |
| 分享率内容 | 转发率 | 情绪/信息/实用价值择一为核心；收藏诱因；转发动机=社交货币 | [viral-elements.md](references/viral-elements.md) |
| 互动诱因 | 评论率 | 选择题/争议留白/经验交换；不靠违规诱导 | [retention-design.md](references/retention-design.md) |

## 接入契约（agent 在 4 个决策点调用本 skill）

本 skill 不独立产出文章，它在 `article` 流水线的四个环节被调用。每个环节产出**可追溯的决策记录**（写入对应 `output/*.md`），不向用户提问。

### 环节 1：选题爆款策略锚定（步骤 2，选题已选定**之后**）

**前置不变式**：选题必须已由 `topic-research` 经 `claim_topic` / `about:` 选定。本环节 **只判定、不重新认领、不换题**（保护选题池防重复消费不变式）。

对已选定的选题，输出「爆款策略」段（追加进 `context-brief.md`）：

- **社交货币类型**：本文给读者的是哪种货币（谈资 / 实用工具 / 身份认同 / 自我表达 / 利他分享，可叠加）——决定转发潜力与写法
- **核心情绪**：本文击中的主情绪（焦虑/好奇/共鸣/愤怒/感动/认同/释然/紧迫…）——贯穿标题、开头、结尾
- **转发潜力**：高/中/低 + 理由（是否给了读者"转发 = 表达我自己"的素材）
- **收藏潜力**：高/中/低 + 理由（是否有清单/步骤/对比/避坑等可保存信息）
- **时效借势**：是否搭季节/节日/热点窗口；若是，标注最佳内容时机

判定方法与货币类型详解见 [viral-elements.md](references/viral-elements.md)。

### 环节 2：写作爆款硬性要求（步骤 3，写作时注入）

与 `content-writing` 既有要求（上下文锚点、具体素材）**并列追加**的爆款要求：

- **黄金三秒开头**：前 100 字（首屏）必须用一个钩子抓住读者。6 种钩子见 retention-design.md（金句定调 / 痛点共鸣 / 热点切入 / 反问悬念 / 故事场景 / 反常识）。禁用"今天来分享…"这类零钩子开场。
- **情绪弧**：全篇情绪有起伏（不是平铺），至少一个"共鸣峰" + 一个"转折/释然"。
- **金句密度**：每千字 ≥3 句可被单独摘出来发朋友圈的金句（短、锐、有观点/画面）。
- **完读率节奏**：段落短（移动端单段 ≤4 行）、小标题信息量足、关键处留悬念。
- **转发/收藏/评论诱因**：全篇各 ≥1 处且与正文价值自然连接，**不靠违规诱导**（不抽奖/不关注换资料）。

设计手法见 [retention-design.md](references/retention-design.md)。

### 环节 3：标题 CTR 层（步骤 5，SEO 之上叠加）

`seo-optimization` 产出关键词与合规标题；本环节在其上叠加 **点击率优化**：

1. 基于核心词 + 社交货币 + 核心情绪，生成 **3 个标题变体**（不同公式：数字型/痛点型/反差型/悬念型/共鸣型）。
2. 按 6 维打分表评分（好奇心缺口 / 情绪强度 / 数字杠杆 / 合规性 / 核心词前置 / 字数 22–25），**选分最高者**为最终标题。打分表见 title-psychology.md。
3. **标题-封面-摘要三位一体**：最终标题的钩子要与封面主视觉、digest 前半句互相强化（同一利益点/同一情绪），形成"刷到就点"的合力。
4. **digest 按 CTR 优化**：不只是塞关键词，前半句要制造"点进去看"的冲动（利益/悬念/反差）。

标题公式库、6 种好奇心缺口、合规边界见 [title-psychology.md](references/title-psychology.md)。

### 环节 4：成品互动质量审计（步骤 9，硬闸门）

对成品（`04-article-final.md` + `seo-result.md` + 封面）按 **7 维** 打分，产出 `output/viral-audit.md`：

1. 选题社交货币
2. 标题 CTR
3. 开头钩子（黄金三秒）
4. 正文价值密度（每段一个信息点）
5. 完读率结构（节奏/情绪弧/金句）
6. 视觉停留（封面 + 配图协同，必须由 Agent 自主完成可见内容审查，读取 `cover_strategy`、`visual_quality_scorecard` 与 `cover_effectiveness_scorecard`，形成可见内容质量评分表，不得只凭"风格统一"或单一自动评分通过）
7. 互动诱因（转发/收藏/评论）

**闸门规则**：整体分 < 阈值 → 回步骤 3 重写并重新审计，不得标记质量验收通过。允许缺 1–2 个非关键维度（降级说明），但 **标题 CTR / 开头钩子 / 合规** 三项必须通过。封面开启时，缺 `viral-audit.md`、缺 `cover_effectiveness_scorecard`、或缺少 Agent 自主完成的可见内容审查与可见内容质量评分表，质量验收不通过。

审计 rubric、阈值、回退规则见 [viral-audit.md](references/viral-audit.md)。

## 与现有 skill 的边界（避免重复/冲突）

| 现有 skill | 做什么 | 本 skill 叠加什么 |
|------------|--------|-------------------|
| topic-research | 选题机制（候选话题评分与筛选） | 选定后判定社交货币/情绪/转发收藏潜力 |
| content-writing | 写作执行 + 去AI味 + 合规 | 开头钩子/情绪弧/金句/诱因等爆款写作要求 |
| seo-optimization | 关键词 + 合规标题 + 摘要 | 标题 CTR 3变体选优 + 三位一体协同 |
| article-cover-design | 封面视觉（CTR 已含） | 标题-封面-摘要三位一体协同 |
| humanizer | 去 AI 味（保情绪/人味） | 互补：humanizer 去痕、本 skill 加爆款杠杆 |

**绝不替换上述 skill 的职责**，只在其产出上叠加互动驱动力。

## references 索引

- [viral-elements.md](references/viral-elements.md) — 五维爆款要素详解 + 社交货币类型 + 爆款公式速查 + 爆款vs普通对比
- [title-psychology.md](references/title-psychology.md) — CTR 标题公式库 + 6 种好奇心缺口 + 合规边界 + 3 变体打分表 + 标题-封面协同
- [retention-design.md](references/retention-design.md) — 黄金三秒 6 种钩子 + 情绪弧曲线 + 金句密度 + 移动端完读率节奏 + 转发/收藏/评论诱因设计
- [viral-audit.md](references/viral-audit.md) — 7 维成品互动质量审计 rubric + 阈值 + 回退规则
