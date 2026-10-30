# OpenMontage Native Mapping

Read this reference when translating evidence files into the installed OpenMontage project format.

## Capability and pipeline probes

Run from OPENMONTAGE_ROOT with the configured OpenMontage Python environment:

~~~bash
python -c 'from tools.tool_registry import registry; registry.discover(); print(registry.provider_menu_summary())'
python -c 'from lib.pipeline_loader import load_pipeline; print(load_pipeline("hybrid"))'
~~~

Use returned registry data, not a hard-coded provider list. If the checkout exposes a different Python executable, use OPENMONTAGE_VENV/bin/python. Discover the render entry point from that checkout's own --help or project metadata and record it.

## Evidence mapping

| Evidence | OpenMontage input or stage | Required relationship |
| --- | --- | --- |
| transcript.json | transcript/script stage | Preserve word timing and source timecodes. |
| edit-decision-list.json | edit/timeline stage | Preserve source-to-sequence mappings and reasons. |
| asset-requirements.json | scene/support planning | Declare video_insert, image_insert, and motion_graphic independently. |
| generated-video-manifest.json | video_selector results | Complete before hybrid composition. |
| visual-plan.json | hybrid scene/track plan | Reference only verified local assets. |
| motion-sample.mp4 | hybrid preview render | Include the source speaker and all planned support classes. |
| final.mp4 | hybrid final render | Preserve dialogue priority and explicit audio decisions. |

## Provider selection

video_selector chooses an operation from the registry for each requirement:

- text_to_video for described motion or a setting without a reference.
- image_to_video when a still establishes object or scene identity.
- reference_to_video when continuity across shots matters.
- stock_video when the plan requires an authorized real-world source.

Record the selected provider/model and parameters in the generated-video manifest. A generated clip is a visual treatment, not evidence that a real event occurred.
