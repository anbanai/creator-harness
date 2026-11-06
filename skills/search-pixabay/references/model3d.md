# Pixabay 3D 模型搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/3d-models/search/{关键词}/?vertex_count={精度}&colors={颜色}&date={时间}&content_type={类型}
```

- 关键词默认英文，多词用 `%20` 连接
- colors 可多选，用 `&colors=` 连接

## 可用筛选参数

### 顶点密度 (vertex_count)

- `low_poly`：低面数，适合游戏、实时渲染
- `mid_poly`：中等面数
- `high_poly`：高面数，适合影视、静帧渲染

### 颜色 (colors)

可多选：

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

- `authentic`：手工建模
- `ai`：AI 生成

## 链接构建原则

1. **单链接参数不超过 3 个**
2. **必须提供 2-3 个梯度链接**：
   - 方案一（最宽）：仅关键词，或关键词 + 1 个参数
   - 方案二（适中）：关键词 + vertex_count + content_type
   - 方案三（最窄，可选）：关键词 + vertex_count + colors + date
3. 游戏开发优先选 low_poly，影视制作优先选 high_poly

## 输出格式

1. **需求分析**：简要分析模型用途、精度需求
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 英文搜索词 | |
| vertex_count | 顶点密度 | |
| colors | 颜色 | |
| date | 发布时间 | |
| content_type | 内容类型 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：低面数的汽车模型

**方案一（最宽）**：
```
https://pixabay.com/3d-models/search/car/
```

**方案二（适中）**：
```
https://pixabay.com/3d-models/search/car/?vertex_count=low_poly
```

**方案三（最窄）**：
```
https://pixabay.com/3d-models/search/car/?vertex_count=low_poly&content_type=authentic
```
