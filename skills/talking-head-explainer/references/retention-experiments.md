# 留存实验

留存实验只检验可观察结果，不承诺平台推荐。每次优先只改一个变量：Hook、开场包装、解释密度、字幕密度、结尾 CTA 或视觉表达。保留相同主题、口播语义、时长范围、发布窗口和受众定义，记录基线与版本差异。

每个实验写明 `hypothesis`、`variable`、`control`、`candidate`、`sample_definition`、`success_metrics`、`stop_conditions`、`maturity`、`unknowns` 和 `causal_limits`。指标可包括前三秒停留、分段流失、平均观看时长、完播、重复观看、收藏、分享和理解度，但样本量与数据成熟度必须同时记录。

没有真实发布数据或实际观众测试时，只写实验计划；禁止生成 `retention-results.json`，也禁止使用模型推测填充结果。发布后数据必须来自 Server 冻结 analytics revision。
