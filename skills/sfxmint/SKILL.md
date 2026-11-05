---
name: sfxmint
description: Use when an Anban video workflow needs SFXMint sound effects matched to visible actions, transitions, reveals, or ambience.
---

# SFXMint Video Sound Effects

This local Skill is the Anban-distributed SFXMint entrypoint for video workflows. Use its documented lookup/download capability only when the current runtime exposes it; do not invent a provider integration.

## Scope

Find and, when the runtime permits, download SFXMint sound effects for a video timeline. This Skill handles cue discovery and source metadata. It does not choose BGM, compose music, mix audio, render video, or claim that a cue suits a shot without contextual listening. `talking-head-sound-design` owns cue placement; Sound Director owns the final mix.

## Inputs

- Approved visual plan or EDL with event times and a short description of each visible action.
- Required format (`wav` preferred for mixing), maximum duration, loop requirement, and any tonal constraints.
- A SFXMint search/download capability explicitly exposed by the current runtime, if one exists.

## Workflow

1. Select only events the viewer should notice: a reveal, impact, transition, object movement, emphasis, or useful ambience. An empty cue list is valid.
2. Use only a SFXMint tool or user-facing integration explicitly exposed by the current runtime. Do not construct HTTP requests, call SFXMint endpoints with `curl`/scripts, or create a custom client. If no SFXMint capability is available, record `capability_unavailable`; do not invent results or substitute another provider.
3. Reject candidates that fail a hard duration, format, loop, or availability check. A text match, score, or `closest` result is not acceptance.
4. Prefer a local WAV download when available. Preserve the returned source URL, page URL, license, measured acoustics, and SHA-256. If the runtime can only inspect a URL, record the candidate as unmaterialized and do not send it to mixing.
5. Keep lookup/download results in `output/sfx-library-results.json` using the schema below. `talking-head-sound-design` consumes that file and writes the final `output/sfx-cues.json` in its cue-and-mix contract; do not write a second schema to `sfx-cues.json`. Ask for contextual listening through the workflow's review step; automated waveform checks do not prove suitability.
6. When the library has no suitable result, write a recoverable missing-cue record. Do not silently replace it with a generic web search, an old bundled library, or generated audio.

## Output

Write `output/sfx-library-results.json`:

```json
{
  "schema_version": 1,
  "status": "assets_found",
  "provider": "sfxmint",
  "cues": [
    {
      "asset_id": "",
      "event_description": "",
      "description": "",
      "slug": "",
      "file": "output/media/sfx/example.wav",
      "source_url": "",
      "page_url": "",
      "license": "CC0-1.0",
      "sha256": "",
      "format": "wav",
      "acoustics": {"onset_ms": null, "peak_ms": null, "audible_ms": null},
      "materialization_status": "downloaded"
    }
  ],
  "missing": [],
  "limitations": []
}
```

Use `status: "no_suitable_assets"` when no cue is needed or no compliant asset exists. Use `status: "capability_unavailable"` when the required local/runtime capability is absent. This file records library assets, not final timing or mix decisions. Preserve missing event descriptions and `resume_from` information in all failure states.

## Quality checks

- Every materialized file has a returned source/page URL, license metadata, and SHA-256.
- Every cue maps to a visible timeline event and has a bounded duration.
- No cue is marked accepted before contextual listening or an explicit human-review waiver.
- Downloaded files are checked for decodability and leading silence; those checks support placement but do not replace listening.
