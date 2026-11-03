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
        "edl": {
            "fps": 30,
            "sample_rate": 48000,
            "segments": [{
                "segment_id": "s1",
                "source_video_in": 1.0,
                "source_video_out": 2.0,
                "source_audio_sample_start": 48000,
                "source_audio_sample_end": 96000,
                "output_start_frame": 0,
                "output_end_frame": 30,
            }],
        },
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

    def test_source_audio_and_video_times_must_align(self):
        data = base()
        data["edl"]["segments"][0]["source_audio_sample_start"] = 0
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "blocked")
        self.assertTrue(any(item["id"] == "source_time_alignment" for item in report["checks"]))

    def test_ambiguous_sample_fields_are_rejected(self):
        data = base()
        segment = data["edl"]["segments"][0]
        segment.pop("source_audio_sample_start")
        segment.pop("source_audio_sample_end")
        segment["sample_start"] = 0
        segment["samples"] = 48000
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "blocked")
        self.assertTrue(any(item["id"] == "explicit_source_time_fields" for item in report["checks"]))

    def test_source_time_error_over_one_frame_is_rejected(self):
        for field in ("source_audio_sample_start", "source_audio_sample_end"):
            with self.subTest(field=field):
                data = base()
                data["edl"]["segments"][0][field] += 1601
                report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
                self.assertEqual(report["gate"], "blocked")

    def test_exactly_one_frame_source_time_error_is_allowed(self):
        data = base()
        data["edl"]["segments"][0]["source_audio_sample_start"] += 1600
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "passed")

    def test_cumulative_output_samples_cannot_be_used_as_source_time(self):
        data = base()
        segment = data["edl"]["segments"][0]
        segment["source_video_in"] = 54.23
        segment["source_video_out"] = 60.0
        segment["source_audio_sample_start"] = round(38.13 * 48000)
        segment["source_audio_sample_end"] = round(43.9 * 48000)
        report = validate_timeline.validate(data["edl"], data["composition"], data["visual"])
        self.assertEqual(report["gate"], "blocked")


if __name__ == "__main__":
    unittest.main()
