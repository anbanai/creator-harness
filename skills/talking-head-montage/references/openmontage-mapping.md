# OpenMontage Mapping

Use OpenMontage `hybrid` as the primary pipeline for this workflow. It keeps source footage as the anchor while allowing generated or selected support assets. Use the upstream `talking-head` stages for transcript, subtitle, silence, face, reframe, and speaker-specific composition guidance when those stages are available in the installed revision.

## Stable Mapping

| Anban artifact | OpenMontage concept | Rule |
| --- | --- | --- |
| `transcript.json` | `script` / transcript artifact | Preserve word timing and source timecodes. |
| `edit-decision-list.json` | `edit_decisions` | Keep source and composition time mappings. |
| `asset-requirements.json` | `scene_plan` support needs | Declare all three asset classes independently. |
| `generated-video-manifest.json` | `asset_manifest` video selects | Generate before final support composition. |
| `visual-plan.json` | hybrid `scene_plan` and support map | Reference only verified local files. |
| `motion-sample.mp4` | hybrid compose preview | Must contain source and planned support media. |
| `final.mp4` | hybrid compose output | Keep dialogue primary and generated clip audio muted by default. |

## Video Selector Contract

Use the installed registry's `video_selector` capability. The operation is selected per requirement:

- `text_to_video` for a described action or environment without a visual reference.
- `image_to_video` when a still establishes the tea, product, utensil, or scene identity.
- `reference_to_video` when continuity across generated inserts matters.
- `stock_video`/search when a real-world observation is required and an authorized source is available.

Record the selected provider and model from the actual registry result. Do not hardcode a provider or call its HTTP API directly. A generated insert is a visual treatment and must not be presented as documentary evidence of a real event.

## Tea IP Example

For a tea presenter, derive requirements from the transcript rather than from a fixed shot list. A sentence about a named tea may need a stable leaf or liquor detail, a sentence about preparation may need a visible pour or steeping action, and a sentence about origin may need a landscape or process insert. These may share one time window with the presenter, a still, and a diagram, provided the visual plan defines the hierarchy and safe zones.
