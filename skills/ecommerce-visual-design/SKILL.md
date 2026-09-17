---
name: ecommerce-visual-design
description: 'Use when 电商视觉设计与生成——商业转化导向的视觉工艺，按已选模块规划并生成主图/详情/封面/分享/SKU，保证产品跨图一致。受众=买家，目标=点击→转化→降退货。当电商出图流程需要图片规划或生成时使用。'
---

# 电商视觉设计与生成

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## 图片比例固定规则

### 任务图像参数合同

- 调用 `get_project_profile(task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 可按不同模块分别从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`；平台常用比例只作选择参考。
- 每次生成都必须显式传 `aspect_ratio` 参数。
- `image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## 受众与目标

服务于**点击与下单**的商业转化视觉——**不是种草情绪共鸣，也不是线稿保真**。每张图都要回答「它让买家更想点击/下单了吗」。

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
| `analyze_image(project_id, file_path\|image_url, prompt)` | 视觉自检 / 锚点评估 |
| `compress_image(task_id, input_path, output_path, max_width?)` | 将授权任务图压缩为新的持久任务文件 |

> `generate_image` 的参考图按本图所需部位选择：只传当前画面相关的原图，数组顺序与 prompt 编号一致；服务端拒绝集合时保留最关键产品证据并按语义相关性缩小子集。每张电商图必须有真实产品参考。

---

## 输入

- `output/product-bible.md`（产品档案 + `$ANCHOR_REF` 锚点）
- `output/copywriting.md`（排序卖点 + 各模块文案）
- 项目画像（品牌、受众、参考资产与视觉风格）
- 任务选项：`selected_modules`、`target_platform`、`visual_style`、语言、各模块数量

---

## 步骤 1：确定视觉风格基线 `$STYLE`

- 项目有参考图/风格描述 → 用之。
- 否则按**品类 × 平台 × 受众**动态设计 `$STYLE`（配色/版式/字体/质感/信息密度），写入 `output/asset-plan.md` 的「视觉风格基线」。`$STYLE` 由主图①确立，后续图共享。

**电商视觉语言要素**：
- **卖点可视化**：把抽象卖点转成可视符号（如「长续航」→ 电量条/时钟图标；「轻」→ 羽毛/手持比例）。
- **促销/价格视觉钩子**：角标/价格牌/赠品标，真实且合规。
- **信息层级**：主体最大 → 卖点次之 → 钩子醒目，服务「先看什么→再看什么→点击/下单」。
- **商业品质感**：专业打光、材质质感、留白、栅格对齐。
- **移动端首屏可读**：主图①与详情首节在手机首屏即传达核心卖点。

## 步骤 2：产出 asset-plan.md（仅含已选模块）

按模块逐张规划。每张含：`用途 / 尺寸 / 视觉主体 / 必须出现的卖点文字 / 禁用元素 / 所需产品图=[第N张(subject), ...]（查「产品图清单」，精确到序号）/ 验收标准`。

**智能适配比例参考**（仅当 `resolved_profile.image_ratio` 等于 `"auto"` 时按 `target_platform` 参考，且必须受 `resolved_profile.allowed_image_ratios` 约束；详见 `ecommerce-platform-specs`）：
- 主图：比例 `1:1`；目标清晰度/分辨率另记为 `2K`，不得拼入 `size`
- 详情页：比例 `3:4`；目标清晰度/分辨率另记为 `2K`
- 封面 banner：比例 `16:9` 或 `3:4`；目标清晰度/分辨率另记为 `2K`
- 分享图：比例 `1:1` 或 `3:4`；目标清晰度/分辨率另记为 `2K`
- SKU：比例 `1:1`；目标清晰度/分辨率另记为 `2K`

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

**包装文字漂移兜底**（复杂包装文字/长成分表是保真难点，逐级升级）：
1. 第 1 轮 FAIL → 自检结果里的 `missing_entities`/漂移项**识别是哪些具体文字/标记漂移**（logo 文字、品名、规格、成分关键词）。
2. 第 2 轮重生成 → prompt 追加「**以下文字必须原样保留，不得增删改、不得拼写偏差**：『<从产品档案逐字转录的关键包装文字，≤12 字/条>』」+ 把图内文字**收紧到 ≤12 字**减少出错面 + 用全角「」包裹。
3. 第 3 轮仍漂移 → 标 `needs_reference`，在 manifest 披露漂移项，并给出**后期合成建议**（把产品原图主体抠出合成到生成场景上，或文字层后期叠加）。
4. **诚实声明**：AI 生成无法保证像素级包装文字还原；复杂文字以「产品档案原样转录 + 后期合成」为最终保真手段，不向用户承诺 100% 文字还原。

## 步骤 4：图片生成

按 asset-plan.md 逐张生成。**主图①先行**确立基准。

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
2. 卖点文字：要求出现的卖点文字「{本张必须出现文字}」是否清晰可读、无错别字/乱码/英文（中文场景）？
3. 信息层级：主体是否突出、卖点是否在合理层级？
4. 合规：是否含极限词/违禁词/虚假承诺？
返回严格 JSON：{all_entities_present, missing_entities, relevance_score(high/medium/low), overall_pass(bool), has_forbidden_content(bool), forbidden_notes}
```

