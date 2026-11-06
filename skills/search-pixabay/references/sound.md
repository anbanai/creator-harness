# Pixabay 音效搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/sound-effects/search/{关键词}/?theme={主题}&duration={时长}&content_type={类型}
```

- 关键词默认英文，除非用户明确指定中文
- theme 中的 `&` 必须编码为 `%26`
- 多个 theme 用 `&` 连接同名参数
- 关键词和参数值中多词用 `%20` 连接

## 可用筛选参数

### 主题 (theme)

- `film%20%26%20special%20effects`：转场、冲击、预告片、whoosh、riser、hit、reveal、boom、sweep、logo 音效
- `people`：人声、笑声、掌声、欢呼、尖叫、脚步、人群、呼吸、咳嗽
- `nature`：雨声、风声、雷声、海浪、森林、鸟鸣、火焰、水流、动物声
- `household`：门、厨房、杯子、钥匙、钟表、清洁、家用电器、室内拟音
- `city`：街道、车流、喇叭、地铁、施工、市场、人群城市氛围、警笛
- `musical`：铃声、提示音、短旋律、音乐标识、乐器音效、叮咚声
- `technology`：按钮、电子设备、打字、故障、glitch、机器人、科幻界面
- `horror`：惊吓、恐怖氛围、低频、怪物、鬼魂、尖叫、诡异环境、悬疑冲击

### 时长 (duration)

- `0-30`：0-30 秒，适合短音效、转场、点击、提示、冲击、按钮
- `30-120`：30 秒到 2 分钟，适合较长环境音、场景氛围
- `120-240`：2-4 分钟，适合长环境氛围、自然声、城市背景
- `240-480`：4-8 分钟，适合长时间背景环境声
- `480-`：8 分钟以上，适合超长环境音、白噪音

### 内容类型 (content_type)

- `authentic`：真实录制
- `ai`：AI 生成

## 链接构建原则

1. **单链接参数不超过 2 个**（theme + duration）
2. **必须提供 2-3 个梯度链接**：
   - 方案一（最宽）：仅关键词，或关键词 + 1 个参数
   - 方案二（适中）：关键词 + theme + duration
   - 方案三（备选）：用近义关键词重新构建
3. 复杂需求优先通过关键词表达，而非堆叠参数

## 输出格式

1. **需求分析**：简要分析场景、动作、情绪和音效用途
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 英文搜索词 | |
| theme | 音效主题 | |
| duration | 音效时长 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：恐怖片里的开门声

**方案一（最宽）**：
```
https://pixabay.com/sound-effects/search/door%20creak/
```

**方案二（适中）**：
```
https://pixabay.com/sound-effects/search/door%20creak/?theme=horror&duration=0-30
```

**方案三（备选）**：
```
https://pixabay.com/sound-effects/search/door%20open%20scary/?theme=horror&duration=0-30
```
