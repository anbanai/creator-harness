import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("render_qc", ROOT / "scripts" / "render_qc.py")
render_qc = importlib.util.module_from_spec(spec)
assert spec.loader
sys.modules[spec.name] = render_qc
spec.loader.exec_module(render_qc)


class RenderQcTests(unittest.TestCase):
    def test_sync_evidence_requires_checkpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sync.json"
            path.write_text(json.dumps({"checkpoints": []}))
            checks = render_qc.sync_checks(Path("video.mp4"), path, 1 / 30)
            self.assertEqual(checks[0].status, "blocked")

    def test_sync_evidence_blocks_jitter_over_one_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sync.json"
            path.write_text(json.dumps({"checkpoints": [{"offset_ms": 0}, {"offset_ms": 40}]}))
            checks = render_qc.sync_checks(Path("video.mp4"), path, 1 / 30)
            self.assertEqual(checks[1].status, "blocked")

    def test_missing_streams_are_blockers(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"fixture")
            original_probe = render_qc.probe
            original_decode = render_qc.decode_ok
            try:
                render_qc.probe = lambda _: {"streams": [], "format": {}}
                render_qc.decode_ok = lambda _: (False, "bad media")
                report = render_qc.run_qc(video, "rev-1", "off", "unavailable", None)
            finally:
                render_qc.probe = original_probe
                render_qc.decode_ok = original_decode
            self.assertEqual(report["gate"], "blocked")
            self.assertTrue(any(item["id"] == "audio_stream" and item["status"] == "blocked" for item in report["checks"]))


if __name__ == "__main__":
    unittest.main()
