---
name: data-tracker
description: Update deterministic time-series feedback projections during the daily scan.
layer: observe
---

# Data Tracker

Run from the daily project-timezone queue after imported observations create a
new analytics revision or a content observation window matures. Consume only
the canonical Server observation source. Preserve null versus observed zero,
metric basis, provenance, and revision identity. No valid observations, no
mature content, revoked batches, rebuilds, and duplicate fingerprints are
skipped with an auditable reason. No LLM is allowed.
