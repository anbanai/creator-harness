---
name: content-postmortem
description: Use when reviewing a content item after its observation window matures.
layer: review
---

# Content Postmortem

The weekly queue may process a single item at 7 or 30 days, or a bounded batch
for pattern extraction. Before maturity, report pending only. Require at least
one non-null metric and a matching immutable content identity. Preserve the
source revision, evidence, confidence, and warnings. A failed interpretation
never rewrites the fact layer.
