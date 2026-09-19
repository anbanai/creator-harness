---
name: short-video-cover
description: 'Use when replicating viral short-video covers, generating a short-video cover from a reference cover image, or when user mentions "短视频封面", "爆款封面", "封面复刻", "复刻封面", "cover replication", "B站封面", "抖音封面", "视频号封面", "小红书视频封面". Triggers whenever a user provides a reference cover image and asks for a new short-video cover based on it — even if they don''t explicitly say "复刻". Covers the short-video cover replication workflow: analyze reference cover''s visual logic → migrate to user''s new title → generate cover prompt → quality optimization.'
---

# 短视频爆款封面——参考封面复刻工作流

## 任务图像参数合同

- 调用 `get_project_profile(project_id=$PROJECT_ID, scope="short-video-cover", task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`；短视频平台可优先参考 `9:16`，但只在能力支持时选择。
- 每次生成都必须显式传 `aspect_ratio` 参数；`image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## MCP 工具

| MCP 工具 | 说明 |
|----------|------|
| `analyze_image` (project_id, task_id, image_url?, file_path?, prompt) | 图像视觉分析——优先传任务相对 `file_path`，返回 AI 视觉分析结果。一次只分析一张图 |
| `generate_image` (project_id, prompt, image_type, output_path, ref_image_path, aspect_ratio, task_id) | 生成并登记单张图片；托管运行时自动把成品写入 `output_path`。当前是参考图生成，不是 ControlNet/img2img |
| `download_image` (project_id, task_id, url, output_path) | 下载公共 HTTPS 图片并登记为当前执行的持久任务文件，返回任务相对 `file_path` |
| `compress_image` (task_id, input_path, output_path, max_width?) | 压缩授权任务图并登记新的持久任务文件 |

---

## 当前能力边界（必须向用户透明记录）

- `generate_image` 是**参考图生成**，不是 ControlNet 或专用封面排版工具。参考图能提高视觉一致性，**不能锁定构图、字号、文字位置**。
- 中文文字在图片内的渲染**不稳定**——AI 生图模型对中文文字支持差。封面以**视觉冲击为主**，关键文字应作为辅助而非主体；若用户需要精确文字排版，建议生成图后用 PS/Canva 二次加工。
- `aspect_ratio=$EFFECTIVE_ASPECT_RATIO` 是宽高比提示，不是像素级硬约束；返回后需用文件尺寸或 `analyze_image` 验证比例。
- 在专用封面排版工具接入前，**二次优化**是重新生成，不是"只改局部"。

如用户要求"标题文字必须精确显示为指定中文"，必须先说明当前能力无法严格保证。

---

## 核心原则

### 原则 0：不抄构图，学视觉逻辑（最高优先级）

参考封面的作用是**拆解其画面结构**——标题位置、主体位置、配色方案、字体气质、视觉重点——而不是像素级复制。**抄构图等于抄表达，会触发原创性风险**；学视觉逻辑等于学方法，可复用到任何新标题。

判断"轻度参考 / 深度参考"的差异：
- **轻度参考**（`reference_depth=light`）：只参考色彩倾向和标题层级思路，构图、主体位置、字体气质全部重做
- **深度参考**（`reference_depth=deep`）：参考整体构图、主体位置、字体气质，但替换具体视觉元素和文字内容

### 原则 1：先用 analyze_image 看图

**Read 工具不用于图像视觉分析**——在本环境中 Read 上传图像到 CDN 并返回 URL，不提供视觉内容。所有需要"看"图像的场景必须使用 `analyze_image`。

### 原则 2：Prompt 8 要素缺一不可

封面 prompt 必须包含 8 个要素（顺序可调）：①画面比例 ②标题排版 ③人物/主体 ④背景 ⑤色彩 ⑥字体气质 ⑦主体元素 ⑧禁止事项。缺要素会直接导致生成结果不稳定。详见 [references/prompt-template.md](references/prompt-template.md)。

### 原则 3：任务有效比例硬约束

用户明确比例必须原样使用。智能适配时才把 **9:16 竖版**作为短视频平台的优先参考，并且只能从当前能力公开的 `resolved_profile.allowed_image_ratios` 中选择。

---

## 完整工作流

### Phase 0 — 初始化

读取任务身份、项目与参考封面，写 `output/input-manifest.md`：新主题、标题、平台、参考深度、风格、比例和张数。任务输入优先；`get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID, scope="article")` 返回任务有效比例。

详见 [references/input-template.md](references/input-template.md)；仅在上述阶段读取。

### Phase 1 — 拆解参考封面

#### 步骤 3：定位参考图 + 视觉分析

**3a. 定位任务参考图**：

优先读取 `.anban-creator/input-attachments/index.json`，按用户要求选择对应 `type="image"` 条目的 `path` 并记为 `$REF_TASK_PATH`。若用户只提供公共 HTTPS URL，则登记为持久任务文件：

```
download_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  url=<公共 HTTPS URL>,
  output_path="output/reference-cover.png"
) → 返回 REF_TASK_PATH
```

把 `$REF_TASK_PATH` 及其附件索引来源记录到 `output/input-manifest.md`。

**3b. 视觉分析**：

调用 `analyze_image` 提取参考封面的 8 个维度，prompt 模板见 [references/analysis-template.md](references/analysis-template.md)：

```
analyze_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  file_path="$REF_TASK_PATH",
  prompt=<参考 references/analysis-template.md 的 8 维度分析模板>
)
```

如果因 10MB 限制失败，调用 `compress_image(task_id=$TASK_ID, input_path=$REF_TASK_PATH, output_path="output/reference-cover-compressed.png")`，然后用返回的任务相对路径重试分析。

**3c. 写入分析结果**：

把 analyze_image 返回的 8 维度结构化描述写入 `output/reference-analysis.md`，包含：画面比例、标题位置与层级、人物/主体位置、背景氛围、主色与强调色、字体气质、视觉重点、构图技巧。

---

### Phase 2 — 迁移到新内容

#### 步骤 4：构建 cover-plan.md

根据新标题、账号领域、参考分析（特别是 `reference_depth`），判断迁移策略。**这一步是"思路"到"行动"的关键过渡**——必须把抽象的视觉逻辑翻译成针对当前新标题的具体决策。

判断维度：

1. **新标题分行**：根据标题字数和语义节奏，决定分几行、哪些词放大
   - 短标题（≤6 字）：1 行，整体放大
   - 中标题（7-12 字）：2 行，关键词放大
   - 长标题（13+ 字）：2-3 行，主关键词明显放大，辅助词缩小
2. **放大词识别**：从新标题中挑出 1-2 个最具情绪张力或信息密度的词
3. **主体位置**：参考封面的人像/主体放在哪里？新封面是否保留这个位置逻辑？
   - `reference_depth=deep`：保留参考的主体位置逻辑
   - `reference_depth=light`：根据新标题重新决定
4. **背景调整**：参考背景氛围是否适合新标题的账号领域？不适合则替换
5. **素材保留/替换**：参考封面中的装饰元素（图标、徽章、几何形）是否保留？
   - 装饰性元素：可保留以保持视觉密度
   - 语义性元素（具体产品/Logo）：必须替换

写入 `output/cover-plan.md`：

```markdown
# Cover Plan

