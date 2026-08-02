---
name: line-art-coloring
description: Use when coloring line art images, batch coloring multiple images, preserving visual consistency across characters, or when user mentions "线稿上色", "上色", "填色", "coloring", "color consistency", "批量上色", "角色上色", "给线稿上色".
---

# 线稿上色——尽力保线 + 跨图配色一致性

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## 任务图像参数合同

- 调用 `get_project_profile(task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 可按原始线稿方向和构图，从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`。
- 每次生成都必须显式传 `aspect_ratio` 参数；不得从工具缺省值反推业务比例。
- `image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## 这个 skill 交付什么

把线稿当主参考与创作蓝图，交付**构图源自线稿、跨图配色一致的成品插画**。优先级：**颜色跨图一致 > 像素级保线**。每张图都把当前原始线稿作为第一张参考，并按语义相关性追加颜色锚点，把保线推到当前能力极限，残余线稿差异如实披露（`needs_img2img`）。

## MCP 工具

| MCP 工具 | 说明 |
|----------|------|
| `analyze_image` (project_id, image_url, file_path, prompt) | 图像视觉分析——传入图像 URL 或服务器文件路径，返回 AI 视觉分析结果。一次只分析一张图片；同时传 `file_path` 和 `image_url` 时服务端只用 `file_path`。用于实体识别、候选评估、一致性审计、线稿验证 |
| `generate_image` (project_id, task_id, prompt, image_type, output_path, aspect_ratio, ref_image_path / ref_image_paths, watermark) | 从创作 prompt 和有序参考集合生成并登记一张任务图片；托管运行时自动把成品写入 `output_path` |
| `upload_image` (project_id, file_path) | 上传图片 |
| `compress_image` (file_path) | 压缩图片 |
| `download_image` (project_id, url) | 把在线图片下载到 MCP 服务器临时路径，返回服务器端 `file_path`；不上传，也不写入 agent 本地 `output` |

---

## 当前能力边界（先讲清楚，再开工）

平台 `generate_image` 是**参考图生成**：根据 prompt + 参考图生成一张新图，**不是专用的 `colorize_lineart`，也不是严格的 img2img/ControlNet 上色**，不提供线稿强度或局部重绘控制。因此：

- 线条会被部分重绘——**尽力保持线稿，但不能承诺 100% 保留**。本 skill 是"尽力保线"的参考图生成流程。
- `ref_image_path` 只能提高构图/风格一致性，不能锁定线稿像素。
- `aspect_ratio` 是宽高比提示，不是像素级裁切硬约束。
- 收敛修正和回溯都是**重新生成整张图**，不是"只改颜色不动线条"——所以不能反复重绘谎称只修色。

**保线能做到多好，取决于是否始终把当前原线稿作为首要参考**。颜色锚点只补充实体颜色语义，不替代当前原线稿；参考图按语义相关性排序，服务端负责路由与数量限制，Agent 不按供应商或模型能力分支。

如用户要求"原线稿 100% 不变、只填色"，必须先说明当前能力无法严格保证；只有接入专用 img2img/colorize_lineart 能力后才能承诺。

---

## 核心原则

### 原则 1：颜色一致性 > 像素级保线

同一实体在所有图中颜色一致是第一目标。不要用大量候选弥补模型保线能力缺口——默认单候选模式，仅在明确触发条件（见「核心机制 3」）下用 2 候选。

### 原则 2：原线稿作单源 ref（保线的核心手段）

每张图都把**当前原始线稿**作 `ref_image_path`/`ref_image_paths`，构图与线条从它出发，**不沿前一张上色输出漂移**（漂移会累积误差，越上越偏）。先 `download_image` 把原线稿注册到服务器拿到稳定 `file_path`，再作 ref。

### 原则 3：参考集合按语义组织

当前原始线稿始终作为第一张参考；需要锁定跨图颜色时，再按实体相关性追加已接受的颜色锚点。prompt 中“参考图 N”的编号必须与数组顺序一致。只提交与当前画面语义相关的参考集合。

### 原则 4：每色必有理由（色彩理论纪律）

配色不是随意。新实体定色遵循：
- **性格/氛围匹配**：活泼角色用暖色、沉稳角色用冷色；户外场景用自然色、室内用柔和色。
- **跨实体区分度**：不同角色主色要有足够区分度，避免混淆；颜色相近时用配饰/细节色区分。
- **和谐关系**：与已有实体色互补/对比/和谐，共享色关系明确写出。
- **不用 hex 色值**——用语义色名 + 实物类比 + 反面约束（见「语义颜色锚定」）。

### 原则 5：用 analyze_image 分析图像（不用 Read）

**Read 工具不用于图像视觉分析**——在本环境 Read 上传图像到 CDN 返回 URL，不提供视觉内容。所有"看"图像的场景用 `analyze_image`。**一次只分析一张**；同时传 `file_path` 和 `image_url` 时服务端只用 `file_path`。线稿保持审计必须先为原线稿生成线稿指纹，再分析上色图，逐项比对。

---

## 图像视觉分析方法

### 分析流程

1. **获取图像可访问路径**：
   - MCP 服务器端文件路径：直接传 `file_path` 参数
   - 已有 CDN URL：传 `image_url` 参数
   - Read 返回 CDN URL 的场景：先 Read 获取 URL，再用 `image_url` 参数传入
2. **调用 analyze_image**：`analyze_image(project_id="$PROJECT_ID", image_url=URL或file_path=路径, prompt=分析提示)`
3. **处理结果**：根据返回的文本描述进行实体匹配、颜色评估等

> **注意**：Read 返回的 CDN URL 约 30 分钟过期。获取后立即使用；需要重新分析时重新 Read 获取新 URL。
>
> **大小限制**：`file_path` 方式分析有 10MB 限制。若 `analyze_image(file_path=...)` 返回图片过大，先调用 `compress_image(file_path=...)` 得到较小文件；仍失败时调用 `upload_image(project_id, file_path)` 获取 URL，再用 `image_url` 重试。

### 各场景的 analyze_image prompt 模板

**实体识别**（步骤 3）：
```
描述图中所有实体：角色（位置、姿态、朝向、体型比例、发型轮廓、服装类型、配饰、与其他角色空间关系）、物体（位置、大小、材质）、环境元素（整体色调方向）。对每个实体提供足够外观描述用于跨图匹配。
```

**候选颜色评估**（步骤 7）：
```
逐实体逐部位描述颜色。对图中每个角色/物体，列出所有可见部位并描述每个部位的颜色。格式：
- [实体名]: [部位1]=[颜色描述], [部位2]=[颜色描述], ...
```

**一致性审计**（步骤 8）：
```
逐实体逐部位描述颜色，与以下 Color Bible 规格比对并标注 PASS/MINOR/FAIL：
[Color Bible 内容]

