---
name: ecommerce-platform-specs
description: 'Use only when the Ecommerce workflow needs platform dimensions, module rules, or prohibited-word checks. Do not trigger for general product-image requests.'
---

# 电商平台规范与合规

## 目录

- [上游方法源](#上游方法源只读)
- [平台规范](#平台规范)
- [合规检查流程](#合规检查流程)
- [产出](#产出)

电商合规比种草更严，且与《广告法》强相关。本 skill 提供两件事：
1. **平台规范**：按 `target_platform` 注入尺寸/主图规则/详情结构偏好。
2. **合规扫描**：扫描图内文字与文案的极限词/违禁词，生成合规报告。

**违禁词库独立编写电商版**（广告法 + 平台电商规则），不复用种草的 prohibited-words（那是诱导互动域，与电商广告法域不同）。

## 上游方法源（只读）

宣称分类、证据边界、品类保守口径与国内广告法执行规则以上游 bundled `ecommerce-visual-copywriting-skill` 为准（`$UPSTREAM_ECOMMERCE_SKILL`）。本阶段读取上游 `compliance-rules.md`（含第 10 节）、`source-notes.md`、`category-notes.md` 与对应平台 playbook，按 [references/upstream-compliance-mapping.md](references/upstream-compliance-mapping.md) 落盘；平台尺寸/白底/数量仍以 `platforms.md` 为准。

---

## 平台规范

详见 [references/platforms.md](references/platforms.md)，覆盖：淘宝天猫 / 京东 / 抖音电商 / 种草笔记电商 / **微信小店（新增）** / 通用。

**先归一化**：收到的 `target_platform`（`taobao`/`jd`/`douyin`/`xhs`/`wechat_store`/`general`）按 platforms.md 顶部「标识符契约表」映射到对应中文章节取规范；未知值 → 走「通用」。类目内差异（服饰/3C/食品/美妆/家居）详见 [references/category-specs.md](references/category-specs.md)。

agent 生成时按 `target_platform` 取投放像素/比例/数量/白底规则；本 skill 合规检查时取平台额外违禁规则。生成只把业务允许的纯比例传给 `generate_image.aspect_ratio`，清晰度写 prompt 与规划；实际投放以 platforms.md 的像素/文件大小/数量上限为准，必要时调用 `compress_image(...)` 或 `crop_image(...)`。

---

## 合规检查流程

### 步骤 1：收集待检文本

从 `output/copywriting.md`（卖点/主图/详情/分享文案）与 `output/asset-plan.md`（每张图「必须出现的卖点文字」）收集全部面向买家的文字。

### 步骤 2：宣称分类与证据核对

先按上游 `compliance-rules.md` 判定每条文字的宣称类型（商品事实 / 性能 / 数据 / 认证 / 比较 / 价格 / 评价 / 健康），对照 `output/copywriting.md` 的证据账本：

- 只允许「已确认 / 有依据」进入图内文字；「待补证」改写为中性表达或删除，并进入待确认清单。
- 数据、认证、对比、价格促销必须能追溯来源与适用条件；引证出处、实验条件、适用范围与期限要进入消费者可见文字层。
- 高风险品类（普通食品/保健食品/医疗器械/母婴/化妆品）按上游品类保守口径处理。

### 步骤 3：极限词/违禁词扫描

对照 [references/prohibited-words-ecommerce.md](references/prohibited-words-ecommerce.md) 扫描：
- **《广告法》极限词**（最/第一/国家级/顶级/极品/100%/绝对/永久/根治/无效退款……）
- **平台电商违禁词**（虚假承诺、医疗/功效绝对化、贬损竞品、诱导违规等）
- **平台专属词**（按 `target_platform`：淘宝「原单/代购」类目词、京东冒用「自营」、抖音诱导互动、微信裂变、种草笔记导流）

**上下文敏感扫描**（避免误报与漏报）：
- 同字不同义：「第一代/第一视角」= 序数/客观陈述，放行；「销量第一/好评第一」= 极限化广告宣称，命中。
- 注册名/成分名含敏感字（如「极地」「金牌」「臻致」为商标或成分名）→ 标注疑似误报、人工复核，不自动删核心信息。
- 客观参数陈述（实测数据/认证编号）≠ 广告宣称，放行；但须有据可查。
- 功效类品类（美妆/健康/电子）额外严查「承诺治愈/绝对功效」，并核对备案号格式（保健食品蓝帽子/特殊化妆品特证/医疗器械注册号）。

### 步骤 4：生成合规报告

产出 `output/compliance-report.md`：

```markdown
# 合规检查报告

## 扫描范围
- 文案文件: copywriting.md
- 资产规划: asset-plan.md（逐图文字层）
- 目标平台: {target_platform}

## 宣称类型与依据
| 宣称/文字 | 类型 | 证据账本行/状态 | 处理 |
|---|---|---|---|

## 逐图合规自检
- {图号}: 文字层 → 通过 / 阻断 / 待人工复核

## 可见出处与条件
- {引证出处、实验条件、适用范围、期限}

## 高风险项（必须改写并重生成相关图）
- {词/宣称} 出现在 {位置} → 建议 {改写}

## 中风险/疑似误报（标注人工复核，不自动删核心信息）
- ...

## 平台专项
- {该平台额外规则检查结果}

## 平台规则核验状态
- 已核验 / 未核验（标明依据与日期）

## 结论
- 高风险: N 项（已处理 / 待处理）
```

**处理原则**：
- 高风险极限词/违禁词**必须删除或改写**，并重生成含该文字的图。
- 疑似误报（如产品名本身含敏感字）只记录标注人工复核，**不自动删除核心信息**。
- 功效类（美妆/健康/电子）额外严查「承诺治愈/绝对功效」。
- 平台规则与法律有时效性：无法核验时写「未核验」，不把历史经验写成现行规定；不宣称「保证过审」。

---

## 产出

- `output/compliance-report.md`

合规是硬约束：命中高风险词的图未改写前不得交付。
