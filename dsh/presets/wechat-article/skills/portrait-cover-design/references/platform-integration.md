# 人物封面：平台调用合同

只读取当前平台的衔接要求；共用设计、风格模板、生成与重试由 [SKILL.md](../SKILL.md) 维护。

## 路由与输入

- `cover_portrait=required_project_portrait`：生成人物＋标题封面；`disabled` 或未提供：返回平台普通封面流程。公众号封面开关关闭时完全跳过。
- `$PORTRAIT_REFERENCE_PATH` 取任务冻结的 `resolved_profile.project_portrait_reference_path`（`.anban-creator/project-portrait-reference.png`）；不移动、覆盖任务参考文件。
- `$COVER_ASPECT_RATIO`：文章/笔记按已解析图像比例；Montage 按冻结的视频比例；Hypit 按成片真实比例。调用者提供最终内容、精确标题、账号风格与平台安全区，不再叠加普通封面的无字策略。

## 验收与交付

调用者接收共用产物，不重复生成或重置重试计数。独立审核不可用时返回失败，不能标记通过。

| 调用者 | 补充约束与结果消费 |
| --- | --- |
| Article | 从最终正文、SEO 标题与摘要提炼短标题；沿用 `article-cover-design/references/cover-effectiveness.md` 的内容承诺与双评分卡。人脸、标题及关键实体须完整落在中心 1:1 安全区并避开底部 20%。将人物结论和双评分卡合并入 `cover-quality.json`，记录 `portrait_decision.use=true`；通过后由公众号入口完成可选精确裁剪、重新审核、`upload_image` 与排版引用。失败记录封面 warning 并继续核心文章交付，不上传失败封面。 |
| Seednote | 从已锁定标题与 `content.md` 提炼封面主文案；用户指定的封面文案优先。服从本次语言与平台边距要求；普通封面模板的字体/背景预设不叠加到人物模板。封面在 `image-plan.md` 中仍计 1 张，将实际 prompt、审核与人物参考用途回填 `image-prompts.md`、`image-review.md`、`reference-usage-summary.json`。失败标记封面 failed，继续其余计划图片，最终按笔记整体质量闸门处理。 |
| Montage / Hypit | 根据最终视频内容和准确标题生成；比例、安全区写进 prompt 与审核。封面通过后继续既有 delivery-manifest 和 Runtime 验收；失败沿用各自结构化可恢复失败态。该开关只控制封面，不改变视频内的人物替换、素材或官方生产流程。 |

`cover-quality.json` 至少记录 `overall_pass`、`attempts`、`portrait_present`、`identity_match`、`required_text`、`text_exact`、`safe_zone_ok`。这些值依据可见结果，不依据提示词自述。保留主文件的失败诊断，业务入口按上表处理失败；共用 Skill 不上传、不发布、不报告平台登记成功。
