# 上游文案映射（Anban 适配）

> 上游来源：`third_party/ecommerce-visual-copywriting-skill`（MIT，pin `7fd4abaa5a280dddf414ccc1372d886bef702cba`）。证据账本、成交驱动力、图内文案规格与五维质量门以上游为准；本文件只定义 Anban 的落盘位置、成图文字覆盖与机械检查。

## 读取顺序

1. `$UPSTREAM_ECOMMERCE_SKILL/SKILL.md` 的 Step 1–2（证据账本、成交驱动力）、Step 5 与「图内文案与文字渲染」、Step 6。
2. `$UPSTREAM_ECOMMERCE_SKILL/references/copy-quality-rules.md`（六条文案质量自检）。
3. `$UPSTREAM_ECOMMERCE_SKILL/references/output-contracts.md` §1–3、§8（策略、执行卡、交付前终态扫描）。
4. 平台口吻与视觉任务：`$UPSTREAM_ECOMMERCE_SKILL/references/platform-playbooks.md` 对应平台 + 本 skill 的 `selling-points.md`。

## 证据账本与 Top3

- `output/copywriting.md` 顶部写 `## 证据账本`，每行：宣称/卖点 → 来源类型与证据路径 → 状态 → 最终处理。
- 只允许「已确认 / 有依据」进入主图、详情、分享文案与图内文字；「待补证」改为中性表达或删除，并进入 `## 待补证清单（不进图内）`。
- 选 1 个主成交驱动力 + 最多 1 个辅驱动力，产出最多 3 条有依据的购买理由；不足 3 条不凑数。
- 用户口述卖点按「用户口述」记入账本，未与原件核对前仍是待补证，不因被采纳而升级为已确认。

## 图内文案与成图文字

- 字数上限以社区上游「图内文案规格」为准：主图 1 标题 + ≤2 条副文案 + ≤1 个数字/证据标签；详情模块 1 标题 + ≤3 条要点。
- **Anban 覆盖**：本流程交付成图，默认由模型直出短文字，不使用上游「留白排版」默认。
  - 标题 ≤12 汉字（英文 ≤6 词）；主图副文案 ≤15 汉字（英文 ≤10 词）；详情要点 ≤18 汉字（英文 ≤12 词）。
  - 每条图内文字用全角「」括起写入 prompt，并在 `asset-plan.md` 记录实际字数。
  - 生成后用 `analyze_image` 逐字核验；连续 2 轮仍错字/乱码/漏字 → 缩短到仅标题；仍失败 → 零文字留白，并在 manifest 标 `text_rendering=degraded`。
- 价格、促销、赠品、服务承诺只在任务提供依据时出现；缺依据不写，不造原价、折扣、最低价或倒计时。

## 机械检查

有 `python3` 时逐条运行（路径由 Agent 提供 `$UPSTREAM_ECOMMERCE_SKILL`）：

- `python3 "$UPSTREAM_ECOMMERCE_SKILL/scripts/count-copy.py" "标题" "副文案"`（英文加 `--language en`）
- `python3 "$UPSTREAM_ECOMMERCE_SKILL/scripts/scan-final-copy.py" "最终文案"`

结果与命令写入 `output/quality-gate.md` 的「机械检查」行；无 `python3` 时写「未运行（无 python3）」，并按上游约定标「字数待工具复核」，不得声称已逐字复核。

## humanizer 顺序

图内文案与分享文案定稿 → humanizer 去 AI → 合规扫描。改写不得引入新事实、极限词或无法证明的功效承诺。

## 待补证清单

放在 `output/copywriting.md` 末尾，不进图内文字、不进执行卡文案字段；由质量门与最终报告披露。

## Anban `copywriting.md` 结构

```markdown
# 电商转化文案

## 证据账本
| 宣称/卖点 | 来源（类型 + 路径/图号） | 状态（已确认/有依据/待补证/禁止） | 最终处理 |
|---|---|---|---|

## 成交驱动力与 Top3
- 主驱动力: ...
- 副驱动力: ...
- Top 3 购买理由: ...

## 核心卖点（排序）
1. ... （标题/FABE/证据/目标买家/建议可视符号）

## 主图文案（按 target_platform 口吻；① 主标题用商品名/品类词）
### ① 点击主图
- 主文案: ...（实际字数: N）
- 辅文案: ...（实际字数: N）
- 数字/证据标签 / 文字渲染方式 / 卖点关键词 / 建议可视符号 / 禁用元素

## 详情页文案
### 第1节 钩子首图
- 标题: ...（实际字数: N）
- 信息点: ...（实际字数: N/条）
- 卖点

## 分享文案（仅当已选 share_image，按渠道分条）
- 种草笔记 / 微信 / 抖音

## SKU 变体文案（仅当已选 sku_images）
- 变体1: 色名/规格/场景短句

## 待补证清单（不进图内）
- ...
```
