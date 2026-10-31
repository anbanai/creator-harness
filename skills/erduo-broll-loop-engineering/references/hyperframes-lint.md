## HyperFrames lint remediation

| Lint error | Required correction |
| --- | --- |
| `video_nested_in_timed_element` | Move the `<video>` media node outside the timed wrapper and express timing through the media/timeline API. Do not nest a video element inside a timed element. |
| `media_missing_id` | Give every media asset a stable, non-empty `id`; use the same ID in the shot card and the composition. |
| `gsap_css_transform_conflict` | Choose one transform owner. Remove competing CSS `transform` declarations when GSAP animates the element, or animate a nested wrapper instead. |
| `font_family_without_font_face` | Register the font with `@font-face` and include the font asset, or use a verified system font stack. Do not reference an unavailable family. |
| `content_overlap` at one position | Assign distinct layout positions or time windows to cards that occupy the same area. If overlap is intentional, make the hierarchy explicit and record it in the shot card. |

Fix the source composition and rerun lint before rendering again. A successful render without a clean lint result is not a passed motion review.


## Additional checks

| Lint/check error | Required correction |
| --- | --- |
| `invalid_inline_script_syntax` | Fix the inline script syntax before rendering; do not hide parser errors behind a successful process exit. |
| `subcomposition_root_styled_by_class` | Move root styling to the supported root style contract; do not depend on a class selector for the subcomposition root. |
| `subcomposition_linked_style_names_root_id` | Link style names to the declared root ID and verify the ID is stable in the shot card. |
| `gsap_timeline_set_initial_hide` | Set the initial hidden state before the timeline starts so the first visible frame does not flash the complete graphic. |
| `gsap_function_value_hazard` | Resolve function-valued animation inputs before serialization or use an explicit supported value; record the evaluated value. |
| `gsap_non_transform_motion` | Prefer transform-based motion for position/scale/rotation; if layout properties are required, record the reason and run the performance check. |
| `clip_ends_past_root_duration` | Clamp the clip to the root duration and rerun lint. |
| `studio_missing_editable_id` | Give each user-editable control a stable non-empty ID and reference it from the studio manifest. |
| `multiple_root_compositions` | Keep one root HTML/composition for the shot; move additional structures into subcompositions. |
| `font_family_without_font_face` | Register the font or use a verified system stack such as `src: local("Songti SC")`; do not assume an unavailable family. |
| `nested_structure_needs_subcomposition` | This is a warning when the output remains understandable; split into a subcomposition when timing or reuse would otherwise be ambiguous. |

A missing `hyperframes check` command is a capability gap, not a passing check. Record the discovered `--help` output and the independent runtime/layout check used instead.
