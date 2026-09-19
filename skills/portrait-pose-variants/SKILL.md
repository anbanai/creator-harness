---
name: portrait-pose-variants
description: Use when generating multiple pose/expression variants from a single portrait photo while keeping the person's identity consistent, or when user mentions "人像姿态", "人像一致性", "同一人物不同表情", "封面人物表情包", "人像变体", "portrait consistency", "pose variants", "手势变化", "表情封面". Triggers whenever a user provides one portrait photo and asks for multiple cover-ready variants of the same person — even if they don't explicitly say "一致性". Generates 1-6 cover-ready portraits from one reference photo, locked to the same person's face/features/hair/style.
---

# 人像姿态变体——基于一张参考人像生成多张封面

## 任务图像参数合同

- 调用 `get_project_profile(project_id=$PROJECT_ID, scope="portrait-pose-variants", task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`；短视频人像可优先参考 `9:16`，但只在能力支持时选择。
- 每次生成都必须显式传 `aspect_ratio` 参数；`image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## MCP 工具

| MCP 工具 | 说明 |
|----------|------|
| `analyze_image` (project_id, task_id, image_url, file_path, prompt) | 图像视觉分析。优先传当前任务登记的相对 `file_path`；一次只分析一张图 |
| `generate_image` (project_id, task_id, prompt, image_type, output_path, ref_image_path, aspect_ratio) | 生成并登记单张图片；`ref_image_path` 必须是当前任务登记的相对路径。当前是参考图生成，**不是专用 ID-lock 工具** |
| `download_image` (project_id, task_id, url, output_path) | 下载公共 HTTPS 图片并登记为当前任务的持久文件，返回任务相对 `file_path` |
| `compress_image` (task_id, input_path, output_path, max_width?) | 压缩当前任务授权图片并登记新的持久任务文件 |
| `upload_image` (project_id, task_id, file_path) | 上传当前任务相对路径中的文件 |

---

## 当前能力边界（必须向用户透明记录）

- `generate_image` 是**参考图生成**，不是专用 ID-lock 工具（如 InstantID、PhotoMaker）。`ref_image_path` 能提高身份一致性，**不能 100% 锁定人脸**。
- 同一人物生成 6 张姿态变体时，**每张的身份漂移风险独立存在**——某张可能很像原图，另一张可能脸型稍变。这是当前能力边界，无法保证 6 张全部完美一致。
- 在专用 ID-lock 工具接入前，**收敛修正是重新生成**，不是"只改局部表情"。严重身份漂移（脸型变化、性别感变化、年龄感变化）标记 `needs_img2img`，不要反复生成并声称"只改表情"。
- 手势是 AI 生图的高失败率区域——手指数量、关节方向、双手协调都可能出错。若手势畸形，重新生成 1 次仍失败则标记 `needs_manual_edit`。

如用户要求"6 张必须 100% 是同一个人，脸型完全一致"，必须先说明当前能力无法严格保证；只有接入专用 ID-lock 工具后才能承诺。

---

## 核心原则

### 原则 0：身份神圣不可侵犯（最高优先级）

**可变的**：表情、手势、姿态、服装细节、背景、光影。

**不可变的（12 个身份维度）**：

| # | 维度 | 描述要点 |
|---|------|---------|
| 1 | 脸型 | 圆 / 方 / 长 / 瓜子 / 心形，颧骨宽度，下颌线条 |
| 2 | 五官比例 | 三庭五眼比例，五官在脸部的相对位置 |
| 3 | 眼睛形状 | 杏眼 / 桃花眼 / 凤眼，单/双眼皮，眼裂大小 |
| 4 | 鼻子形状 | 鼻梁高度，鼻头形状，鼻翼宽度 |
| 5 | 嘴型 | 嘴唇厚度，嘴角走向，唇峰形状 |
| 6 | 眉毛 | 眉形（柳叶眉 / 剑眉 / 平眉），浓淡，长度 |
| 7 | 发型 | 长度，刘海，卷直，层次 |
| 8 | 发色 | 黑 / 棕 / 栗 / 染色（具体色名） |
| 9 | 肤色 | 白皙 / 偏黄 / 小麦 / 健康古铜，肤质（哑光 / 水光） |
| 10 | 年龄感 | 18-22 / 23-28 / 30+，气质成熟度 |
| 11 | 气质 | 甜美 / 御姐 / 文艺 / 元气 / 高冷 |
| 12 | 神态特征 | 标志性表情倾向（如"嘴角总带一点笑意"） |

12 维度从参考人像提取后写入 `output/identity-lock.md`，每张变体生成后**逐维度比对**。

### 原则 1：逐张生成、逐张审计

每张姿态变体生成后立即 `analyze_image` 验身份。**不要批量生成 6 张后再统一审计**——如果第 1 张就身份漂移，后续 5 张大概率也会漂移；越早发现越省成本。

### 原则 2：参考图链必须指向原始人像

每张变体的 `ref_image_path` 都传入**原始参考人像**的任务相对路径（`$PORTRAIT_TASK_PATH`）。**不用前一张变体作下一张的参考**——这会放大错误，导致身份越生成越偏。

### 原则 3：有效比例 + 商业封面质感

默认配置（直接写入每张 prompt）：

```
画幅比例: $EFFECTIVE_ASPECT_RATIO
镜头: 50mm 人像镜头
景别: 半身近景（头肩到胸口）
风格: 真实摄影、商业封面、短视频爆款封面
清晰度: 高清、锐利、面部细节丰富
背景: 纯色或简洁渐变背景
光影: 明亮棚拍灯光，面部受光清晰，背景简洁，轻微景深
```

人物一致性权重最高，表情/手势变化权重中高，背景变化权重低。

---

## 完整工作流

### Phase 0 — 初始化

从任务身份和默认项目解析 `$PROJECT_ID` / `$TASK_ID`，读取 `get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID, scope="article")`。记录原始人像、所需姿态/表情、张数、风格和有效比例到 `output/input-manifest.md`；任务给定值优先，不得重问已给信息。

详见 [references/input-template.md](references/input-template.md)；仅在上述阶段读取。

### Phase 1 — 锁定身份

#### 步骤 3：解析参考人像 + 提取身份锁

**3a. 解析当前任务中的参考人像**：

```
1. 用户上传图：读取 `.anban-creator/input-attachments/index.json`，选择与用户要求对应的 `type="image"` 条目，将其 `path` 冻结为 `PORTRAIT_TASK_PATH`。
2. 公共在线图：调用 `download_image(project_id="$PROJECT_ID", task_id="$TASK_ID", url=CDN_URL, output_path="output/reference-portrait.png")`，将返回的任务相对 `file_path` 冻结为 `PORTRAIT_TASK_PATH`。
```

把 `$PORTRAIT_TASK_PATH` 记录到 `output/input-manifest.md`。禁止记录或传递宿主机路径、服务端临时路径。

**3b. 提取身份锁**：

调用 `analyze_image` 提取 12 个身份维度，prompt 模板见 [references/identity-lock-template.md](references/identity-lock-template.md)：

```
analyze_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  file_path="$PORTRAIT_TASK_PATH",
  prompt=<参考 references/identity-lock-template.md 的 12 维度提取模板>
)
```

如果因 10MB 限制失败：调用 `compress_image(task_id="$TASK_ID", input_path="$PORTRAIT_TASK_PATH", output_path="output/reference-portrait-compressed.png")`，并把返回的任务相对路径用于分析；压缩后仍超限则写结构化失败诊断并停止。

**3c. 写入身份锁**：

把 12 维度结构化描述写入 `output/identity-lock.md`。这份文件是后续每张变体 prompt 的**身份部分**直接抄写来源，也是 Phase 4 审计的比对基准。

---

### Phase 2 — 选择姿态

#### 步骤 4：确定要生成的姿态列表

根据 `input-manifest.md` 的 `target_poses`，从 6 个标准模板（参考 [references/pose-templates.md](references/pose-templates.md)）中选择：

| # | 模板名 | 适用封面类型 |
|---|--------|-------------|
| 1 | 震惊瞪眼 + 双手捂脸 | "震惊内幕"、"太离谱了" |
| 2 | 自信微笑 + 单手指向镜头 | "干货分享"、"重要提醒"、"别再踩坑" |
| 3 | 疑惑皱眉 + 单手托下巴 | "为什么会这样"、"很多人都想错了" |
| 4 | 开心大笑 + 双手点赞 | "好消息"、"太值了"、"强烈推荐" |
| 5 | 严肃警告 + 单手停止手势 | "别再这样做"、"危险提醒"、"千万注意" |
| 6 | 惊喜兴奋 + 双手张开 | "终于发现了"、"原来这么简单"、"太惊喜了" |

如果是自定义姿态（不在 6 模板内），用户须提供：表情描述 + 手势描述 + 整体情绪 + 适用封面类型。

把选定的姿态列表写入 `output/selected-poses.md`，包含每个姿态的：编号、表情、手势、情绪基调、prompt 段落。

---

### Phase 3 — 逐张生成

#### 步骤 5：循环生成 N 张变体

对每个姿态 i（i = 1..N）执行 5a-5e：

**5a. 构建 prompt**：

按以下顺序拼接（详细模板见 [references/pose-templates.md](references/pose-templates.md)）：

```
[身份锁段落 — 从 identity-lock.md 抄写]
[当前姿态段落 — 从 selected-poses.md 抄写]
[通用风格段落 — $EFFECTIVE_ASPECT_RATIO, 半身, 商业封面, 棚拍, etc.]
[通用负面约束段落 — 见下方"通用负面提示词"]
```

Prompt 控制在 500 词以内；超过时优先保留身份锁 + 当前姿态 + 关键负面约束。

**5b. 调用 generate_image**：

```
result_i = generate_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  prompt=<5a 构建的 prompt>,
  image_type="cover",
  output_path="output/variant_0i.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
  ref_image_path="$PORTRAIT_TASK_PATH"  # 始终用原始人像，不用前一张变体
)
VARIANT_ANALYSIS_URL_i = result_i.download_url
```

**5c. Prompt 备份**：

- 确认 `generate_image` 成功；托管运行时会把图片写入 `output/variant_0i.png`，不得手工下载或 base64 转存
- 把图片文件名、用途和最终创作 prompt 追加到 `output/image-prompts.md`；参考图选择和稳定顺序写入 `output/selected-poses.md`

**5d. 逐张身份审计**：

立即（不等其他变体生成）调用 `analyze_image` 审计：

```
analyze_image(
  project_id="$PROJECT_ID",
  task_id="$TASK_ID",
  image_url="$VARIANT_ANALYSIS_URL_i",
  prompt=<参考 references/consistency-audit.md 的 12 维度比对模板，基准是 identity-lock.md>
)
```

**5e. 必要时立即重试**：

关键维度（脸型 / 五官比例 / 发型发色）任一 FAIL：
- 用更严格 prompt 重试 1 次（加强身份锁描述、加强反面约束）
- `output_path` 改为 `output/variant_0i_v2.png`
- 重试结果走 5d 审计；仍 FAIL 则接受当前最佳并标记 `needs_img2img`
- **不要无限重试**——最多 1 次

**5f. 逐张确认模式**：

如果 `confirm_per_image=true`：每张完成后**停止并提示用户**：

```
[3/6] variant_03.png 已生成（姿态：疑惑皱眉 + 单手托下巴）

