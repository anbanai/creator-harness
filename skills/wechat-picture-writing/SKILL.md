---
name: wechat-picture-writing
description: Use when writing titles, captions, labels, and concise copy for WeChat picture messages.
---

# 微信公众号贴图文案

根据 Content DNA 生成标题、图片内信息、图下说明、摘要和标签。文案应能脱离图片独立理解，避免夸大承诺和外部导流。将结果写入 `output/content-script.md` 与 `output/content.md`，并在 `output/publish-package.json` 的 `content` 字段提供纯文本 caption。

## Server finalizer 交付包合同

`output/publish-package.json` 是交给 Server finalizer 的唯一贴图草稿输入。它必须是一个 UTF-8、单个 JSON 对象，使用下面的字段名和路径；不要把字段改成同义词：

```json
{
  "schema_version": "1.0",
  "status": "ready",
  "source": "wechat-picture-agent",
  "data_at": "<RFC3339 timestamp>",
  "missing": [],
  "title": "公众号标题",
  "digest": "可选摘要",
  "content": "纯文本图下注释（caption），不得写 HTML",
  "cover_path": "output/cover.png",
  "image_paths": ["output/image_01.png", "output/image_02.png"],
  "readiness": {"status": "ready"}
}
```

`status` 和 `readiness.status` 只能为 `ready` 或 `blocked`，且必须保持一致；只有两者均为 `ready` 且 `missing` 为空时才能进入 Server finalizer。质量或合规未通过时将两个状态都设为 `blocked` 并保留失败诊断，不要伪造 ready。`content` 是 Server 发送给公众号的 caption，不能使用 `caption`、`text` 或 `html` 代替。`cover_path` 单独指向封面；`image_paths` 只按顺序列出其余内容图，不要把封面重复放入数组。所有路径必须是任务相对路径，不能使用绝对路径、通配符或兼容占位文件；封面加内容图总数为 1 到 20 张。
