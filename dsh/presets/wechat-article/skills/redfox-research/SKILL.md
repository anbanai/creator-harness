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

- **Cross-platform hot topics**: aggregate `trending-hub-top10` across supported public platforms.
- **WeChat search**: query public articles; retain returned title, author, metrics, date and URL.
- **Xiaohongshu search**: query popular public notes; retain only returned note and interaction fields.
- **Douyin search/rankings**: query public works or daily rankings for the requested date; retain returned fields.

Method reference: `https://github.com/redfox-data/redfox-community`. Use upstream
read-only query scripts only through an adapter explicitly included in the
runtime. Never copy payment, subscription, downloader, account, comment, like,
publish or browser automation workflows. Load [references/upstream.md](references/upstream.md)
for mode-specific adapters or provenance; it records locked paths and revision.

## Evidence contract

Record each consumed result in the owning output artifact:

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
