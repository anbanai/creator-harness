---
name: content-writing
description: Use when writing WeChat article body content, de-AI rewriting, content quality review, compliance review, or when an article pipeline reaches article body creation.
---

# 微信公众号内容写作知识库


## 案例库

遇到场景分支、产物格式或质量边界不确定时，先读 [references/examples.md](references/examples.md)。

## Intent Routing

Use this Skill for正文创作、正文质量修订、公众号文章预检和渲染交接。正文、写作判断和质量门禁在 Skill 内完成；MCP 只用于项目资料、writer/resource discovery、确定性渲染和任务状态等受控能力。

## Discovery First

Before writing, read only the minimum necessary context:

1. `output/context-brief.md` and `output/02-outline.md`.
2. `get_project_profile(project_id, scope="article", task_id?)` for positioning, keywords, audience, writer, theme, and task overrides.
3. `list_resources(category="writers")` to confirm the writer key exists.
4. `get_resource(category="writers", name="$WRITER", include_raw=true)` for writer metadata, tone rules, structure patterns, title formulas, and raw YAML.
5. When rendering handoff is needed, use `list_resources(category="article_templates")`, `get_resource(category="article_templates", ...)`, `list_resources(category="layouts")`, and `get_resource(category="layouts", ...)` only for the selected template/modules.

## Configuration Boundaries

- writer controls voice, paragraph rhythm, title formula, rhetoric, and banned expressions.
- visual_style controls image language; theme controls WeChat HTML styling; article_templates and layouts control slot rhythm and modules.
- Do not infer writer from visual style, theme, image model, or supplier defaults.
- Do not insert image placeholders during body writing; visual planning owns image slots.
- `render_template` is the 主路径 for HTML. `convert_markdown` 只用于旧版 server 兼容降级, and the fallback reason must be recorded in `output/final-review.md`.

## Output Contract

Write these file-backed artifacts:

1. `output/03-article.md`: complete Markdown article body generated directly from writer resource, `context-brief.md`, and `02-outline.md`.
2. `output/04-article-final.md`: de-AI and compliance-adjusted final Markdown after the humanizer draft -> audit -> final loop.
3. `output/content-quality-report.md`: article preflight report with every item passed or adjusted.

The article must satisfy:

- each `##` section uses at least one anchor from `context-brief.md`;
- each section contains concrete material: scenario, case, data, person, conflict, metaphor, or actionable detail;
- first 100 Chinese characters contain a real hook, not generic opening filler;
- subtitles are scannable, paragraphs are mobile-friendly, and claims are supported by context;
- the ending gives a concrete action or one answerable question without forbidden engagement bait.

## 公众号文章预检

文章预检 is owned by this Skill and does not depend on MCP validation. 审阅未通过 means the draft needs adjustment, not task failure. Automatically revise and rerun until no item is marked 待调整.

Required checks:

- 导流风险: no QR codes, personal contact, external URL, mini-program jumps, other account/service/video-account jumps, group joining, WeChat adding, reward-bound follow/like/comment/share, keyword reply, or multi-hop transaction diversion.
- 内容完整性: readers can get the promised information inside this article without being pushed elsewhere.
- 标题摘要一致性: title, digest, opening, and body promises align; do not hide key information with ellipsis or vague suspense.
- 互动合规: natural questions and collection/share suggestions are allowed only when tied to article value; no benefits, materials, contact, or off-platform action can be bound to interaction.
- AI 套话风险: remove generic elevation, rigid three-part summaries, empty conclusions, overused transition words, and unsupported judgment sentences.
- 自动调整: revise the affected paragraph, title, digest, or ending, then rerun the preflight.

Report format:

```text
公众号文章预检：
- 导流风险：通过 / 已调整（说明）
- 内容完整性：通过 / 已调整（说明）
- 标题摘要一致性：通过 / 已调整（说明）
- 互动合规：通过 / 已调整（说明）
- AI 套话风险：通过 / 已调整（说明）
结论：无审阅未通过项，可以进入 SEO 与视觉阶段。
```

## Failure Handling

- Missing writer resource: use project default only if `get_project_profile` provides one; otherwise stop with a clear missing-resource note.
- Missing outline or context brief: create the smallest safe placeholder from available project profile and user prompt, then record the gap in `content-quality-report.md`.
- Preflight failure: revise content in place and rerun. Do not pass downstream while any item remains 待调整.
- Render handoff failure: keep Markdown artifacts, record the reason, and let the article agent decide whether to retry `render_template` or use the documented fallback.

## 深入参考

- 写作方法与示例：[writing-guide.md](references/writing-guide.md)
- 内容合规规则：[content-compliance.md](references/content-compliance.md)
- 违禁词：[prohibited-words.md](references/prohibited-words.md)

## Reference Map

Load these long references only when the current task needs that detail:
- [references/html-guide.md](references/html-guide.md) - html guide.
