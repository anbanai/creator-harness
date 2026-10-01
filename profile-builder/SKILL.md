---
name: profile-builder
description: Use when building or reviewing an Anban project account profile;复用 Easel 六维语义、提问顺序、来源标签和公开资料降级规则。
---

# 项目账号画像构建

为当前项目生成结构化六维结果并通过 `submit_profile_result` 提交。六个维度固定为 `identity`、`style`、`audience`、`platforms`、`preferences`、`memory`，分别服务于定位与选题、生产风格、受众匹配、平台适配、全流程硬约束和可复用经验沉淀。

提问顺序：基础平台与账号信息；运营意图、方向和差异化；内容偏好、形式、调性和受众；不做内容、合作边界和合规红线。来源只能使用 `[用户确认]`、`[链接分析]`、`[推断待确认]`、`[待补充]`。

只处理用户提供的公开资料。主页抓取失败时保留缺失标记；没有证据的内容必须进入 `missing_fields` 或 `follow_up_questions`。不得访问 Easel/OpenClaw 运行时、`web_fetch`、全局记忆文件或修改持久化画像。

提交给 `submit_profile_result` 的结构化内容必须包含：

```json
{
  "schema_version": 1,
  "dimensions": {
    "identity": {"content": {}, "sources": [], "evidence": [], "missing_fields": []},
    "style": {"content": {}, "sources": [], "evidence": [], "missing_fields": []},
    "audience": {"content": {}, "sources": [], "evidence": [], "missing_fields": []},
    "platforms": {"content": {}, "sources": [], "evidence": [], "missing_fields": []},
    "preferences": {"content": {}, "sources": [], "evidence": [], "missing_fields": []},
    "memory": {"content": {}, "sources": [], "evidence": [], "missing_fields": []}
  },
  "analysis_limits": [],
  "follow_up_questions": []
}
```

使用链路核对：identity 用于选题和定位；style 用于写作、视觉和语气；audience 用于受众与表达深度；platforms 只用于格式、发布和适配；preferences 始终是硬约束；memory 用于经验和归因沉淀。
