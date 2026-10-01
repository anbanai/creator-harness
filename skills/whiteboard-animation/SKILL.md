---
name: whiteboard-animation
description: Use when a managed Anban whiteboard-animation task turns an uploaded SRT subtitle file into scene illustrations, timed annotations, and a rendered whiteboard video.
---

# Whiteboard Animation

本 Skill 将 SRT 字幕转换为 16:9 暖纸色白板手绘动画。上游脚本固定随托管运行时安装；本 Skill 负责自动编排和质量验收，不提供交互式预览编辑流程。

## 输入

- 托管上下文中的 `$TASK_ID`、`$PROJECT_ID` 和项目 Profile。
- 一个文件名以 `.srt` 结尾的任务附件，路径由 `.anban-creator/input-attachments/index.json` 提供。
- 可选的风格参考图和任务创作说明。
- 上游源码位于 `/opt/whiteboard-animation`，隔离 Python 环境位于 `/opt/whiteboard-animation-venv`。

缺少或无法解析 SRT 时写失败产物并停止。不得从日志或项目目录推断字幕文件，也不得等待人工确认。

## 执行

1. 读取附件索引，定位唯一 SRT 和可选风格参考图。使用 `scripts/parse_srt.py` 校验字幕并按 25–35 秒分幕，保留原始时间戳及字幕文本。
2. 生成 `output/storyboard.json`，每幕对应一个叙事核心、字幕区间、画面主体和时长。以 storyboard 为唯一场景清单。
3. 对每幕使用 Anban MCP `generate_image` 生成 16:9 暖米黄纸张底的统一手绘线稿。可选参考图只约束风格，不复用图中身份或内容。每张图通过 `analyze_image` 核对主体、风格、比例和无文字要求；最多修订一次，仍不合格则失败。
4. 实际查看每张线稿，再按字幕事件语义创建同名 `scene-NN.annotation.json`。坐标使用源图像素整数；区域在画布内；sequence 连续；时序不重叠；遮罩保护后续区域与重叠对象。
5. 使用 `scripts/render_annotation_preview.py` 生成并检查分区预览。使用 `scripts/render_stream_whiteboard.py` 为每幕渲染 MP4，参数采用 `--ink-path grid --color-fill contour-wipe`。抽查开场、作画中段和收尾，确认未开始区域不可见、末帧完整且停留至少 0.5 秒。
6. 使用 `scripts/merge_scenes.py` 按 storyboard 顺序合并各幕。输出最终视频为 `output/final.mp4`，场景 PNG、annotation JSON、单幕视频和分区预览均保存在 `output/scenes/`。
7. 写 `output/quality-report.json` 与 `output/delivery-manifest.json`，核对所有文件存在、非空、场景配对完整、顺序一致且 manifest 路径准确。失败状态清除只可发生在全部验收通过之后。

## 画面与标注规则

- 画布比例为 16:9。暖米黄底、深灰线稿，红/橙/蓝只作少量点缀；不出现文字、标签、摄影感、3D 或复杂背景。
- 每幕只表达一个核心意思；场景按叙事铺垫、主体、变化、结果排序。
- 每个 `region` 与 `protectedRegions` 使用原图坐标并完整落在画布范围；禁止估算百分比坐标。
- 同一幕的区域依次绘制，不得时间重叠；每幕结束至少保留 500ms 完整画面。

## 失败与恢复

所有终止路径写 `output/failure-state.json` 和 `output/failure-diagnosis.md`，记录稳定的 `stage`、`error_code`、脱敏 `message` 和 `resume_from`。保留可复用分镜、线稿和标注；恢复时按失败阶段续做，不重复已通过的图像生成或渲染。缺少 MCP 能力、字幕损坏、场景图生成失败、标注无效、渲染器退出非零或必需产物缺失均不得报告成功。

## 输出合同

- `output/storyboard.json`：版本化场景清单、字幕时间范围、画面意图及 16:9 画布声明。
- `output/scenes/scene-NN.png` 与 `scene-NN.annotation.json`：每幕成对场景图与渲染标注。
- `output/scenes/scene-NN-whiteboard.mp4` 与 `scene-NN-preview.png`：逐幕成片和区域检查图。
- `output/final.mp4`、`output/quality-report.json`、`output/delivery-manifest.json`：最终成片、质量证据和交付索引。
- 失败时 `output/failure-state.json`、`output/failure-diagnosis.md`；完成时写一次 `submit_agent_feedback`，其结果不替代交付验收。
