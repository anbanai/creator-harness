# Pixabay 插画搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/illustrations/search/{关键词}/?orientation={方向}&min_width={最小宽度}&min_height={最小高度}&colors={颜色}&date={时间}&content_type={类型}
```

参数规则与图片搜索完全一致，详见 `photo.md`。

## 与图片的区别

- 插画（illustrations）：手绘、卡通、扁平风格的插画作品
- 图片（photos）：真实拍摄的照片
- 矢量图（vectors）：SVG 格式的矢量素材

三者的筛选参数（orientation、min_width、min_height、colors、date、content_type）完全通用。

## 适用场景

- 需要卡通、手绘、扁平风格素材时
- PPT 配图、文章插图、UI 设计参考
- 不需要真实照片质感的场景

## 链接构建原则、输出格式

同 `photo.md`，将 URL 路径中的 `photos` 替换为 `illustrations`。

## 示例

用户需求：扁平风格的商务人物插画

**方案一（最宽）**：
```
https://pixabay.com/illustrations/search/business%20people/
```

**方案二（适中）**：
```
https://pixabay.com/illustrations/search/business%20people/?orientation=horizontal
```

**方案三（最窄）**：
```
https://pixabay.com/illustrations/search/business%20people/?orientation=horizontal&content_type=ai
```
