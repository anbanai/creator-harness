---
name: wechat-picture-writing
description: Use when writing titles, captions, labels, and concise copy for WeChat picture messages.
---

# 微信公众号贴图文案

根据 Content DNA 生成标题、图片内信息、图下说明、摘要和公开话题标签。文案应能脱离图片独立理解，适配公众号贴图编辑器的窄屏阅读，避免夸大承诺和外部导流。将结果写入 `output/content-script.md` 与 `output/content.md`，并在 `output/publish-package.json` 的 `content` 字段提供同一份纯文本 caption。

开始写作前必须读取 `get_project_profile` 返回的 `wechat_delivery_instructions`。Server 已经根据贴图任务的“创建草稿”选择和冻结交付能力给出中文结论；不要读取凭据或让 Agent 自己重算模式。

- 自动贴图：发布包提供标题、caption 和完整有序图片路径，由 Server finalizer 上传图片并创建官方贴图草稿；Agent 不直接调用微信发布能力。
- 手动贴图：仍然必须提供标题、caption 和完整有序图片路径。Server 会据此生成包含文字和全部图片的富文本 HTML，Studio 一次复制完整图文；不能只交付 caption，也不能要求用户逐张复制或重新拼图。
- 任一必需图片缺失、不可公开访问或未进入最终交付内容时，发布包必须保持 `blocked`，不得报告 ready。

公众号贴图的排版、字数计数、标签分层和三道复核闸门见 [references/format-and-tags.md](references/format-and-tags.md)，写作与交付前必须读取并执行。

选题角度和正文结构见 [references/engagement-framework.md](references/engagement-framework.md)。当任务需要从图片或主题选择写法时读取它，将四类结构作为启发式映射到一个主任务；不要把经验文章中的流量结论当成保证，也不要为了套公式制造数字、焦虑或空泛互动。

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

`status` 和 `readiness.status` 只能为 `ready` 或 `blocked`，且必须保持一致；只有两者均为 `ready` 且 `missing` 为空时才能进入 Server finalizer。质量或合规未通过时将两个状态都设为 `blocked` 并保留失败诊断，不要伪造 ready。`content` 是 Server 发送给公众号的 caption，不能使用 `caption`、`text` 或 `html` 代替。`content` 必须已经过标题、正文和标签的最终计数复核；超出任一平台硬上限时不得交付。`cover_path` 单独指向封面；`image_paths` 只按顺序列出其余内容图，不要把封面重复放入数组。所有路径必须是任务相对路径，不能使用绝对路径、通配符或兼容占位文件；封面加内容图总数为 1 到 20 张。
