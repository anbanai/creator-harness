# 上游合规映射（Anban 适配）

> 上游来源：`third_party/ecommerce-visual-copywriting-skill`（MIT，pin `7fd4abaa5a280dddf414ccc1372d886bef702cba`）。宣称分类、证据边界、品类保守口径与国内广告法执行规则以上游为准；本文件定义 Anban 的合规流程、报告结构与优先级。

## 读取顺序

1. `$UPSTREAM_ECOMMERCE_SKILL/references/compliance-rules.md`（含第 10 节国内主图/详情执行规则）。
2. `$UPSTREAM_ECOMMERCE_SKILL/references/source-notes.md`（官方来源与核验边界）。
3. `$UPSTREAM_ECOMMERCE_SKILL/references/category-notes.md`（命中的品类，如饰品）。
4. `$UPSTREAM_ECOMMERCE_SKILL/references/platform-playbooks.md` 对应平台的风险点与「需核验」项。

> 平台尺寸、像素、白底与文件规则仍以 Anban `platforms.md` 为准，不以上游为尺寸来源。

## 合规流程

1. 收集待检文字：`copywriting.md` 的图内文案 + `asset-plan.md` 每张图的文字层。
2. 先判宣称类型（商品事实 / 性能 / 数据 / 认证 / 比较 / 价格 / 评价 / 健康），对照 `copywriting.md` 的证据账本状态。
3. 再扫 Anban `prohibited-words-ecommerce.md` 与上游高风险表达；上下文敏感判断按 Anban 既有规则执行。
4. 逐图合规自检：引证出处、适用条件、免责声明是否在消费者可见文字层。
5. 高风险改写并重生成相关图；疑似误报只标人工复核，不自动删核心信息。
6. 平台规则时效：无法核验时写「未核验」，不得写成「平台规定」。

## `compliance-report.md` 结构

保留 Anban 原有节（扫描范围 / 高风险项 / 中风险与疑似误报 / 平台专项 / 结论），并新增：

- `## 宣称类型与依据`：类型、证据账本行、状态、处理。
- `## 逐图合规自检`：图号、文字层、阻断、待人工复核。
- `## 可见出处与条件`：引证出处、实验条件、适用范围、期限。
- `## 平台规则核验状态`：已核验 / 未核验（标明依据）。

## 优先级

- 尺寸/白底/文件/主图数量：Anban `platforms.md`。
- 宣称证据、广告法与品类保守口径：社区上游 `compliance-rules.md`（更严格者胜出）。
- 极限词/违禁词：Anban 词库 + 上游规则双扫；词表只是兜底，不能替代宣称审查。

## 披露

阻断、待人工复核与未核验项进入 `quality-gate.md` 与最终报告；不得标「可发布」或「保证过审」。
