---
name: ecommerce-visual-design
description: "Use only during the Ecommerce workflow's visual planning and generation stage for main, detail, cover, share, or SKU assets. Do not trigger as a standalone entrypoint."
---

# 电商视觉设计与生成

## 目录

- [图像参数合同](#图像参数合同图片比例固定规则)
- [上游方法源](#上游方法源只读)
- [硬性纪律](#硬性纪律违反视为流程失败)
- [输入](#输入)
- [图片生成](#步骤-4图片生成)
- [产出](#产出)

## 图像参数合同（图片比例固定规则）

- 调用 `get_project_profile(project_id=$PROJECT_ID, scope="ecommerce", task_id=$TASK_ID)` 后读 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：原样作为 `$EFFECTIVE_ASPECT_RATIO`；等于 `"auto"` 表示智能适配：按模块从 `resolved_profile.allowed_image_ratios` 选择。
- 每次 `generate_image` 都必须显式传 `aspect_ratio`（取 `$EFFECTIVE_ASPECT_RATIO`）；`image_type=cover|content` 只表示产物角色。


## 受众与目标

服务于**点击与下单**的商业转化视觉——**不是种草情绪共鸣，也不是线稿保真**。每张图都要回答「它让买家更想点击/下单了吗」。

## 上游方法源（只读）

Campaign Style Lock、Storyboard、逐图执行卡、自包含 Prompt 与 Negative 以上游 bundled `ecommerce-visual-copywriting-skill` 为准（根路径由 Agent 提供：`$UPSTREAM_ECOMMERCE_SKILL`）。本阶段读取其 `SKILL.md` Step 3–5 与 `$UPSTREAM_ECOMMERCE_SKILL/references/output-contracts.md` §2–4，并按 [references/upstream-visual-mapping.md](references/upstream-visual-mapping.md) 落盘；KV1 识别优先见 [references/main-image.md](references/main-image.md)。

## 硬性纪律（违反视为流程失败）

- **禁止跳过 asset-plan.md 直接调 generate_image**
- **禁止生成未在 `selected_modules` 中的模块**——未选模块不出现在 asset-plan.md、不调 generate_image、不进 manifest
- **每张电商图必须带当前画面相关的产品原图**——按「产品图清单」subject 选择语义相关子集，保持数组顺序与 prompt 中“参考图 N”一致；服务端负责参考能力与数量限制。禁止纯文臆造产品
- **prompt 必须点名保真**——明确写出「本图{部位}必须与【产品图清单】第 N 张完全保持一致——{该图可见特征}不得偏差」，禁止泛泛「保留产品」（详见步骤 3）
- **`output/image-prompts.md` 只记录每张图片的用途、最终创作 prompt 和参考图编号**
- **一致性关键模块生成后单独调用 `analyze_image`**，对照对应原图审核产品、文字与合规；结果写入 `output/best-refs.md` 与 manifest
- **图内文字语言必须与用户语言一致**（中文场景用简体中文），文字用全角引号「」包裹；禁止英文/拼音/乱码/伪词

---

## MCP 工具

| MCP 工具 | 用途 |
|----------|------|
| `generate_image(project_id, task_id, prompt, image_type, output_path, aspect_ratio, ref_image_path, ref_image_paths)` | 从创作 prompt 和有序产品参考生成并登记单张电商素材 |
| `analyze_image(project_id, task_id, file_path\|image_url, prompt)` | 视觉自检 / 锚点评估 |
| `compress_image(task_id, input_path, output_path, max_width?)` | 将授权任务图压缩为新的持久任务文件 |

> `generate_image` 的参考图按本图所需部位选择：只传当前画面相关的原图，数组顺序与 prompt 编号一致；服务端拒绝集合时保留最关键产品证据并按语义相关性缩小子集。每张电商图必须有真实产品参考。

---

## 输入

- `output/product-bible.md`（产品档案 + `$ANCHOR_REF` 锚点）
- `output/copywriting.md`（排序卖点 + 各模块文案）
- 项目画像（品牌、受众、参考资产与视觉风格）
- 任务选项：`selected_modules`、`target_platform`、`visual_style`、语言、各模块数量

---

## 步骤 1：锁定 Campaign Style Lock

- 项目有参考图/风格描述 → 优先继承；否则按**品类 × 平台 × 受众**设计。
- 写入 `output/asset-plan.md` 的 `## Campaign Style Lock`，至少含：产品身份、构图、色彩、光影、字体与信息密度、背景/场景、Reference Fidelity、Negative Constraints；`$STYLE` 是其内部简称。
- 产品身份以 `product-bible.md` 的「一致性锁定项」为准；不得为了更好看改包装结构、Logo、规格或配件。
- Lock 由已选模块首张关键图确立、后续图共享；每条 prompt 重复写 Lock 与 Negative，不写「同上」。

**电商视觉语言要素**：
- **卖点可视化**：把抽象卖点转成可视符号（如「长续航」→ 电量条/时钟图标；「轻」→ 羽毛/手持比例）。
- **促销/价格视觉钩子**：角标/价格牌/赠品标，真实且合规。
- **信息层级**：主体最大 → 卖点次之 → 钩子醒目，服务「先看什么→再看什么→点击/下单」。
- **商业品质感**：专业打光、材质质感、留白、栅格对齐。
- **移动端首屏可读**：主图①与详情首节在手机首屏即传达核心卖点。

## 步骤 2：产出 Storyboard 与 asset-plan.md（仅含已选模块）

先出 `## Storyboard`（每张图一个决策问题与角色：Hero/Benefit/Proof/Compare/Scene/Spec-CTA），再逐张写执行卡：
`视觉任务/用户疑问 / 画面与第一落点 / 图内文案（含实际字数）/ 文字渲染方式 / 排版与安全区 / 证据来源 / 所需产品图=[第N张(subject)] / 自包含 Prompt / Negative / 验收标准`。KV1（选中主图模块时）主标题必须是商品名/品类词。字段细节见 [references/upstream-visual-mapping.md](references/upstream-visual-mapping.md)。

**智能适配比例参考**（仅 `image_ratio == "auto"` 且受 `allowed_image_ratios` 约束；详见 `ecommerce-platform-specs`）：主图/SKU 常用 `1:1`；详情 `3:4`；封面 `16:9` 或 `3:4`；分享 `1:1` 或 `3:4`。清晰度 `2K` 只写 prompt 与规划，不拼入 `aspect_ratio`。

各模块设计规范见：
- 主图 → [references/main-image.md](references/main-image.md)
- 详情页 → [references/detail-page.md](references/detail-page.md)
- 封面 banner → [references/cover-banner.md](references/cover-banner.md)
- 分享图 → [references/share-image.md](references/share-image.md)

**设计方法论（字体/色彩/构图/信息层级/移动端，达到高级设计师水平）** → [references/design-principles.md](references/design-principles.md)：设定 `$STYLE` 与逐张构图时，把设计原则翻译成 prompt 的具体字号/字色/构图描述。**类目×平台差异**（服饰/3C/食品/美妆/家居）见 `ecommerce-platform-specs/references/category-specs.md`。

**asset-plan.md 必须在「计划图片数量」字段写入实际总张数**（按已选模块求和），机械闸门按此校验。

## 步骤 3：按需选参考图 + 点名保真策略

读取项目画像、产品档案和资产计划。Skill 为每张图决定语义参考集合和稳定顺序。

**核心原则（电商独有，与种草笔记的反雷同逻辑刻意相反）**：每张电商图都描绘某个产品部位（茶汤/干茶/叶底/包装…），**只传该部位对应的那几张产品图作参考**，并在 prompt 里点名「与第 N 张完全一致」。禁止任何「纯文生图不传 ref」的电商图——产品必须来自真实参考，不得凭文本臆造。

Style Lock/Negative 与自包含 Prompt 要求见 [references/upstream-visual-mapping.md](references/upstream-visual-mapping.md)；首图识别规则见 [references/main-image.md](references/main-image.md)。

1. **产品档案前缀块**：每个 prompt 以 `【产品档案·必须严格遵守】{产品档案的「一致性锁定项」：品牌 logo 文字与颜色 / 主色 HEX / 形状轮廓 / 包装可见文字}` 开头。
2. **锚点优先**：先生成主图①（点击主图），确立色系/版式/字体基准。
3. **按需选参考图**（查 `output/product-bible.md`「产品图清单」的 subject + 序号）：
   - asset-plan 每张图已声明 `所需产品图=[第N张(subject), ...]`。
   - 把 asset-plan 声明的所需产品原图按语义重要性排序后作为 `ref_image_paths`，并让 prompt 中“参考图 N”与数组顺序一致。
   - 服务端拒绝参考集合时，保留当前画面最关键的产品证据并按语义相关性缩小子集后重试。
   - 同 subject 多张时按清单序号精确到具体图。
4. **点名保真 prompt**（产品档案前缀块之后追加）：
   `【产品保真·必须严格遵守】本图{部位}必须与【产品图清单】第N张（{subject}）完全保持一致——{该图可见特征：汤色/透亮度/形态/包装文字/logo/主色/材质}不得偏差/增删/臆造；仅允许生成场景/构图/光影/道具；参考图未显示的细节不得凭空添加。`
   多部位图逐部位点名对应序号；单部位图也必须点名序号（「与第 N 张完全一致」），**禁止泛泛「保留产品」**。
   `{部位}` 取自产品档案「产品图清单」的 subject，**按品类用对应部位词**：茶类=茶汤/干茶/叶底/包装；服饰=平铺/挂拍/细节/材质/模特；3C=正面/背面/接口/屏幕/配件/参数表；美妆=瓶身/膏体/质地/上脸/成分表；食品=成品/原料/包装正反/保质期标识；家居=整体/细节/使用场景（详见 product-analysis skill 的品类 subject 词表）。
5. **视觉自检循环**：一致性关键模块生成后单独调用 `analyze_image`，对照 asset-plan 中的原图序号审核产品、文字和合规。FAIL 时走「包装文字漂移兜底」，最多 3 轮；仍不达标标 `needs_reference` 并在 manifest 披露。
6. **诚实标注**：语义参考与点名保真能提高一致性，但复杂包装文字仍不能承诺像素级还原；差异作为风险记录。

**包装文字漂移兜底**：逐级升级（识别具体漂移文字 → 逐字转录「以下文字原样保留」并收紧 ≤12 字 → 仍漂移标 `needs_reference` + 后期合成建议），详见 [references/upstream-visual-mapping.md](references/upstream-visual-mapping.md) 的「包装文字漂移兜底」。

## 步骤 4：图片生成

按 asset-plan.md 逐张生成。**已选模块首图先行**确立基准；仅在 selected_modules 包含主图时优先主图①，否则从已选模块选择首张关键图。

每张 generate_image 调用：
- `project_id=$PROJECT_ID`
- `prompt` = 产品档案前缀块 + **点名保真块（本图{部位}与【产品图清单】第 N 张完全一致）** + 本张视觉描述（视觉主体/场景/构图/打光）+ 必须出现的卖点文字（用「」包裹）+ `$STYLE` 风格延续块 + 禁用元素
- `image_type`：主图/封面/分享/SKU 用 `"cover"`，详情图用 `"content"`；仅表示产物角色
- `aspect_ratio`：必须显式传 asset-plan 的纯比例 `$EFFECTIVE_ASPECT_RATIO`；清晰度/分辨率不得拼入该参数
- `output_path`：`output/<模块>_<NN>.png`
- `ref_image_paths`：只传本图所需部位的产品原图，顺序与 prompt 编号一致；服务端拒绝时缩小为更相关的子集。禁止不传 ref
- `task_id=$TASK_ID`


**Prompt 备份**：每张图片只把用途、最终创作 prompt 和参考图编号写入 `output/image-prompts.md`。

**失败处理**：单图失败重试一次仍失败则跳过并在 manifest 标注；主图①失败重试两次仍失败则写结构化失败诊断并停止。重试必须覆盖同一 output_path，禁止新增 `_v2` 候选文件；交付前清理目录，仅保留 asset-plan 列出的文件。

## 步骤 5：视觉自检（电商专属维度）

一致性关键模块生成后，单独调用 `analyze_image` 并使用以下内容审核 prompt：

```
你是电商视觉质检员。检查这张电商素材图是否满足：
1. 产品一致性（**对照本图所用参考图【产品图清单】第 N 张**）：该部位（{subject}）的色泽/形态/包装文字/logo/主色/材质是否与第 N 张完全一致？有无臆造、漂移、多出或漏掉的品牌标记/文字？（把生成图与第 N 张原图逐项比对）
2. 图内文字逐字：要求出现的文字「{本张必须出现文字}」是否逐字一致、清晰可读、无错别字/乱码/英文（中文场景）？
3. 信息层级：主体是否突出、卖点是否在合理层级？
4. KV1 识别（仅首张主图）：遮住副文案、缩到缩略图，陌生用户能否说出商品品类？
5. 合规：是否含极限词/违禁词/虚假承诺？
返回严格 JSON：{all_entities_present, missing_entities, relevance_score(high/medium/low), overall_pass(bool), has_forbidden_content(bool), forbidden_notes}
```

自检结果写入 `output/best-refs.md`（逐图：内容质量 PASS/FAIL、创作修订轮次、`needs_reference`）。

## 步骤 6：模块内一致性复查

同模块多张图生成后复查风格一致与卖点不重复；偏离的图按 `$STYLE` 重生成。

## 步骤 7：SKU 变体保真策略（若已选 sku_images）

SKU 变体图要求「**同一版式、同一打光、仅变体属性不同**」，是保真与差异化的平衡：

- **版式一致**：所有变体共享 `$STYLE`（同构图/背景/打光/字体/版式），仅颜色/款式/规格属性不同——让买家一眼看出是「同一系列的不同选项」。
- **色准控制**：色彩变体（多色服饰/美妆色号）**用产品图原图色作锚**，prompt 点名「色号/色名与第 N 张（{variant}）完全一致」，生成后单独用 `analyze_image` 对照原图核色；不得臆造色卡外的颜色。
- **避免雷同**：同构图变体换道具/角度微调（如不同色款的摆位/搭配道具略有差异），避免多张像复制粘贴；但版式骨架不变。
- **点名保真**：每个变体点名其对应的产品图序号（「与第 N 张（{variant}色）完全一致」），**禁止纯文生图臆造变体**。
- **命名**：`sku_<variant>.png`，variant 名来自产品档案或用户指定。

---

## 产出

视觉计划、审核或 manifest JSON 必须包含 `schema_version`、有限 `status`（`ready`、`warning`、`blocked`、`failed`、`skipped`）、`source`、`data_at`、`missing` 和 `evidence_paths`。单图失败可标记 `needs_reference` 或 `skipped`；关键模块失败由 Agent 写 `output/failure-state.json`，包含 `version`、`status`、`stage`、`error_code`、脱敏 `message`、`resume_from`，不得虚报数量或质量。

- `output/asset-plan.md`（仅含已选模块的计划）
- `output/image-prompts.md`（全部 prompt 备份）
- `output/best-refs.md`（逐图内容质量结论/创作修订/needs_reference）
- 各模块图片：`main_01..05.png`、`detail_01..NN.png`、`cover_01..NN.png`、`share_01..NN.png`、`sku_<variant>.png`
