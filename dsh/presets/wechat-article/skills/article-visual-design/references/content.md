# 公众号内容配图设计规范（新 schema + 独立内容审核）

## Contents

- [核心变化（相对旧版）](#核心变化相对旧版)
- [参考链机制](#参考链机制)
- [反同质化规则](#反同质化规则)
- [image-plan.md 升级 schema](#image-planmd-升级-schema)
  - [旧 schema（已废弃）](#旧-schema已废弃)
- [img_01 章节：{chapter title}](#img01-章节chapter-title)
  - [新 schema（强制）](#新-schema强制)
- [img_01 章节：{chapter title}](#img01-章节chapter-title)
- [字段填写规范](#字段填写规范)
  - [`visual_brief`（最关键）](#visualbrief最关键)
  - [`required_entities`](#requiredentities)
  - [`must_match_excerpts`](#mustmatchexcerpts)
- [完整 image-plan.md 示例](#完整-image-planmd-示例)

## 核心变化（相对旧版）

1. **新增 visual_brief**：1-2 句白话"这张图必须画什么"，替代抽象的 visual_subject
2. **新增 required_entities**：必须出现的具体物体列表（内容审核依据）
3. **新增 must_match_excerpts**：章节原文锚点，确保实体不脱离章节
4. **新增页面级蓝图字段**：页面目标、当前章节范围、主体状态/关系、构图地图、文字白名单、跨页变化和页面外禁止项，让最终 prompt 能从计划复原
5. **独立内容审核**：每张图生成后按需单独调用 `analyze_image`，由 Agent 根据可见内容决定接受或锐化 prompt 重试

完整的字段含义、编译顺序和 prompt 骨架见 [prompt-blueprint.md](prompt-blueprint.md)。本文件保留文章正文图的 schema、章节取证和审核示例；封面继续使用 `article-cover-design` 的独立合同。

---

## 参考链机制

内容配图的参考链由 `article_image_mode` 与人物参考开关共同决定。先解析 `$CONTENT_STYLE_REFERENCE_PATH`：

```
cover_and_content + 人物参考关闭 → $CONTENT_STYLE_REFERENCE_PATH = "output/cover.png"
cover_and_content + 人物参考启用 → $CONTENT_STYLE_REFERENCE_PATH = ""
content_only → $CONTENT_STYLE_REFERENCE_PATH = ""
```

只有 `$CONTENT_STYLE_REFERENCE_PATH` 非空时才向 `generate_image` 传 `ref_image_path`。人物参考启用时，正文配图不传 `ref_image_path`，改用从封面方案提取且不含人物身份特征的文本风格块；封面关闭时同样省略该参数。这样既避免风格漂移，也不会把人物身份、姿态或面部特征泄漏到正文图。

**注意**：`ref_image_path` 只传递"风格语言"。内容贴切度由 prompt 中的 `visual_brief` 和 `required_entities` 决定，并由 Agent 的独立内容审核把关。

## 反同质化约束

内容配图必须服务章节信息，而不是复刻封面主体。`ref_image_path` 只传递"风格语言"，不得复刻封面主体、封面构图或封面隐喻。

- 连续 3 张内容图不得使用同一主体、同一构图或同一色块重心。
- Prompt 必须显式写明：ref_image_path 只传递"风格语言"，不得复刻封面主体。
- 每张图都要写出与章节原文绑定的 `visual_brief`、`required_entities` 和 `anti_generic_constraints`。
- 若内容审核认为画面同质化，先改章节实体和构图策略，不要只替换风格形容词。

---

## 反同质化规则

正文配图要像同一套品牌系统，但不能像同一张图的变体。`ref_image_path` 只传递"风格语言"，不得复刻封面主体、构图或核心物件；每张正文图仍由章节自己的 `visual_brief` 和 `required_entities` 决定。

规划 `image-plan.md` 时执行以下检查：

- 同一批正文图不得连续 3 张使用相同主体类型（如全是茶盏/药材/山水/手部特写）。
- 不得连续 3 张使用相同 `composition_type`、相同远近景和相同色调重心，`listicle` 模板的构图统一例外，但主体必须不同。
- 封面主视觉只作风格锚点，不得在正文图中重复作为主要画面；如果封面是莲花，正文图不能连续用莲花或近似荷塘当章节图。
- 中医/养生题材尤其避免"通用养生水墨背景"：每张图必须有能对应章节论点的具体物体、动作或对比关系。

---

## image-plan.md 升级 schema

### 旧 schema（已废弃）

```markdown
## img_01 章节：{chapter title}
- visual_subject: "商务场景"     ← 太抽象，不知道画什么
- source_excerpt: "..."           ← 有，但没约束视觉实体
```

### 新 schema（强制）

```markdown
## img_01 章节：{chapter title}

# 基础字段（沿用旧版）
- chapter_title: {章节标题}
- core_point: {章节核心论点，1 句话}
- page_goal: {读者看到图片后要完成的一个理解动作}
- page_scope: {本图允许使用的章节事实/段落范围}
- composition_type: {8 种构图类型之一}
- source_excerpt: {章节原文摘录}

# 新字段（强制）
- visual_brief: 1-2 句白话描述"这张图必须画什么"
- required_entities: 必须出现的具体物体列表（内容审核依据）
- subject_states: 每个实体的可见状态（打开/密封、干燥/潮湿、正在进行/已完成等）
- subject_relations: 实体与章节论点、动作、对比或因果关系
- must_match_excerpts: 章节中支撑这些实体的原句（防止凭空编造）
- camera: 镜头角度
- shot: 景别
- focal_area: 第一视觉焦点及相对区域
- text_policy: 无字或受控短标签
- visible_text_whitelist: 按最终阅读顺序逐字列出的可见文字；无字时写 `NO TEXT`
- text_zone: 文字或主体保护区
- layout_map: 信息块/主体的相对布局
- negative_space: 明确留白区域
- reading_order: 读者扫描顺序
- medium_surface: 主媒介与表面
- palette: 主色与强调色
- lighting: 光线方向、软硬和色温
- material_details: 要看清的材质细节
- series_anchors: 跨页共享的风格锚点
- page_variation: 本页相对前页的主体、视角或场景变化
- out_of_scope: 不得带入的其他章节信息、主体、数字或结论
- anti_generic_constraints: 避免模板化的具体约束
- acceptance_criteria: 可观察的通过条件

# 衍生字段
- prompt_strategy: 按 prompt-blueprint.md 的顺序把上述字段组合成最终 prompt 的策略
```

---

## 字段填写规范

### `visual_brief`（最关键）

**定义**：1-2 句白话，描述读者看到这张图时应该看到的具体画面。写完问自己："如果让一个陌生人按这句话画图，他能画出来吗？" 答不上来就是不合格。

**好的例子**：
- ✅ "一颗石头路上的裂缝中钻出嫩绿新芽，背景是虚化的晨光。"
- ✅ "一只手握着手摇磨豆器，磨豆器下方接着玻璃瓶，桌面是深色木头。"
- ✅ "空旷的房间里一把空椅子，墙上挂着一幅字，午后阳光从窗户斜射进来。"

**坏的例子**：
- ❌ "自然场景"（太空泛，画什么都行）
- ❌ "商务氛围"（没说画什么）
- ❌ "科技感"（没具体物体）

### `required_entities`

**定义**：列出图片中应能直接观察到的具体物体。这些是内容审核的"必中清单"——审核时如果任何一个没出现，就判定为不合格。

**好的例子**：
```yaml
required_entities:
  - "stone path with visible crack"
  - "tender green shoots emerging from crack"
  - "soft blurred morning light in background"
```

**坏的例子**：
```yaml
required_entities:
  - "美感"           # 主观，无法识别
  - "氛围"           # 太抽象
  - "高质量摄影"     # 不是物体
```

### `must_match_excerpts`

**定义**：章节中支撑 `required_entities` 的原句。防止 agent 凭空编造视觉元素。

**好的例子**：
```yaml
must_match_excerpts:
  - "他说，'你看这条石板路的缝里，不也长出了新芽？'"
  - "晨光透过窗棂，斜斜地落在那道裂缝上。"
```

**坏的例子**：
```yaml
must_match_excerpts:
  - "本章讨论自然修复"   # 这是论点，不是视觉锚点
```

---

## 完整 image-plan.md 示例

```markdown
# 图片内容规划

## 元信息

- 所选模板: long-form-essay
- 视觉风格: warm natural photography, soft morning light
- 色彩基调: warm earth tones with sage green and gold
- 情绪氛围: serene and meditative
- 计划配图数: 5（hero + 4 section_opener）

---

## img_00 封面（hero slot）

- slot_id: hero
- visual_brief: 一朵晨光中缓缓绽放的莲花，花瓣上有露珠，背景是雾气未散的池塘。
- required_entities:
  - "single lotus flower in mid-bloom"
  - "water droplets on petals"
  - "misty pond background"
  - "soft golden morning light"
- must_match_excerpts:
  - "文章开篇：'真正的力量，像一朵莲花——慢，但不曾停下。'"
- composition_type: 留白主导
- prompt_strategy: 主体居左，右侧大面积留白，建立"静"的基调

---

## img_01 章节：身体的智慧

- slot_id: section_opener
- section_index: 1
- chapter_title: 身体的智慧
- core_point: 身体有自己的节奏，强行加速只会破坏自我修复机制
- page_goal: 让读者看见“自我修复从裂缝开始”的具体证据
- page_scope: 本章石板路、新芽和晨光的段落
- composition_type: 三分法
- camera: 平视略低角度
- shot: 石板路局部环境中景
- focal_area: 右侧三分线交点的裂缝和新芽
- text_policy: 无字
- visible_text_whitelist: [NO TEXT]
- text_zone: 左侧浅色路面保持干净，作为主体保护区
- layout_map: 裂缝从左下延至右侧焦点，新芽从裂缝向上突破
- negative_space: 上方和左侧保留晨光留白
- reading_order: 先看裂缝里的新芽，再看晨光和石板路的压迫感
- source_excerpt: "他说，'你看这条石板路的缝里，不也长出了新芽？'"

# 新字段
- visual_brief: 一颗石头路上的裂缝中钻出嫩绿新芽，背景是虚化的晨光。
- required_entities:
  - "stone path with visible crack"
  - "tender green shoots emerging from crack"
  - "soft blurred morning light in background"
- subject_states:
  - "weathered stone path with a dry, visible crack"
  - "fresh shoots actively emerging upward"
  - "soft morning light falling across the crack"
- subject_relations:
  - "the shoots must visibly originate from the crack, not sit beside it"
  - "the hard path surrounds the shoots and proves the chapter's resilience point"
- must_match_excerpts:
  - "他说，'你看这条石板路的缝里，不也长出了新芽？'"
  - "晨光透过窗棂，斜斜地落在那道裂缝上。"
- medium_surface: 温暖自然摄影，真实石材和叶片纹理
- palette: 石板灰、嫩绿、柔金色晨光
- lighting: 左上方柔和晨光，裂缝和叶片边缘有可见高光
- material_details: 粗糙石材裂纹、叶片湿润表面
- series_anchors: 温暖自然光、克制大地色、真实物理关系
- page_variation: 本页用低角度局部自然场景，不重复封面的主体和视角
- out_of_scope: 其他章节的人物、茶具、数字或结论
- anti_generic_constraints: 不要通用绿叶背景、盆栽、无裂缝的草地或抽象励志符号
- acceptance_criteria: 裂缝与新芽关系清楚；缩略图仍能一眼看到“硬石缝里长出新芽”；无额外文字
- prompt_strategy: 按 prompt-blueprint.md 编译：主体在右三分线交点，裂缝横贯画面，新芽向上突破，强化"自我修复"的证据
```

---

## 8 种构图类型（沿用）

| # | 构图类型 | 适用场景 | 视觉特征 |
|---|----------|----------|----------|
| 1 | **中心聚焦** | 核心概念、重要观点 | 单一主体居中，视觉冲击力强 |
| 2 | **对角线流动** | 变化、过程、流动感 | 元素沿对角线分布，动态感 |
| 3 | **三分法** | 自然平衡、通用场景 | 主体位于三分线交点，和谐稳定 |
| 4 | **前景/背景** | 层次、上下文、环境 | 前后景分层，纵深感和空间感 |
| 5 | **俯拍** | 结构、细节、展示 | 鸟瞰或平铺视角，秩序感 |
| 6 | **特写** | 质感、情感、细节强调 | 微距聚焦纹理/图案，亲密感 |
| 7 | **留白主导** | 沉思、极简、意境 | 大面积负空间，主体精简，呼吸感 |
| 8 | **重复图案** | 节奏、重复、规律 | 图案重复排列，韵律感和秩序感 |

### 视觉多样性规则

- 3 张以上配图时，必须使用 3 种以上不同构图类型
- **例外**：`listicle` 模板要求所有 section_opener 使用同一种构图（强化"清单"感），不受此规则约束
- 不得出现连续 3 张视觉元素、构图、色调高度相似的配图；命中时回到 image-plan.md 重分配主体、远近景或色彩重心

---

## 内容配图 Prompt 构建

按 [prompt-blueprint.md](prompt-blueprint.md) 的顺序基于 image-plan.md 的字段构建最终 prompt。`visual_style` 和 `color_palette` 只提供共享锚点，不能覆盖当前章节实体、页面目标或文字策略：

```
页面契约：公众号文章《{ARTICLE_TITLE}》的 {SLOT_ID}，服务《{CHAPTER_TITLE}》；页面目标：{PAGE_GOAL}；当前章节范围：{PAGE_SCOPE}；最终画布比例严格为 {EFFECTIVE_ASPECT_RATIO}，展示尺寸为 {IMAGE_SIZE}。

文字契约：{TEXT_POLICY}。可见文字白名单（按顺序逐字）：{VISIBLE_TEXT_WHITELIST}。文字/主体保护区：{TEXT_ZONE}；禁止白名单之外的文字、字母、拼音、页码、书页字、水印、logo、二维码或导流信息。

构图地图：{CAMERA}，{SHOT}；第一焦点：{FOCAL_AREA}；{LAYOUT_MAP}；留白：{NEGATIVE_SPACE}；阅读顺序：{READING_ORDER}。

章节证据：{VISUAL_BRIEF}

MUST CONTAIN:
{REQUIRED_ENTITIES 逐行列出}

主体状态：{SUBJECT_STATES}。
实体关系：{SUBJECT_RELATIONS}。
艺术指导：主媒介与表面 {MEDIUM_SURFACE}；系列锚点 {SERIES_ANCHORS}；本页变化 {PAGE_VARIATION}；色彩 {PALETTE}。
光线与材质：{LIGHTING}；重点表现 {MATERIAL_DETAILS}。
页面外禁止带入：{OUT_OF_SCOPE}。
负面约束：{ANTI_GENERIC_CONSTRAINTS}；不得复刻封面主体、封面构图或其他章节画面。
输出验收：{ACCEPTANCE_CRITERIA}；移动端缩略图仍能完成页面目标。
```

### 示例

基于上面的 img_01：

```
页面契约：公众号文章《慢下来的力量》的 section_opener，服务《身体的智慧》；页面目标：让读者看见“自我修复从裂缝开始”的具体证据；当前章节范围：本章石板路、新芽和晨光的段落；最终画布比例严格为 $EFFECTIVE_ASPECT_RATIO，展示尺寸为 full-width。

文字契约：无字。可见文字白名单（按顺序逐字）：NO TEXT。文字/主体保护区：左侧浅色路面保持干净；禁止白名单之外的文字、字母、拼音、页码、书页字、水印、logo、二维码或导流信息。

构图地图：平视略低角度，石板路局部环境中景；第一焦点是右侧三分线交点的裂缝和新芽；裂缝从左下延至右侧焦点，新芽从裂缝向上突破；留白在上方和左侧；阅读顺序是先看裂缝里的新芽，再看晨光和石板路的压迫感。

章节证据：一颗石头路上的裂缝中钻出嫩绿新芽，背景是虚化的晨光。

MUST CONTAIN:
- stone path with visible crack
- tender green shoots emerging from crack
- soft blurred morning light in background

主体状态：weathered stone path with a dry, visible crack; fresh shoots actively emerging upward; soft morning light falling across the crack。
实体关系：the shoots must visibly originate from the crack, not sit beside it; the hard path surrounds the shoots and proves the chapter's resilience point。
艺术指导：主媒介与表面为温暖自然摄影、真实石材和叶片纹理；系列锚点为温暖自然光、克制大地色、真实物理关系；本页变化为低角度局部自然场景；色彩为石板灰、嫩绿、柔金色晨光。
光线与材质：左上方柔和晨光，裂缝和叶片边缘有可见高光；重点表现粗糙石材裂纹和叶片湿润表面。
页面外禁止带入：其他章节的人物、茶具、数字或结论。
负面约束：不要通用绿叶背景、盆栽、无裂缝的草地或抽象励志符号；不得复刻封面主体、封面构图或其他章节画面。
输出验收：裂缝与新芽关系清楚；缩略图仍能一眼看到“硬石缝里长出新芽”；无额外文字；移动端缩略图仍能完成页面目标。
```

---

## 独立内容审核循环

### 步骤 1：生成图片

先读取 `resolved_profile.image_ratio` 与 `resolved_profile.allowed_image_ratios`：用户明确比例必须原样作为 `$EFFECTIVE_ASPECT_RATIO`；仅当比例等于 `"auto"`时才按智能适配从当前能力支持范围选择。每次生成都显式传 `aspect_ratio` 参数，值为 `$EFFECTIVE_ASPECT_RATIO`。

```
当 `$CONTENT_STYLE_REFERENCE_PATH` 非空时：

generate_image(
  project_id=$PROJECT_ID,
  prompt=<上面的 prompt>,
  image_type="content",
  output_path="output/img_01.png",
  task_id=$TASK_ID,
  ref_image_path=$CONTENT_STYLE_REFERENCE_PATH,
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO
)

当 `$CONTENT_STYLE_REFERENCE_PATH` 为空时，调用参数中完全省略 `ref_image_path`，并把文本风格块写入 prompt。
```

### 步骤 2：构建内容审核 prompt

```
这张图用于文章《$ARTICLE_TITLE》的章节《$CHAPTER_TITLE》。
章节核心论点：$CORE_POINT
页面目标：$PAGE_GOAL
当前页面范围：$PAGE_SCOPE
视觉简报：$VISUAL_BRIEF
必须出现的视觉元素：
$REQUIRED_ENTITIES（逐行列出）
主体状态与关系：$SUBJECT_STATES / $SUBJECT_RELATIONS
构图地图：$CAMERA / $SHOT / $FOCAL_AREA / $TEXT_ZONE / $LAYOUT_MAP / $READING_ORDER
可见文字白名单：$VISIBLE_TEXT_WHITELIST（无字则为 `NO TEXT`）
页面外禁止带入：$OUT_OF_SCOPE

请按 JSON 格式回答，不要包含其他文字：
{
  "all_entities_present": true/false,
  "missing_entities": ["...", "..."],
  "subject_relations_correct": true/false,
  "page_goal_completed": true/false,
  "visible_text_exact": true/false,
  "extra_text_observed": ["..."],
  "text_readability": "high" | "medium" | "low" | "not_applicable",
  "composition_matches": true/false,
  "out_of_scope_content_present": true/false,
  "relevance_score": "high" | "medium" | "low",
  "has_forbidden_content": true/false,
  "forbidden_notes": "文字/水印/低俗等问题，如无则空字符串",
  "overall_pass": true/false,
  "sharper_prompt_hint": "如不通过，给出更具体的 prompt 建议"
}
```

### 步骤 3：Agent 作出质量判断

`analyze_image` 是独立能力。Agent 根据其返回的可见内容分析决定接受、修订或失败，并维护只含业务质量观察的 `quality_review`；不得把分析结果视为生成 API 的字段。

判断时逐项检查 `required_entities`、章节相关性、文字准确性、构图和合规。全部满足时标记 `quality_status=passed`；存在可修订问题时标记 `retry_needed`；达到创作重试上限后标记 `failed`。任何调用诊断、路由信息或原始响应都不写入 `images.json`。

### 步骤 4：失败重试

- **第一次失败**：根据可见缺失和构图问题重写 prompt，加 "MUST CONTAIN" 强调
- **第二次失败**：进一步锐化（加入材质、颜色、方位、数量等具体描述）
- **第三次仍失败**：标记 `quality_status=failed`，记录所有尝试，继续后续 slot

### 步骤 5：锐化 prompt 的具体技巧

| 问题 | 锐化技巧 |
|------|----------|
| 实体缺失 | 在 prompt 开头加 "MUST CONTAIN: " + 实体名，加材质/颜色/数量 |
| 实体错误（出现了不该出现的） | 加 "NO <错误实体>" 排除
| 构图错误 | 加具体方位描述（"主体居左三分线"） |
| 风格漂移 | 加强 ref_image_path 描述（"match the warm earth tone of the reference image"） |
| 主体不突出 | 加 "MAIN SUBJECT: " 前缀，明确唯一焦点 |

---

## 单独调用 analyze_image

需要分析时始终单独调用 `analyze_image`：

```
analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  project_id=$PROJECT_ID,
  file_path=output/img_01.png,
  prompt=<步骤 2 的校验 prompt>
)
```

Agent 只读取分析中与可见主体、文字、构图和合规有关的内容，并据此作出质量判断。无法可靠判断时记录保守结论；不得把调用诊断或原始响应写入 `images.json`。

---

## images.json 审计模板

```json
[
  {
    "index": 1,
    "slot_id": "section_opener",
    "section_index": 1,
    "image_type": "content",
    "chapter_title": "身体的智慧",
    "composition_type": "三分法",
    "visual_brief": "一颗石头路上的裂缝中钻出嫩绿新芽，背景是虚化的晨光。",
    "required_entities": [
      "stone path with visible crack",
      "tender green shoots emerging from crack",
      "soft blurred morning light in background"
    ],
    "must_match_excerpts": [
      "他说，'你看这条石板路的缝里，不也长出了新芽？'"
    ],
    "prompt": "Final prompt used",
    "quality_review": {
      "visible_subjects": ["stone path", "green shoot"],
      "text_observations": [],
      "composition_observations": ["主体位于右侧三分线"],
      "compliance_observations": []
    },
    "ref_image_path": "output/cover.png",
    "file_path": "output/img_01.png",
    "url": "https://cdn.example.com/img_01.png",
    "quality_status": "passed"
  }
]
```

字段说明：
- `quality_review`：由 Agent 根据独立 `analyze_image` 的可见内容分析维护，只含主体、文字、构图和合规观察。

### 质量状态

- `passed`：所有 required_entities 出现、内容与章节一致且无禁止内容
- `retry_needed`：校验失败但仍在重试中
- `failed`：3 次重试仍不通过，必须继续后续 slot，并在最终报告中标注
- `skipped`：模板规则下该 slot 不需要图（如 footer 仅 module 无图）

### 审计规则

- 每条必须有 `slot_id` + `section_index`，与 `visual-rhythm-plan.md` 对应
- `quality_review` 必须只含可见内容质量观察
- `quality_status=failed` 的图片，最终报告中必须列出
- `$CONTENT_STYLE_REFERENCE_PATH` 非空时，`ref_image_path` 必须与其相等；为空时必须省略 `ref_image_path`
- `prompt_source_excerpt` 已升级为 `must_match_excerpts`（list，允许多条）

---

## 常见失败模式与修复

| 模式 | 现象 | 修复 |
|------|------|------|
| 内容审核持续无法确认实体 | 图片细节或实体描述不够明确 | 检查实体描述是否具体（"green shoots" vs "3cm tall bright green plant"），用更可识别的描述 |
| Prompt 过载 | 一次塞太多元素 | 砍掉非必要元素，只保留 3-5 个最关键 required_entities |
| 风格被 ref 拉偏 | 所有图都长得像封面 | 加强 prompt 中的主体描述权重，开头说 "MAIN SUBJECT: <具体物体>" |
| 正文图复刻封面主体 | ref_image_path 被误当成内容来源 | 明确写入"ref_image_path 只传递\"风格语言\"，不得复刻封面主体"，并把章节 required_entities 放在 prompt 开头 |
| 连续 3 张同质化 | 主体/构图/色调重心重复 | 回到 image-plan.md 重分配主体类型、composition_type 或远近景 |
| 构图不符合 composition_type | 指定三分法但生成居中 | 加具体方位词："subject placed at the right-third intersection, NOT centered" |
| 重试 3 次仍失败 | 通常 prompt 本身有问题 | 回到 image-plan.md 重新审视 visual_brief 是否合理 |
