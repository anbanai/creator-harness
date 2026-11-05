---
name: search-pixabay
description: Use when an Anban video workflow needs Pixabay background-music candidates; this adapter delegates search-link construction to the maintained Pixabay Skill.
---

# Search Pixabay Music

This local Skill is the Anban-distributed Pixabay search entrypoint. Use only its music branch, write `output/bgm-candidates.json`, and do not treat links as downloaded audio or rights evidence.

## Scope

Find and compare Pixabay music candidates for video background music (BGM). This adapter does not retrieve sound effects, generate music, download tracks, establish license eligibility, or mix audio. `video-bgm-design` owns the selection record and rights checks; Sound Director owns mixing and final audio QC.

## Inputs

- Approved visual plan or edit timeline, target duration, intended audience/platform, and emotional arc.
- Dialogue density and any user-provided music constraints.
- Runtime browser/search capability, when available.

## Workflow

1. Summarize the sonic brief in a few search concepts: mood, energy, instrumentation, and whether the track should build or remain unobtrusive. Prefer instrumental tracks under dense speech.
2. Read `references/music.md` for Pixabay's supported music-search URL filters and query construction.
3. Use the available browser/search capability to inspect Pixabay's music results. If no such capability is available, report `search_unavailable`; do not fabricate results or substitute a generic web search, another provider, or an unrelated Skill.
4. Return up to five candidates that plausibly fit. For each, record the exact track page URL, title, creator, observed duration, relevant mood/style, and the time of inspection. Do not treat search snippets or a search-result URL as a verified track page.
5. Write the candidates file below, then hand it to `video-bgm-design`, which copies the candidate records into `bgm-plan.json` under `candidates[]`. Keep candidates separate from `tracks[]`.

## Output

Write `output/bgm-candidates.json`:

```json
{
  "schema_version": 1,
  "status": "candidates_found",
  "provider": "pixabay",
  "brief": {"mood": "", "energy": "", "instrumentation": "", "duration_seconds": 0},
  "inspected_at": "ISO-8601 timestamp",
  "candidates": [
    {"candidate_id": "", "title": "", "creator": "", "track_url": "", "duration_seconds": null, "fit_note": "", "candidate_only": true}
  ],
  "limitations": []
}
```

Use `status: "search_unavailable"` with an empty candidate list when runtime search is unavailable. Preserve unknown fields as `null`; never infer creator, duration, license, or download status.

## Quality checks

- Every candidate URL resolves to a specific Pixabay music track page observed during this run.
- Candidate notes explain fit against the visual/timing brief, not just keyword overlap.
- No candidate is described as licensed, approved, downloaded, or ready to mix based on search alone.
