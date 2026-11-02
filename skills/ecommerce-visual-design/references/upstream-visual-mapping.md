# 上游视觉映射（Anban 适配）

> 上游来源：`third_party/ecommerce-visual-copywriting-skill`（MIT，pin `7fd4abaa5a280dddf414ccc1372d886bef702cba`）。Style Lock、Storyboard、执行卡与自包含 Prompt 以上游为准；本文件定义 Anban 的落盘位置、成图验收与失败修复。

## 读取顺序

1. `$UPSTREAM_ECOMMERCE_SKILL/SKILL.md` 的 Step 3–5（Style Lock、Storyboard、执行输出）。
2. `$UPSTREAM_ECOMMERCE_SKILL/references/output-contracts.md` §2–4（Storyboard、单张图与详情模块执行卡）。
3. `$UPSTREAM_ECOMMERCE_SKILL/references/copy-quality-rules.md` 的 Prompt 自包含与终态扫描。

## Campaign Style Lock

- 写入 `output/asset-plan.md` 的 `## Campaign Style Lock`，至少包含：产品身份（包装/Logo/结构/比例）、构图体系、色彩体系、光影体系、字体与信息密度、背景/场景、Reference Fidelity、Negative Constraints。
- 每条生成 prompt 必须重复 Style Lock 与 Negative，不写「同上」；`$STYLE` 只是它的内部简称。
- 产品身份以 `output/product-bible.md` 的「一致性锁定项」为准；不得为了更好看改包装结构、Logo、口味、规格或配件。

## Storyboard 与 KV1

- 先出 `## Storyboard`：每张图一个决策问题与角色（Hero/Benefit/Proof/Compare/Scene/Spec-CTA）。
- **KV1 识别优先**：选中主图模块时，首张主标题写商品名/品类词（来自 `product-bible.md` 的命名来源），卖点降为副文案；遮住副文案并把图缩到缩略图仍能说出品类才算 PASS。
- 未选主图模块时，用已选模块首张关键图承担识别并确立风格基准。
- 后续 Benefit/Proof/Scene 图可直接讲特性，不要求每张重复商品名。

## 逐图执行卡

`asset-plan.md` 每张图必须包含：视觉任务与目标用户疑问、画面与第一视觉落点、图内文案（含实际字数）、文字渲染方式、排版与安全区、证据来源、所需产品图 `[第N张(subject)]`、自包含 Prompt、Negative、验收标准。

## 自包含 Prompt 与 Negative

- Prompt 独立可用：主体结构/材质、光线、构图占比、留白位置、背景、Style Lock、参考图与必须保留项、禁止项。
- 禁止依赖「上一张 / 同上」；模型不得生成 Logo、包装原文、认证标志或具体数字（已写入文案且可追溯的短标签除外）。
- Negative 至少覆盖：包装结构/颜色/Logo/规格漂移、额外配件、错误文字/乱码、认证徽章、水印、虚假场景。

## 文字与一致性验收

- 生成后单独 `analyze_image`：①与第 N 张原图逐项比对产品一致性；②图内文字逐字核对；③KV1 缩略图识别；④合规。
- FAIL 走向上收敛（≤3 轮）；未验收的图在 `best-refs.md` 与质量门标「待验收」，不得声称已验收。

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 产品跨图不一致 / 与原图不符 | 漏传或错传相关部位 ref / 点名保真弱 | 按所需部位只传相关产品图 + 强化点名保真「与第 N 张完全一致」+ 自检对照第 N 张原图重生成 |
| 多张场景图雷同 | 多图复用同一张参考 | 按需选不同部位 ref；确需同张时追加语义相关的产品原图 |
| 图内文字乱码/英文 | 语言约束弱 | 文字用「」包裹 + 末尾独立「禁止英文/拼音/乱码」段 + 缩短到 ≤12 字 |
| 卖点未可视 | prompt 只描述产品没描述卖点符号 | 把卖点转成可视符号写进 prompt |
| 主图①认不出品类 | 主标题只有特性/氛围 | 按 KV1 规则把商品名/品类作主标题，卖点降为副文案 |
| 详情节无叙事 | 章节乱序 | 按 `detail-page.md` 黄金结构重排 |
| 包装文字/成分表漂移 | 复杂文字生成易错 | 逐字转录「以下文字原样保留」+ 收紧 ≤12 字 → 仍漂移标 `needs_reference` + 后期合成建议 |
| SKU 变体色偏/雷同 | 色彩臆造 / 同构图复制粘贴 | 用产品图原图色作锚点名色号 + 变体换道具/角度微调但版式骨架不变 |
| 首图非白底违规 | 未遵循平台白底规则 | 按平台白底规则重做①：白底为主、主体居中、无牛皮癣；纯白与压体积后期完成 |
| 平台尺寸/比例不符 | 用错 ratio | 按 `platforms.md` 该平台的投放像素/比例/数量重选 `aspect_ratio` |
| 极限词 | 文案带禁用词 | 删除/改写，重生成相关图 |

## 包装文字漂移兜底

复杂包装文字/长成分表是保真难点，逐级升级：

1. 第 1 轮 FAIL → 从自检结果的 `missing_entities`/漂移项识别具体文字或标记（logo 文字、品名、规格、成分关键词）。
2. 第 2 轮重生成 → prompt 追加「**以下文字必须原样保留，不得增删改、不得拼写偏差**：『<从产品档案逐字转录的关键包装文字，≤12 字/条>』」，并把图内文字收紧到 ≤12 字，用全角「」包裹。
3. 第 3 轮仍漂移 → 标 `needs_reference`，在 manifest 披露漂移项，并给出后期合成建议（把产品原图主体抠出合成到生成场景，或文字层后期叠加）。
4. 诚实声明：AI 生成无法保证像素级包装文字还原；复杂文字以「产品档案原样转录 + 后期合成」为最终保真手段，不承诺 100% 文字还原。
