---
name: video-edit
description: Use for fully automatic Anban video editing tasks that turn uploaded video, audio, or image assets and a brief into a rendered video, edit decision list, strategy, and quality evidence with browser-use/video-use.
---

# 全自动视频剪辑

## 适用范围与边界

本 Skill 只负责一次任务内的素材分析、剪辑决策、转写（按需）、渲染和文件化质量证据。它使用运行时提供的 browser-use/video-use 固定版本，不调用 OpenMontage，不创建持久服务，也不执行发布。

这是托管的零交互流程。不得调用 `AskUserQuestion`，不得等待用户确认剪辑策略。缺少硬输入时写失败产物并停止；可选偏好按任务输入、项目默认、服务端默认解析，并记录最终选择。

## 输入

- 读取 `video-edit-input.json` 和 `video-edit-policy.json`，不要接受任意本地路径或外部 URL。
- 读取 `get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID, scope="video-edit")` 返回的冻结 brief、素材索引、项目默认值、运行限制和脱敏环境状态。
- 输入素材位于标准 `/workspace` 任务目录，由 Server 预先物化；从每项素材的 `workspace_path` 读取，不要从目录名推断任务身份。
- `subtitle_mode` 默认 `off`。仅当值为 `required` 且素材中有人声时，才调用 ElevenLabs Scribe 生成词级转写和字幕；字幕关闭时不得调用付费转写。只使用 Server 注入的执行环境变量。

## 执行流程

1. 从结构化上下文获取 `TASK_ID`、`PROJECT_ID`，建立 3-6 个阶段的进度计划。
2. 校验 brief、素材类型和文件可读性；按冻结偏好选择 `effective`、`balanced` 或 `quality` 档位。
3. 检查 `/opt/video-use/.anban-source-revision` 与固定 commit 相同。执行策略以本 Skill 为准，不执行上游 `SKILL.md` 的提问/审批流程。使用上游 `helpers/transcribe.py`、`helpers/transcribe_batch.py`、`helpers/pack_transcripts.py`、`helpers/timeline_view.py`、`helpers/grade.py` 和 `helpers/render.py`；上游源文件保持原样。需要为图片或无视频轨道的素材准备输入时，只在任务工作区用 `ffmpeg` 生成带视频/音频轨道的临时源，后续切点和最终渲染仍交由上游 helper。
4. 仅当 `subtitle_mode=required` 且素材含可转写人声时调用 Scribe；关闭字幕时不得调用付费转写。若任务要求字幕但没有可转写的人声，写可恢复失败状态，不伪造字幕。
5. 自动形成 3-6 阶段编辑策略并写 `output/edit-strategy.md`，据此生成上游 EDL。不得等待审批；根据质量档位运行上游渲染，自检切点、声音和画面，必要时最多修订 3 次。
6. `subtitle_mode=off` 时以 `--no-subtitles` 渲染；`required` 时由上游 `--build-subtitles` 生成字幕并烧录到成片，再将 SRT 作为 `output/subtitles.srt` 交付。
7. 写入 EDL、质量证据、内容标签和交付清单；验证 `ffprobe` 可读取成片、存在视频流，EDL 时段有效，且所有必需文件非空。
8. 恢复执行时读取失败状态和已有文件，复用上游缓存转写并从 `resume_from` 继续。成功后清除旧失败状态；密钥不得进入命令参数、文件或日志。

## 输出合同

必需文件：`output/final.mp4`、`output/edit-decision-list.json`、`output/edit-strategy.md`、`output/delivery-manifest.json`、`output/quality-evidence.json` 和 `output/content-tags.json`。字幕按需为 `output/subtitles.srt`。

JSON 文件包含 `schema_version`、有限 `status`、`source`、`data_at`、`missing` 和适用的 `evidence_paths`。交付清单只记录相对路径、角色、大小、哈希和验证状态，不写入密钥。质量证据记录 ffprobe、音视频流、时长、字幕状态和降级原因。

失败必须同时写 `output/failure-state.json` 与可读的 `output/failure-diagnosis.md`，包含 `version`、`status= recoverable_failure`、`stage`、`error_code`、脱敏 `message` 和 `resume_from`。

## 质量检查

- `final.mp4` 可被 `ffprobe` 读取，至少包含可解码的视频流；音频缺失必须在证据中明确记录。
- EDL 的时间段不重叠且位于输入媒体范围内；策略说明与 EDL、最终清单一致。
- 默认字幕关闭时不得生成字幕文件；请求字幕时必须同时记录转写证据和语言/时轴信息。
- 不把 API key、Bearer token 或完整本地绝对路径写入任何产物、日志或反馈。
