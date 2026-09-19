### Phase 0 — 初始化

托管运行时提供任务私有工作区和预先创建的 `output/`。最终与恢复关键产物只写入本文列出的 `output/<filename>` 路径；不创建、发现、移动或重命名 `output/`。

#### 步骤 1：获取项目

- `echo $ANBAN_DEFAULT_PROJECT` → `$PROJECT_ID`
- 如果为空，调用 `list_projects` 获取项目列表；只有一个可用项目时自动使用，多个项目且无法从任务上下文判断时停止并提示配置 `ANBAN_DEFAULT_PROJECT`
- 从结构化运行时上下文读取 `$TASK_ID`
- 调用 `get_project_profile(project_id=$PROJECT_ID, task_id=$TASK_ID)`，按「任务图像参数合同」冻结 `$EFFECTIVE_ASPECT_RATIO`；用户明确比例不支持时在生成前停止

#### 步骤 2：收集用户输入

需要用户提供以下信息（缺失时停止并询问，不要凭空发挥）：

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| 参考封面 | ✅ | — | 优先使用任务上传图；也可提供公共 HTTPS URL |
| 新封面标题 | ✅ | — | 用户的新标题文案 |
| 账号领域 | ✅ | — | 知识干货/娱乐/美妆/科技/教育/...，决定视觉调性 |
| 画面比例 | ❌ | 智能适配 | 用户明确值优先，否则从当前能力支持范围选择 |
| 是否有人像 | ❌ | 自动判断 | 若参考封面有人像，新封面也建议保留人像位置逻辑 |
| 参考深度 | ❌ | `light` | `light`（只学色彩和层级）或 `deep`（参考构图和主体位置）|

写入 `output/input-manifest.md`：

```markdown
# Input Manifest

## User Inputs

- reference_cover: .anban-creator/input-attachments/attachment_01_ref.png
- new_title: 3 步学会爆款标题
- account_domain: 知识干货
- aspect_ratio: $EFFECTIVE_ASPECT_RATIO
- has_person: true
- reference_depth: light

## Runtime Context

- $PROJECT_ID: <项目 ID>
- output_root: output/
- $TASK_ID: <任务 ID>
```

---