## Migration Strategy

- reference_depth: light
- title_breakdown:
  - line_1: "3 步学会"（中等大小）
  - line_2: "爆款标题"（放大，强视觉冲击）
- emphasized_words: ["爆款标题"]
- subject_position: 居中偏上（保留参考逻辑）
- background: 由参考的纯黑改为深蓝渐变（更符合知识干货调性）
- decorative_elements: 保留右下角箭头图标，替换左上角徽章

## Style Anchors

- main_color: 深蓝（参考的黑色调整为更亲和的深蓝）
- accent_color: 暖黄（与主色对比，提升标题可读性）
- font_vibe: 黑体加粗（参考是无衬线粗体，沿用）
- visual_focus: 标题文字（参考的视觉重点是人脸，新封面改为文字主导）
```

---

### Phase 3 — 生成封面

#### 步骤 5：构建 prompt + 调用 generate_image

**5a. 构建 prompt**：

按 [references/prompt-template.md](references/prompt-template.md) 的 8 要素模板组装 prompt。Prompt 控制在 500 词以内，避免长 prompt 触发 504；超过时删减到关键要素 + 1-2 个最重要反面约束。

构建要点：
- 已确定要素直接填入：`画面比例 $EFFECTIVE_ASPECT_RATIO`、`标题分行`、`主体位置`、`背景描述`、`色彩主+强调`、`字体气质`、`主体元素`、`禁止事项`
- `reference_depth=deep` 时，prompt 中显式声明"参考封面的构图逻辑"
- `reference_depth=light` 时，prompt 中只提色彩和字体气质参考，构图完全自主
- 中文文字描述要具体（"标题'爆款标题'用大号黑体加粗"），但要在能力边界说明中告知用户渲染可能不精确

**5b. 调用 generate_image**：

```
result = generate_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  prompt=<5a 构建的 prompt>,
  image_type="cover",
  output_path="output/cover.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
  ref_image_path="$REF_TASK_PATH"
)
COVER_ANALYSIS_URL = result.download_url
```

**5c. Prompt 备份**：

- 确认 `generate_image` 成功；托管运行时会把图片写入 `output/cover.png`，不得手工下载或 base64 转存
- 把图片文件名、用途和最终创作 prompt 写入 `output/cover-prompts.md`；参考封面的语义拆解与迁移决策保留在 `output/reference-analysis.md` 和 `output/cover-plan.md`

---

### Phase 4 — 二次优化

#### 步骤 6：审计 + 必要重试

**6a. 审计生成结果**：

```
analyze_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  image_url="$COVER_ANALYSIS_URL",
  prompt=<参考 references/optimization-checklist.md 的 5 项审计模板>
)
```

审计 5 项（详见 [references/optimization-checklist.md](references/optimization-checklist.md)）：

1. 标题是否清楚（文字可辨认、层级分明）
2. 构图是否接近参考的逻辑（不是像素级，是结构逻辑）
3. 人物/主体是否突出（视觉重点是否对焦在主体）
4. 颜色是否统一（主色和强调色和谐，无杂色）
5. 元素是否过多（画面是否杂乱，视觉重点是否被稀释）

写入 `output/cover-review.md`，每项打分 PASS/MINOR/FAIL 并附分析依据。

**6b. 必要时重试**：

任一关键项（标题清楚、主体突出）FAIL，或 3 项以上 MINOR：
- 用更具体的 prompt 重试 1 次（明确指出问题项，加强反面约束）
- `output_path` 改为 `output/cover_v2.png`
- 重试结果同样走 6a 审计；若仍 FAIL 则接受当前最佳并在 cover-review.md 标注 `needs_manual_edit`（建议用户用 PS/Canva 二次加工具体文字）

**不要无限重试**——最多 1 次重试，避免消耗。

---

### Phase 5 — 交付报告

逐图汇报本地文件、参考拆解、迁移方案、审核结果、重试及未解决风险；只将审核通过的图标为可用。保留 input-manifest.md、reference-analysis.md、cover-plan.md、cover-prompts.md 和 cover-review.md 以便恢复。

详见 [references/delivery-template.md](references/delivery-template.md)；仅在上述阶段读取。

## Prompt 修订

用内容主体、构图、色彩、字体、层级、光影、纹理、情绪八要素描述视觉逻辑；更换可识别构图和文案，避免照抄原图。重试针对审核中实际缺失的元素。

详见 [references/prompt-and-repair.md](references/prompt-and-repair.md)；仅在上述阶段读取。

## 验证清单

### 单张封面完成后

- [ ] `output/input-manifest.md` 已生成，包含全部 6 个用户输入字段
- [ ] `output/input-manifest.md` 已记录输入参考图的 `$REF_TASK_PATH` 与附件索引来源
- [ ] `output/reference-analysis.md` 已生成，覆盖 8 个分析维度
- [ ] `output/cover-plan.md` 已生成，包含迁移决策和 style anchors
- [ ] `output/cover.png` 已由托管运行时写入
- [ ] `output/cover-prompts.md` 已备份文件名、用途和最终创作 prompt
- [ ] `output/cover-review.md` 已生成，5 项审计 PASS/MINOR/FAIL 评级

### 全部完成后

- [ ] 任一关键项（标题清楚、主体突出）FAIL 时已重试 1 次
- [ ] 重试后仍 FAIL 已标记 `needs_manual_edit` 并向用户说明
- [ ] 最终报告已交付，包含路径、迁移摘要、审计结论、能力边界声明
