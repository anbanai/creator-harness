# 独立验证

验证来源要回答不同问题，并记录 `method`、`source`、`revision_id`、`coverage`、`result`、`missing`、`limitations` 和 `evidence_paths`。每项结果使用 `passed`、`failed`、`not_run` 或 `unavailable`；计划不等于执行结果，Agent 自我复核不等于外部独立审查。

1. 技术：ffprobe、FFmpeg 解码/静音/响度/冻结帧/音画同步、timeline lint、视频生产 QC、字幕逐条检查、手机尺寸与安全区抽查。
2. 语义：独立转录与最终音轨比对，重点检查否定、条件、数字、因果、限定、Hook 兑现和平台版本语义等价。
3. 事实/专业：关键主张绑定来源；高风险或专业内容预留领域专家盲审。专家只验证事实和解释，不代替留存数据。专家未实际参与时记录 `not_run`，不能由模型自评填充。
4. 观众：小样本开场停留、核心观点复述、清晰度、视觉负担、误解和收藏/转发意愿测试。没有真实参与者与记录时记为 `not_run`。
5. 平台：使用可追溯的平台规则、安全区和交付格式证据；缺失时标记 unavailable。
6. 复现：原始素材、计划、EDL、资产、母版、变体和渲染产物使用 SHA-256 与 revision_id 绑定；下游证据若与最终 revision 不符，必须重跑受影响验证。只有当前 delivery-manifest 合同能表达并且实际存在的交付文件才登记为已渲染变体。
7. 发布后：只接受 Server 持久化的冻结 analytics revision，记录样本、成熟度、版本差异和因果限制。

“文件存在”“命令成功”“Agent 日志无错误”都不是独立正确性证明。
