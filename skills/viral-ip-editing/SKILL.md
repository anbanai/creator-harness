---
name: viral-ip-editing
description: Use when making editorial decisions for already-recorded IP talking-head footage, including hook selection, semantic-safe cuts, retention pacing, captions, visual support, sound design, and final editorial QC. Do not use it to run the Montage pipeline or publish media.
---

# Viral IP Editing

This Skill owns the editorial reasoning for recorded IP talking-head footage.
The invoking Agent owns stage orchestration and recovery; `montage` owns the
OpenMontage runtime and delivery contract; Server owns task identity, profile
snapshots, publication, and external side effects.

## Boundaries

- Preserve the speaker's actual meaning, evidence, conditions, chronology,
  stance, numbers, names, negations, and disclaimers.
- Use only source-backed hooks. A hook must be fulfilled by the finished cut;
  do not manufacture controversy, results, testimony, or a replacement voice.
- Treat retention as an editorial objective, never as a guaranteed metric.
- Do not force a fixed cut cadence. Every cut, crop, speed change, B-roll shot,
  caption emphasis, sound effect, and music change needs a content or
  comprehension reason.
- Prefer user-provided or authorized media. Mark unknown rights and generated
  illustrative media as unresolved; never present generated media as evidence.
- Treat live-action/video assets and animation/graphic assets as different
  classes. Live-action video is for real people, products, actions, places,
  texture, continuity, and evidence-backed visual presence; animation/graphics
  are for explaining abstractions, relationships, data, process, emphasis, and
  controlled visual timing. Do not use one class to silently substitute for the
  other.
- Treat background music and sound effects as separate sound-design systems.
  Music shapes the macro emotional arc and perceived energy; effects mark
  events, interaction, impact, transitions, and micro attention. Neither should
  compensate for a weak story or unclear speech.

## Editorial workflow

1. Inspect the transcript, source timecodes, picture, audio, task brief, and
   the routed profile files named by the workspace `AGENTS.md`.
2. Map semantic segments, core value, supporting evidence, repetitions,
   context dependencies, protected meaning, and two or three credible hook
   candidates when the source supports them.
3. Build a timecoded master plan before large edits. Include the promise and
   payoff, segment order, target duration, cut reasons, visual/audio plan,
   rights risks, and acceptance checks.
4. Review the plan as an independent editor. Reject or revise it when the hook
   is misleading, a reorder breaks reference or causality, a deletion removes
   a protected qualifier, or a planned asset does not improve understanding.
5. Create the semantic main cut before decoration. Preserve natural breaths and
   useful pauses, then check every cut for syllable loss, grammar, room-tone
   jumps, and audio continuity.
6. Select or generate the required live-action/video assets, then lock their
   relation to the spoken edit before building timing-dependent explanatory
   animation. Use low-cost storyboards or placeholders earlier when they help
   test the idea; do not spend on final animation before its timing and purpose
   are known.
7. Add captions, final animation/graphics, sound effects, and music only where
   they support meaning, attention, or emotional timing. Keep the speaker
   visible for trust-building and key claims.
8. Review the actual rendered media. Check the first three seconds, promise
   payoff, semantic continuity, captions, safe areas, frame continuity,
   intelligibility, loudness measurements, playback, and delivery files.
9. Repair Blocker/Major defects, render again, and recheck the changed area and
   its timing/audio neighbors. Do not call a plan or a successful command a
   verified video.

For a plan-only or single-stage request, run only the applicable stages and
the checks affected by the change. A full production run requires both a plan
review and a final media review.

## Asset roles and production order

Record the asset class and function for every visual item in `visual_plan.json`.
At minimum, record `asset_class` (`live_video` or `animation_graphic`),
`function`, source or generation method, source/target timecodes, rights or
authenticity status, and whether its timing depends on the locked spoken edit.

- **Live video / B-roll:** use for a real person or product, a physical action,
  a place, an observable result, texture, atmosphere, or continuity with the
  speaker. It can carry trust, presence, and evidence only when the source
  actually supports that claim. Generated video remains illustrative and must
  not be presented as proof.
- **Animation / explanatory graphics:** use for concepts that are difficult to
  show directly: relationships, comparisons, sequences, numbers, mechanisms,
  maps, diagrams, UI flows, emphasis, or visual metaphors. It should improve
  comprehension or attention, not add decoration to fill silence, and must not
  imply real footage or real evidence.

The default production order is: semantic rough cut and spoken timing -> select
or generate the required live-action/video assets -> integrate and lock their
coverage and timing -> build final explanatory animation/graphics against that
locked timing -> captions and final sound mix. This order reduces rework because
animation duration, labels, entry points, and visual hierarchy can follow the
actual footage and speech. It is a default, not an absolute ban on parallel
work: storyboard frames, motion tests, reusable lower-thirds, and other
timing-independent templates may be prepared earlier, but they remain
previsualization until the real timing is confirmed.

## Sound-design roles and workflow

