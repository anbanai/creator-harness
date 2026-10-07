# 公众号贴图 Prompt Blueprint

## Contents

- [这份参考解决什么问题](#这份参考解决什么问题)
- [何时读取与交付边界](#何时读取与交付边界)
- [图片参数与顺序](#图片参数与顺序)
- [页面职责默认值](#页面职责默认值)
- [文字契约](#文字契约)
- [构图地图与信息绑定](#构图地图与信息绑定)
- [视觉证据、系列锚点与变化](#视觉证据系列锚点与变化)
- [最终 prompt 骨架](#最终-prompt-骨架)
- [`image-plan.md` 建议字段](#image-planmd-建议字段)
- [逐页审核 prompt](#逐页审核-prompt)
- [生成前检查](#生成前检查)

## 这份参考解决什么问题

公众号贴图（小绿书）不是把一篇文章裁成多张海报，也不是把封面 prompt 复制到所有图片。它是一组按视觉顺序阅读的移动端页面：封面负责停留和承诺，内容页负责一次讲清一个信息块，最后一页（如果规划了）负责收束已经讲过的结论。

工业级 prompt 的价值在于把每一页的阅读任务、文字版式、视觉证据和跨页关系写成可审核的合同。每张图都至少要有以下九个槽位：

1. **页面契约**：`cover`、`content` 或 `summary`，序号、总页数、公众号贴图场景和有效比例。
2. **阅读任务**：读者看完本页要理解、比较、执行或记住什么；一页只设一个主要任务。
3. **文字契约**：逐字可见的中文白名单、层级、阅读顺序和文字安全区；没有计划文字就明确 `NO TEXT`。
4. **信息范围**：本页允许使用的事实、信息点和来源；不得把下一页或 caption 的内容偷渡进画面。
5. **视觉证据**：具体对象、状态、动作和对象关系；抽象“高级感”不算实体。
6. **构图地图**：镜头、景别、焦点、文字区、卡片/流程/对比布局、留白和扫视路径。
7. **艺术导演**：媒介、表面、色板、字体/图标/批注语言、光线和材质。
8. **系列连续性**：共享的品牌锚点，以及本页必须变化的场景、焦点、视角或信息结构。
9. **负面约束与验收**：额外文字、无关对象、伪事实、导流视觉、裁切风险和可观察的通过条件。

提示词不需要为了“像工业模板”变得冗长。缺一个可观察关系，通常比少写一串氛围词更容易让页面失效。

## 何时读取与交付边界

在写 `output/image-plan.md` 时为封面和每一张内容图填槽位；在写 `output/image-prompts.md` 和调用图像能力前按本文件编译最终 prompt；生成后用同一页的字段构建 `analyze_image` 审核 prompt。

本 Skill 只负责编排、生成和审核图片文件。`output/publish-package.json` 只记录 `cover_path`、按视觉顺序的 `image_paths` 和纯文本 `content`；永久素材上传、newspic 草稿和发布状态由 Server finalizer 决定。不要在 prompt 或图片中声称草稿已创建。

## 图片参数与顺序

先调用：

```text
get_project_profile(project_id=$PROJECT_ID, scope="wechat", task_id=$TASK_ID)
```

读取 `resolved_profile.image_ratio`、`resolved_profile.allowed_image_ratios`、`resolved_profile.visual_style` 和可用参考路径：

- `image_ratio != "auto"` 是用户明确比例，封面和每张内容图都原样使用 `$EFFECTIVE_ASPECT_RATIO`。
- `image_ratio == "auto"` 才能从 `allowed_image_ratios` 选择；公众号贴图在能力允许时可偏好 `3:4` 或 `1:1` 的移动端画布，但不能覆盖用户明确比例。
- prompt 中和 `generate_image` 参数中都要明确最终比例；不能用图片存在或后续隐式裁剪代替比例合同。
- `cover.png` 是独立封面；`image_01.png` 起只放后续图片。总数为 1–20 张，最终 `image_paths` 不重复列出封面。
- 先按 `image-plan.md` 的视觉顺序生成、审核和记录，再写 `publish-package.json`。单张失败最多 3 次生成尝试；耗尽后保留诊断并把交付状态置为 `blocked`。

如果项目风格参考图存在，先分析为文字锚点；只有承担本页主体身份且确实相关的任务附件才传入生成。参考图不能替代当前页的 `required_entities`，也不能让所有页面复刻同一个主体。

## 页面职责默认值

这些是可调整的默认值，用户或任务规划优先：

### 封面 `cover`

- **任务**：在信息流缩略图中给出一个真实、具体的点击理由，并建立整组视觉锚点。
- **信息量**：主标题/短钩子最多一个主层级，必要时一个短辅助标签；完整解释留在内容页或 caption。
- **画面**：一个主焦点，主体和文字不互相遮挡；中心区域和四周裁切都要安全。
- **禁止**：只靠空泛风景、通用桌面、无关人物或大段正文制造“高级感”。

### 内容页 `content`

- **任务**：让读者完成一个理解动作，例如按步骤判断、比较两类对象、看懂一个过程或保存一条方法。
- **信息量**：通常 1–4 个信息点；每条文字都绑定一个主体、状态、图标或对比关系。
- **画面**：先确定卡片/流程/双栏/标注图解的布局，再决定装饰；不要用一张物件合照代替信息结构。
- **禁止**：重复封面钩子、跨页结论、未经正文支持的数字和功效承诺。

### 收束页 `summary`

- **任务**：复述已出现的行动清单或结论，或按任务明确要求完成温和收束。
- **画面**：只使用已出现的实体和短句；不新增事实、价格、联系方式或外部导流。
- **禁止**：把 caption、关注话术或评论诱导自动变成图片文字，除非已列入白名单且任务明确要求。

## 文字契约

图片模型对多行中文的逐字稳定性有限，所以文字必须像数据字段一样写：

- `visible_text_whitelist` 按最终阅读顺序逐条记录完整文案，用全角引号「」包裹；不得改字、换标点、同义改写或自动添加标题/页码。
- `text_policy` 明确 `NO TEXT`、`short_labels` 或 `information_layout`。若是 `NO TEXT`，不得出现任何可读字形、英文、拼音、数字、书页字、logo 或伪词。
- 记录 `text_hierarchy`（主标题/标签/正文短句）和 `text_zone`；写清卡片边距、主体避让、对比背景和阅读顺序。
- 圆形徽章、箭头标签、页码或图标中的汉字也属于可见文字，必须单独列入白名单；prompt 的 `1.`、`2.` 等元编号不是画面文字。
- “模糊印章”只能是不可辨识的形状或色块，不能生成伪汉字。
- 标题、内容页文字和 caption 分工不同；不把完整 caption 或下一页文案塞进当前页。
- 任意二维码、联系方式、外链 URL、扫码提示、加群、加微信、关注领资料、回复关键词和虚构平台标识都判为失败。

没有独立叠字工具时，生成后必须用 `analyze_image` 逐字检查；文字错误、顺序错误、遮挡或缩略图不可读时按可见问题重试，不能仅凭 prompt 把它标记为 ready。

## 构图地图与信息绑定

每页写清下列相对关系：

| 字段 | 要回答的问题 |
| --- | --- |
| `camera` | 俯拍、平视、三分之四视角、侧面还是局部微距？ |
| `shot` | 环境中景、桌面中景、物件组、人物动作还是细节特写？ |
| `focal_area` | 第一视觉焦点是什么，位于哪个区域？ |
| `text_zone` | 文字落在哪个连续干净区域，主体避让哪里？ |
| `layout_map` | 单焦点、纵向卡片、对比双栏、时间流程、标注或网格如何排列？ |
| `negative_space` | 哪些边缘和卡片间距保持留白，避免裁切和拥挤？ |
| `reading_order` | 读者先看标题、主体、步骤还是左右对比？ |
| `entity_binding` | 每条信息点对应哪个对象、状态、动作或图标？ |

“三行清单”“双栏对比”“步骤流程”都不是完整构图说明：必须点名每一行/每一栏/每个节点表示什么，以及信息块之间的方向关系。

## 视觉证据、系列锚点与变化

把主题拆成能被审核的事实：

- `page_scope`：本页唯一允许使用的标题/信息点/事实范围。
- `visual_brief`：1–2 句陌生设计师可以直接画出的白话场景。
- `required_entities`：可直接观察的具体物体、人物、图标或状态，不写“氛围”。
- `subject_states`：开合、数量、颜色、损坏、温度、进行中/已完成等可见状态。
- `subject_relations`：对象与信息点的对应、动作因果、左右对比或前后步骤。
- `must_match_excerpts`：支撑本页事实的原文句子或内容脚本句子；缺证据时标记不确定，不自行补写。
- `series_anchors`：整组共享的 3–5 个媒介、表面、色彩、线条/图标和光线锚点。
- `page_variation`：本页相对上一页必须变化的主体、场景、景别、视角、信息结构或色彩重心。

连续三张不能只是同一桌面换标题。封面若是茶罐，内容页可以用开盖检查、气味动作或收纳关系；只有当页面事实确实需要时才再次出现茶罐，并改变它在信息结构中的角色。

## 最终 prompt 骨架

空字段删除，不要填“无”：

```text
页面契约：这是公众号贴图的第 {SEQUENCE}/{TOTAL} 张，页面类型为 {PAGE_ROLE}，页面目标是 {PAGE_GOAL}。最终画布比例严格为 {EFFECTIVE_ASPECT_RATIO}，面向手机阅读。

文字契约：{TEXT_POLICY}。可见文字白名单（按最终阅读顺序逐字）：{VISIBLE_TEXT_WHITELIST}。文字层级为 {TEXT_HIERARCHY}，文字安全区为 {TEXT_ZONE}；不得出现白名单之外的任何文字、字母、拼音、数字、伪词、水印、logo 或导流元素。

页面范围：只表达 {PAGE_SCOPE}。不得带入 {OUT_OF_SCOPE}。

构图地图：{CAMERA}，{SHOT}；第一焦点是 {FOCAL_AREA}；{LAYOUT_MAP}；保留 {NEGATIVE_SPACE}；阅读顺序为 {READING_ORDER}；信息绑定为 {ENTITY_BINDING}。

视觉证据：{VISUAL_BRIEF}
MUST CONTAIN:
{REQUIRED_ENTITIES}
主体状态：{SUBJECT_STATES}。
主体关系：{SUBJECT_RELATIONS}。

艺术指导：主媒介与表面为 {MEDIUM_SURFACE}；系列锚点为 {SERIES_ANCHORS}；本页变化为 {PAGE_VARIATION}；色彩为 {PALETTE}。
光线与材质：{LIGHTING}；重点表现 {MATERIAL_DETAILS}。

禁止项：{NEGATIVE_CONSTRAINTS}；不要把图片变成一张正文截图或模板化海报。
输出验收：{ACCEPTANCE_CRITERIA}；主体关系、文字和布局在缩略图中仍可读，生成后接受独立视觉审核。
```

## `image-plan.md` 建议字段

封面和每张后续图都独立填写，不要只写一段总 prompt：

```markdown
## cover.png / image_01.png
- sequence: 1
- total_images: 4
- page_role: cover | content | summary
- page_goal: {一个阅读动作}
- page_scope: {当前页允许使用的内容范围}
- title_hook: {仅封面需要}
- text_policy: NO TEXT | short_labels | information_layout
- visible_text_whitelist: [{按最终顺序逐字列出；无字写 NO TEXT}]
- text_hierarchy: {主标题/标签/正文短句的层级}
- camera: {镜头}
- shot: {景别}
- focal_area: {第一焦点与区域}
- text_zone: {文字安全区/主体保护区}
- layout_map: {卡片、流程、对比或单焦点布局}
- negative_space: {留白与裁切保护}
- reading_order: {扫描顺序}
- entity_binding: {信息点与主体/图标关系}
- visual_brief: {具体场景}
- required_entities: [{具体实体}]
- subject_states: [{可见状态}]
- subject_relations: [{关系}]
- must_match_excerpts: [{文案或内容脚本依据}]
- medium_surface: {媒介与表面}
- palette: {主色与强调色}
- lighting: {光线}
- material_details: {材质重点}
- series_anchors: {跨页共享锚点}
- page_variation: {本页变化}
- out_of_scope: [{不得出现的跨页内容}]
- negative_constraints: [{页面级禁止项}]
- acceptance_criteria: [{可观察通过条件}]
```

`image-prompts.md` 必须记录最终实际传给 `generate_image` 的 prompt、有效比例和参考图用途；`quality-review.md` 逐页记录可见实体、文字、构图、系列重复和合规结论。

## 逐页审核 prompt

生成后对同一页调用 `analyze_image`，审核 prompt 至少包含：

```text
这是公众号贴图第 {SEQUENCE}/{TOTAL} 张，页面类型 {PAGE_ROLE}，页面目标：{PAGE_GOAL}。
页面范围：{PAGE_SCOPE}
必须出现的实体：{REQUIRED_ENTITIES}
主体状态与关系：{SUBJECT_STATES} / {SUBJECT_RELATIONS}
构图地图：{CAMERA} / {SHOT} / {FOCAL_AREA} / {TEXT_ZONE} / {LAYOUT_MAP} / {READING_ORDER}
可见文字白名单：{VISIBLE_TEXT_WHITELIST}
不得带入：{OUT_OF_SCOPE}

只返回 JSON：
{
  "page_goal_completed": true,
  "all_entities_present": true,
  "missing_entities": [],
  "subject_states_correct": true,
  "subject_relations_correct": true,
  "visible_text_exact": true,
  "extra_text_observed": [],
  "text_readability": "high|medium|low|not_applicable",
  "layout_and_reading_order_ok": true,
  "safe_zone_ok": true,
  "out_of_scope_content_present": false,
  "series_duplication_issue": false,
  "forbidden_content": false,
  "overall_pass": true,
  "sharper_prompt_hint": ""
}
```

`overall_pass=true` 只能在页面目标、实体状态/关系、文字白名单、安全区、跨页范围和合规项全部通过时使用。审核不可用时写 warning，不伪造通过；可见问题最多按每张 3 次生成预算修订。

## 生成前检查

- 封面是否只有一个点击理由，内容页是否只有一个主要阅读任务？
- 每条图中文字是否逐字出现在白名单，并与信息点、位置和主体绑定？
- 每个主体是否有可见状态和关系，而不是孤立的物件名？
- 镜头、景别、焦点、文字安全区、布局地图和阅读顺序是否完整？
- 是否明确排除了下一页、caption、品牌伪字和未证实事实？
- 共享风格是否稳定，本页变化是否真实可见？
- prompt 和 `generate_image` 是否都传 `$EFFECTIVE_ASPECT_RATIO`？
- 失败或审核不可用时，`publish-package.json` 是否能正确保持 `blocked` 或 warning，而不是把本地文件当成 Server 发布证据？
