# Public Account Evidence And Fallback

Analyze only public account pages or samples explicitly provided for this project. The goal is evidence-supported account context, not a general competitor report.

## Evidence Mapping

| Public evidence observed | Profile dimension |
| --- | --- |
| Account bio, pinned description, recurring topics | `identity` and `platforms` |
| Public titles, examples, visual presentation, repeated phrases | `identity` and `style` |
| User-provided audience notes or public interaction examples | `audience` |
| Differences among supplied samples | `memory`, only as a provisional reusable observation |

Public samples may support topic and style observations. They do not establish private audience demographics, commercial deals, undisclosed account ownership, or causal performance claims.

## Fallback Order

1. Inspect only the public page through an official public-browsing capability available in the managed runtime. Do not build a scraper or issue direct HTTP requests from a Skill or Agent.
2. If the page cannot be accessed, requires login, is empty, or does not expose useful material, record the platform and limitation in `analysis_limits` and add a specific follow-up requesting titles, sample links, or a short description.
3. Use user answers and supplied samples as the primary evidence. If they support a tentative pattern, label it `[推断待确认]` and state which evidence led to it.
4. If evidence remains insufficient, mark the field `[待补充]`. Do not retry through a private session, alternate identity, or unrelated data source.

## Source Labels

- `[用户确认]`: a direct answer, account name, link, or sample explicitly supplied by the user.
- `[链接分析]`: an observation that can be pointed to in accessible public material or a supplied sample.
- `[推断待确认]`: a tentative interpretation grounded in the cited evidence, never a verified fact.
- `[待补充]`: information not provided or unavailable from public evidence.

Keep evidence close to its dimension. If two sources conflict, retain both with a limitation instead of choosing one without evidence. Do not invent follower counts, engagement rates, posting cadence, audience characteristics, or platform algorithm claims.
