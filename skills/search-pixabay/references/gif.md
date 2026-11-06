# Pixabay GIF 搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/gifs/search/{关键词}/?date={时间}&content_type={类型}
```

- 关键词默认英文，多词用 `%20` 连接
- GIF 的筛选参数较少，主要依赖关键词精准搜索

## 可用筛选参数

### 发布时间 (date)

- `1d`：1 天内
- `3d`：3 天内
- `1w`：1 周内
- `6m`：6 个月内
- `1y`：1 年内

### 内容类型 (content_type)

- `authentic`：真实录制
- `ai`：AI 生成

## 链接构建原则

1. **GIF 参数很少，核心靠关键词**
2. **必须提供 2-3 个梯度链接**：
   - 方案一（最宽）：仅关键词
   - 方案二（适中）：关键词 + content_type
   - 方案三（备选）：用近义关键词重新构建
3. 关键词选择对 GIF 搜索结果影响最大

## 输出格式

1. **需求分析**：简要分析动图用途、风格需求
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 英文搜索词 | |
| date | 发布时间 | |
| content_type | 内容类型 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：庆祝用的烟花动图

**方案一（最宽）**：
```
https://pixabay.com/gifs/search/fireworks%20celebration/
```

**方案二（适中）**：
```
https://pixabay.com/gifs/search/fireworks%20celebration/?content_type=authentic
```

**方案三（备选）**：
```
https://pixabay.com/gifs/search/party%20fireworks/
```
