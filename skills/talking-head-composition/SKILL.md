---
name: talking-head-composition
description: Use when converting a reviewed talking-head edit into a layered composition with a permanent dialogue bed, one authoritative timeline, explicit frame durations, and auditable visual/audio layer rules.
---

# Talking-Head Composition

This Skill owns the shared composition contract for the talking-head Montage
Agents. The Agent chooses editorial content; Montage executes the declared
project; this Skill prevents renderer branches from inventing different timing
or dropping the dialogue bed.

Read [references/layer-stack.md](references/layer-stack.md) before creating
`output/composition-plan.json`. Run
`scripts/validate_timeline.py` before each render and include its result in the
current revision evidence.

## Invariants

- The Pack-declared edit-decision-list artifact is the only source of
  source-to-composition time mapping. Every visual item references an EDL
  `segment_id`.
- Every EDL segment separates source media time from output placement. Use
  `source_video_in`/`source_video_out` and
  `source_audio_sample_start`/`source_audio_sample_end` for source trimming;
  `output_start_frame`/`output_end_frame` are composition positions only.
  Never use output cumulative samples or frames as a source trim position.
- Dialogue audio and picture for a segment must address the same source time
  interval. The timeline validator checks sample-to-second conversion against
  source video in/out with a one-frame tolerance; missing or ambiguous fields
  block rendering. This proves only that the EDL is internally consistent; it
  does not prove that the renderer obeyed the EDL. Post-render QC must measure
  the rendered media independently, and a missing detector is a delivery
  blocker.
- The `dialogue_bed` spans frame zero through the master duration. Visual and
  graphic branches may cover picture layers, but cannot conditionally remove
  dialogue audio.
- Duration is derived from the master frame count and actual fps. Do not write
  integer-second constants or independently calculate reveal/offset decisions in
  the renderer.
- Visual/video assets are silent by default. Audio enters through the explicit
  dialogue, SFX, and (when a Pack owns it) BGM layers.
- A covering graphic or mask is opaque by default. A transparent layer requires
  an explicit blend mode, reason, and review evidence.
- HyperFrames layers that depend on first-frame visibility must set
  `immediateRender` explicitly; verify transparent layers against an extracted
  frame rather than trusting the timeline declaration.
- Subtitle layers sit above visual inserts and masks in the declared z-order;
  the z-order is checked at frame boundaries and after every trim.
- Do not concatenate independently AAC-encoded segments. Prefer one filter graph
  and one final encode, retaining encoder-delay evidence.

## Composition plan

Write `output/composition-plan.json` with the current `revision_id`, the master
fps and frame count, the authoritative timeline path, the ordered layer stack,
the dialogue-bed range, render constraints, and the hashes of the inputs used to
build the composition. Keep this file aligned with `visual_plan.json`, the EDL,
and the final render.

## Failure behavior

If the plan contains a second time source, a discontinuous dialogue bed, an
unexplained transparent cover, an independent seconds-based visual clock, or an
adjacent repeated composition without a semantic reason, stop before rendering.
Write the owning Agent's failure artifacts with `resume_from=composition_plan`.

The Skill does not call MCP, publish media, or change task state. It only
validates the declared composition and writes evidence.
