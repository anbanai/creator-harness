# 字幕样式 token 与章节映射

本文件定义 `caption-style.json` 的字段、章节映射结构、竖屏/横屏参数和字体降级规则。

## 样式 token 字段

每条样式是一个独立对象，`style_id` 在整片唯一：

```json
{
  "style_id": "base-bottom",
  "usage": "主体论证",
  "font_family": "Source Han Sans SC",
  "font_weight": 600,
  "font_size_ratio": 0.042,
  "fill_color": "#FFFFFF",
  "stroke_color": "#000000",
  "stroke_width_ratio": 0.004,
  "shadow": { "enabled": true, "blur_ratio": 0.006, "opacity": 0.45 },
  "background": { "mode": "none" },
  "position": { "anchor": "bottom-center", "offset_y_ratio": 0.02 },
  "max_width_ratio": 0.8,
  "line_height": 1.2,
  "alignment": "center",
  "emphasis": { "color": "#FFD54A", "weight": 800 },
  "numeric_style": { "scale": 1.12, "tabular": true },
  "entrance": { "type": "fade", "duration_ms": 120 },
  "exit": { "type": "fade", "duration_ms": 100 }
}
```

字段规则：

- 尺寸一律用相对画面的比例（`*_ratio`），不用绝对像素，保证不同分辨率一致。
- `max_width_ratio` 不超过 0.8；超过会让文字顶到画面两侧。
- `background.mode` 只能是 `none`、`solid`、`gradient`；使用底条时底条也计入安全区。
- `entrance`/`exit` 只允许 `none`、`fade`、`slide_up`、`typewriter`；时长不超过 250ms。
- `emphasis` 与 `numeric_style` 是可选增强，关闭时不影响基础可读性。

## 章节映射结构

```json
{
  "schema_version": "1.0",
  "status": "ready",
  "source": "video-subtitle-design",
  "data_at": "2026-11-01T12:00:00+08:00",
  "missing": [],
  "render_mode": "sidecar",
  "ratio": "9:16",
  "styles": [ { "style_id": "hook-large" }, { "style_id": "base-bottom" } ],
  "chapter_style_map": [
    { "chapter_id": "ch1", "purpose": "hook", "start": 0.0, "end": 8.4, "style_id": "hook-large" },
    { "chapter_id": "ch2", "purpose": "body", "start": 8.4, "end": 62.0, "style_id": "base-bottom" },
    { "chapter_id": "ch3", "purpose": "cta", "start": 62.0, "end": 73.5, "style_id": "base-bottom" }
  ],
  "fallbacks": []
}
```

规则：

- 章节必须连续覆盖整片，不允许空洞或重叠。
- 同一章只有一个 `style_id`；需要强调时用 `emphasis`，不新建样式。
- 整片样式数量上限 4；超过时合并相近样式。
- 样式切换只能发生在章节边界或明确的语义转折点，并在 `caption-plan.md` 说明理由。

## 竖屏与横屏参数

| 参数 | 9:16 竖屏 | 16:9 横屏 | 1:1 |
|---|---|---|---|
| 字幕带位置 | 0.75–0.82 | 0.82–0.88 | 0.78–0.85 |
| 底部保留 | ≥ 0.12 | ≥ 0.08 | ≥ 0.10 |
| 最大宽度 | 0.80 | 0.72 | 0.76 |
| 建议字号比例 | 0.040–0.048 | 0.028–0.034 | 0.034–0.040 |
| 额外避让 | 右侧互动栏、底部文案区 | 底部播放控件 | 四角按钮 |

竖屏字幕不得使用横屏的绝对位置；横屏也不得复用竖屏字号。

## 字体与降级

- 优先使用项目指定字体；没有时按以下顺序 fallback：Source Han Sans SC → Noto Sans CJK SC → PingFang SC → 系统无衬线。
- 换字体必须保持字号比例与字重层级不变；字重缺失时向上取最近可用字重并记录。
- 不得用图片贴字替代字幕轨（不可编辑、不可检索、不可无障碍）。
- 字体文件与许可证信息记入 `caption-style.json` 的 `fallbacks`，不得引入未授权字体。
