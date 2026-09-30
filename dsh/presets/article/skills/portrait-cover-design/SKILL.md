---
name: portrait-cover-design
description: Use when an Article, Seednote, video generation, or video replication workflow explicitly selects a portrait cover with a visible headline and a frozen portrait reference.
---

# Portrait Cover Design

## 目录

- [执行合同](#执行合同)
- [图像参数合同](#图像参数合同)
- [自动决策](#自动决策)
- [产物](#产物)
- [工作流](#工作流)
- [完成条件](#完成条件)

为公众号、种草笔记、视频生成与视频复刻生成“指定人物＋标题”封面。由对应业务入口在用户启用人物封面时调用；平台衔接只读取 [references/platform-integration.md](references/platform-integration.md) 中对应的一行。

## 执行合同

调用者一次提供 `$PROJECT_ID`、`$TASK_ID`、最终内容与标题依据、精确封面标题、有效 `$COVER_ASPECT_RATIO`、`$PORTRAIT_REFERENCE_PATH`、账号视觉偏好、平台安全区及相关任务素材。不询问用户，不重新选择项目、比例或人物。

人物与标题都是必需主体；人物缺失、损坏、不支持参考图或比例不支持时返回失败，不静默切换到无人物/无字封面。普通封面由各平台入口负责。

## 图像参数合同

调用方先按 `resolved_profile.image_ratio` 和 `resolved_profile.allowed_image_ratios` 完成用户明确比例校验或智能适配，再传入有效比例。每次生成显式传 `aspect_ratio`，取值为 `$COVER_ASPECT_RATIO`；比例原样贯穿规划、prompt、生成和审核。风格模板保留原有 `$VIDEO_ASPECT_RATIO` 占位，使用时代入 `$COVER_ASPECT_RATIO`，它在此表示封面比例，不限定视频场景。

## 人像与参考素材

- 使用调用者提供的冻结 `$PORTRAIT_REFERENCE_PATH`，作为 `ref_image_paths` 第一项；其后才是与概念直接相关的任务实体素材。逐张声明职责，不从产品图或项目风格图推断人物身份。
- 项目风格图只分析为文本，不传入生成；不读取 Skill 目录的人像或下载未知人物替代。
- 所选模板必须保留指定人物，不采用省略人物的分支；人物及文字服从调用者提供的平台安全区。
- 人物参考及含该人物的封面只用于本次封面，不传入正文/内容图，也不改变视频内的人物替换设置。

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

先按平台安全区和身份可核验要求筛选模板；需要完整人脸时不选背影或仅手部模板，不修改原模板来规避验收。选定后只读取对应的 `references/style-XX-*.md`；需要校准具体程度时再读 `references/examples.md`。缺失的非必要视觉偏好由内容语义和所选模板确定。

## 产物

每次执行都维护以下文件：

- `output/cover-plan.md`：输入摘要、比例来源、是否使用人像、风格选择及理由、标题排版和参考图顺序。
- `output/cover-prompt.md`：实际传给每次 `generate_image` 的完整 prompt 和对应审核反馈。提示词仅是内部审计证据，不是交付物。
- `output/cover-quality.json`：机器可读的最终审核结果、尝试次数、各评分项和通过状态。
- `output/cover.png`：最终封面，必须生成并通过审核。

终止失败时保留已经生成的文件，并额外写 `output/failure-diagnosis.md`，至少包含 `status`、`stage`、`error_code`、`message`、`attempts` 和 `resume_from`。

## 工作流

### 1. 规划

使用调用者锁定的精确封面标题，自动选择风格并写 `output/cover-plan.md`。规划应具体说明：

- 前景、中景、后景及遮挡关系
- 人物或主物体的位置、姿势、表情、动作和相对大小
- 标题分行、字号层级、颜色和安全区
- 参考素材各自承担的视觉角色
- 与本次内容直接相关的具象隐喻

所有关键元素距画面四边保留约 10% 安全距离。标题必须逐字明确引用，避免冗长副标题、水印、二维码、联系方式和伪文字。

### 2. 生成

将所选模板的比例占位替换为 `$COVER_ASPECT_RATIO`，填实标题、构图和素材角色，先写入 `output/cover-prompt.md`，再调用 Anban MCP：

```text
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<完整封面 prompt，首行明确 $COVER_ASPECT_RATIO>,
  image_type="cover",
  output_path="output/cover.png",
  aspect_ratio=$COVER_ASPECT_RATIO,
  ref_image_paths=[$PORTRAIT_REFERENCE_PATH, <可选的相关任务实体路径>]
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
  prompt=<检查身份、主题、构图、标题、安全区和 $COVER_ASPECT_RATIO 的审核要求>
)
```

将结论写入 `output/cover-quality.json`。至少检查：

- 实际画布比例严格等于 `$COVER_ASPECT_RATIO`
- 身份、五官、发型和年龄观感与所选人物参考一致
- 主体和标题与本次内容一致，缩略图尺寸下层级清楚
- 指定人物和标题均可见；标题无错字、漏字、伪文字或不可读笔画
- 人脸、标题和关键物体不越出安全区，不被平台 UI 高风险区域遮挡
- 无水印、logo、二维码、联系方式和无关装饰

比例错误、人物或标题缺失、身份明显不一致、主题偏离、标题不可读或关键元素越界均为硬失败。文字失败不得改成无字封面。

### 4. 有限重试

生成尝试总数最多 3 次。审核不通过时，根据可见问题收紧 prompt，将修改和审核依据追加到 `output/cover-prompt.md`，然后再次对同一 `output/cover.png` 调用 `generate_image`。传输或 MCP 运行时错误也计入尝试次数。

通过后，`output/cover-quality.json` 写入 `overall_pass: true`。三次仍未通过则写失败质量结果和 `output/failure-diagnosis.md`，返回失败，由调用者按平台合同处理；不得把未通过封面标记为成功。

## 完成条件

1. `output/cover.png` 已由 MCP 生成并登记到当前任务执行。
2. `output/cover-plan.md` 和 `output/cover-prompt.md` 能复原最终决策。
3. `output/cover-quality.json` 记录实际审核结果且 `overall_pass` 为 `true`。
4. 封面使用的比例与 `$COVER_ASPECT_RATIO` 完全一致。

向调用者返回结构化摘要即可，不要向最终用户交付提示词。