自检结果写入 `output/best-refs.md`（逐图：内容质量 PASS/FAIL、创作修订轮次、`needs_reference`）。

## 步骤 6：模块内一致性复查

同模块多张图生成后，复查视觉风格一致（同色系/版式/字体/信息密度）与卖点不重复堆砌。不一致则按 `$STYLE` 块重生成偏离的那张。

## 步骤 7：SKU 变体保真策略（若已选 sku_images）

SKU 变体图要求「**同一版式、同一打光、仅变体属性不同**」，是保真与差异化的平衡：

- **版式一致**：所有变体共享 `$STYLE`（同构图/背景/打光/字体/版式），仅颜色/款式/规格属性不同——让买家一眼看出是「同一系列的不同选项」。
- **色准控制**：色彩变体（多色服饰/美妆色号）**用产品图原图色作锚**，prompt 点名「色号/色名与第 N 张（{variant}）完全一致」，生成后单独用 `analyze_image` 对照原图核色；不得臆造色卡外的颜色。
- **避免雷同**：同构图变体换道具/角度微调（如不同色款的摆位/搭配道具略有差异），避免多张像复制粘贴；但版式骨架不变。
- **点名保真**：每个变体点名其对应的产品图序号（「与第 N 张（{variant}色）完全一致」），**禁止纯文生图臆造变体**。
- **命名**：`sku_<variant>.png`，variant 名来自产品档案或用户指定。

---

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 产品跨图不一致 / 与原图不符 | 漏传或错传相关部位 ref / 点名保真弱 | 按所需部位只传相关产品图（步骤 3）+ 强化点名保真「与第 N 张完全一致」+ 自检对照第 N 张原图重生成 |
| 多张场景图雷同 | 多图复用同一张参考 | 按需选不同部位 ref（茶汤图传茶汤、叶底图传叶底，天然差异化）；确需同张时追加语义相关的产品原图 |
| 图内文字乱码/英文 | 语言约束弱 | 文字用「」包裹 + 末尾独立「禁止英文/拼音/乱码」段 + 缩短到 ≤12 字 |
| 卖点未可视 | prompt 只描述产品没描述卖点符号 | 把卖点转成可视符号写进 prompt（见 `$STYLE` 卖点可视化） |
| 主图①无冲击 | 缺钩子/层级混乱 | 按 main-image.md 的 CTR 模板重做：主体最大→卖点→钩子；信息层级用 design-principles 的 5 变量实现 |
| 详情节无叙事 | 章节乱序 | 按 detail-page.md 黄金结构重排 |
| 包装文字/成分表漂移 | 复杂文字生成易错 | 走「包装文字漂移兜底」：识别漂移文字→逐字转录「以下文字原样保留」+ 收紧 ≤12 字→仍漂移标 needs_reference + 后期合成建议 |
| SKU 变体色偏/雷同 | 色彩臆造 / 同构图复制粘贴 | 用产品图原图色作锚点名色号 + 变体换道具/角度微调但版式骨架不变（见步骤 7） |
| 首图非白底违规 | 未遵循平台白底规则 | 按平台（淘宝天猫/京东白底强制）重做①：白底为主、主体居中、无牛皮癣；纯白与压体积后期完成 |
| 平台尺寸/比例不符 | 用错 ratio | 按 platforms.md 该平台的投放像素/比例/数量重选 `aspect_ratio` |
| 极限词 | 文案带禁用词 | 删除/改写，重生成相关图 |

---

## 产出

- `output/asset-plan.md`（仅含已选模块的计划）
- `output/image-prompts.md`（全部 prompt 备份）
- `output/best-refs.md`（逐图内容质量结论/创作修订/needs_reference）
- 各模块图片：`main_01..05.png`、`detail_01..NN.png`、`cover_01..NN.png`、`share_01..NN.png`、`sku_<variant>.png`
