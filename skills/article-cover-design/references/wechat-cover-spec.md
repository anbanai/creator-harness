# 微信公众号文章双封面规格

来源：<https://developers.weixin.qq.com/community/develop/article/doc/00068ebcc4c65082572357c876b413>

本 Skill 按该官方社区文章采用固定双封面交付：

- 横版封面：`2.35:1`，平台文件为 `output/cover.png`。
- 方形封面：`1:1`，平台文件为 `output/cover-square.png`。
- 两个版本分别生成、审核和上传；不能把一张图裁切后当作另一版本，也不能让用户在任务中选择比例。

微信图文草稿的 `thumb_media_id` 是单值字段。平台自动创建草稿时使用横版素材作为主封面；方形素材单独上传并保留其 `media_id`，供平台后续展示或素材管理使用。不得把两个素材 ID 合并到 `thumb_media_id`，也不得增加未经微信 API 定义的字段。

该规则是封面展示与交付规则，不改变正文配图、Seednote 或其他平台的图片比例合同。
