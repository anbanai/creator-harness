# Harness Agent/Skill 审计与精简重构 — 2026-09-19

已完成六个 Pack 的执行契约修正、内容归属调整、按需加载和生成物同步。原有业务产物路径与工具名保留，Article 的自动发布仍归 Server，Humanizer 上游提交未改。

## 测量结果

计数使用 JavaScript UTF-16 字符与文本行数，不等同于计费 token。启动量计算为 **Claude Agent 源全文 + frontmatter 实际预加载的 SKILL.md**；不将 Pack 的分发清单误算为预加载，也不将 Codex `enabled` 的可发现 Skill 当成全部加载。

| 流程 | 重构前 | 重构后 | 启动字符减少 | 回归上限 |
| --- | ---: | ---: | ---: | ---: |
| Article | 91,724 | 44,159 | 51.9% | 45,000 |
| Seednote | 74,498 | 36,757 | 50.7% | 38,000 |
| Ecommerce | 61,624 | 30,274 | 50.9% | 34,000 |

| 指标 | 重构前 | 重构后 |
| --- | ---: | ---: |
| Skill 数（含 Humanizer） | 27 | 27 |
| 自维护 SKILL.md 字符 | 171,879 | 140,541 |
| 自维护 SKILL.md 行数 | 4,638 | 3,639 |
| Claude Agent 源字符 | 79,577 | 64,898 |
| 自维护文档总字符（含按需 references） | 476,214 | 456,972 |
| 自维护文档总行数 | 15,365 | 14,809 |
| 重复段落组 | 15 | 11 |
| 多余重复字符 | 6,957 | 5,381 |

- 基线为 Harness 提交 `853e3ad8e4f01127ac8f6959a13a6ca832699b75`，改后为本次工作区。完整字段、各 Pack 分发/预加载列表和基线已存在的问题见 [metrics JSON](2026-09-19-harness-metrics.json)。
- 26 个自维护 Skill 主入口均不超过 280 行；Humanizer 不受本次压缩限制。总文档统计含自维护 Skills/references 和 Claude Agent 源，不重复计入 Codex、DSH、生成镜像、外部 submodule、审计报告或二进制资源。
- Humanizer 的 28,698 字符改为正文改写阶段读取，仍会产生阶段上下文成本；references 也有按需成本。因此启动量下降约一半，**不代表任务全程 token 减半**。自维护文档总字符仅减少约 4.0%，其余收益来自去重与延迟加载。
- 重复检测按至少 120 字符的规范化段落统计，排除标题、表格、references、宿主镜像和生成文件；保留的重复主要为各独立入口必需的执行/失败边界。上限为 6,000 多余字符。
- 删除 8 张无引用的示例 WebP，共 2,149,890 字节；未删除视频封面风格说明和许可证。

## 关键修正

| 范围 | 最终合同 |
| --- | --- |
| Article | 核心 Markdown/HTML 可生成时必写 `output/draft.json`；视觉、上传、营销/质量闸门失败写结构化 warning 与 blocked readiness。仅核心内容或必需能力失败终止。 |
| Seednote | `viral_analysis` 只交付 source-analysis 与 viral-template；生成工具失败停止图片阶段，单图质量失败继续其余页，最后仍有失败页则以 `image_quality_failed` 阻止成功交付。分析工具不可用仅记 warning。 |
| Ecommerce | 父 Skill 是用户入口，四个子 Skill 仅按领域阶段调用；缺产品图停止，只生成已选模块，核心详情场景不通过不得声明全流程成功。 |
| Moments | 运行时项目 ID 优先；默认、唯一匹配、稳定语义选择均无法安全解析时结构化失败，不向用户提问。 |
| Live-slicer | 放行本地 ffmpeg/ffprobe、必要辅助命令及预签名 curl PUT；不允许自写服务端 HTTP 客户端。上传失败保留音频和恢复点，跳过听悟创建；CapCut 不可用时只降级可选草稿。 |
| Montage | 两宿主统一比例冻结、checkpoint、decision log、工作目录、封面调用和最终验证。所有终止路径同时写 Markdown 诊断与运行时识别的 failure-state JSON；Runtime 统一上传登记，Agent 不等待不存在的文件登记 MCP。 |
| Codex | 零交互、阶段 metadata、恢复入口与最终反馈边界明确；生命周期使用对应宿主的工具合同。 |
| MCP | 示例和参数表显式携带项目/任务身份；图片生成显式传业务比例。`scope` 按工具和业务传入，不虚构其为 Server schema 的全局必填字段。 |
| CapCut | 模板 JSON 可解析；类型占位符用明确字符串，实例化时还原数值/对象类型。使用配置草稿根目录；删除先列出目标并取得明确确认。 |

