# Pixabay 矢量图搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/vectors/search/{关键词}/?orientation={方向}&min_width={最小宽度}&min_height={最小高度}&colors={颜色}&date={时间}&content_type={类型}
```

参数规则与图片搜索完全一致，详见 `photo.md`。

## 与图片/插画的区别

- 矢量图（vectors）：SVG 格式，无限缩放不失真，适合图标、logo、UI 元素
- 插画（illustrations）：手绘、卡通风格的位图
- 图片（photos）：真实拍摄的照片

三者的筛选参数完全通用。

## 适用场景

- 需要图标、logo、UI 元素时
- 需要无限缩放不失真的素材
- 设计稿中需要可编辑的矢量素材

## 链接构建原则、输出格式

同 `photo.md`，将 URL 路径中的 `photos` 替换为 `vectors`。

## 示例

用户需求：圣诞节相关的矢量图标

**方案一（最宽）**：
```
https://pixabay.com/vectors/search/christmas%20icon/
```

**方案二（适中）**：
```
https://pixabay.com/vectors/search/christmas%20icon/?colors=red
```

**方案三（最窄）**：
```
https://pixabay.com/vectors/search/christmas%20icon/?colors=red&date=1y
```
