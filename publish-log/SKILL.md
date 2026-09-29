---
name: publish-log
description: Record the immutable fact of a confirmed successful publication.
layer: observe
---

# Publish Log

Trigger only after Server durable evidence confirms external publication. Record
project, platform/account, content identity, publication time, URL/provider IDs,
and observation-window metadata. This skill is deterministic, idempotent, does
not call an LLM, and must not enqueue analytics, postmortems, reviews, or strategy.
Failed or ambiguous publication attempts are never successful publish facts.

Downstream consumers are `data-tracker` and the periodic scheduler. The Server
owns the write and the publication state machine; do not duplicate publisher or
calendar writes.
