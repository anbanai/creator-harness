---
name: talking-head-sound-design
description: Use when an approved talking-head visual plan needs event-synced sound-effect cues and source evidence. Covers SFX selection only; Sound Director owns final mixing and audio QC.
---

# Talking-head Sound Design

Design a restrained, event-synced SFX cue list for the approved visual plan. SFX may accompany creator-recorded footage, AI-generated video, documentary/source media, and graphic overlays; they support the picture and never replace a required action, result, dialogue, or BGM. Use only the user-designated `sfxmint` Skill/MCP for SFX discovery and retrieval. Probe whether its MCP tools are available; if not, record `sfxmint_unavailable` and leave cues unselected or fail recoverably. Do not use web search, Pixabay sound-effect links, or another source as a fallback. Preserve SFXMint source identity, license evidence, local-file SHA-256, and any listening/approval requirement from its Skill. A search result or preview alone is not a local asset. This Skill plans SFX only: it must not render, mix, normalize, or re-encode audio. The separate `video-bgm-design` Skill owns BGM discovery through `search-pixabay`, candidate selection, and source evidence; Sound Director owns the combined mix and final audio QC. Use a cue only when a visible action, appearance, emphasis, transition, or attention change benefits from sound; an explicit empty cue list is valid. Every visual insert is silent unless its cue is explicitly declared.

## Workflow

1. Run only after the Server has approved `output/motion-sample.mp4`. Base cues on visible events in the approved `visual-plan.json`; do not add a sound to every cut. Prefer no cue to a decorative or distracting one.
2. Use SFXMint search/library tools for each needed event, then retrieve a suitable local asset through the supported SFXMint flow. Follow SFXMint's generation key, credits, and user approval rules when library search has no suitable result; never spend credits or generate without the required authorization. Create `output/sfx-cues.json` with the cue-planning fields in [references/cue-and-mix-contract.md](references/cue-and-mix-contract.md). Record the SFXMint asset/source/license/hash, cue time, intended event, and conservative gain. A candidate without an approved local file remains unselected.
3. Hand the cue list and source evidence to Sound Director for mixing through OpenMontage's registered `audio_mixer`.
4. Keep effects below speech and leave dialogue timing unchanged. Sound Director verifies measured audibility, true peak, loudness, edit boundaries, and listening status after the combined mix.

Do not apply music beat-grid alignment; the music layer is handled by the BGM stage. Never claim the result sounds good based only on measurements. Keep source media unchanged.
