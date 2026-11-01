# Cue 表与混音细则

本文件定义 `bgm-plan.json` 的结构、ducking 与响度计算、换曲转场决策表。

## bgm-plan.json 结构

```json
{
  "schema_version": "1.0",
  "status": "ready",
  "source": "video-bgm-design",
  "data_at": "2026-11-01T12:00:00+08:00",
  "missing": [],
  "arc": [
    { "chapter_id": "ch1", "purpose": "hook", "start": 0.0, "end": 8.4,
      "emotion": ["好奇", "轻微紧张"], "energy": "medium", "tension": "build",
      "voice_density": "high", "allow_lift": false, "silence_allowed": false }
  ],
  "tracks": [
    { "track_id": "t1", "title": "…", "artist": "…", "duration_seconds": 165,
      "source_type": "cc0", "source_ref": "library:pack-07/ambient-13",
      "license": "CC0 1.0", "sha256": "…", "rights_status": "verified" }
  ],
  "cues": [
    { "cue_id": "c1", "chapter_id": "ch1", "start": 0.0, "end": 8.4,
      "track_id": "t1", "in_point": 12.5, "out_point": 20.9,
      "gain_db": -15, "ducking": { "attack_ms": 120, "release_ms": 380, "min_gain_db": -20 },
      "fade_in": 0.5, "fade_out": 0.0,
      "transition_to_next": { "type": "crossfade", "duration": 0.6, "anchor": "bar_end" },
      "jianying_search_keywords": ["悬念", "轻电子", "节奏感"],
      "reason": "Hook 段需要建立张力，鼓点密度中低，不压口播" }
  ]
}
```

字段规则：

- `start`/`end` 使用成片绝对秒；`in_point`/`out_point` 是曲目内秒。
- `gain_db` 是该 cue 相对人声的基准增益（通常 -12 ~ -18）。
- `ducking.min_gain_db` 是 ducking 触发时的下限，必须比 `gain_db` 更低。
- `transition_to_next.anchor` 只允许 `bar_end`、`section_end`、`cut`、`silence`。
- `gap` 类型的留白 cue 用 `"track_id": null` + `"gap_reason"` 表示。

## Ducking 与音量自动化

- 触发源：人声段落检测（VAD）或校对转录的语音区间；不用“整片一直压”。
- 参数：`attack` 80–150ms（太快会有抽吸感）、`release` 250–500ms（太短会呼吸式起伏）。
- 深度：`min_gain_db` 相对基准再降 3–8dB，密集数字段可再降。
- 平滑：ducking 曲线必须连续，禁止逐句阶梯式跳变；相邻两段之间用一个包络，不要每句重新压。
- 检查：在每个口播段落起始 300ms 内确认音乐已让位，段落结束后 500ms 内恢复。

## 响度与峰值

- 整片积分响度默认目标 `-14 LUFS`；平台另有要求时以平台为准，并记录来源。
- 真峰值 `≤ -1.0 dBTP`。
- 换曲点前后各 3 秒窗口的响度差应 `≤ 3 LU`；超过时必须调整增益或换曲。
- 单曲 loop 接缝处的瞬时峰值不得高于该 cue 平均峰值 2dB 以上。
- 测量方法（工具、版本、窗口）写入 `bgm-qc.json` 的 `evidence`。

## 换曲转场决策表

| 条件 | 推荐接法 | 时长 | 禁止 |
|---|---|---|---|
| 同曲不同段落 | 按乐句边界硬切 | 0–80ms 淡化 | 切在小节中段 |
| 同调/BPM 差 ≤ 8% | 交叉淡化 | 0.4–0.8s | 长淡化超过 1.5s（会糊） |
| BPM 差 8%–20% | 强拍硬切 + 短淡化 | 60–120ms | 直接无淡化硬接 |
| BPM 差 > 20% 或调性冲突 | 留白 drop 或转场音效桥接 | 0.5–1.5s 静音 | 直接硬接、长淡化掩盖 |
| 情绪反转（紧张→释然） | 先收尾再进新曲，允许 0.5s 留白 | 0.5–1s | 两曲重叠超过 1s |
| 章节结束进入 CTA | 新曲从 intro 进 | 0.8–1.5s | 新曲从副歌砸进来 |

## 多曲使用的最小检查

1. 每首曲子至少被一个 cue 完整使用（intro 到明确收尾或 loop 边界）。
2. 同一首曲子在整片出现次数不超过 3 次，且不连续复用。
3. 相邻两首曲子的调性与 BPM 满足上表条件；不满足时必须留白或加转场。
4. 换曲总数符合“60 秒 ≤ 2 首、60–180 秒 ≤ 4 首”的密度要求。
