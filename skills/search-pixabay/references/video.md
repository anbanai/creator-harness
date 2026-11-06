# Pixabay 视频搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/videos/search/{关键词}/?orientation={方向}&slow_motion={慢动作}&animation={动画}&time_lapse={延时}&resolution_hd={HD}&resolution_4k={4K}&date={时间}&content_type={类型}
```

- 关键词默认英文，多词用 `%20` 连接
- 布尔参数值为 `true` 时生效，不需要时删除该参数
- resolution_hd 和 resolution_4k 值为 `1` 时生效

## 可用筛选参数

### 方向 (orientation)

- `horizontal`：横向
- `vertical`：纵向
- 不传或 `any`：不限

### 特效 (effects)

布尔参数，值为 `true` 时生效：

- `slow_motion`：慢动作
- `animation`：动画
- `time_lapse`：延时摄影

### 分辨率 (resolution)

- `resolution_hd=1`：HD 高清
- `resolution_4k=1`：4K 超清

### 发布时间 (date)

- `1d`：1 天内
- `3d`：3 天内
- `1w`：1 周内
- `6m`：6 个月内
- `1y`：1 年内

### 内容类型 (content_type)

- `authentic`：真实拍摄
- `ai`：AI 生成

## 链接构建原则

1. **单链接参数不超过 3 个**
2. **必须提供 2-3 个梯度链接**：
   - 方案一（最宽）：仅关键词，或关键词 + 1 个参数
   - 方案二（适中）：关键词 + 2 个参数
   - 方案三（最窄，可选）：关键词 + 3 个参数
3. 需要高清素材时优先加 resolution_hd 或 resolution_4k

## 输出格式

1. **需求分析**：简要分析视频用途、风格、画质需求
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 英文搜索词 | |
| orientation | 方向 | |
| slow_motion | 慢动作 | |
| animation | 动画 | |
| time_lapse | 延时 | |
| resolution_hd | HD | |
| resolution_4k | 4K | |
| date | 发布时间 | |
| content_type | 内容类型 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：城市夜景延时视频，4K

**方案一（最宽）**：
```
https://pixabay.com/videos/search/city%20night/
```

**方案二（适中）**：
```
https://pixabay.com/videos/search/city%20night/?time_lapse=true&resolution_4k=1
```

**方案三（最窄）**：
```
https://pixabay.com/videos/search/city%20night/?time_lapse=true&resolution_4k=1&orientation=horizontal
```
