---
name: sfxmint
description: Use when ip-explainer needs event-synced sound-effect discovery and retrieval through the pinned SFXMint Skill/MCP; not for BGM, voice, or mixing.
---

# SFXMint Adapter

Read and follow the upstream Skill at `../sfxmint-mcp/skills/sfxmint/SKILL.md`. This wrapper exposes the maintained upstream Skill through Anban's Pack contract; do not copy its API instructions here.

Use SFXMint only for sound effects that support an identified visible event. Preserve returned source, license, asset, and file evidence as required by the upstream Skill. A search result or preview alone is not a retrieved local asset. Follow its actual key, quota, credit, generation, and approval requirements; do not invent additional account or spending assumptions.

If the upstream entrypoint or its required runtime capability is unavailable, record a recoverable `sfxmint_unavailable` failure. Do not use general web search, Pixabay SFX, or another library as a fallback. This Skill does not select BGM or mix audio.
