---
name: search-pixabay
version: 1.0.0
description: Use when searching Pixabay music, sound effects, photos, illustrations, vectors, videos, GIFs, or 3D models. 根据用户需求生成 Pixabay 搜索链接，支持 8 种素材类型。
---

# Pixabay 素材搜索

根据用户需求，分析素材类型，读取对应参考文档，生成可直接点击的 Pixabay 搜索链接。

## 素材类型索引

| 类型 | 参考文档 | 说明 |
|------|---------|------|
| 音乐 | [music.md](references/music.md) | 背景音乐、配乐、BGM |
| 音效 | [sound.md](references/sound.md) | 环境音、转场音、拟音、冲击音 |
| 图片 | [photo.md](references/photo.md) | 照片，支持真实拍摄和 AI 生成 |
| 插画 | [illustration.md](references/illustration.md) | 插画作品 |
| 矢量图 | [vector.md](references/vector.md) | SVG 矢量素材 |
| 视频 | [video.md](references/video.md) | 视频素材、实拍、动画 |
| GIF | [gif.md](references/gif.md) | 动图素材 |
| 3D模型 | [model3d.md](references/model3d.md) | 三维模型文件 |

## 工作流程

### 第一步：判断素材类型

- "音乐""配乐""BGM""背景音乐" → 音乐
- "音效""声音""声效""拟音""转场音""环境音""白噪音" → 音效
- "图片""照片""素材图""壁纸""头图" → 图片
- "插画""手绘""扁平""卡通图" → 插画
- "矢量图""svg""图标""icon" → 矢量图
- "视频""视频素材""实拍""动画视频" → 视频
- "动图""gif""表情包" → GIF
- "3d模型""三维模型""模型文件" → 3D模型

描述模糊时主动询问用途以确定类型。

### 第二步：读取对应文档

确定类型后读取 `references/` 下对应文档，获取 URL 构造规则和可用参数。

### 第三步：生成链接

1. 提炼英文关键词（1-3 个）
2. 选择合适的筛选参数
3. 按"由宽到窄"原则生成 2-3 个梯度链接

### 第四步：输出结果

按参考文档中的格式输出，包含需求分析、参数表格、梯度链接和使用建议。

## 核心原则

1. **由宽到窄**：每个回复提供 2-3 个链接，从最宽泛到最精准
2. **优先有结果**：宁可参数少、结果宽泛，也不要搜不到
3. **参数不超过 3 个**：复杂需求用关键词承载
4. **关键词用英文**：Pixabay 默认英文搜索效果最佳
5. **参数值用英文原文**：小写，多词用 `%20` 连接
6. **中文交流**：除非用户指定语言，始终用中文回复

## 注意事项

- 多种素材类型时分别生成各自的链接
- 需求模糊时先提出引导性问题
- URL 参数值严格遵循参考文档中的格式化规则
- 链接可用性高于参数精准度