对每个实体的每个部位：
- PASS: 颜色与定义一致
- MINOR: 色调正确但有轻微饱和度/明度偏差
- FAIL: 色调错误
```

**线稿验证**（每张上色图生成后）：

先为原始线稿生成线稿指纹：
```
只描述这张原始线稿的可验证线稿指纹，不评论颜色。包括：画面宽高方向、主体数量、主体位置、姿态、轮廓关键线（含线条粗细与曲率）、服装/道具/背景线条、构图边界、容易被重绘或丢失的小线条，以及线条整体锐利还是模糊。
```

再审计上色图：
```
只描述这张上色图的线条和构图状态，不评论颜色。按原始线稿指纹逐项检查：画面宽高方向、主体数量、主体位置、姿态、轮廓关键线（粗细/曲率是否一致）、服装/道具/背景线条、构图边界、小线条是否存在、线条锐度（是否变模糊或变锐化）。输出 PASS/MINOR/FAIL，并列出任何线条重绘、模糊、锐化变化、构图偏移、比例变化或元素增删。
```

将上色图审计结果与线稿指纹逐项比对；不能确认时标记为 `needs_img2img`。

---

## 核心机制

### 1. 渐进式 Color Bible

Color Bible 不在开始时一次性建完，而是逐图渐进构建：
- 处理第 1 张图时建立初始 Color Bible
- 处理第 N 张图时：匹配已有实体（复用颜色）+ 发现新实体（定义新颜色加入）
- 这避免了全局规划的遗漏问题

颜色定义方法论详见 [references/color-bible.md](references/color-bible.md)。

### 2. 语义颜色锚定

**不用 hex 色值**——AI 模型经常忽略 "#FF5733" 这种写法。

改用三层颜色描述：
- **语义色名**："bright cherry red, like a fire truck"
- **实物类比**："hair like dark chocolate, not milk chocolate"
- **反面约束**："must NOT be blonde or light brown, it must be very dark brown, almost black"

### 3. 单候选优先 + 可选最优选 + 回归检查

默认每张线稿生成 **1 个候选**，减少成本和长任务失败率。满足以下**明确**条件才生成 2 个候选：
- 用户明确要求质量优先（如"高质量"/"多出几个挑"）
- 第一候选颜色明显失败（FAIL = 色调错误，见 verification.md PASS/MINOR/FAIL）但线稿保持尚可——换措辞再试
- 跨图关键实体（主角）需要更稳定的颜色版本

2 候选流程：
- 候选 A 和 B 用不同 prompt 措辞（描述同一颜色但换说法），都以**原线稿作单源 ref** 独立生成，不把 A 当 B 的参考（避免放大 A 的错误）
- 用 `analyze_image` 逐实体逐部位比对 Color Bible
- 选颜色最优且线稿风险最低的；**回归检查**：颜色更准但线稿退化更严重的候选必须拒
- 两个候选都明显不匹配 → 生成候选 C（换 ref 锚点或加强 prompt）

多候选只能提高颜色命中率，不能保证线稿一致。

### 4. Per-Entity Best Reference 追踪

维护映射表 `output/best-refs.md`：
```
## Entity: Girl with red hood
- best_ref: colored_00.png
- quality: hair=PASS, skin=PASS, hood=PASS
- appearances: colored_00, colored_02, colored_05

