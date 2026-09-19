## 通用负面提示词

每张变体的 prompt 末尾**必须**包含以下反面约束（来自参考文档原文，不要删减）：

```
DO NOT change the person's identity. DO NOT swap face. DO NOT turn into a different person.
DO NOT change age, gender, or ethnic features. DO NOT change face shape or facial proportions.

DO NOT include multiple people. DO NOT include extra fingers or deformed hands.
DO NOT distort facial features. DO NOT make expression stiff. DO NOT use low resolution.
DO NOT blur. DO NOT use plastic skin or over-smoothing. DO NOT make cartoon or anime style.
DO NOT over-distort to the point of unreality.

DO NOT include text, watermark, logo, border, or cluttered background.
DO NOT obscure the face. DO NOT use heavy face shadows.
```

---

## Prompt 构建技巧

### 身份锁段落写法

从 `identity-lock.md` 抄写时，**转换成英文 prompt 友好的格式**：

```
Identity lock (MUST remain identical across all variants):
- Face shape: <oval with defined jawline, NOT round>
- Facial proportions: <three-tenths proportions, balanced features>
- Eyes: <almond-shaped, double eyelids, medium eye opening>
- Nose: <medium-height bridge, rounded tip>
- Mouth: <medium-thick lips, slight upward corners>
- Eyebrows: <arched, medium thickness, well-defined>
- Hair: <shoulder-length wavy curls with side-swept bangs, NOT straight>
- Hair color: <dark chocolate brown, NOT black or light brown>
- Skin: <fair with subtle warmth, semi-matte finish>
- Age vibe: <mid-20s, youthful but professional>
- Aura: <confident, slightly playful, approachable>
- Signature demeanor: <eyes carry a hint of smile even when mouth is neutral>

CONSTRAINT: The variant MUST be recognizably the SAME person as the reference. Identity dimensions 1-12 are non-negotiable. Only expression, gesture, pose, clothing details, background, and lighting may change.
```

### 姿态段落写法（参考 pose-templates.md）

每个姿态段落包含 4 部分：

1. **核心动作**（一句话描述姿态）
2. **表情细节**（眉、眼、嘴的具体状态）
3. **手势细节**（手的位置、形状、与身体的关系）
4. **情绪基调**（这个姿态传达什么情绪，适合什么封面类型）

详见 [references/pose-templates.md](pose-templates.md) 的 6 个完整模板。

### 跨变体一致性技巧

每张变体的 prompt 中**显式声明**这是同一人物的不同姿态：

```
This is variant #3 of 6 variants of the SAME person shown in the reference image.
All variants share the same identity (see identity lock above).
Only this variant's expression, gesture, and pose change.
Background and clothing may vary slightly but the person MUST be identical.
```

这段声明帮助模型理解"我要画同一个人的不同照片"，而不是"画 6 个不同的人"。

---

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 身份漂移（脸型变化） | 模型对参考图身份锁定不严 | 加强 identity-lock 段落；增加反面约束"face shape MUST be [具体], NOT [常见错误]"；严重时标记 `needs_img2img` |
| 发色变化 | 模型对深浅色偏好不同 | 用实物类比"dark chocolate brown, NOT milk chocolate, NOT black"；加强反面约束 |
| 表情不够夸张 | 模型倾向中性表情 | 姿态段落用更具体的描述"eyes WIDE OPEN, eyebrows raised HIGH, mouth forming an O"；加强反面约束"DO NOT use neutral expression" |
| 手势畸形（多指、扭曲） | AI 生图模型对手部处理能力差 | 手势描述更具体"five fingers visible, palm facing camera, thumb tucked"；加强反面约束"DO NOT add extra fingers or distort joints"；重试 1 次仍失败标记 `needs_manual_edit` |
| 背景污染主体 | 模型无法分离前景/背景 | 加强背景简化"solid color background, NO patterns, NO textures"；加强反面约束"background must NOT compete with subject" |
| 肤色变化 | 模型对肤色一致性处理弱 | 身份锁中肤色维度加实物类比"fair skin with peach warmth, NOT pale white, NOT tanned" |
| 画风偏卡通 | 参考 prompt 中"商业摄影"描述不够强 | 加强风格描述"photorealistic commercial photography, hyper-detailed skin texture, NOT illustration, NOT cartoon" |
| 多张变体之间身份不一致 | 每张变体身份漂移方向不同 | 确保所有变体 ref_image_path 都指向同一原始人像；不要用变体作下一张参考 |
| 公共 URL 下载失败 | URL 非 HTTPS、重定向到私网或内容不是图片 | 写失败诊断；不得绕过 `download_image` 的网络与类型校验 |
| analyze_image 文件过大 | `file_path` 方式分析有 10MB 限制 | 调用带 `task_id` 与任务相对输入/输出路径的 `compress_image`；仍超限则停止 |
| output_path 权限错误 | 路径不属于任务工作区 | 使用任务相对路径 `output/...` |
| 长 prompt 504 Gateway Timeout | prompt 过长（12 维度身份锁 + 6 姿态模板容易超长） | Prompt 控制在 500 词以内；身份锁可压缩到 8-10 行核心维度；姿态段落保留核心动作和情绪 |
| ref_image_path 无法访问 | 路径未登记在当前任务或不属于当前 execution | 重新读取附件索引，或用完整参数调用 `download_image` 登记公共 HTTPS 图片 |

---
