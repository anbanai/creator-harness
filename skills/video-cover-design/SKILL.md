---
name: video-cover-design
description: Use when a managed Montage workflow needs to design, generate, audit, and deliver a short-video cover from its frozen video brief, aspect ratio, and system-provided assets.
---

# Video Cover Design

为 Montage 视频自动生成可交付封面。该 Skill 由 Montage Agent 调用，不是面向用户的问答入口。

## 执行合同

上游 Agent 必须在一次调用中提供：

- `$PROJECT_ID`、`$TASK_ID`
- 从 Cloud 首条用户消息冻结的 `$VIDEO_ASPECT_RATIO`
- 视频 brief、内容摘要、最终标题或标题依据
- 系统任务人像是否可用；可用时路径固定为 `.anban-creator/task-reference.png`
- 其他已冻结的任务素材路径、项目定位和显式视觉偏好

不得向用户提问，不得要求补充配置，不得读取 `montage-input.json`、项目设置或 Skill 默认值来重新决定比例。缺少或不支持 `$VIDEO_ASPECT_RATIO` 时，写 `output/failure-diagnosis.md` 并停止。

比例必须原样贯穿封面规划、prompt、`generate_image` 和质量审核。封面是否生成不受 `delivery_targets` 控制。

## 图像参数合同

`$VIDEO_ASPECT_RATIO` 是上游从首条用户消息冻结的用户明确比例。Studio 的“智能适配”必须在调用本 Skill 前解析为具体业务比例；本 Skill 不得再次推断或改写。`resolved_profile.image_ratio` 和 `resolved_profile.allowed_image_ratios` 只用于上游校验，不是本 Skill 的第二配置来源。每次生成必须显式传 `aspect_ratio`，且值必须是 `$VIDEO_ASPECT_RATIO`。

## 人像与参考素材

- 人像只能来自系统提供的 `.anban-creator/task-reference.png`，不得读取项目风格图、Skill 目录中的人物图片或本地配置。
- 封面概念需要用户本人出镜但系统人像不可用时，写结构化失败诊断并停止，不得捏造身份。
- 内容不要求人物时，可自动选择非人像构图，不传人像参考。
- 风格参考中的人物行只在系统人像可用且概念确实需要人物时适用；非人像构图必须删去人物占位，以产品、界面、道具或具象隐喻作为主体。
- 需要人像时，`.anban-creator/task-reference.png` 必须是 `ref_image_paths` 的第一项；其后才是与封面概念直接相关的任务素材，保持上游顺序。
- 不得使用任意绝对路径、网络下载或未由任务冻结的图片。

## 自动决策

从 brief、标题、素材和项目定位中选择最适合的一种风格，无需征询用户：

| 风格 | 优先条件 |
| --- | --- |
| 深色渐变风 | 强冲突、科技、警示或高冲击主题 |
| 纯色扁平风 | 单一观点、轻量知识或清爽表达 |
| 产品主视觉风 | 有产品、界面或工具截图作为主证据 |
| 对比卡片风 | 明确的前后、优劣或二选一叙事 |
| 极简留白风 | 标题本身是视觉锤，素材较少 |
| 海报拼贴风 | 多张任务素材共同支撑内容 |
| 人物侧置留白风 | 人像可信且长标题需要空间 |
| 背影构图风 | 主题强调代入、探索或转折 |
| 局部出镜风 | 道具或产品是绝对主角 |
| 正面对视风 | 人像可信且情绪表达是点击钩子 |

选定后只读取对应的 `references/style-XX-*.md`；需要校准具体程度时再读 `references/examples.md`。缺失的非必要视觉偏好由内容语义和所选模板确定。

## 产物

每次执行都维护以下文件：

- `output/cover-plan.md`：输入摘要、比例来源、是否使用人像、风格选择及理由、标题排版和参考图顺序。
- `output/cover-prompt.md`：实际传给每次 `generate_image` 的完整 prompt 和对应审核反馈。提示词仅是内部审计证据，不是交付物。
- `output/cover-quality.json`：机器可读的最终审核结果、尝试次数、各评分项和通过状态。
- `output/cover.png`：最终封面，必须生成并通过审核。

终止失败时保留已经生成的文件，并额外写 `output/failure-diagnosis.md`，至少包含 `status`、`stage`、`error_code`、`message`、`attempts` 和 `resume_from`。

## 工作流

### 1. 规划

提取一个短而准确的封面标题，自动选择风格并写 `output/cover-plan.md`。规划应具体说明：

- 前景、中景、后景及遮挡关系
- 人物或主物体的位置、姿势、表情、动作和相对大小
- 标题分行、字号层级、颜色和安全区
- 参考素材各自承担的视觉角色
- 与视频内容直接相关的具象隐喻

所有关键元素距画面四边保留约 10% 安全距离。标题必须逐字明确引用，避免冗长副标题、水印、二维码、联系方式和伪文字。

### 2. 生成

将所选模板中的 `$VIDEO_ASPECT_RATIO`、标题、构图和素材角色填实，先写入 `output/cover-prompt.md`，再调用 Anban MCP：

```text
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<完整封面 prompt，首行明确 $VIDEO_ASPECT_RATIO>,
  image_type="cover",
  output_path="output/cover.png",
  aspect_ratio=$VIDEO_ASPECT_RATIO,
  ref_image_paths=<按人像优先规则排列的任务相对路径；无参考图时省略>
)
```

`generate_image` 是封面生成的唯一接口。不得只交付提示词，不得让用户或上游 Agent 去其他模型手工生图。

### 3. 审核

每次生成后直接审核任务文件：

```text
analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path="output/cover.png",
  prompt=<检查身份、主题、构图、标题、安全区和 $VIDEO_ASPECT_RATIO 的审核要求>
)
```

将结论写入 `output/cover-quality.json`。至少检查：

- 实际画布比例严格等于 `$VIDEO_ASPECT_RATIO`
- 使用人像时，身份、五官、发型和年龄观感与系统参考一致
- 主体和标题与视频内容一致，缩略图尺寸下层级清楚
- 标题无错字、漏字、伪文字或不可读笔画
- 人脸、标题和关键物体不越出安全区，不被平台 UI 高风险区域遮挡
- 无水印、logo、二维码、联系方式和无关装饰

比例错误、身份明显不一致、主题偏离、标题不可读或关键元素越界均为硬失败。

### 4. 有限重试

生成尝试总数最多 3 次。审核不通过时，根据可见问题收紧 prompt，将修改和审核依据追加到 `output/cover-prompt.md`，然后再次对同一 `output/cover.png` 调用 `generate_image`。传输或 MCP 运行时错误也计入尝试次数。

通过后，`output/cover-quality.json` 写入 `overall_pass: true`。三次仍未通过则写失败质量结果和 `output/failure-diagnosis.md`，停止当前执行；不得询问用户，不得把未通过封面标记为成功。

## 完成条件

1. `output/cover.png` 已由 MCP 生成并登记到当前任务执行。
2. `output/cover-plan.md` 和 `output/cover-prompt.md` 能复原最终决策。
3. `output/cover-quality.json` 记录实际审核结果且 `overall_pass` 为 `true`。
4. 封面使用的比例与 `$VIDEO_ASPECT_RATIO` 完全一致。

向 Montage Agent 返回结构化摘要即可，不要向最终用户交付提示词。