## Entity: Big bad wolf
- best_ref: colored_02.png
- quality: fur=PASS, eyes=PASS
- appearances: colored_00, colored_02
```

best_ref 记录的是某实体**颜色**渲染最好的一张，可作为 `ref_image_paths` 中的颜色锚点；它**不作下一张构图的来源**——构图来源始终是当前图的原线稿。参考图按语义相关性排序，服务端负责路由与数量限制。每完成一张上色图就更新：新图中某实体颜色比当前 best_ref 更好则更新。

### 5. 收敛修正循环（回归感知）

收敛修正和回溯统一都遵循同一回归守卫：只要线稿比修正/回溯前退化，就拒收并回退、标 `needs_img2img`，绝不为了修色而改线。

全部上完后审计 → 修正 → 再审计 → 再修正，最多 3 轮。

**先判断能否真正改善**：颜色问题若需"只改色不动线"才能修，直接标 `needs_img2img`，不反复全量重绘（重绘会改线，越修越破）。只在"重绘既能修色又不明显退化线稿"时才重生成，并做**回归守卫**：修正后线稿比修正前退化 → 拒收、回退修正前版本。线稿退化判定维度与「颜色改善×线稿退化」2×2 矩阵见 [references/verification.md](references/verification.md)「回归检查」。

### 6. 回溯统一（默认前向不回溯）

**默认前向不回溯**（对齐同仓 agent）。仅当任务要求严格跨图一致、且颜色一致性收益明确大于线稿重绘风险时才 opt-in：修正后某实体 best_ref 变了 → 用新 best_ref 作颜色锚点、仍以原线稿作单源 ref，回溯重上前面的图。回溯同样带回归守卫，退化则放弃、标 `needs_img2img`。

---

## 完整工作流

### Phase 0 — 初始化

#### 步骤 1：获取项目和工作目录

- `echo $ANBAN_DEFAULT_PROJECT` → `$PROJECT_ID`
- 如果为空，调用 `list_projects` 获取项目列表并选择；只有一个可用项目时自动使用，多个项目且无法从任务上下文判断时停止并提示配置 `ANBAN_DEFAULT_PROJECT`
- 从结构化 runtime 上下文获取 `$TASK_ID`
- 调用 `get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID)`，按「任务图像参数合同」冻结 `$EFFECTIVE_ASPECT_RATIO`；用户明确比例不支持时在生成前停止
- **确定语义参考集合**：当前原始线稿排第一；需要颜色一致性时追加最相关的颜色锚点，并保持 prompt 编号与参考数组顺序一致
- 使用 runtime 已预创建的 `output/`；不得创建、发现、移动或重命名该目录

#### 步骤 2：确认输入线稿

- 收集用户提供的线稿图路径列表
- 处理 TIF、TIFF、BMP 等非标准格式：先转换成 PNG，再进入分析/生成流程。macOS 可用 `sips -s format png "$IN" --out "$OUT.png"`；若安装了 ImageMagick，可用 `magick "$IN" "$OUT.png"`。保留原始文件路径和转换后 PNG 路径到 manifest。
- Read 每张 PNG/JPG/WebP/GIF 图验证存在且可读取。Read 对 TIF 常会失败，不要把 TIF 直接传给 Read。
- 如果用户未指定顺序：
  - 对每张线稿调用 `analyze_image`，参数 `prompt="识别图中所有角色/实体的数量、类型（人物/动物/物体）、位置、构图复杂度。列出每个实体的简要描述。"`
  - 按角色数量 × 构图简洁度降序排列
- 写入 `output/input-manifest.md`：

```markdown
# Input Manifest

