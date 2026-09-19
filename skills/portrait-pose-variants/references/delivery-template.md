### Phase 4 — 全量一致性审计

#### 步骤 6：生成汇总报告

步骤 5 的逐张审计结果汇总到 `output/consistency-report.md`：

```markdown
# Consistency Report

## Identity Lock Source

- file: output/input-manifest.md 中的 reference_portrait
- analyzed_at: <时间戳>
- portrait_task_path: $PORTRAIT_TASK_PATH
- 12 维度身份锁: output/identity-lock.md

## Per-Variant Audit

| # | Pose | 脸型 | 五官比例 | 眼睛 | 鼻子 | 嘴型 | 眉毛 | 发型 | 发色 | 肤色 | 年龄感 | 气质 | 神态 | Overall |
|---|------|------|---------|------|------|------|------|------|------|------|--------|------|------|---------|
| 1 | 震惊捂脸 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | PASS |
| 2 | 自信指向 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | MINOR |
| 3 | 疑惑托下巴 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | FAIL（已重试）|
| ... |

## Summary

- PASS: 4 张
- MINOR: 1 张（关键维度 PASS，可接受）
- FAIL: 1 张（重试后仍漂移，标记 needs_img2img）

## Retry History

- variant_03.png: 发型 FAIL（卷发变直发）→ 重试 prompt 加强"hair must be wavy curls, NOT straight"→ 仍 FAIL → 标记 needs_img2img

## Capability Boundary

当前 generate_image 是参考图生成，不是专用 ID-lock 工具。MINOR/FAIL 是能力边界，非流程缺陷。
```

---

### Phase 5 — 交付报告

#### 步骤 7：最终交付

向用户交付：

```
人像姿态变体生成完成

参考人像: output/input-manifest.md 记录的路径
生成张数: N
姿态列表: <从 selected-poses.md 提炼>

成果文件:
- output/variant_01.png ~ variant_0N.png（主交付）
- output/variant_0N_v2.png（若重试过，作为备选）

身份一致性:
- 12 维度审计结果: <PASS/MINOR/FAIL 汇总>
- 关键维度（脸型/五官比例/发型发色）: <汇总>
- 能力边界: 当前使用 generate_image best-effort 参考图生成，未使用专用 ID-lock

复盘材料:
- output/identity-lock.md （身份锁）
- output/selected-poses.md （姿态选择）
- output/image-prompts.md （prompt 备份）
- output/consistency-report.md （一致性审计）

人工复核:
- variant_0X.png: <描述仍存在的问题>，建议手动指定该维度后重新生成或使用专用 ID-lock 工具
```

---
