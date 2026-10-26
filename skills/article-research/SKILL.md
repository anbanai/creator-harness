---
name: article-research
description: Use when researching WeChat topics, selecting from a topic pool, checking historical duplication, scoring topic candidates, or generating article outlines.
---

# 微信公众号选题分析


## Intent Routing

Use this Skill for topic source selection, duplicate checks, candidate generation, candidate scoring, Top 1 choice, and outline creation. Topic research and outline writing happen inside the Skill; MCP is used only for controlled discovery such as topic pool, history, and profile. Task lifecycle and progress are owned by the top-level Agent; this Skill only consumes the current stage context and writes its research artifacts.

## Discovery First

1. Read the user prompt and decide whether a concrete topic or current-hot-topic intent was specified. Phrases such as “今天有什么热点” or “当前热搜” are trend-discovery intent, not a concrete article topic.
2. Call `get_project_profile(project_id, scope="wechat", task_id?)` for positioning, keywords, audience, writer, theme, and task overrides.
3. For current-hot-topic intent, invoke `trending-topics` immediately after profile resolution so the request always reaches `list_trends`; do not let a non-empty topic pool suppress that call. Use the pool as fallback or an additional candidate source. For ordinary topic discovery without a specified topic, call `claim_topic(project_id, task_id?)` first.
4. Always call `list_project_titles(project_id)`, `list_drafts(project_id)`, and `list_published_articles(project_id)` before finalizing a title or outline. For each WeChat history response, inspect `history_available`: `true` means `items` is authoritative, including a successful empty result; `false` means history could not be queried and `items` must not be treated as empty history.
5. Build a topic-history set from recorded task titles, drafts, and published articles. Compare the underlying reader problem and article angle, not title wording alone; use [recent-topic-deduplication.md](references/recent-topic-deduplication.md) for time windows and the MCP history contract.
6. When there is no user-specified topic and the claimed pool is empty, use `trending-topics` as an optional public-hot-topic source after the pool and history checks. Do not let a trend replace an explicit user topic or a non-empty claimed pool item, except that current-hot-topic intent must still query trends as described above.
7. For a trend candidate that may be selected, invoke `trend-rider`, then `topic-evaluator` before finalizing the topic. `article-viral-strategy` remains responsible for post-selection propagation strategy.

8. For ordinary factual background research, call the Server MCP tool `search_web` when current public web evidence is needed. The tool is Server-configured and execution-scoped; do not choose a provider or pass credentials. `list_trends` remains the only source for public trend ranking and freshness.
9. When a search result must be verified or its full source text is needed, call `fetch_web_page` with that result URL. Keep the returned title, URL, Markdown content, provider request ID, and fetched time in the research evidence.

## Configuration Boundaries

- A user-specified topic wins over the pool and must not consume the pool again.
- A non-empty topic pool wins over Skill-generated candidates.
- Project keywords guide candidate generation but are not themselves a topic.
- Treat confirmed long-term positioning and explicit red lines as constraints. Treat ordinary topic or format preferences as ranking signals, never exclusion filters; a first-batch or campaign direction applies only within its stated scope and must be reconsidered at its completion or review condition.
- History tools are the source of truth for duplication checks.
- A selected WeChat topic must be recorded to the current task with `finalize_task_title(task_id, title, topic, angle)` as soon as its working title is chosen, before drafting the outline. This makes completed-but-unpublished work and its semantic selection visible to later executions. If the final article title changes later, update the title while passing the same topic and angle before delivery.
- A duplicate-title rejection requires a materially different topic or reader problem; do not evade it by paraphrasing the title. Treat non-duplicate persistence errors as a failed required capability, not as an empty history result.
- `list_trends` is the only public trend source. If it is unavailable, continue the existing candidate-generation and history-based fallback and record the exact failure; never invent heat, freshness, or source evidence.
- `search_web` and `fetch_web_page` are the only general public web sources for this Skill. Never fetch search pages directly, call a third-party search API, or write a custom HTTP client. Preserve each returned URL, domain, citation ID, fetched time, and any missing publication/freshness field in the research evidence.
- If `search_web` returns `provider_unavailable`, continue with the existing conservative fallback and record the exact error and missing external evidence.
- The Skill chooses structure and scoring rubric itself; do not delegate creative judgment to a generation MCP endpoint.

