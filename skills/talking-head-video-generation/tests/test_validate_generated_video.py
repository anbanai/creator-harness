import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("validate_generated_video", ROOT / "scripts" / "validate_generated_video.py")
validator = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = validator
spec.loader.exec_module(validator)


class GeneratedVideoValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "output").mkdir()
        self.asset = self.root / "output" / "generated.mp4"
        self.asset.write_bytes(b"generated-video-bytes")
        self.revision = "rev-3"
        self.manifest = {
            "schema_version": "1.0",
            "source": "talking-head-video-generation",
            "revision_id": self.revision,
            "items": [{
                "asset_id": "gen-1",
                "kind": "ai_video",
                "path": "output/generated.mp4",
                "sha256": validator.sha256(self.asset),
                "revision_id": self.revision,
                "generation": {"status": "succeeded", "provider": "provider", "model": "model", "request_id": "req-1", "generated_at": "2026-11-03T00:00:00Z", "parameters": {}},
                "purpose": {"unit_id": "unit-core", "core_explanation": True},
                "review": {"status": "approved", "revision_id": self.revision, "method": "frame review", "reviewed_at": "2026-11-03T00:00:00Z", "inspected_range": {"start": 0, "end": 2}},
            }],
        }
        self.edl = {"segments": [{"segment_id": "s1", "visual_assets": [{
            "asset_id": "gen-1", "kind": "ai_video", "purpose_unit_id": "unit-core", "source_in": 0.0, "source_out": 2.0, "output_start_frame": 0, "output_end_frame": 60,
        }]}]}

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_reviewed_generated_video_adopted_by_core_edl_passes(self):
        with patch.object(validator, "decodable", return_value=True):
            result = validator.validate(self.manifest, self.edl, self.root, self.revision)
        self.assertEqual(result["gate"], "passed")
        self.assertTrue(result["core_explanation_video_adopted"])

    def test_unreferenced_generated_video_blocks(self):
        with patch.object(validator, "decodable", return_value=True):
            result = validator.validate(self.manifest, {"segments": []}, self.root, self.revision)
        self.assertEqual(result["gate"], "blocked")
        self.assertIn("no approved generated video is adopted by a core explanation unit", result["errors"])

    def test_stale_generation_revision_blocks(self):
        self.manifest["items"][0]["revision_id"] = "rev-2"
        with patch.object(validator, "decodable", return_value=True):
            result = validator.validate(self.manifest, self.edl, self.root, self.revision)
        self.assertEqual(result["gate"], "blocked")

    def test_asset_hash_mismatch_blocks(self):
        self.manifest["items"][0]["sha256"] = "stale-hash"
        with patch.object(validator, "decodable", return_value=True):
            result = validator.validate(self.manifest, self.edl, self.root, self.revision)
        self.assertEqual(result["gate"], "blocked")
        self.assertIn("asset is missing or its SHA-256 does not match", result["errors"][0])


if __name__ == "__main__":
    unittest.main()
