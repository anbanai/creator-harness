---
name: moments
description: Use when generating WeChat Moments / 朋友圈 content packages from source material, project positioning, product notes, case notes, launch copy, personal-brand snippets, or private-domain sales briefs.
---

# Moments / 朋友圈素材包

## 定位

本 skill 直接产出 Anban 朋友圈素材包，不做自动发布，不接定时计划，不依赖运行时外部仓库。方法参考 `Caihui0127/caihui-moments-skill` 的内容拆解框架，但只借鉴公开方法：**不默认使用“彩卉”人设**，不复制私有素材，不把参考 repo 作为运行时依赖。

## 固定产物

生成五个必需文件：

1. `output/material-analysis.md`：素材分类与四层抽取。
2. `output/content.md`：朋友圈正文、备选开头/结尾、发布建议。
3. `output/image-prompts.md`：配图用途、有效比例、能力和最终提示词。
4. `output/moments-image.png`：与正文匹配的一张朋友圈配图。
5. `output/quality-review.md`：真实感、诱导互动、空泛营销、证据不足检查。

## 图像参数合同

从 `get_project_profile` 读取 `resolved_profile.image_ratio`、`resolved_profile.allowed_image_ratios` 和 `resolved_profile.image_capability_key`。用户明确比例时原样作为 `$EFFECTIVE_ASPECT_RATIO`；智能适配时根据正文结构从 `allowed_image_ratios` 中选择一个具体比例。最终提示词必须明确描述该画布比例，每次调用都显式传 `aspect_ratio`：

```
generate_image(project_id=$PROJECT_ID, task_id=$TASK_ID, prompt=<最终提示词，明确最终画布比例>, image_type="content", output_path="output/moments-image.png", aspect_ratio=$EFFECTIVE_ASPECT_RATIO)
```

只允许在同一用户比例和同一 `image_capability_key` 下细化提示词并有限重试；不得切换比例、能力、自动裁剪或静默回退。

## 输入理解

把用户给出的资料先归入六类素材，可多选但必须确定主类型：

| 类型 | 适用素材 | 核心目标 |
| --- | --- | --- |
| 发售 | 上新、开营、活动、名额、优惠 | 清楚说明机会与行动理由 |
| 人设 | 日常观察、经历、价值观、工作片段 | 建立可信、鲜活、可持续的人 |
| 产品 | 功能、服务、课程、方案、卖点 | 让读者理解价值与适用场景 |
| 案例 | 客户过程、复盘、前后变化、反馈 | 用证据呈现解决问题的能力 |
| 生活 | 真实日常、情绪、关系、休息、现场 | 增加松弛感与长期信任 |
| 认知 | 观点、方法论、行业判断、反常识 | 输出判断力和专业框架 |

然后做四层提炼：

- **观点层**：这条朋友圈真正想表达的判断、立场或提醒。
- **框架层**：用什么结构让读者顺着看完，例如问题-洞察-建议、场景-转折-结论。
- **风格层**：语气、密度、人称、句长、生活感和克制程度。
- **人设层**：这条内容如何服务项目主理人/品牌的长期可信形象。

## 结构检查

### 产品型朋友圈

- 开头必须进入具体使用场景或真实问题，不能只喊卖点。
- 中段写清“谁适合、解决什么、为什么可信、怎么开始”。
- 结尾给轻行动建议，避免强迫式催单。
- 禁止夸大功效、承诺收益或把未验证体验写成事实。

### 案例型朋友圈

- 先确认案例证据来源：用户原文、可引用反馈、过程记录、公开数据。
- 没有证据时只能写“匿名复盘/典型问题”，不得伪造客户案例、成交数据、用户反馈。
- 结构建议：背景困境 → 关键动作 → 可验证变化 → 复盘启发。
- 涉及隐私时去标识化，不暴露姓名、联系方式、订单号等敏感信息。

### 发售型朋友圈

- 写清对象、结果、形式、节奏、名额/时间等真实信息。
- 先给价值判断，再给行动入口；不要只堆稀缺感。
- 稀缺、价格、赠品、截止时间必须来自素材，不能编。
- 结尾允许“想了解可以私信/看详情”，避免诱导转发、集赞、强互动。

## 写作流程

1. 读取项目画像：调用 `get_project_profile(project_id=$PROJECT_ID, scope="moments", task_id=$TASK_ID)`，读取返回的 `instructions`、`keywords`、`author`、`moments` block。
2. 归纳素材：在 `material-analysis.md` 写明主类型、辅助类型、四层提炼、证据清单、缺口。
3. 生成正文：在 `content.md` 写 1 条主版本，2-3 个备选开头，2 个备选结尾，发布时间/配图建议。
4. 生成配图：基于正文与项目视觉风格写 `image-prompts.md`，再按图像参数合同生成 `moments-image.png`。
5. 去 AI 味：必要时 using the `humanizer` skill，减少空泛升华、套话、过度营销词。
6. 质量复盘：在 `quality-review.md` 检查真实感、诱导互动、空泛营销、证据不足、隐私与合规。

## `material-analysis.md` 模板

```markdown
# 素材分析

## 素材分类
- 主类型：
- 辅助类型：
- 判断依据：

## 四层提炼
- 观点层：
- 框架层：
- 风格层：
- 人设层：

## 证据清单
- 可直接使用：
- 需要弱化表达：
- 不得使用/不得编造：

## 结构选择
- 使用结构：
- 原因：
- 风险：
```

## `content.md` 模板

```markdown
# 朋友圈正文

## 主版本
[可直接发布正文]

## 备选开头
1.
2.
3.

## 备选结尾
1.
2.

## 发布建议
- 建议时段：
- 配图建议：
- 适合人群：
- 不建议发布的条件：
```

## `quality-review.md` 模板

```markdown
# 质量复盘

## 真实感
- 结论：
- 需要调整：

## 诱导互动
- 结论：
- 风险表达：

## 空泛营销
- 结论：
- 已删改：

## 证据不足
- 结论：
- 降级表达：

## 最终状态
- 是否可发布：
- 人工复核点：
```

## 红线

- 不伪造客户案例、成交数据、用户反馈。
- 不把“彩卉”或参考 repo 的人物经历、案例、口吻默认套到用户项目上。
- 不把用户没有提供的收入、转化率、客户身份、真实反馈写成事实。
- 不用“转发/集赞/评论领资料”等诱导互动。
- 不输出只有营销口号、没有场景和证据的朋友圈。