## Output Contract

JSON evidence produced by this Skill, when applicable, uses `schema_version`, a finite `status` (`ready`, `warning`, `blocked`, `failed`, or `skipped`), `source`, `data_at`, `missing`, and `evidence_paths`. If a required discovery call cannot be completed, the owning Agent writes the shared `output/failure-state.json` recovery shape with `version`, `status`, `stage`, `error_code`, `message`, and `resume_from`.

Write these file-backed artifacts:

1. `output/01-research.md` with:
   - topic source: user prompt / claimed pool item / Skill-generated candidate;
   - history sources queried, returned titles and counts, exclusion list, and whether records include `topic`, `angle`, and `topic_locked_at`; distinguish unavailable history from a successfully returned empty history;
   - candidates, angles, audience fit, freshness, risk, and score;
   - when trends were used: MCP source/platform, `fetched_at`, `expires_at`, `stale`, `source`, and `last_error` for each selected candidate;
   - trend-rider relevance, lifecycle, borrowing judgment, and proposed angles;
   - topic-evaluator seven-dimension scores, evidence, and final decision reason;
   - when trends were unavailable: `list_trends` failure and the fallback reason;
   - final Top 1 topic and reason.
2. `output/02-outline.md` with:
   - final title;
   - hook;
   - `##` sections;
   - each section's claim, context anchor, supporting material, and reader takeaway;
   - CTA / ending direction;
   - SEO seed keywords.
3. `output/context-brief.md` when the caller has not already created one, containing original user need, project positioning, historical avoidance, chosen topic reason, and section anchors.

The research record must state the `finalize_task_title` result, including selected title, topic, and angle. Apply the Server's exact 30-day duplicate guard and the Skill's 31-90 day semantic review; never claim a temporal check when history lacks reliable timestamps.

## Candidate And Outline Protocol

When the pool is empty, generate 5-10 candidates directly from project positioning, user intent, keywords, and historical gaps. If public trends are available, `trending-topics` may add candidates, but it must not replace this baseline. For a selected trend candidate, run `trend-rider` and then `topic-evaluator` before choosing it. Score each candidate on:

- audience fit;
- novelty against historical titles;
- usefulness or emotional resonance;
- concrete writing material available;
- compliance and overclaiming risk;
- title potential.

Pick the highest-scoring non-duplicate candidate. If all candidates collide with history, generate a second batch with a narrower angle or a different reader problem.

For trend candidates, preserve the distinction between real MCP fields and local judgment: `fresh`/`stale` comes from the returned trend record, while relevance, lifecycle, and borrowing angles come from `trend-rider`. A stale snapshot may inform a long-tail angle but must not be presented as a current hot topic.

Outline templates are chosen internally:

| Template | Use When |
|---|---|
| authoritative | analysis, judgment, expert explanation |
| comparison | choices, products, methods, tradeoffs |
| cultural | story, history, people, values |
| practical | tutorial, checklist, step-by-step action |

## Failure Handling

- `claim_topic` returns an item but it duplicates history: keep the claimed topic, adjust the wording/angle, and record the change in `output/01-research.md`.
- A history response with `history_available=false` is an explicit unavailable result, not an empty history and not an MCP call failure. Record the returned note and unavailable source in `output/01-research.md`; continue using `list_project_titles`, the user request, and other available evidence, choose a conservative topic, and state that draft/published history could not be checked. Do not claim duplicate-free history or invent titles.
- If a history MCP call itself returns an error or cannot be completed, write the owning Agent's structured failure state and stop before topic selection. Do not convert transport, authorization, or other API failures into an empty list.
- Candidate confidence is low: choose the least risky topic and add a "low confidence" note instead of blocking the whole task.
- Outline lacks concrete anchors: return to research notes and add supporting material before writing `output/02-outline.md`.

## 深入参考

- 大纲模板：[outline-templates.md](references/outline-templates.md)