## Processing Order

| # | File | Reason |
|---|------|--------|
| 0 | /path/to/lineart_01.png | 3 characters, simple composition → anchor |
| 1 | /path/to/lineart_03.png | 2 characters, shares Girl with #0 |
| 2 | /path/to/lineart_02.png | 1 character, complex pose |
```

---

### Phase 1 — 渐进式上色循环

对 `input-manifest.md` 中的每张线稿（按顺序）执行步骤 3-7：

#### 步骤 3：读取线稿，识别实体

Read 当前线稿图获取 CDN URL → 调用 `analyze_image(project_id="$PROJECT_ID", image_url=CDN_URL, prompt=实体识别prompt)` → 识别所有实体：

- **角色类**：人物、动物、拟人角色
  - 描述：位置、姿态、朝向、大小、服装特征、配饰、与其他角色的空间关系
  - 识别依据：外观特征（发型、服装轮廓、体型比例）、上下文线索
- **物体类**：关键道具、标志性物品
  - 描述：位置、大小、材质暗示
- **环境类**：场景背景、氛围元素
  - 描述：整体色调方向（温暖/冷调/中性）

关键原则：**识别的目的是匹配**——描述要足够详细，以便与后续图中的同一实体匹配。

#### 步骤 4：实体匹配与 Color Bible 更新

将识别到的实体与 `output/color-bible.md` 中已有实体逐一匹配（方法详见 [references/color-bible.md](references/color-bible.md)）。

**已知实体**：从 Color Bible 读取颜色规格。
**新实体**：按色彩理论纪律（性格/氛围匹配 + 跨实体区分度 + 与已有色和谐关系）定义颜色规格，追加到 `output/color-bible.md`。

写入/更新 `output/color-bible.md`。

#### 步骤 5：构建上色 Prompt

构建包含以下要素的 prompt（颜色描述使用英文，模型对英文颜色术语响应更精确；其余指令可用中文）。Prompt 控制在 500 词以内，避免长 prompt 触发 504 Gateway Timeout；超过时删减到关键实体、关键颜色和 1-2 个最重要反面约束。

> **提醒**：颜色描述使用语义色名 + 实物类比 + 反面约束，**绝对不用 hex 色值**。详见下方"语义色名参考"表。

**保线固定语**（定义一次，生成 prompt 和修正 prompt 都复用）：
```
CRITICAL: PRESERVE the exact line art composition. Every line, stroke, and
proportion must remain identical to the original. Do NOT modify, blur, redraw,
add, or remove any lines. Only add color.
```
> 这是 **prompt 约束，不是能力承诺**——平台无 ControlNet，线条仍可能被部分重绘。若输出仍明显改变线稿，记录 `needs_img2img`，不要谎称 100% 保线。

Prompt 模板：
```
Color this line art illustration.

