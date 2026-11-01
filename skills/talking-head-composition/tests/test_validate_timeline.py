import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("validate_timeline", ROOT / "scripts" / "validate_timeline.py")
validate_timeline = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(validate_timeline)


def base():
    return {
        "edl": {"segments": [{"segment_id": "s1"}]},
        "composition": {
            "timeline_source": "output/edit-decision-list.json",
            "master_fps": 30,
            "master_duration_frames": 900,
            "audio_bed": {"source": "dialogue_bed", "start_frame": 0, "end_frame": 900},
            "layer_stack": [],
        },
        "visual": {"items": []},
    }


class TimelineTests(unittest.TestCase):
    def test_valid_plan_passes(self):
        data = base()
        self.assertEqual(validate_timeline.validate(data["edl"], data["composition"], data["visual"])["gate"], "passed")

    def test_second_time_source_blocks(self):
        data = base()
        data["composition"]["offsets"] = [1]
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "blocked")

    def test_adjacent_duplicate_composition_blocks(self):
        data = base()
        data["visual"]["items"] = [
            {"asset_id": "a", "composition_fingerprint": "same"},
            {"asset_id": "a", "composition_fingerprint": "same"},
        ]
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "blocked")


if __name__ == "__main__":
    unittest.main()