身份审计结果：脸型 PASS / 五官比例 PASS / 发型 PASS / 表情夸张度 MINOR

是否接受这张？接受请回复"继续"，重新生成请回复"重做"。
```

得到用户确认后再生成下一张。

---

### Phase 4/5 — 一致性审计与交付

逐图核验身份、表情/手势、原图参考链和比例，把观察、重试历史与能力边界写 `output/consistency-report.md`。报告只交付通过审核的变体，明确失败/缺失项和文件路径，不声称像素级身份保证。

详见 [references/delivery-template.md](references/delivery-template.md)；仅在上述阶段读取。

## Prompt 修订

发现身份漂移先加强原始人像身份锁，保持参考链直指原图。只修订当前变体的表情、手势和视线，不改变五官比例、性别、年龄和肤色。

详见 [references/prompt-and-repair.md](references/prompt-and-repair.md)；仅在上述阶段读取。

## 验证清单

### 单张变体完成后

- [ ] `output/variant_0N.png` 已由托管运行时写入
- [ ] `output/image-prompts.md` 已追加该张的文件名、用途和最终创作 prompt
- [ ] 逐张身份审计已通过（关键维度 PASS 或重试后接受）
- [ ] `confirm_per_image=true` 时已得到用户确认

### 全部完成后

- [ ] N 张变体全部生成
- [ ] `output/identity-lock.md` 覆盖 12 个身份维度
- [ ] `output/selected-poses.md` 列出所有选定姿态
- [ ] `output/consistency-report.md` 汇总所有变体的 12 维度审计
- [ ] 关键维度 FAIL 已重试 1 次；重试后仍 FAIL 已标记 `needs_img2img`
- [ ] 手势畸形的变体已重试 1 次；重试后仍畸形已标记 `needs_manual_edit`
- [ ] 最终报告已交付，包含 N 张路径、身份锁摘要、审计汇总、能力边界声明
