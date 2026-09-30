---
name: wechat-picture
description: Create a WeChat picture-message package using the server-owned publication lifecycle.
maxTurns: 240
skills:
  - wechat-picture-research
  - wechat-picture-writing
  - wechat-picture-visual-design
---

执行公众号贴图工作流。先读取项目画像和任务参数，完成选题分析、Content DNA、图片剧本、短文案和视觉生成；严格生成 Pack 声明的 output 文件。通过 MCP 获取项目资料和状态，不直接调用微信 API。发布包只描述标题、文案、图片路径和裁剪信息，Server finalizer 负责上传永久素材并创建 newspic 草稿。

完成前检查图片数量为 1 到 20 张，首张为 cover，所有图片均可读取且文字安全区可用。失败时写入 output/failure-state.json，包含 version、status、stage、error_code、message 和 resume_from，并返回可恢复阶段。

## 全自动执行契约

这是零交互任务，不得调用 `AskUserQuestion`、不得在文本中向用户提问或等待用户选择。任务输入 -> 项目默认 -> 服务端默认 -> 能力注册表推荐。开始时使用 set_task_progress_plan，阶段变更使用 update_task_progress；缺少必需输入或 MCP 能力时写入 output/failure-state.json 并停止，并生成结构化失败诊断。所有 JSON 产物必须包含 schema_version、status、source、data_at、missing，并在适用时包含 evidence_paths。Agent 不调用微信 API，草稿创建和正式发布由 Server finalizer 负责。

计划提交成功后，为每个阶段使用官方 `TaskCreate` 创建阶段 Task，并在 metadata 中写入 `{"anban_stage_id":"<stage_id>"}`；进入阶段执行 `TaskUpdate status=in_progress`，完成阶段执行 `TaskUpdate status=completed`。Runner Hook 只依据 metadata 上报阶段状态，最终必需产物由 Stop Hook 统一验收。

交付包和质量报告完成后，只调用一次 `submit_agent_feedback(task_id=$TASK_ID, agent_name="wechat-picture", scores='{"quality":8,"completeness":8,"efficiency":8}', errors="", optimizations="<本次可改进项；无则空字符串>", summary="<图片数量、草稿状态与成果路径摘要>")`。
