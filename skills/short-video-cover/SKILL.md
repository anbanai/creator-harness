---
name: short-video-cover
description: 'Use when designing or auditing high-quality short-video covers from raw source assets and reference cover sets, including 短视频封面、爆款封面、封面复刻、封面优化 and tasks that supply a reference image. The workflow targets thumbnail clarity, concrete subject evidence, exact copy, and independent validation; it does not promise reach.'
---

# Short-video Cover Quality

This Skill owns the cover as a visual communication artifact. The target is a
cover that explains its promise and subject in one second at feed size, while
remaining original, fact-grounded, and reproducible. A larger canvas or more
text is not a quality improvement.

Read [anban-cover-case-study.md](references/anban-cover-case-study.md) when a
reference set is supplied or when the existing cover is text-heavy. Read the
other references only when their phase is active:

- [analysis-template.md](references/analysis-template.md): structured reference analysis.
- [prompt-template.md](references/prompt-template.md) and [prompt-and-repair.md](references/prompt-and-repair.md): image-generation prompts.
- [optimization-checklist.md](references/optimization-checklist.md): visual audit prompts.
- [delivery-template.md](references/delivery-template.md): final report shape.

## Non-negotiable quality bar

The finished cover must have:

- one clear promise or question, with no more than three visible text layers;
- one concrete visual subject: the real IP owner, a verified guest, a source
  frame, a relevant object, or a real scene;
- a readable hierarchy at approximately 270x480 and in a blurred/low-attention
  thumbnail test;
- visible foreground, middle-ground, and background relationships when the
  subject benefits from depth;
- a restrained palette with a deliberate contrast accent, subject separation,
  and no accidental pseudo-logo or pseudo-text;
- exact title copy and safe-area placement verified after composition.

Do not deliver a flat text poster when the source content provides a person,
relationship, object, place, or action that can carry the story. Do not invent a
person, guest, event, product result, or factual scene. Do not copy a reference
cover pixel-for-pixel.

## Raw input contract

Before planning, inspect the most original available inputs. A cleaned cover or
preselected still is evidence, not a sufficient source set. Look for:

1. all original video takes and clean audio, then extract candidate frames;
2. the corrected transcript, title candidates, source outline, factual sources,
   comments/questions, audience and account profile;
3. authorized portrait/video references for every person-led IP or guest;
4. original object/product/location images and any usable foreground details;
5. a reference set of comparable high-performing covers, not only one image;
6. platform display captures, safe areas, font availability, brand marks, and
   historical cover/CTR or retention data when available;
7. source, hash, rights status, and the claim each asset can support.

Write `output/input-manifest.md` with paths, hashes, source roles, missing
evidence, and whether each item is raw, derived, or reference-only. If the
actual IP owner is required and no authorized identity source exists, fail the
person-led gate rather than substituting a generic generated face.

## 图像参数合同

The calling Agent resolves the task Profile before this Skill runs. When the
user specifies a ratio, preserve the 用户明确比例. When the Profile selects
智能适配, choose only from the allowed ratios. When
`resolved_profile.image_ratio` is explicit, preserve it as
`$EFFECTIVE_ASPECT_RATIO`; when it is `auto`, choose only from
`resolved_profile.allowed_image_ratios`. Every `generate_image` call passes the
same semantic ratio. This Skill does not create a second Profile scope or
silently crop to a different ratio.
Every generation must 显式传 `aspect_ratio` and verify the returned file
dimensions; ratio text in a prompt alone is not evidence.

## What expert cover teams do beyond the prompt

The planner must explicitly record these decisions in `output/cover-plan.md`:

- the one-second viewer question and the content evidence that answers it;
- why the headline wording is stronger than the raw video title;
- which real subject, expression, gesture, object, or relationship carries the
  promise and why it is credible;
- the foreground/middle-ground/background and occlusion plan;
- title line breaks, emphasis words, font, contrast, and safe-area geometry;
- the reference grammar being transferred and the parts being deliberately
  changed for originality;
- two or more candidate concepts and the reason one wins;
- the independent evidence needed to call the result ready.

Do not use a generic style label such as “高级、电影感、爆款” as a substitute
for these decisions.

## Tools and boundaries

Use only the registered image capabilities and local media tools available to
the Agent:

- `analyze_image` for reference and candidate audits;
- `generate_image` for a visual plate or a fully composed cover when the
  provider can render exact copy reliably;
- `crop_image`/`compress_image` for task-file preparation;
- `ffprobe`/`ffmpeg` for source-frame extraction, thumbnail renders, ratio and
  pixel checks, and deterministic text composition when the runtime provides
  CJK fonts;
- OCR, face/subject visibility, contrast, and target-audience tests when they
  are available. Record unavailable checks instead of pretending they passed.

`generate_image` is not a layout engine. For exact Chinese copy, prefer a
two-pass workflow: generate a clean visual plate with no critical text, then
compose the approved copy deterministically with `ffmpeg drawtext` or another
registered compositor. Keep the copy in a text file, use an installed CJK
font, and hash the plate, copy file, font, and final output. If no deterministic
composition path is available, do not claim exact-copy readiness; run the
visual audit and mark the cover `needs_manual_edit` or failed.