[保线固定语]

COLOR SPECIFICATIONS (must match exactly):

[Known entities — match the reference]:
- [Entity A]: [element] is [语义色名, e.g. "deep dark chocolate brown, NOT light brown"],
  wearing [garment] in [语义色名, e.g. "bright cherry red, like a fire truck"],
  [element] in [语义色名]
  CONSTRAINT: [Entity A]'s [element] must NOT be [常见错误色]

[New entities — use these colors]:
- [Entity B]: [element] [语义色名], wearing [garment] in [语义色名]

COLOR RELATIONSHIPS:
- [Entity A]'s [element] is the same color as [Entity B]'s [element]
```

**Prompt 要点**：
- 已知实体：强调与参考一致 + 反面约束
- 新实体：完整定义颜色 + 实物类比
- 跨实体颜色关系明确写出
- 保线固定语必须包含
- 不使用 hex 色值
- 模型对简单直接的颜色指令响应更准，如 "blue jacket"、"red scarf"；复杂语义色名只用于关键实体，不要堆叠多层反面约束
- `output/image-prompts.md` 只记录图片用途、最终创作 prompt 和参考图编号

#### 步骤 6：生成候选（原线稿作为第一参考）

**先把当前原线稿注册到服务器**（作 ref 的前提）：
```
lineart_cdn   = Read(lineart_path)                              # 返回 CDN URL
lineart_server = download_image(project_id="$PROJECT_ID",
                                url=lineart_cdn).file_path       # 稳定的服务器端路径