Plan `bgm_plan.json` and `sfx_cues.json` separately. They may share the same
timeline, but they have different narrative jobs, decision criteria, and QC.

- **Background music (macro emotion):** define the intended emotional effect
  for each section (for example: trust, curiosity, urgency, relief, warmth, or
  resolve), plus energy curve, tempo/texture, tension and release, entry/exit,
  repetition, and voice-ducking strategy. Music can support anticipation and
  continuity across cuts, but it must leave speech intelligible and should be
  removed or simplified when the topic needs authority, delicacy, or silence.
- **Sound effects (micro event):** define the triggering visual or spoken event,
  narrative role (attention, confirmation, impact, transition, interaction, or
  atmosphere), emotional effect, intensity, duration, sync point, and fade. An
  effect should make a specific moment clearer or more felt; do not place one on
  every cut or use loud hits to manufacture excitement.

Use this order for a full mix: lock the clean dialogue and semantic edit; sketch
the BGM emotional arc early enough to test pacing; lock video and animation
timing; choose and arrange the final BGM; add SFX against the locked visual
events; then mix dialogue, BGM, SFX, and room tone together. Review BGM for
macro emotional continuity and voice masking separately from SFX for sync,
frequency collisions, transient peaks, and overuse. A change to either audio
system is a revision to the downstream render and requires the affected review
and platform-compliance checks.

## Cover design routing

Cover design is part of a full Montage production. Select exactly one branch
from the frozen task inputs and record the decision in `output/cover-plan.md`:

1. **Ordinary cover (default):** read
   `montage/references/cover.md`. Use the frozen `$VIDEO_ASPECT_RATIO`, the
   final video brief and title, and relevant non-person task assets. Generate
   with Anban MCP `generate_image`, then independently run `analyze_image`.
2. **Portrait cover:** when `cover_portrait=required_project_portrait`, read
   `portrait-cover-design/references/platform-integration.md` and follow its
   Montage row. Use the frozen project portrait reference and the same frozen
   video ratio. Do not use an uploaded video frame as an identity reference.
3. **Reference-cover adaptation:** only when the task includes a reference
   cover or explicitly asks for cover replication, read
   `short-video-cover/SKILL.md` and only the relevant references. Analyze the
   reference with `analyze_image`, extract visual logic, and create a new
   composition for the current title. Never copy the source image or treat it
   as a pixel/layout lock. In this Montage branch, skip the referenced Skill's
   Phase 0 Profile lookup and use the already frozen `$VIDEO_ASPECT_RATIO` for
   every `generate_image` call; do not call `get_project_profile` for a second
   image ratio. The Montage cover contract remains authoritative: write
   `cover.png`, `cover-plan.md`, `cover-prompt.md`, `cover-quality.json`, and
   the reference-workflow prompt evidence `cover-prompts.md`. Retry in place at
   `output/cover.png`; if a provider or helper creates a temporary v2 cover
   file, promote it to `output/cover.png` only after its
   independent audit passes, then ensure the delivery manifest and quality
   evidence point to the promoted file. Never leave `cover_v2.png` as a
   competing primary delivery.

All branches must verify exact title text as far as the current image
capability permits, subject/theme fit, aspect ratio, safe zones, identity when
applicable, and absence of watermarks or unrelated elements. A failed cover is
a failed or partial Montage delivery according to the Montage contract; never
silently deliver a prompt, placeholder, or unreviewed image.

## File outputs

Write the editorial files declared by the Pack under `output/`. Keep source
timecodes distinct from final timeline timecodes. Agent-owned JSON files use:

- `schema_version`
- `status`: `ready`, `partial`, or `failed`
- `source`: `viral-ip-video-editor`
- `data_at`
- `missing`
- `evidence_paths` when applicable

This common shape does not override a delegated contract. In particular,
`output/montage-project.json`, `output/content-tags.json`, content-reuse
artifacts, cover artifacts, and `output/failure-state.json` must follow their
own Skill or Pack schemas.

The minimum editorial evidence for a full production run is:

- `project_brief.md`
- `transcript.json` or an equivalent timecoded transcript
- `content_map.md`
- `edit_master_plan.md`
- `plan_review.md`
- `edit_decision_list.json`
- `visual_plan.json`
- `sfx_cues.json`
- `bgm_plan.json`
- `captions.srt` or the timeline's native caption format
- `qc_report.md`

Use `output/failure-state.json` and `output/failure-diagnosis.md` for a
terminal failure. The failure JSON uses the Montage failure contract:
`version`, `status="recoverable_failure"`, `stage`, `error_code`, a redacted
non-empty `message`, and `resume_from`.

## Review standard

Block delivery for changed meaning, an unfulfilled or misleading hook,
missing/invalid media, severe audio-video sync errors, unreadable captions,
or unresolved material rights/identity risk. Mark Major defects that affect
comprehension or viewing quality and repair them when the source and tools
permit. Record Minor issues without hiding them or allowing endless retakes.