The registered calls remain atomic and task-scoped:

```text
generate_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  prompt=<visual-plate prompt>,
  image_type="cover",
  output_path="output/cover_v2.png",
  aspect_ratio=$EFFECTIVE_ASPECT_RATIO,
  ref_image_path=<authorized reference path>
)

analyze_image(
  project_id=$PROJECT_ID,
  task_id=$TASK_ID,
  file_path=$CANDIDATE_PATH,
  prompt=<thumbnail and exact-copy audit>
)
```

The generated path is a candidate. Promote it to `output/cover.png` only after
the independent review and quality evidence pass.

## Workflow

### 1. Freeze inputs and ratio

The caller resolves and freezes `$EFFECTIVE_ASPECT_RATIO`. Use it unchanged in
every generation and verification step. Locate attachments through the task
manifest, preserve the original files, and record the input manifest before
generation.

### 2. Analyze the reference set

Run `analyze_image` once per reference image. For each image record:

- hook type and exact title hierarchy;
- subject identity, action, expression, crop, scale, and relationship;
- foreground, middle-ground, background, texture, depth, and focal path;
- palette, contrast, typography character, series mark, badge, and name strip;
- what is transferable, what is content-specific, and what must be changed.

Write `output/reference-analysis.md`. A reference set is a visual grammar, not
a prompt to copy. The supplied Anban case study is the calibration example.

### 3. Build the cover plan and source assets

Select the strongest evidence-bearing source frame or object. For a person-led
cover, the face must be recognizable and emotionally useful at thumbnail size;
for a topic-led cover, the object or scene must make the topic concrete. Extract
several frames from the raw material if needed and log their timestamps and
hashes in `output/cover-asset-manifest.json`.

Make at least two cover concepts. Each concept defines a headline, subject,
background, depth/overlap, palette, crop, and safe-area geometry. Limit the
visible copy to a main hook plus small context or identity labels. Do not fill
empty space with explanatory paragraphs.

### 4. Generate and compose

Generate the selected visual plate with a prompt containing ratio, subject,
scene, depth, palette, lighting, crop, and forbidden artifacts. Use supplied
identity or object references in their declared order. Do not ask the image
model to invent a real guest or proof.

Then compose exact copy deterministically when possible. Preserve the source
plate and write the candidate path recorded in the variant matrix.
Record prompt, tool/version, reference paths, font, copy file, and hashes in
`output/cover-prompts.md` and `output/cover-variant-matrix.json`.

### 5. Audit at real viewing size

For every candidate:

1. Verify actual dimensions and ratio with `ffprobe` or equivalent.
2. Render a thumbnail near 270x480 and inspect it with `analyze_image`.
3. Check headline recognition, subject identity, emotional read, focal order,
   face/object occlusion, safe areas, contrast, and accidental artifacts.
4. Check exact copy with OCR or a deterministic source-copy comparison. A
   prompt claiming the right text is not evidence that the pixels are right.
5. Have an independent reviewer who did not create the candidate perform a
   blind PASS/MINOR/FAIL review and bind it to the candidate SHA-256.

Write `output/cover-thumbnail-review.json`, `output/cover-review.md`, and
`output/cover-quality.json`. The review must say which checks were actually
run and which remain unavailable.

### 6. Repair and deliver

Repair the earliest failed decision: headline, source subject, crop, depth,
contrast, or composition. Do not merely enlarge text. Use at most three total
generation attempts unless the caller explicitly changes the brief. A failed
candidate cannot be silently promoted to `output/cover.png`; only an
independently reviewed candidate with `overall_pass=true` may be promoted.

When evidence is missing, write the normal failure contract with
`resume_from`, preserve all candidates, and stop. Never modify Profile, task
state, or publication state from this Skill.

## Evidence beyond the Agent and user

Where available, include in `output/independent-validation.json`:

- blind review by an independent designer or creative director;
- one-second target-audience thumbnail choices with sample size and protocol;
- automated ratio, safe-area, OCR, contrast, and face/subject checks;
- comparison against the account's historical cover baseline;
- post-publication CTR, three-second retention, and controlled A/B evidence.

Missing evidence is recorded as missing or low confidence. It is never inferred
from a successful tool call or from the creator's own opinion.

## Output contract

Maintain `output/input-manifest.md`, `output/reference-analysis.md`,
`output/cover-plan.md`, `output/cover-asset-manifest.json`,
`output/cover-variant-matrix.json`, `output/cover-prompts.md`,
`output/cover-thumbnail-review.json`, `output/cover-review.md`,
`output/cover-quality.json`, and the final `output/cover.png`. JSON files use
the shared envelope (`schema_version`, `status`, `source`, `data_at`,
`missing`, and applicable `evidence_paths`). Failure preserves artifacts and
writes `output/failure-state.json` and `output/failure-diagnosis.md`.

Read [optimization-checklist.md](references/optimization-checklist.md) for the
audit prompt and [delivery-template.md](references/delivery-template.md) only
when writing the final report.
