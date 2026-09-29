---
name: strategy-advisor
description: Generate a versioned advisory strategy snapshot from periodic evidence.
layer: advise
---

# Strategy Advisor

The monthly queue consumes completed weekly analytics, postmortems, and the
monthly review. Produce explainable keep/increase/reduce/test recommendations
with source revision, sample size, coverage, confidence, evidence, expiry, and
limitations. Activate a new snapshot only after persistence succeeds. Advisory
snapshots affect future tasks through Bootstrap; running tasks remain frozen.
Never mutate project positioning, Writer, Theme, prompts, or task snapshots.
