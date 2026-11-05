---
name: data-tracker
description: Use when a frozen data-tracker FeedbackJob needs deterministic coverage and lifecycle analysis.
---

# Data Tracker

Analyze only the analytics revision, observations, content set, maturity windows, and coverage already frozen in the FeedbackJob context. Return deterministic tracking facts and their evidence as private JSON for Server ingestion.

The Server owns scheduling, eligibility, revision fingerprints, deduplication, projection persistence, and audit rows. Do not scan external sources, select content, create jobs, or persist projections or audit rows. Do not write a strategy or change a project profile.

If the frozen context indicates no eligible change, no mature content, no valid metric, a revoked import without a replacement revision, or an identity mismatch, report the provided status and reason without changing job eligibility. Include the analytics revision, valid sample count, coverage, and content-set digest in the evidence.

## Analysis boundary

When observations are absent or insufficient, emit `skipped` or `data_insufficient`, preserve the reason and use low confidence for any partial projection. Do not modify a project profile, prompt, publish state, or global configuration.
