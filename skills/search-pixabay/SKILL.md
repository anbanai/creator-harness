---
name: search-pixabay
description: Use when ip-explainer needs BGM discovery through the pinned Pixabay search Skill. It creates Pixabay candidate links only; it does not download files or establish license eligibility.
---

# Pixabay BGM Search Adapter

For BGM discovery, read and follow the upstream Skill at `../pixabay-search-skill/src/search-pixabay/SKILL.md` and its music reference. This wrapper exists to expose the upstream Skill through Anban's Pack contract; the submodule is the maintained source of its search method.

Use it only to create Pixabay music search candidates. Do not use its sound-effect, image, or video branches in this workflow. A search link is not a downloaded audio file or license evidence. Record candidate links in `output/bgm-plan.json`; do not mark a track ready or pass it to mixing until a local file and independently verifiable rights evidence exist.

If the upstream entrypoint is missing, record a recoverable `pixabay_skill_unavailable` failure and stop BGM discovery. Do not replace it with general web search or another provider.
