---
name: article-visual-design
description: 'Use only when the Article workflow enters its visual planning, content-image generation, review, or upload stage. Do not trigger for a standalone cover request; use article-cover-design.'
---

# 公众号图文图片管理（模板化 + 独立内容审核）

## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## 图片比例固定规则

### 任务图像参数合同

- 调用 `get_project_profile(project_id=$PROJECT_ID, scope="article", task_id=$TASK_ID)` 后读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`。
- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：必须原样作为 `$EFFECTIVE_ASPECT_RATIO`，封面和正文图的每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：Agent 按每张产物职责从 `resolved_profile.allowed_image_ratios` 选择 `$EFFECTIVE_ASPECT_RATIO`；公众号常用宽屏、横版或方形比例只作选择参考。
- 每次生成都必须显式传 `aspect_ratio` 参数。
- `image_type=cover|content` 只表示产物角色，不决定能力、比例、裁剪或价格。


## 图片模式与跳过条件（运行控制驱动）

公众号文章的**封面**与**正文配图**由 user message 的结构化运行控制 `article_image_mode` 决定。缺少该键时写入 `output/failure-state.json`（`error_code=article_image_mode_missing`、`resume_from=project_resolution`），保留已有产物并结束当前执行，不得猜测默认值。本 skill 不解析自然语言禁令：

| `article_image_mode` | 受影响阶段 |
|----------------------|-----------|
| `cover_and_content` | Phase 2/3/4 全部执行 |
| `cover_only` | **Phase 3（配图规划）+ Phase 4（配图生成）跳过**——不写 `image-plan.md`/`images.json`；正文不内联 `<img>`；模板 `image_count.min` **不再生效**，不得据此强制生成配图 |
| `content_only` | **Phase 2（封面生成）跳过**——封面已委托 `article-cover-design` skill，见其「跳过条件」；不生成 `output/cover.png`，不取 `media_id`/`$COVER_PATH` |
| `text_only` | Phase 2/3/4 全跳过 |

**封面关·配图开**或**人物参考启用**时，Phase 4 正文图改为各自独立生成，只使用文本风格块且不传 `ref_image_path`。封面关·配图开时严禁指向不存在的 `output/cover.png`。Phase 0/1（模板选择、节奏规划、三维风格分析）不受开关影响，始终执行。

下方各 Phase 顶部再次标注其跳过条件；质量验证的图片相关项在配图开关关闭时跳过。

## 公众号图片尺寸与展示规则

公众号图片必须遵循任务有效比例，并在 MCP `generate_image` 参数中显式传入。下表中的构图比例只用于智能适配时从当前能力支持范围选值，不得覆盖用户明确比例：

| 图片类型 / slot | MCP `aspect_ratio` | HTML `image_size` | 用途 |
|-----------------|--------------|---------------------|------|
| 封面 / hero | `$EFFECTIVE_ASPECT_RATIO` | `full-bleed` | 用户明确比例原样使用；智能适配时优先考虑能力支持的宽屏比例 |
| `section_opener` / 普通正文配图 | `$EFFECTIVE_ASPECT_RATIO` | `full-width` | 用户明确比例原样使用；智能适配时可考虑横版 |
| `inline_detail` / 段内细节图 | `$EFFECTIVE_ASPECT_RATIO` | `inline` | 用户明确比例原样使用；智能适配时可考虑方形 |
| 信息图 / 流程图 / 对比图 / 清单总结图 | `$EFFECTIVE_ASPECT_RATIO` | `full-width` 或 `inline` | 智能适配时按信息结构从能力支持范围选择 |

`visual-rhythm-plan.md` 中正文图 slot 默认不要滥用 `full-bleed`；正文阅读流优先 `full-width` 或 `inline`。`render_template` 会按 `image_size` 控制展示宽度：`full-bleed=100%`、`full-width=86%`、`inline=68%`。

## 受控文字策略

图片上是否需要文字由场景决定，不再一律纯图：

- 封面：当标题利益点强、系列感明显、教程/清单/杂志编辑风、或用户/项目视觉风格明确需要时，可生成 2-8 个字的短标题/关键词；普通氛围图、真实场景摄影、情绪意象封面默认无字。
- 正文图：真实场景/氛围图默认无字；信息图、流程图、对比图、清单总结图可带少量中文标签或短句。
- 所有可见文字必须写入生成 prompt；独立 `analyze_image` 的审核 prompt 检查文字是否短、清晰、无乱码、无水印、无 logo、无密集排版。
- **反导流视觉禁区**：任何封面和正文图都不得出现二维码、联系方式、外链 URL、扫码提示、跳转图标、加群、加微信、关注领资料或回复关键词等导流元素。若生成结果含上述元素，内容审核必须判为不通过并重试。

## MCP 工具

任何图像 MCP 返回 `execution_identity_required` 或 `execution_identity_mismatch` 时，必须按不可重试的运行时身份故障处理：不得更换 prompt、比例、`image_type` 或工具重复尝试；保留已有产物，在 `output/final-review.md` 记录 `execution_identity_unavailable` warning 和 `resume_from=image_generation`，停止剩余视觉工作并返回 Article Agent 继续生成核心 HTML。身份失败不属于下文的质量或供应商重试预算；诊断不得包含令牌、密钥或完整环境变量。视觉失败不得阻止核心 Markdown 与 HTML 继续生成。

| MCP 工具 | 说明 |
|----------|------|
| `analyze_image` (project_id, task_id, image_url 或 file_path, prompt) | 分析图片可见内容，供 Agent 作质量判断或创作修订 |
| `upload_image` (project_id, task_id, file_path) | 独立上传已接受图片到微信 CDN，返回 CDN URL 和素材 ID |
| `download_image` (project_id, task_id, url, output_path) | 下载公共 HTTPS 图片并登记为持久任务文件 |
| `compress_image` (task_id, input_path, output_path, max_width?) | 压缩授权任务图并登记新的持久任务文件 |

---

## 规划、生成与持久化

1. 模板与节奏：从文章结构选择 `templates/article/*.yaml`；每个章节映射 slot，写 `output/visual-rhythm-plan.md`，包含 slot_id / section_index / image_size / module / composition_type / chapter_anchor。
2. 风格：`visual_style`（task > project）优先，三维分析仅补充；`writer` 与 `theme` 不决定图片风格。记录 `$VISUAL_STYLE_SOURCE`。
3. 封面：模式允许才读取 [article-cover-design/SKILL.md](../article-cover-design/SKILL.md)，输出 cover-plan.md / cover-prompt.md / cover-quality.json；审核后独立上传。
4. 正文规划：`output/image-plan.md` 每图含 visual_brief、required_entities、must_match_excerpts；实体必须来自该章节，不能仅写抽象风格。
5. 逐 slot 生成：`generate_image(project_id=$PROJECT_ID, task_id=$TASK_ID, prompt=<当页提示词>, image_type="content", output_path="output/img_N.png", aspect_ratio=$EFFECTIVE_ASPECT_RATIO)`。仅当封面可用且未启用人物参考时，可传 `ref_image_path="output/cover.png"`；否则只用文本风格块。
6. 独立审核：`analyze_image(project_id=$PROJECT_ID, task_id=$TASK_ID, file_path=<生成图>, prompt=<实体/章节相关性/文字/构图/合规检查>)`。可见问题最多共 3 次生成，耗尽标 `quality_status=failed`，继续后续 slot；分析运行失败记 warning，不伪造评分。
7. 接受图片后调用 `upload_image(project_id=$PROJECT_ID, task_id=$TASK_ID, file_path=<生成图>)`；失败仅重试上传一次，仍失败保留本地图和 warning，返回 Agent 继续核心 HTML 与 blocked draft。
8. 每张立即原子写 `output/images.json`（临时文件 → fsync → rename），包含 slot、章节、实体、原句、最终 prompt、quality_review、file_path、wechat_url、media_id、quality_status。只将已接受且已上传的 CDN 图片按 slot 插回 `output/04-article-final.md`，不得插入失效路径。

详见 [references/generation-contract.md](references/generation-contract.md)；仅在上述阶段读取。

## 质量验证

> **配图开关守卫**：配图开关关闭时，下方所有图片相关检查项（文件完整性/风格一致性/视觉多样性/内容审核通过率/审计完整性/CDN 持久化）跳过，不计为失败；节奏完整性、模板一致性（slot 映射）仍执行。封面关闭或人物参考启用时，「风格一致性」改为“无 `ref_image_path`，使用文本风格块”。

生成完成后执行 7 项检查：

- [ ] **节奏完整性**：`visual-rhythm-plan.md` 中每个 `##` 都映射到一个 slot
- [ ] **模板一致性**：所选模板的 rhythm 规则被遵守（如 listicle 的 section_opener 必填、inline_detail forbidden）
- [ ] **文件完整性**：所有图片文件存在且可访问
- [ ] **风格一致性**：未启用人物参考且封面开启时，内容图可记录 `ref_image_path="output/cover.png"`；封面关闭或人物参考启用时无 `ref_image_path`，并通过文本风格块保持一致
- [ ] **视觉多样性**：3 张以上配图使用 3 种以上不同 `composition_type`（清单模板可豁免，因要求统一构图）
- [ ] **反同质化**：不得连续 3 张正文图复用同主体/同远近景/同色调重心；正文图不得复刻封面主体
- [ ] **内容审核通过率**：至少 80% 的内容图 `quality_status=passed`
- [ ] **审计完整性**：`images.json` 每条含 `visual_brief` / `required_entities` / `must_match_excerpts` / `quality_review` / `slot_id` / `section_index` / `wechat_url` / `media_id`
- [ ] **CDN 持久化**：`images.json` 每条都有非空 `wechat_url`（每张图已独立上传到 CDN）；缺 URL 的 slot 只调用 `upload_image` 重传，禁止重新生成

未通过检查时：
- 单图失败 → 重试或降级标记
- 节奏/模板违规 → 回到 Phase 0 重新规划
- 内容审核通过率 < 80% → 检查 prompt 构建逻辑，必要时回退到 Phase 3 重新规划
- 超过一半章节配图在各自限定重试后仍失败 → 保留已有产物，在 `output/final-review.md` 记录 `article_content_images_failed` warning 和缺失章节，返回 Article Agent 继续核心交付，不得请求用户协助

---

## 保存结果

- 含 CDN 图片链接的文章覆盖写回 `output/04-article-final.md`
- 所有配图信息保存为 `output/images.json`

---

## 尺寸与故障处理

超出当前 MCP 限制时按返回约束压缩，保留任务比例。缺实体、章节不相关、构图雷同或节奏违规时按诊断修订；每张重试预算耗尽后保留失败记录，交由 Agent 写 blocked 交付包。

详见 [references/troubleshooting.md](references/troubleshooting.md)；仅在上述阶段读取。

## 参考文档

- [references/cover.md](references/cover.md) — 封面设计规范（三维风格分析 + prompt 模板）
- [references/content.md](references/content.md) — 配图规划与生成（新 schema + 独立内容审核循环）
- [references/rhythm.md](references/rhythm.md) — 节奏规划与模板选择（visual-rhythm-plan.md 模板）
