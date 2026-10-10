# 六维使用链路

| 维度 | 使用位置 |
| --- | --- |
| identity | 选题发现与项目定位 |
| style | 写作、视觉与语气约束 |
| audience | 受众匹配、表达深度与选题判断 |
| platforms | 平台格式、发布与适配规则 |
| preferences | 所有阶段的硬性红线 |
| memory | 可复用经验与归因沉淀 |

一份项目画像可以服务公众号文章、公众号贴图、种草笔记、视频生成、视频复刻和白板视频。系统应用与用户确认是不同的来源状态；两者都可作为当前创作上下文，但 `[推断待确认]` 不等于已核实事实。

制作层读取 `style`、`audience` 和 `memory` 以形成内容；`identity` 服务定位与选题；`platforms` 的发布字段仅在格式与交付适配时使用。`preferences` 在所有阶段都是硬约束。诊断所需维度缺失时提示补充，不生成没有证据的结论。

以上语义参考 Easel 的自研 `skill-profile-builder`、`skill-profile-manager` 与 `profiles/_template/` 文档结构。Easel 的参考项目许可证仍待核实；本适配只复用流程、字段语义和文档结构，不复制第三方代码或素材。Anban 不读取 Easel、OpenClaw 运行时目录或全局 `MEMORY.md`；正式画像、版本与恢复均由 Server 持久化。