```

**按语义组织参考集合**：
- 当前原始线稿始终是第一张参考
- 需要跨图颜色一致性时，追加与当前实体最相关的已接受颜色锚点
- prompt 中“参考图 N”必须与参考数组顺序一致
- 每张上色图都必须带当前原始线稿；不要把前一张上色输出作为下一张的构图来源
- 服务端拒绝参考集合时，保留原线稿并按语义相关性缩小锚点子集

`output_path` 使用任务相对路径 `output/colored_NN_a.png`。用户明确比例时原样使用；智能适配时才从 `resolved_profile.allowed_image_ratios` 中选择与原始线稿最接近的 `$EFFECTIVE_ASPECT_RATIO`（如 7:5 可在能力支持时选择 `3:2` 或 `4:3`）。返回后用 `analyze_image` 检查是否被裁切、变形或转向。

生成候选 A：
```
result_a = generate_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  prompt="[主 prompt]",
  image_type="content",
  output_path="output/colored_NN_a.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
  ref_image_paths=[lineart_server, ...相关颜色锚点]
)
# image-prompts.md 只记录用途、最终 prompt 和参考图编号
```

如需高质量模式，生成候选 B（换 prompt 措辞，**同样以原线稿作单源 ref 独立生成**，不把候选 A 当候选 B 的参考，避免放大 A 的错误）。

#### 步骤 7：候选评估 + 最优选 + 回归检查

1. 调用 `analyze_image(project_id="$PROJECT_ID", task_id="$TASK_ID", image_url=result_a.download_url, prompt=候选颜色评估prompt)` → 获取候选 A 的颜色描述。
2. 高质量模式下，同样使用候选 B 的 `download_url` 分析。
3. 对每个候选，逐实体逐部位比对 Color Bible 评 PASS/MINOR/FAIL，同时记录线稿/构图差异。
4. 选颜色最优且线稿风险最低的候选；**回归检查**：颜色更准但线稿退化更严重的候选必须拒。
5. 选中候选已由托管运行时写入声明的 `output_path`；不得再用 shell、`download_image` 或 base64 重复物化。
6. 如果两个候选都明显不匹配 → 生成候选 C（换 ref 锚点或加强 prompt 约束），选三者中最好的。
7. 调用 `analyze_image` 验证线稿完整性：先为原线稿生成线稿指纹，再审计上色图，逐项比对。
8. 更新 `output/best-refs.md`：新图中某实体颜色比当前 best_ref 更好则更新。
9. 删除未选中的候选文件。

**产出**：`output/colored_NN.png`

---

### Phase 2 — 全量一致性审计

验证与修正方法论详见 [references/verification.md](references/verification.md)。

#### 步骤 8：全面审计（双轨：颜色 + 线稿风险）

对每张 `output/colored_NN.png`：调用 `analyze_image(project_id="$PROJECT_ID", file_path=服务器端路径, prompt=一致性审计prompt)` → 对 Color Bible 中每个跨图实体逐部位比对。

生成 `output/consistency-report.md`（双轨：颜色 PASS/MINOR/FAIL + 线稿保持风险）：

```markdown
# Consistency Report

## Entity: Girl with red hood

| Image | Hair | Skin | Hood | Dress | Overall |
|-------|------|------|------|-------|---------|
| colored_00 | ✅ dark chocolate | ✅ warm beige | ✅ cherry red | ✅ navy blue | PASS |
| colored_02 | ✅ dark chocolate | ✅ warm beige | ⚠️ slightly darker red | ✅ navy blue | MINOR |
| colored_05 | ✅ dark chocolate | ✅ warm beige | ❌ appears orange | ✅ navy blue | FAIL |

## 线稿保持风险
| Image | 重绘 | 偏移 | 比例 | 元素增删 | 判定 |
|-------|------|------|------|----------|------|
| colored_03 | 小线条重绘 | 无 | 无 | 无 | needs_img2img(轻微) |
| colored_05 | 姿态改变 | 构图偏移 | 无 | 无 | needs_img2img(严重) |

## Summary
- PASS: 5 entities across 12 appearances
- MINOR: 2 entities across 3 appearances
- FAIL: 1 entity across 1 appearance
- needs_img2img: 2 images
```

---

### Phase 3 — 收敛修正循环（最多 3 轮，回归感知）

专用 img2img/colorize_lineart 工具可用前，收敛修正只能 best-effort 执行。遇到"颜色只需局部微调，但重新生成会破坏线稿"的情况，**直接标 `needs_img2img`，不要继续消耗候选**。

**每轮修正**（均以**原线稿作单源 ref**，必要时叠加该实体 best_ref 锚点）：

**9a. FAIL 级修正**（重新生成）：

对每个 FAIL 实体，构建修正 prompt：
```
CORRECTION PASS for color inconsistency.
The reference shows the CORRECT color scheme for [Entity].

[保线固定语，见步骤 5]
Only change the COLOR of [Entity], nothing else.

SPECIFIC ISSUES TO FIX:
- [Entity]'s [element] should be [语义色名] (currently appears [错误色描述])

