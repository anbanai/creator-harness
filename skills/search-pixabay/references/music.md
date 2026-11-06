# Pixabay 音乐搜索

## URL 构造规则

基本结构：
```
https://pixabay.com/music/search/{关键词}/?genre={流派}&mood={情绪}&movement={乐章}&theme={主题}&duration={时长}&content_type={类型}
```

- 关键词默认英文，除非用户明确指定中文
- 所有参数值小写，多词用 `%20` 连接
- 参数值为多个时用 `&` 连接同名参数，如 `genre=upbeat&genre=beats`
- 参数值中多词用 `%20` 连接，如 `music%20for%20videos`

## 可用筛选参数

### 流派 (genre)

Electronic, Upbeat, Beats, Beautiful Plays, Main Title, Alternative Hip Hop, Modern Classical, Ambient, Build Up Scenes, Acoustic Group, Solo Piano, Corporate, Solo Instruments, Rnb, Action, Intro/Outro, Rock, Folk, Adventure, Vocal, Mystery, Chase Scene, Indie Pop, Pulses, Meditation/Spiritual, Small Emotions, Alternative, Nostalgia, Trap, High Drones, Mainstream Hip Hop, Solo Classical Instruments, Soft House, Epic Classical, Techno & Trance, House, Pop, Classical Piano, Happy Childrens Tunes, Suspense, Cafe, Future Bass, Synthwave, Traditional Jazz, Video Games, Solo Guitar, Hard Rock, World, Dance, Electro, Horror Scene, Supernatural, High Rhythmic Drones, Special Occasions, Christmas, Crime Scene, Cartoons, Eccentric & Quirky, Small Drama, Elevator Music, Funk, Drama Scene, Jingles, Vintage, Low Drones, Synth Pop, Old School Hip Hop, Marching Band, Metal, Modern Country, Lullabies, Fantasy & Dreamy Childrens, Deep House, Smooth Jazz, Chamber Music, Dramatic Classical, Drum N Bass, Sneaky, Modern Jazz, Bloopers, Afrobeat, Island, Religious Theme, Choir, Acid Jazz, Dubstep, Comedy, Motown & Old School Rnb, Blues, Modern Blues, Ireland, Strange & Weird, Scotland, Wedding, Post Rock, Scary Childrens Tunes, Amusement Park, Gospel, Reggae, Traditional Country, Bossa Nova, China, Low Rhythmic Drones, Big Band, Urban Latin, Funerals, Old School Funk, Vaudeville & Variety Show, Show Dance, Tragedy, High Non Rhythmic Drones, Low Non Rhythmic Drones, Ska, Old School Rnb, India, Samba (Latin), Military & Historical, Punk, Classical String Quartet, Cha Cha (Latin), Circus, Usa, American Roots Rock, Oompah Band, Tango, Polka, France, Greece, Disco, Edm, Rap, Instrumental, Celtic, Lofi, Abstract, Percussion, Bachata, Latin, Orchestral, Flamenco, Reggeaton, Salsa, Phonk

### 情绪 (mood)

Bright, Restless, Dreamy, Laid Back, Hopeful, Uplifting, Relaxing, Suspense, Energetic, Peaceful, Sentimental, Mysterious, Epic, Glamorous, Quirky, Romantic, Euphoric, Happy, Dark, Eccentric, Scary, Sad, Angry, Funny, Weird, Sexy, Emotional, Groovy, Celebration, Chill

### 乐章 (movement)

Medium, Chasing, Elegant, Floating, Smooth, Running, Fast, Medium Fast, Heavy & Ponderous, Slow, Busy & Frantic, Sneaking, Marching, Changing Tempo, Very Fast

### 主题 (theme)

Music For Videos, Music For Youtube Videos, Vlog Music, Background Music, Film Music, Podcast Music, Cinematic Music

### 时长 (duration)

- `0-30`：30 秒以内
- `30-120`：30 秒到 2 分钟
- `120-240`：2 到 4 分钟
- `240-480`：4 到 8 分钟
- `480-`：8 分钟以上

### 内容类型 (content_type)

- `authentic`：真实录制
- `ai`：AI 生成

## 链接构建原则

1. **参数总数不超过 3 个**（genre/mood/movement/theme 中选）
2. **必须提供 2-3 个梯度链接**：
   - 方案一（最宽）：关键词 + 1 个核心参数
   - 方案二（适中）：关键词 + 2 个参数
   - 方案三（最窄，可选）：关键词 + 3 个参数
3. 复杂情绪优先用关键词表达，而非堆叠多个 mood 参数

## 输出格式

1. **需求分析**：简要分析用户需求，解释为何选择该风格
2. **筛选参数表格**：

| 参数 | 中文描述 | 推荐值 |
|:--|:--|:--|
| 关键词 | 核心搜索词 | (英文) |
| genre | 流派 | |
| mood | 情绪 | |
| movement | 乐章 | |
| theme | 主题 | |

3. **梯度链接**：2-3 个由宽到窄的链接
4. **使用建议**：1-2 条实用建议

## 示例

用户需求：婚礼视频配乐

**方案一（最宽）**：
```
https://pixabay.com/music/search/wedding/?mood=romantic
```

**方案二（适中）**：
```
https://pixabay.com/music/search/wedding/?mood=romantic&genre=wedding&movement=elegant
```

**方案三（最窄）**：
```
https://pixabay.com/music/search/wedding/?mood=romantic&genre=wedding&movement=elegant&theme=music%20for%20videos
```
