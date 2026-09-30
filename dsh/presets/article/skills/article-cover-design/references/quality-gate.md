# 封面质量闸门

## 审核输入

用独立 `analyze_image` 审核最终 `$COVER_PATH`，同时提供：`final_title`、`digest_hook`、`article_promise`、`content_proof_points`、`selected_cover_concept`、`required_entities`、`anti_generic_constraints`、`$EFFECTIVE_ASPECT_RATIO`、文字策略，以及人物参考是否启用。

Agent 必须结合实际可见画面作判断，不能直接采信生成 prompt 或模型自述。分析调用故障可记录 warning，但没有可见内容结论时不得上传。

## 输出 Schema

把结果写入 `output/cover-quality.json`：

```json
{
  "version": "1.0",
  "attempt": 1,
  "visual_quality_scorecard": {
    "title_cover_digest_alignment": "high|medium|low",
    "thumbnail_readability": "high|medium|low",
    "contrast_focus": "high|medium|low",
    "specificity_not_generic": "high|medium|low",
    "series_distinctiveness": "high|medium|low",
    "safe_zone_centered": true,
    "text_policy_ok": true,
    "hard_no_forbidden_cues": true,
    "hard_aspect_ok": true,
    "overall_pass": true
  },
  "cover_effectiveness_scorecard": {
    "information_scent_alignment": "high|medium|low",
    "audience_motivation": "high|medium|low",
    "content_specificity": "high|medium|low",
    "thumbnail_attention": "high|medium|low",
    "truthfulness_not_clickbait": "high|medium|low",
    "brand_style_fit": "high|medium|low",
    "visual_distinctiveness": "high|medium|low",
    "safe_zone_text_policy": "high|medium|low",
    "generic_swap_test": true,
    "promise_proof_test": true,
    "audience_motivation_test": true,
    "overall_pass": true
  },
  "portrait_decision": {
    "available": false,
    "required_by_user": false,
    "use": false,
    "selected_path": null,
    "reason": "根据内容与用户要求说明是否采用人物"
  },
  "portrait_quality": {
    "enabled": false,
    "portrait_present": null,
    "identity_similarity": null,
    "face_integrity": null,
    "pose_and_expression_fit": null,
    "safe_zone_face_complete": null
  },
  "required_entities_present": true,
  "visible_issues": [],
  "next_prompt_changes": [],
  "overall_pass": true
}
```

## 通过规则

- 两个评分卡的所有软维度不低于 `medium`，全部硬布尔为 `true`。
- `required_entities_present=true`。
- `portrait_decision` 必须与封面方案一致。`use=false` 时 `portrait_quality.enabled=false`；`use=true` 时必须 `enabled=true`，其余字段必须全部通过，`identity_similarity` 不得为 `low`。已配置但未采用人物可通过；用户要求本人出镜却 `use=false` 不通过；用户明确不要人物时，生成画面出现人物也不通过。
- 图上有文字时必须逐字准确、无乱码；不应有字时任何可见伪文字都失败。
- 中心 1:1 裁切后关键主体、人脸和必要短文字完整；底部 20% 没有关键元素。
- 不含水印、logo、二维码、联系方式、外链 URL、扫码提示、加群、加微信或其他导流视觉。

任一硬项失败则 `overall_pass=false`。不能用美观、风格一致或单项高分覆盖硬失败。

## 重试顺序

1. 先修正 `selected_cover_concept` 与正文证据的关系。
2. 再修正主体、景别、位置、占比、动线和负空间。
3. 再修正媒介语言、色彩与光线。
4. 最后才调整修饰性词汇。

文字失败优先改成无字；身份失败优先减少姿态变化和强风格化；安全区失败优先移动/放大主体。单张封面最多 3 次生成尝试，重试原因和实际修改必须写入审计文件。
