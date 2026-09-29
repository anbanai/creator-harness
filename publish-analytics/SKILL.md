---
name: publish-analytics
description: Analyze mature published content in the weekly queue.
layer: analyze
---

# Publish Analytics

Weekly work consumes publish facts plus time-series snapshots for the frozen
analytics revision. Compare platform, content type, writer, theme, visual
style, title/body length, images, and tags only when sample and coverage gates
pass. Deterministic scripts calculate; an optional interpreter explains. State
correlation and limitations, never causation. Cache by job fingerprint and do
not run after publication or after every import.