Agent 保留编排、状态、产物验收和恢复；视觉方法、评分卡、详细 schema 与故障处理归对应 Skill/reference。已删除没有分支价值的通用案例提示，修复跨 Skill 与资源链接。未验证的平台算法/权重主张降为实验建议，并记录核验状态、适用范围和失效策略，未声称已在线验证平台规则。

## 生成与版本

- 唯一编辑源为 `packs/*/agent.*`，`agents/*`、DSH presets、两个 Catalog 由 `make agent-pack-generate` 同步，`make agent-pack-check` 检查无 drift。
- 六个 Pack 为 `2.0.1`；两宿主 manifest、marketplace、package 统一为 `4.2.1`，CHANGELOG 已更新。
- Pack `agent.skills` 是分发成员清单。Article 的独立交互发布 Skill 仍随 Pack 分发，但不进入托管 Agent 的预加载列表；未引入额外 schema 字段。
- Humanizer 保持提交 `9862685f575c65a8247f90369951df1b3416e3d6`，工作树干净。

## 自动检查与独立推演

[自动审计脚本](../../scripts/audit-workflows.mjs) 已接入 `pnpm run check`，支持 `--baseline` 和隔离测试目录 `--root`。覆盖入口长度、预加载预算、重复段落、Skill frontmatter、MCP 身份/比例参数、Markdown/资源引用、Agent 的插件路径依赖、模板 JSON、共享 Skill 的宿主生命周期越界、自治标识及 Seednote 条件产物合同。

[审计器的变异测试](../../scripts/audit-workflows.test.mjs) 验证正常计数、断链、缺任务 ID、非法模板、超预算、共享 Skill 调用宿主生命周期和不存在的 Agent Skill 依赖均按预期通过/失败。Go 合同测试覆盖发布/失败边界、延迟加载、依赖引用及 Pack 的 task-type 替代合同，生成校验覆盖 native/DSH/Catalog 漂移。

两个独立审阅 Agent 完成六条业务路径的静态 forward simulation：

| 流程 | 验证情景 |
| --- | --- |
| Article | 纯文本；图片或上传失败；HTML 成功但 readiness blocked。 |
| Seednote | 原创研究降级；复刻；viral_analysis；单图质量耗尽；生成工具失败。 |
| Ecommerce | 缺产品图；仅选详情页；非关键单图失败与核心图失败的区别；全部所选模块成功交付。 |
| Live-slicer | 本地切片；签名上传成功/失败；命令边界；CapCut 根目录不可用。 |
| Moments | 运行时项目与默认冲突；多项目无安全匹配时自动失败。 |
| Montage | 缺比例；pipeline 失败；封面生成；Runtime 最终登记；失败 schema 与 runner 一致。 |

13 个高重叠领域 Skill 的 should-trigger / should-not-trigger 与 with/without 对照见 [Skill 推演记录](2026-09-19-forward-skills.md)；其余流程、宿主工具边界及 Montage 二次复核见 [Agent 推演记录](2026-09-19-forward-agents.md)。Ecommerce 父入口单独按“完整电商素材任务应触发，普通图片请求或已进入子阶段不重复触发”审核。

这些对照是独立静态推演，with/without 列说明移除 Skill 后保留及缺失的规则，并非两次真实生成质量的 A/B 实验。自动检查不能证明自然语言语义永远一致，也不能直接验证模型实际选用 Skill 的概率；改动触发描述、阶段或失败规则时仍需重跑这些情景审阅。

## 验证记录

- `make agent-pack-generate`、`make agent-pack-check`：通过。
- `cd server && go test ./agent ./agentpack ./mcp`：通过。
- `cd server && go test ./...`：通过。
- `cd server && go build -o /tmp/anban-creator-server .`：通过。
- `cd harness && pnpm run check`：通过，含类型检查、构建、456 项测试（1 项跳过）、打包完整性及 `smoke:profile`。
- `cd harness && pnpm run audit:workflows`：通过，审计无错误，7 项变异测试通过。
- `make -C harness humanizer-check`：通过。
- Skill Creator `quick_validate.py`：26 个自维护 Skill 通过。
- 两个仓库 `git diff --check`：通过。

完整检查期间曾遇本机 pnpm 离线缓存缺依赖，已在临时目录补齐缓存后通过原检查；150ms 进程监督测试在机器并行负载下出现启动竞态，减少并行测试后通过，未放宽断言。

未调用真实付费 MCP 研究/图像/视频服务或发布服务，未做线上产出质量与计费 token A/B。此次结论限于可运行的仓库检查、执行合同一致性与静态路由/恢复推演。
