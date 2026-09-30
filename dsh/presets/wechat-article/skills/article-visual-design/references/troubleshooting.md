## 技术规范

**微信图片限制**：
- 最大尺寸：10MB（超出自动压缩）
- 最大宽度：1920px（保持比例压缩）
- 支持格式：JPG、PNG、GIF、WebP

**公众号常用比例**：
- 封面图（公众号封面）：使用任务有效比例；智能适配时从能力允许比例中优先选择宽横图，并保护中心 1:1 分享卡安全区
- 正文配图（section_opener）：显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`
- 章节内细节图（inline_detail）：显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`
- Hero slot：full-bleed，比例为 `$EFFECTIVE_ASPECT_RATIO`

---

## 常见失败与修复

| 问题 | 原因 | 修复 |
|------|------|------|
| 内容审核持续失败 | prompt 过于抽象 | 锐化 visual_brief，明确每个 required_entity 的材质、颜色、方位 |
| 配图与章节无关 | required_entities 与章节原文脱节 | 回到 Phase 3 重新提取，确保 must_match_excerpts 是章节原句 |
| 所有配图构图雷同 | 未在 rhythm-plan 中分配不同 composition_type | 重新规划 rhythm-plan，强制 3+ 种构图（清单模板除外） |
| 风格漂移 | 未根据人物参考状态选择风格传递方式 | 未启用人物参考且封面开启时可引用封面；封面关闭或人物参考启用时只使用文本风格块 |
| 封面与文章脱节 | 封面 prompt 缺少内容隐喻 | 在封面 prompt 中加入文章核心论点的视觉隐喻 |
| 节奏违反模板规则 | 未读模板 YAML 的 rhythm 字段 | 重新加载模板，按 rhythm 字段约束 slot 分配 |

---
