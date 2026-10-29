## HyperFrames lint remediation

| Lint error | Required correction |
| --- | --- |
| `video_nested_in_timed_element` | Move the `<video>` media node outside the timed wrapper and express timing through the media/timeline API. Do not nest a video element inside a timed element. |
| `media_missing_id` | Give every media asset a stable, non-empty `id`; use the same ID in the shot card and the composition. |
| `gsap_css_transform_conflict` | Choose one transform owner. Remove competing CSS `transform` declarations when GSAP animates the element, or animate a nested wrapper instead. |
| `font_family_without_font_face` | Register the font with `@font-face` and include the font asset, or use a verified system font stack. Do not reference an unavailable family. |
| `content_overlap` at one position | Assign distinct layout positions or time windows to cards that occupy the same area. If overlap is intentional, make the hierarchy explicit and record it in the shot card. |

Fix the source composition and rerun lint before rendering again. A successful render without a clean lint result is not a passed motion review.