Use the reference's colors EXACTLY for [Entity].
```

- 默认生成 1 候选；质量优先模式 2 候选选最优
- 更新 best-refs.md

**9b. MINOR 级修正**（增加反面约束）：在原 prompt 基础上增加反面约束，生成 1 候选。

**9c. 回归守卫 + 重新审计**：
- 对每个修正结果先做线稿审计：若线稿比修正前退化 → **拒收、回退修正前版本**，该项标 `needs_img2img`
- 颜色改善但线稿退化的"修正"不算成功
- 更新 consistency-report.md，判断：
  - 全部 PASS/MINOR 可接受 → 跳出，进入 Phase 4
  - FAIL 数减少 → 继续下一轮
  - 无改善 / 线稿风险升高 → 停止，剩余 FAIL 标 `needs_manual_review` / `needs_img2img`

---

### Phase 4 — 回溯统一（opt-in）

**默认前向不回溯**。仅当任务要求严格跨图一致、且颜色一致性收益明确大于线稿重绘风险时才执行：

- 检查 Phase 3 中是否有实体的 best_ref 发生变化
- 如果变了，且前面的图也包含该实体 → 用新 best_ref 作颜色锚点、仍以**原线稿作单源 ref**，回溯重上前面的图
- 回溯同样带回归守卫：回溯后线稿退化 → 放弃回溯、标 `needs_img2img`
- 回溯后重新审计确认一致性

---

### Phase 5 — 交付报告

向用户交付结果：

```
尽力保线的线稿上色完成

参考策略: 当前原始线稿始终排第一，颜色锚点按实体相关性追加
总图数: 8
颜色一致性: PASS 5 / MINOR 2 / FAIL 1（已修正或标 needs_img2img）
修正轮次: 2
保线风险(needs_img2img): 2 张——colored_03(轻微)、colored_05(严重)

Color Bible 实体数: 5（3 角色 + 2 物体）
一致性报告: output/consistency-report.md
能力边界: 当前使用 generate_image best-effort 参考图生成，未使用专用 img2img/colorize_lineart，非像素级 100% 保线

成果文件:
- output/colored_00.png ~ output/colored_07.png

人工复核: 无
```

如果有人工复核项：
```
需要人工复核:
- colored_05.png: [Entity] 的 [element] 经 3 轮修正仍偏差
  建议: 手动指定该部位颜色后重新运行修正步骤；或接入专用 img2img 工具保线重上
```

---

## Prompt 与故障处理速查

- 语义色名、实物类比、反面约束和跨实体颜色关系的完整写法见 [references/color-bible.md](references/color-bible.md)。次要实体使用更简单直接的颜色指令，关键实体才叠加实物类比和反面约束。
- 常见失败按 [references/verification.md](references/verification.md) 判断：颜色 FAIL 优先修；线稿退化直接触发回归守卫；当前 generate_image 非严格上色工具，强化 prompt 后仍失败就标 `needs_img2img`，不承诺 100% 保留。
- 分析失败时遵循工具边界：Read 返回的 CDN URL 约 30 分钟过期；`file_path` 方式分析有 10MB 限制，先 `compress_image`，仍失败再 `upload_image` 后用 `image_url`。
- `output_path` 使用任务相对路径 `output/...`；`generate_image` 成功后由托管运行时自动写入，不执行手工下载或 base64 转存。
- 长 prompt 可能触发 504 Gateway Timeout。Prompt 控制在 500 词以内，优先关键实体、关键颜色和 1-2 个最重要反面约束。

## 最终验证

每张图完成后确认：Color Bible 已更新、原线稿已作单源 ref、候选已做颜色和线稿双轨审计、best-refs.md 已更新、`output/colored_NN.png` 已写入。

全部完成后确认：所有上色图存在、consistency-report.md 已生成、收敛修正最多 3 轮且带回归守卫、FAIL 项已修正或标记 `needs_manual_review` / `needs_img2img`、最终报告不写"100% 保线 / 完全一致"承诺。
