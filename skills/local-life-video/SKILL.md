---
name: local-life-video
description: Use when a managed 素材混剪 task needs local-life scene selection, factual merchant copy, and shot ordering.
---

# 本地生活视频策略

根据 `mix_type` 读取对应场景：restaurant、retail、personal-service、leisure、event、general-store。类型只改变文案策略和镜头组织，不改变视频执行器。

读取 `local-life-input.json`，并在 JSON 产物中声明 `schema_version`、`status`、`source`、`data_at`、`missing` 和 `evidence_paths`；失败时写 `output/failure-state.json`，包含 `resume_from`。

只使用任务输入和用户素材可证明的事实。素材不足时降低文案承诺并在质量报告中说明；不得补写优惠、价格、评价、医疗功效或未展示的服务。

为所有变体生成一份共用脚本。脚本应按场景推荐的顺序组织门店、环境、商品或服务和到店理由，避免声称每条视频都包含某个镜头。
