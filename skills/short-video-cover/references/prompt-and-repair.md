## Prompt 构建技巧

### 8 要素写法要点

| 要素 | 好的写法 | 差的写法 |
|------|---------|---------|
| 画面比例 | "use the effective ratio $EFFECTIVE_ASPECT_RATIO and matching orientation" | "竖图" |
| 标题排版 | "title '爆款标题' in 2 lines, line 1 small, line 2 oversized bold" | "有大标题" |
| 人物/主体 | "young woman in red hoodie, half-body, positioned center-left, looking at camera" | "有个女生" |
| 背景 | "deep navy gradient background with subtle geometric pattern, clean and uncluttered" | "深色背景" |
| 色彩 | "main color deep navy like midnight sky, accent color warm yellow like honey" | "蓝黄色调" |
| 字体气质 | "bold sans-serif Chinese title, high contrast, commercial poster vibe" | "黑体" |
| 主体元素 | "central focus on the oversized title text, woman as supporting element behind text" | "标题为主" |
| 禁止事项 | "no English text, no watermark, no logo, no border, no cluttered elements" | "干净" |

### 参考深度对 prompt 的影响

- `reference_depth=light`：prompt 不提"参考构图"，只描述新封面的目标视觉；ref_image_path 仍传入但仅作为风格参考
- `reference_depth=deep`：prompt 开头加 "Reference cover shows the visual logic to follow: title in [position], subject in [position], color scheme [main + accent]. Recreate this composition logic with the new title and subject."

### 反面约束的力量

AI 生图模型容易跑偏，**显式禁止比正向描述更有效**：

```
DO NOT include:
- English text or pinyin (Chinese only, with possible character rendering imperfections)
- Watermarks, logos, signatures
- Cluttered or busy elements competing with the main subject
- Multiple unrelated subjects
- Cartoon or anime style (must be photorealistic/commercial photography style)
```

---

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 标题文字渲染模糊/错字 | AI 模型对中文文字支持差 | 在 prompt 中明确"Chinese characters may have rendering imperfections, prioritize overall visual impact over text precision"；建议用户 PS 二次加工 |
| 构图完全偏离参考 | reference_depth=deep 但 prompt 未显式声明参考逻辑 | prompt 开头加"Reference cover shows the visual logic to follow: ..." |
| 人物位置错误 | 主体描述不够具体 | 明确位置："positioned center-left"、"right side of frame" |
| 颜色与参考差距大 | 色彩描述过于抽象 | 用实物类比："deep navy like midnight sky, NOT pure black" |
| 画面元素过多过乱 | 缺少反面约束 | prompt 末尾加"DO NOT include cluttered elements" |
| 太像参考图（构图照搬） | reference_depth=deep 但未替换语义元素 | 把参考的"装饰元素保留、语义元素替换"原则写进 prompt |
| 太不像参考图（视觉断裂） | reference_depth=light 但色彩和字体气质也未对齐 | 即使 light 模式，主色和字体气质也应参考；只重做构图 |
| 公共 URL 下载失败 | URL 非 HTTPS、重定向到私网或内容不是图片 | 写失败诊断；不得绕过 `download_image` 的网络与类型校验 |
| analyze_image 文件过大 | `file_path` 方式分析有 10MB 限制 | 调用 `compress_image(task_id=$TASK_ID, input_path=$REF_TASK_PATH, output_path="output/reference-cover-compressed.png")` 后分析返回路径 |
| output_path 权限错误 | 路径不属于任务工作区 | 使用任务相对路径 `output/...` |
| 长 prompt 504 Gateway Timeout | prompt 过长或约束过多 | Prompt 控制在 500 词以内，优先 8 要素和最关键反面约束 |
| ref_image_path 无法访问 | 路径未登记在当前任务 | 重新读取附件索引，或用完整参数调用 `download_image` 登记公共 HTTPS 图片 |

---
