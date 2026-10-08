---
name: wechat-picture-visual-design
description: Use when planning or reviewing multi-image WeChat picture-message visuals.
---

# 微信公众号贴图视觉设计

把内容拆成封面和 1 到 19 张后续图片，按视觉顺序服务移动端阅读。封面承担停留和点击承诺，内容页承担一个明确的信息理解动作；不能把同一张封面 prompt 换标题后批量复用。完整的页面槽位、文字白名单、构图地图、主体关系、系列连续性和审核 JSON 见 [references/prompt-blueprint.md](references/prompt-blueprint.md)，进入规划和生成阶段必须读取。

## 图像参数合同

生成前调用：

```text
get_project_profile(project_id=$PROJECT_ID, scope="wechat", task_id=$TASK_ID)
```

读取 `resolved_profile.image_ratio`、`resolved_profile.allowed_image_ratios`、`resolved_profile.visual_style` 和任务可用参考路径：

- `resolved_profile.image_ratio` 不等于 `"auto"` 表示用户明确比例：封面与每一张内容图必须原样作为 `$EFFECTIVE_ASPECT_RATIO`。
- `resolved_profile.image_ratio` 等于 `"auto"` 表示智能适配：只能从 `resolved_profile.allowed_image_ratios` 选择；公众号贴图在能力允许时可偏好 `3:4` 或 `1:1`，不能覆盖用户明确值。
- 每次 `generate_image` 都显式传 `aspect_ratio=$EFFECTIVE_ASPECT_RATIO`（显式传 `aspect_ratio`），并在最终 prompt 中写出严格画布比例；`image_type` 不隐式决定比例或裁剪。
- 失败、超时、身份错误和比例不支持按 Agent Pack 的失败合同落盘；不能通过换比例、换 Provider 或删掉页面约束掩盖错误。

## 页面规划与生成

1. 读取 `output/content-script.md`、`output/content.md`、项目画像和任务输入。`picture_image_count` 是图片总数（含封面），范围 1–20；`picture_image_count_mode=up_to` 表示上限，实际可少于请求数，`exact` 表示必须精确匹配。若有数量但缺少模式，按历史 `exact` 处理；若两个字段都缺失，按 `up_to`、最多 5 张处理。先按独立信息价值确定实际页数，再为每页确定 `page_role`：`cover`、`content` 或按任务需要的 `summary`。
   - `up_to` 的默认上限是 5 张（含封面）。封面计入总数；其余页只承载能独立增加读者理解或行动价值的信息点。信息不足时少生成，禁止拆分短句、重复结论或添加装饰页来凑数。
   - `exact` 必须生成指定数量且每页都通过质量审核。若无法在不重复、不编造的前提下满足数量，保持交付包 `blocked`，不要降低质量门槛。
2. 写 `output/image-plan.md`。每页必须独立填写 `page_goal`、`page_scope`、`visible_text_whitelist`、`required_entities`、主体状态/关系、镜头/景别/焦点、文字安全区、`layout_map`、阅读顺序、媒介/色彩/光线、跨页变化、页面外禁止项和验收标准。用户锁定文案逐字保留；无字页写 `NO TEXT`。
3. 逐页按 [references/prompt-blueprint.md](references/prompt-blueprint.md) 编译最终提示词，记录实际 `$EFFECTIVE_ASPECT_RATIO` 和参考图用途。封面使用 `image_type="cover"`，后续图片使用 `image_type="content"`；调用只传当前页相关参考。

```text
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<当前页最终 prompt>,
  image_type="cover" 或 "content",
  output_path="output/cover.png" 或 "output/image_NN.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO
)
```

将每张最终提示词写入 `output/image-prompts.md`，按视觉顺序记录用途、有效比例和参考图职责。

4. 每张生成成功后必须独立调用 `analyze_image(project_id=$PROJECT_ID, task_id=$TASK_ID, file_path=<当前图片>, prompt=<同页审核 prompt>)`，检查页面目标、实体、状态/关系、文字逐字准确、阅读顺序、安全区、串页内容、跨页重复和导流元素。可见问题按单图最多 3 次生成尝试修订；调用失败、malformed 或无法可靠判断时记录 `quality_status=unavailable` 和 warning，继续生成后续计划图片，但不能把该图算作通过。
5. 只有审核接受后才保留为交付图片并写入 `output/quality-review.md`。图片文件必须可读，`cover_path` 单独指向封面，`image_paths` 按视觉顺序列出后续图片且不重复封面。
6. 完成前按 Pack 合同写 `output/publish-package.json`：任何缺图、文字错误、关键关系错误、`quality_status=failed` 或 `quality_status=unavailable` 都把 `status` 与 `readiness.status` 设为 `blocked`，并写 `output/failure-state.json`；只有 `ready` 才能交给 Server finalizer，本地文件存在不能证明 Server 已上传或创建草稿。

## 质量闸门

- [ ] 封面在缩略图中给出具体点击理由，内容页按视觉顺序各自完成一个理解动作
- [ ] 所有页面文字都在白名单内，无乱码、伪词、英文/拼音、二维码、水印或导流内容
- [ ] 每个信息点都有对应主体、状态或关系，且没有把其他页面或 caption 带入
- [ ] 文字区、主体区、边缘裁切和手机缩略图安全
- [ ] 共享风格稳定，但连续三张不复用同一主体、同一景别和同一色块重心
- [ ] `image-plan.md`、`image-prompts.md`、`quality-review.md` 和交付包的页序一致
- [ ] 每张图片都有独立审核结果；`quality_status=unavailable` 或 `failed` 时 `status` 与 `readiness.status` 必须均为 `blocked`
- [ ] `picture_image_count` 为总张数上限或精确数（含封面）；`up_to` 的实际张数为 1 到上限，`exact` 必须与请求数一致，历史无模式任务按 `exact` 校验
- [ ] 只有 `ready` 且全部审核通过的图片才进入 `publish-package.json`；发布事实由 Server finalizer 返回
