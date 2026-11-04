---
name: topic-radar
description: Use when a managed Topic Radar task must turn a Server-frozen snapshot into a source-attributed topic digest or short-video script artifact.
---

# Topic Radar Artifact Contract

Topic Radar is a file-backed transformation of a Server-frozen snapshot. The
Agent may research new material through search_web, fetch_web_page, and
list_search_receipts MCP capabilities for topic_digest; it never owns durable state. The Server validates and persists the result.

## Startup

1. Read the frozen input and confirm `task_id`, `execution_id`, `task_kind`,
   snapshot identity/hash, and the pre-created `output/` directory.
2. Check required evidence and explicitly record missing fields. Do not ask
   questions or substitute live defaults for frozen values.
3. Preserve frozen persona, strategy, subscription, and weights. For topic_digest,
   search using frozen interests, fetch promising pages, then call list_search_receipts
   with the current task identity. Copy new references from successful current-execution
   receipts as type search, ref_id equal to operation_id, and the exact result URL.
   Script tasks use only frozen sources; do not fabricate URLs, ranks, freshness, or
   engagement claims.

## Shared JSON envelope

Digest, script, and evidence JSON artifacts have `schema_version: "1.0"`, `task_id`, `execution_id`,
`kind`, `status`, `source: "topic-radar"`, `data_at`, `missing`, and
`quality_status`. Use `ready` only when required evidence and contract fields
are complete. Use `warning` for bounded partial quality, `data_insufficient`
when the snapshot cannot support the requested result, and `blocked` for an
unresolvable task or identity conflict. `quality_status` is ready, warning, or
blocked. Provider failures require failure-state and must never masquerade as empty success.

Each source reference is an object with `type`, `label`, `platform`, `ref_id`,
`title`, `url`, `rank`, `hot`, `fetched_at`, and `freshness` when supplied.
Omit absent fields; do not emit null or fill missing values from memory. Candidate-level `source_refs` must point to those exact records. New research
references require both receipt ID and exact URL; leave platform absent unless
the Server receipt provides it. Do not put provider metadata URLs into citations.

## Digest: `output/topic-digest.json`

The digest contains `generated_at` (RFC3339), `outcome` (candidates or
no_new_candidates), and a `suggestions` array. After successful current-execution
research, zero relevant/new candidates is valid: emit no_new_candidates with
suggestions [], status ready or warning, and explain the search coverage in evidence.
Each suggestion contains `title`, `introduction`, `source_summary`, `source_refs`,
`scores`, and `video_fit`. Use the frozen_context project/profile, subscription,
performance history, and missing_fields to assess relevance. Keep research
responses and limitations in output/topic-evidence.json; do not change frozen strategy.

Supply seven suitability scores from 0 to 1: `traffic_potential`, `account_fit`,
`differentiation`, `timeliness`, `monetization`, `production_cost`, and
`compliance_risk`. Higher is always better: production_cost measures production
ease (low cost), and compliance_risk measures safety (low risk). Unknown scores
must be omitted and listed in `missing`; the Server treats omitted dimensions as
zero without renormalizing. Never invent a metric to complete all dimensions.
The Server normalizes the full frozen weight vector once, then computes totals
and final rank without redistributing weights for missing scores; do not
emit score_total or award bonuses for external-source cross-platform counts.

Keep rationale in optional `output/topic-evidence.json`, repeating the envelope
and identifying each suggestion by title, claim, source refs, and limitations.
A suggestion requires a resolvable frozen source or a successful current-execution
receipt. Historical or foreign-execution receipts cannot authorize new sources.

## Script: `output/topic-script.json`

Script generation is independent from digest success. The script JSON contains
`title`, `hook`, `cta`, frozen `source_refs`, `target` (`platform`,
`duration_seconds`, `aspect_ratio`), and a nonempty ordered `scenes` array.
Every scene has positive integer `duration_seconds`, `voiceover`, and `visual`;
add stable `id`, `on_screen_text`, and copied `source_refs` when useful.
Scene durations accumulate in array order and must total the target duration.
Do not emit start/end seconds, visual_direction, or a selected_topic object.
Optional `output/topic-script.md` and `output/topic-script.srt` are mirrors of
the validated JSON and must not introduce unsourced claims.

## Failure and boundary rules

On missing or contradictory input, write `output/failure-state.json` with
`version`, `status`, `stage`, `error_code`, redacted `message`, and
`resume_from`; retain valid partial files. Never report a success based on a
log, a tool acknowledgement, or the existence of a file alone. Do not mutate
TopicPool, project/profile/task state, notification channels, webhooks, or any
external platform. Do not use direct HTTP, custom MCP clients, or user
interaction. Server validation, not the final report, determines completion.
