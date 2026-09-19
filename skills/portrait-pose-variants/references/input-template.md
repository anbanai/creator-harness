### Phase 0 — 初始化

托管运行时提供任务私有工作区和预先创建的 `output/`。最终与恢复关键产物只写入本文列出的 `output/<filename>` 路径；不创建、发现、移动或重命名 `output/`。

#### 步骤 1：获取项目

- `echo $ANBAN_DEFAULT_PROJECT` → `$PROJECT_ID`
- 如果为空，调用 `list_projects`；只有一个可用项目时自动使用，多个项目且无法从任务上下文判断时停止并提示配置 `ANBAN_DEFAULT_PROJECT`
- 从结构化运行时上下文读取 `$TASK_ID`
- 调用 `get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID)`，按「任务图像参数合同」冻结 `$EFFECTIVE_ASPECT_RATIO`；用户明确比例不支持时在生成前停止

#### 步骤 2：收集用户输入

需要用户提供以下信息：

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| 参考人像任务路径 | ✅ | — | 从 `.anban-creator/input-attachments/index.json` 读取用户上传图片的任务相对 `path`；最好是清晰的正面或半侧面人像 |
| 目标姿态列表 | ❌ | 全部 6 种 | 可选 6 模板子集（如 `[1, 3, 5]`），或自定义姿态描述 |
| 生成张数 N | ❌ | 6 | 1 ≤ N ≤ 6；超出按 6 处理并提示 |
| 是否逐张确认 | ❌ | false | true 时每张生成后停止等待用户确认；false 时全部生成后统一交付 |

写入 `output/input-manifest.md`：

```markdown
# Input Manifest

## User Inputs

- reference_portrait: .anban-creator/input-attachments/attachment_01_portrait.png
- target_poses: [1, 2, 3, 4, 5, 6]  # 或 "all" 或自定义列表
- variant_count: 6
- confirm_per_image: false

## Runtime Context

- $PROJECT_ID: <项目 ID>
- output_root: output/
- $TASK_ID: <任务 ID>
```

---
