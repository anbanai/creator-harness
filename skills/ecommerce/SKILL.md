---
name: ecommerce
description: 'Use when 电商出图全自动创作。用户提到"电商出图"、"电商素材"、"商品图"、"产品图"、"主图"、"详情页"、"商详"、"SKU图"、"电商封面"、"电商设计"、"ecommerce"时使用此 skill。'
---

# /ecommerce 电商出图命令

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。


## 强制执行声明

**你正在执行电商出图任务。你必须使用工具（MCP 工具、Write、Bash、TaskCreate 等）完成完整的电商素材创作流水线。**

**禁止直接用文字回答用户的产品问题。** 你不是在回答问题，你是在为一件商品产出可投放的成套电商素材（主图/详情/封面/分享/SKU）。如果你直接输出文字回答而没有使用任何工具，说明你理解错了任务。

用户输入 `/ecommerce` 后面的内容是产品与需求描述，不是让你回答的问题。

---

## 必须执行的步骤

按顺序执行。每一步都必须调用对应工具，不能跳过。**交付模块与数量严格以任务配置的 `selected_modules` 为准**——未勾选的模块禁止生成。

托管运行时提供任务私有工作区和预先创建的 `output/`。最终与恢复关键产物只写入本文列出的 `output/<filename>` 路径；不创建、发现、移动或重命名 `output/`。

### 步骤 1：解析任务上下文与获取项目

- **读取 `$TASK_ID`**：该值由结构化运行时上下文提供，全程复用。
- Bash 执行 `echo $ANBAN_DEFAULT_PROJECT`；非空 → `$PROJECT_ID`。为空 → `list_projects(platform="ecommerce")`，唯一匹配直接用；多个候选按品类/品牌语义匹配，仍无法唯一解析时写结构化失败诊断并停止。
- `get_project_profile(project_id="$PROJECT_ID", scope="ecommerce", task_id="$TASK_ID")` → 品牌定位、受众、参考资产与视觉风格。
- 读取任务输入：**产品图发现 → `$PRODUCT_PHOTOS`**。读取 `.anban-creator/input-attachments/index.json`，只取 role 为 `ecommerce_product` 且 `type="image"` 的条目，按 `index` 保持上传顺序，直接使用每项 `path` 作为任务相对路径，供 `analyze_image.file_path` 与 `generate_image.ref_image_paths` 使用；期望数见 `product_photo_count`，索引缺失、数量不符或全无可访问时写结构化失败诊断并停止。其余输入为 `selected_modules`、`target_platform`、`selling_points`、`visual_style`、语言。

### 步骤 2：构建产品档案

使用 `ecommerce-product-analysis` skill：
- 对每张产品图 `analyze_image` 逐张抽取电商转化属性 + **部位标签 subject**
- 产出「产品图清单」（序号 | subject | 任务相对路径 | 该图可见产品信息），汇总锁定规格到 `output/product-bible.md`
- 选出最佳锚点 `$ANCHOR_REF`

### 步骤 3：提炼卖点与转化文案

使用 `ecommerce-copywriting` skill：
- FABE 提炼 3-5 个排序核心卖点
- 生成主图 5 张结构文案、详情页 FABE 章节文案、分享文案
- 保存到 `output/copywriting.md`

### 步骤 4：资产规划与图片生成

使用 `ecommerce-visual-design` skill：
- 传入 `output/product-bible.md`、`output/copywriting.md`、`$ANCHOR_REF`、项目画像与任务选项
- 产出 `output/asset-plan.md`（仅含已选模块）
- 锚点优先（主图①先确立基准）→ 按模块逐张生成（产品档案前缀块 + **按需选参考图**：每张电商图只传它描绘部位对应的那几张产品图（查「产品图清单」序号）+ **点名保真 prompt**（「本图{部位}与【产品图清单】第N张完全一致」）+ 生成后单独 `analyze_image` 自检 + 3 轮收敛）
- 产物：`main_01..05.png`、`detail_01..NN.png`、`cover_01..NN.png`、`share_01..NN.png`、`sku_<variant>.png` + `output/asset-plan.md`、`output/image-prompts.md`、`output/best-refs.md`

### 步骤 5：合规检查

使用 `ecommerce-platform-specs` skill：
- 按 `target_platform` 扫描《广告法》极限词与平台违禁词
- 高风险词改写并重生成相关图
- 生成 `output/compliance-report.md`

### 步骤 6：交付校验

- 生成 `output/manifest.json`（按模块：文件名/尺寸/用途/内容质量结论/合规状态）
- 直接校验 manifest 中的文件与所有最终产物均位于 `output`，不得移动、复制或按产品名重命名成果目录
- 报告成果目录 `output` + `submit_agent_feedback(...)`

---

## 质量标准

- `product-bible.md` 含品类/品牌/色彩/材质/形状/包装文字/卖点候选 + 锚点
- `copywriting.md` 含排序卖点 + 主图5张文案 + 详情FABE章节文案
- `asset-plan.md` 仅含已选模块，计划数量与实际产物一致
- 各已选模块图片存在、命名规范；未选模块无产物
- 产品跨图一致（自检 PASS 或已标 `needs_reference`）
- 图内卖点文字清晰可读、信息层级服务点击/下单、移动端首屏可读
- 合规报告生成，无未处理高风险词
- `manifest.json` 生成

---

## 任务追踪要求

流程启动时用 `TaskCreate` 创建任务列表，每个步骤对应一个任务。开始前 `TaskUpdate status → in_progress`，完成后 `TaskUpdate status → completed`。报告进度示例：`[N/M] 卖点文案完成 → output/copywriting.md (5个卖点)`

---

## 子技能调用顺序

| 步骤 | 调用技能 | 产出 |
|------|----------|------|
| 1 | Bash + MCP 调用 | `$PROJECT_ID`、`$TASK_ID`、任务输入 |
| 2 | 直接 MCP 调用 | `output` |
| 3 | `ecommerce-product-analysis` | `product-bible.md`、`$ANCHOR_REF` |
| 4 | `ecommerce-copywriting`（内部步骤 4.5 调 `humanizer` 去味）| `copywriting.md` |
| 5 | `ecommerce-visual-design` | `asset-plan.md`、`image-prompts.md`、`best-refs.md`、各模块图片 |
| 6 | `ecommerce-platform-specs` | `compliance-report.md` |
| 7 | Agent 交付校验 | `output/manifest.json` 与最终成果 |

> **humanizer 位置**：`humanizer` 不是独立步骤，而是 `ecommerce-copywriting` 内部步骤 4.5（卖点/主图/详情/分享文案定稿后统一去 AI 味，再进入步骤 6 合规扫描）。顺序固定：**先去 AI，后合规**。
> **平台与类目贯穿**：`target_platform`（taobao/jd/douyin/xhs/wechat_store）影响步骤 4 文案口吻、步骤 5 视觉尺寸/白底/调性、步骤 6 违禁词；`category`（服饰/3C/食品/美妆/家居）影响步骤 3 部位识别、步骤 5 主图套系与详情结构（详见各 skill 的平台/类目章节）。
