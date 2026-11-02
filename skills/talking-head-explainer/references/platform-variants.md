# 平台变体

`semantic_master` 是唯一事实源。平台版本只保存包装和交付差异，不得改写事实、因果、条件、否定、数字或结论。

## 变体字段

每个平台记录 `platform`、`master_revision_id`、`revision_id`、`title_variant`、`cover_variant`、`opening_wrap`、`caption_safe_area`、`visual_safe_area`、`pace_adjustment`、`cta`、`delivery_format`、`rule_sources` 和 `warnings`。

默认平台为 `douyin`、`wechat_video_account`、`xiaohongshu`。Prompt 只选择一个或两个平台时，只生成所选版本。平台规则需要当前来源；不能核验时使用保守安全区并写 `platform_rules_unavailable`，不要把经验写成硬规则。

## 渲染与交付边界

`platform-variant-plan.json` 先登记共同母版哈希、所选平台、包装差异、各版本 revision 和语义等价检查。现有 Montage 合同只保证一个 `output/final.mp4`；除非当前运行时明示支持多次独立渲染并实际产出不同文件，否则将视频渲染标为 unavailable 或 not_run，不得复制同一文件并声称完成多平台导出。

仅按当前 `delivery-manifest.json` 合同登记真实存在的文件。若合同没有平台变体关系字段，在 `platform-variant-plan.json` 中保存关系与证据路径，不得向 Montage project 或 Adapter 增加未声明字段。包装变体只改标题、封面、开场包装或 CTA 时可复用语义母版；核心口播、事实、因果、限定或解释顺序改变必须创建新母版 revision。
