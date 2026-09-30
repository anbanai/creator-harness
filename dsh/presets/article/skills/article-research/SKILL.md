---
name: article-research
description: Use when researching WeChat topics, selecting from a topic pool, checking historical duplication, scoring topic candidates, or generating article outlines.
---

# 微信公众号选题分析


## Intent Routing

Use this Skill for topic source selection, duplicate checks, candidate generation, candidate scoring, Top 1 choice, and outline creation. Topic research and outline writing happen inside the Skill; MCP is used only for controlled discovery such as topic pool, history, and profile. Task lifecycle and progress are owned by the top-level Agent; this Skill only consumes the current stage context and writes its research artifacts.

## Discovery First

1. Read the user prompt and decide whether a concrete topic or current-hot-topic intent was specified. Phrases such as “今天有什么热点” or “当前热搜” are trend-discovery intent, not a concrete article topic.
2. Call `get_project_profile(project_id, scope="article", task_id?)` for positioning, keywords, audience, writer, theme, and task overrides.
3. For current-hot-topic intent, invoke `trending-topics` immediately after profile resolution so the request always reaches `list_trends`; do not let a non-empty topic pool suppress that call. Use the pool as fallback or an additional candidate source. For ordinary topic discovery without a specified topic, call `claim_topic(project_id, task_id?)` first.
4. Always call `list_project_titles(project_id)`, `list_drafts(project_id)`, and `list_published_articles(project_id)` before finalizing a title or outline.
5. Build an exclusion list from existing titles, draft titles, published titles, and close keyword variants.
6. When there is no user-specified topic and the claimed pool is empty, use `trending-topics` as an optional public-hot-topic source after the pool and history checks. Do not let a trend replace an explicit user topic or a non-empty claimed pool item, except that current-hot-topic intent must still query trends as described above.
7. For a trend candidate that may be selected, invoke `trend-rider`, then `topic-evaluator` before finalizing the topic. `article-viral-strategy` remains responsible for post-selection propagation strategy.

## Configuration Boundaries

- A user-specified topic wins over the pool and must not consume the pool again.
- A non-empty topic pool wins over Skill-generated candidates.
- Project keywords guide candidate generation but are not themselves a topic.
- History tools are the source of truth for duplication checks.
- `list_trends` is the only public trend source. If it is unavailable, continue the existing candidate-generation and history-based fallback and record the exact failure; never invent heat, freshness, or source evidence.
- The Skill chooses structure and scoring rubric itself; do not delegate creative judgment to a generation MCP endpoint.

## Output Contract

JSON evidence produced by this Skill, when applicable, uses `schema_version`, a finite `status` (`ready`, `warning`, `blocked`, `failed`, or `skipped`), `source`, `data_at`, `missing`, and `evidence_paths`. If a required discovery call cannot be completed, the owning Agent writes the shared `output/failure-state.json` recovery shape with `version`, `status`, `stage`, `error_code`, `message`, and `resume_from`.

Write these file-backed artifacts:

1. `output/01-research.md` with:
   - topic source: user prompt / claimed pool item / Skill-generated candidate;
   - existing titles and exclusion list;
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
- History tools fail: record the failure and continue with an explicit risk note.
- Candidate confidence is low: choose the least risky topic and add a "low confidence" note instead of blocking the whole task.
- Outline lacks concrete anchors: return to research notes and add supporting material before writing `output/02-outline.md`.

## 深入参考

- 大纲模板：[outline-templates.md](references/outline-templates.md)
