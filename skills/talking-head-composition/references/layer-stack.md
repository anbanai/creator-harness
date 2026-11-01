# Layer stack and timing contract

Use this order unless the selected Montage pipeline documents a stricter
equivalent:

1. `dialogue_bed`: the source speech bed, continuous across the master timeline.
2. `picture_base`: the primary talking-head or a full-frame visual validated by the visual plan.
3. `visual_overlays`: B-roll, images, graphics, and speaker inset.
4. `text_and_labels`: semantic on-screen text, anchored to EDL segments.
5. `sfx`: event-synced effects, mixed below dialogue.
6. `bgm`: only for a Pack whose contract explicitly owns BGM. When present,
   it is an explicit audio layer below dialogue and must be covered by the
   Pack's BGM plan and licensing evidence; it must never be smuggled in by a
   visual asset branch.

Every layer entry records `layer_id`, `segment_id` or a master frame range,
`source_asset_id`, `start_frame`, `end_frame`, `z_order`, and its audio policy.
Visual entries also record `composition_fingerprint`, `semantic_role`, and
`transition_reason`.

`composition-plan.json` must contain:

```json
{
  "schema_version": "1.0",
  "revision_id": "rev-001",
  "timeline_source": "output/edit-decision-list.json",
  "master_fps": 30,
  "master_duration_frames": 900,
  "audio_bed": {"source": "dialogue_bed", "start_frame": 0, "end_frame": 900},
  "layer_stack": [],
  "render_constraints": {
    "single_final_encode": true,
    "frame_derived_duration": true,
    "opaque_cover_default": true
  }
}
```

The renderer must consume the plan as declared. It must not insert a second
breath detector, offset calculator, or reveal scheduler after the plan is
validated by the preceding automatic review stage.
