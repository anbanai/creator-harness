---
name: ecommerce-product-analysis
description: "Use only during the Ecommerce workflow's product-analysis stage to build the locked Product Bible from supplied product images. Do not trigger as a standalone entrypoint."
---

# 电商产品图分析 → 产品档案 Product Bible

## 目录

- [目标](#目标)
- [上游方法源](#上游方法源只读)
- [分析流程](#分析流程)
- [产品档案](#产品档案-product-bible)
- [常见失败与修复](#常见失败与修复)
- [产出](#产出)

## 目标

把用户提供的多张产品图压成一份**锁定规格**，服务三个电商独有需求：
1. **产品跨图一致性**——后续所有素材（主图/详情/场景/SKU）必须让买家认出是同一件商品，产品档案是注入每个生成 prompt 的强制前缀块。
2. **按需选参考图**——逐张识别每张产品图展示的**产品部位**（茶汤/干茶/叶底/包装正面…），产出「产品图清单」。生成每张电商图时，只传该图描绘部位对应的那几张产品图（而非全部），并在 prompt 点名「与第 N 张完全一致」。
3. **卖点提炼**——文案 skill 据此提炼 FABE 卖点。

这是对**实物商品**的理解（品类/品牌/材质/包装/功能），不是对线稿角色配色的分析，也不是对种草笔记爆款的拆解——目标与维度完全不同。

## 上游方法源（只读）

命名来源、证据边界与产品事实抽取方法以上游 bundled `ecommerce-visual-copywriting-skill` 为准（`$UPSTREAM_ECOMMERCE_SKILL`）。开工读取上游 `SKILL.md` Step 0–2 与 `output-contracts.md` §1，按 [references/upstream-evidence-mapping.md](references/upstream-evidence-mapping.md) 落盘；问卷/命名询问/确认点由 Agent 的零交互规则替代。

---

## MCP 工具

| MCP 工具 | 用途 |
|----------|------|
| `analyze_image(project_id, task_id, file_path\|image_url, prompt)` | 逐张抽取产品属性（一次一张） |
| `compress_image(task_id, input_path, output_path, max_width?)` | 产品图 >10MB 时压缩成当前任务的持久文件后再分析 |

`file_path` 必须是 `.anban-creator/input-attachments/index.json` 中登记的任务相对路径（≤10MB），并同时传 `task_id=$TASK_ID`。不得传宿主机或服务端本地路径。

---

## 分析流程

### 步骤 1：准备产品图清单

把 `$PRODUCT_PHOTOS`（来自 `.anban-creator/input-attachments/index.json` 中 role 为 `ecommerce_product` 的条目，见主流程「产品图发现」）写入 `output/product-photos.md`，逐张标注序号、来源任务相对路径、可见性（是否可访问/是否需压缩）。任一不可访问剔除并记录，**至少保留 1 张**；全不可访问则报错停止。

### 步骤 2：逐张抽取产品属性

对**每张**产品图调 `analyze_image`（逐张单张识别，一次一张），使用下方**电商属性抽取 prompt**。一张图可能只展示部分属性（如包装图只见包装文字，场景图见使用语境），多张互补。

**`subject` 部位标签是关键产物**——它决定后续生成时「这张图该被哪些电商图当参考」。务必为每张图给出明确的 subject（**按品类用对应部位词**：茶类=茶汤/干茶/叶底/包装；服饰=平铺/挂拍/细节/材质/模特；3C数码=正面/背面/接口/屏幕/配件/参数表；美妆个护=瓶身/膏体/质地/上脸/成分表；食品=成品/原料/包装正反/保质期标识；家居=整体/细节/使用场景；通用=包装正面/包装背面/产品本体/原料/成品/剖面/细节特写/使用场景/模特手持），看不清的标注置信 low。

**电商属性抽取 prompt 模板**：见 [references/product-extraction-prompt.md](references/product-extraction-prompt.md)（含抽取 JSON、subject 词表、置信度规则与命名/证据标注）。

### 步骤 3：汇总成产品档案

把多张图的抽取结果合并去重，冲突项**以最清晰、打光最好、最代表商品的那张为准**并标注来源图序号。产出 `output/product-bible.md`，结构：

```markdown
# 产品档案 Product Bible

## 商品名称与命名来源
- 商品名: ...
- 命名来源: 任务输入 / 项目画像 / 包装可见文字 / 据图拟名（非官方原名，不推断材质/工艺/认证）
- 品类词: ...（KV1 主标题使用）

## 锚点
- 最佳锚点参考图: $ANCHOR_REF = {选定的任务相对路径}（来源：产品图 N，理由：最清晰/打光最好/最代表商品）

## 产品图清单（逐张识别产物 · 生成时按需选 ref 的查表依据）

**序号一经确定即在任务内固定**，作为生成 prompt「与【产品图清单】第 N 张完全一致」与视觉自检的稳定锚点（"第 N 张" = 本清单序号，非 ref 数组下标）。

> **握手机制（关键）**：本「产品图清单」（序号 + subject + 任务相对路径）是 `ecommerce-visual-design` 的 **asset-plan 唯一查询表**——asset-plan 每张图填「所需产品图=[第 N 张(subject)]」时**必须读本清单**，按本张电商图描绘的部位匹配 subject，取对应序号的产品图作 ref。没有它，visual-design 无法知道「哪张是茶汤、哪张是叶底」，也无法点名「与第 N 张完全一致」。

| 序号 | subject 部位标签 | 任务相对路径 | 该图可见产品信息（色泽/形态/包装文字/材质） |
|------|------------------|-------------------|----------------------------------------------|
| 1    | 包装正面         | `.anban-creator/input-attachments/attachment_01_product.png` | 品牌文字「XX」/ 主色 #XXX / 哑光金盒 |
| 2    | 茶汤             | `.../product_02.png` | 汤色橙黄透亮 / 玻璃公道杯 |
| 3    | 干茶             | `.../product_03.png` | 条索紧结 / 墨绿润 |
| 4    | 叶底             | `.../product_04.png` | 红边显露 / 柔软亮 |

（上表为示例；实际按逐张识别结果填写，每张产品图一行。）

## 基础属性
- 品类: ...
- 细分类目: ...
- 品牌/logo: 文字=...，位置=...，颜色=...
- 主色: #XXXXXX（语义名）
- 辅色: ...
- 材质: ...
- 形状轮廓: ...
- 尺寸线索: ...

## 包装可见文字（原样转录，用于一致性校验）
- 品名: ...
- 规格: ...
- 成分/材质标: ...
- slogan: ...

## 可见功能与设计特征
- ...

## 卖点候选（供 copywriting skill 排序）
- ...

## 拍摄与场景
- 角度/场景: ...

## 一致性锁定项（生成时必须严格遵守）
- 品牌 logo 文字与颜色: ...
- 主色 HEX: ...
- 形状轮廓: ...
- 包装可见文字（不得增删改）: ...

## 证据观察与推断边界
- 任务输入 / 包装可见文字（已确认）: ...
- 图片观察（只作视觉依据，不升级为事实）: ...
- 推断（不得进入卖点与图内文字）: ...

## 待补证与禁止宣称
- 待补证（中性表达或删除，不进入图内文字）: ...
- 禁止宣称（治疗/保证性效果/虚构背书）: ...

## 缺失/低置信 (missing_data)
- ...
```

**一致性锁定项**是关键——这些是后续每个生成 prompt 的强制前缀块 `【产品档案·必须严格遵守】...` 的内容，视觉自检也据此派生。

### 步骤 4：选出最佳锚点

从产品图中选**最佳锚点** `$ANCHOR_REF`（任务相对路径）：最清晰、打光最好、最能代表商品全貌的一张。锚点用于一致性关键模块（主图①、详情核心场景）的 `ref_image_paths`。理由写入档案。

---

## 常见失败与修复

压缩、品牌矛盾、色准、缺失属性与场景杂物的处理见 [references/product-extraction-prompt.md](references/product-extraction-prompt.md) 的「常见失败与修复」。

---

## 产出

产品索引或分析 JSON（如使用）必须包含 `schema_version`、有限 `status`（`ready`、`warning`、`blocked`、`failed`、`skipped`）、`source`、`data_at`、`missing` 和 `evidence_paths`。没有可访问产品图或关键身份证据不足时写 `output/failure-state.json`，包含 `version`、`status`、`stage`、`error_code`、脱敏 `message`、`resume_from`；不得把推断规格写成事实。

- `output/product-bible.md`（锁定规格，含**「产品图清单」**：序号 | subject 部位标签 | 任务相对路径 | 该图可见产品信息；以及商品名称与命名来源、证据观察与推断边界、待补证与禁止宣称）
- `output/product-photos.md`（产品图访问性清单与可见性）
- `$ANCHOR_REF`（最佳锚点任务相对路径，写入档案与内部变量）

> 「产品图清单」的 subject 标签 + 稳定序号是 `ecommerce-visual-design`「按需选参考图 + 点名保真」的查表依据——没有它，生成时无法知道「哪张是茶汤、哪张是叶底」，也无法在 prompt 里精确点名「与第 N 张完全一致」。
