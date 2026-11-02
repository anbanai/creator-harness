---
name: redfox-research
description: Use when research needs RedFox read-only data for cross-platform hot topics, WeChat article search, Xiaohongshu popular notes, or Douyin search and daily rankings. Never use for publishing, account actions, downloads, subscriptions, payments, or destructive operations.
---

# RedFox research

Use RedFox only as a read-only research source. The runtime may provide
`REDFOX_API_KEY`; never print it, write it to an artifact, include it in a
prompt, or pass it as a command-line argument. If the key is absent or the
source is unavailable, record the failure and use the owning research Skill's
documented fallback. Do not invent heat, engagement, freshness, authors, or
article metadata.

## Supported research modes

- **Cross-platform hot topics**: aggregate the RedFox `trending-hub-top10`
  source across the supported public platforms.
- **WeChat search**: search public WeChat articles for a concrete keyword and
  preserve the returned title, author, metrics, date, and URL when present.
- **Xiaohongshu search**: search popular public notes for a concrete keyword
  and preserve the returned note and interaction fields only when returned.
- **Douyin search and daily ranking**: search public works or read a daily
  ranking for the requested date and preserve the returned platform fields.

The upstream RedFox repository is the method reference:
`https://github.com/redfox-data/redfox-community`. Use its read-only query
scripts only when the runtime image explicitly includes the corresponding
adapter. Do not copy upstream payment, subscription, downloader, account,
comment, like, publish, or browser automation workflows.

The locked upstream paths and revision are recorded in
[references/upstream.md](references/upstream.md). Load that reference when a
mode-specific adapter or provenance statement is needed.

## Evidence contract

Every RedFox result consumed by a research workflow must be represented in the
owning output artifact with:

```text
schema_version=1.0
data_source=redfox
query=<redacted query parameters without credentials>
fetched_at=<UTC timestamp>
freshness=fresh|stale|unknown
source_url=<returned URL or unknown>
missing_fields=<comma-separated fields or none>
fallback_reason=<none or stable reason>
```

Keep the provider's original ranking and heat fields separate from local
relevance, lifecycle, or topic-fit judgments. A RedFox ranking is evidence of
the returned snapshot, not a promise of reach or platform algorithm behavior.

## Failure and safety rules

- A missing key, authentication error, timeout, quota error, malformed
  response, or empty result is a source failure; preserve the reason without
  exposing the secret.
- Retry a transient transport failure at most once. Do not retry credential,
  parameter, quota, or policy errors by changing the query.
- Do not create an HTML report outside the Pack `output/` contract.
- Do not call external APIs from a Skill script unless the runtime adapter has
  explicitly registered that capability; ordinary Agent workflows must use
  the available MCP capability or the approved runtime adapter.
- The owning Agent decides whether to continue with a conservative fallback;
  this Skill never changes task state, billing, profiles, prompts, or publish
  state.
