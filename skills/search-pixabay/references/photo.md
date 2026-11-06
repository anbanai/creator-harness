# Pixabay 图片搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/photos/search/{关键词}/?orientation={方向}&min_width={最小宽度}&min_height={最小高度}&colors={颜色}&date={时间}&content_type={类型}
```

- 关键词默认英文，多词用 `%20` 连接
- orientation 为 any 时删除此参数
- colors 可多选，用 `&colors=` 连接
- grayscale 和 transparent 互斥

## 可用筛选参数

### 方向 (orientation)

- `horizontal`：横向
- `vertical`：纵向
- 不传或 `any`：不限

### 最小像素 (min_width / min_height)

独立设置，值为数字，如 `1920`、`1080`

### 颜色 (colors)

可多选。grayscale（黑白）和 transparent（透明）互斥，其他颜色可任意组合。

- `transparent`：透明
- `grayscale`：黑白
- `red`、`orange`、`yellow`、`green`、`turquoise`、`blue`、`lilac`、`pink`、`white`、`gray`、`black`、`brown`

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
   - 方案一（最宽）：仅关键词，或关键词 + 1 个核心参数
   - 方案二（适中）：关键词 + 2 个参数
   - 方案三（最窄，可选）：关键词 + 3 个参数
3. 需要高清大图时优先加 min_width/min_height

## 输出格式

1. **需求分析**：简要分析图片用途、风格、尺寸需求
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 英文搜索词 | |
| orientation | 方向 | |
| min_width | 最小宽度 | |
| min_height | 最小高度 | |
| colors | 颜色 | |
| date | 发布时间 | |
| content_type | 内容类型 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：科技感的蓝色背景图，横版 1920 以上

**方案一（最宽）**：
```
https://pixabay.com/photos/search/technology%20background/?orientation=horizontal
```

**方案二（适中）**：
```
https://pixabay.com/photos/search/technology%20background/?orientation=horizontal&min_width=1920&colors=blue
```

**方案三（最窄）**：
```
https://pixabay.com/photos/search/technology%20background/?orientation=horizontal&min_width=1920&min_height=1080&colors=blue&content_type=ai
```
