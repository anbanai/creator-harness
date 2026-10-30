import json
import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SKILL = Path(__file__).resolve().parents[1]
SCRIPT = SKILL / "scripts" / "sound_pass.py"
SPEC = importlib.util.spec_from_file_location("talking_head_sound_pass", SCRIPT)
SOUND_PASS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SOUND_PASS)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
class SoundPassIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="talking-head-sfx-test-")
        self.root = Path(self.temp.name)
        self.video = self.root / "input.mp4"
        self.cues = self.root / "sfx-cues.json"
        self.output = self.root / "final.mp4"
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "color=c=black:s=320x240:r=25:d=2",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=48000",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(self.video),
        ], check=True)

    def tearDown(self):
        self.temp.cleanup()

    def cue_payload(self, category="pop"):
        return {
            "schema_version": "1.0",
            "status": "ready",
            "source": "talking-head-editor",
            "data_at": "2026-10-29T00:00:00Z",
            "missing": [],
            "cues": [{
                "cue_id": "card-1",
                "time_seconds": 0.8,
                "category": category,
                "event": "information card appears",
                "purpose": "mark the visual reveal",
            }],
        }

    def run_pass(self):
        return subprocess.run([
            "python3", str(SCRIPT), "--video", str(self.video), "--cues", str(self.cues), "--output", str(self.output),
        ], capture_output=True, text=True, check=False)

    def test_mixes_bundled_effect_and_records_measured_evidence(self):
        self.cues.write_text(json.dumps(self.cue_payload()), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreater(self.output.stat().st_size, 0)
        report = json.loads(self.cues.read_text(encoding="utf-8"))
        evidence = report["render_evidence"]
        self.assertEqual(evidence["status"], "ready")
        self.assertEqual(evidence["source"], "talking-head-editor")
        self.assertEqual(evidence["applied_cues"][0]["asset_id"], "pop")
        self.assertEqual(evidence["applied_cues"][0]["license"], "CC0 1.0")
        self.assertIn("integrated_lufs", evidence["render"]["before"])
        self.assertIn("true_peak_dbfs", evidence["render"]["after"])
        self.assertEqual(evidence["render"]["audibility_check"]["cues"][0]["status"], "audible")
        self.assertIn("measured_rms_dbfs", evidence["render"]["audibility_check"]["cues"][0])

    def test_accepts_upstream_asset_variant_and_records_its_identity(self):
        payload = self.cue_payload(category="pop")
        payload["cues"][0]["asset_id"] = "pop-fs-447910-plop"
        self.cues.write_text(json.dumps(payload), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(self.cues.read_text(encoding="utf-8"))["render_evidence"]
        self.assertEqual(evidence["applied_cues"][0]["asset_id"], "pop-fs-447910-plop")

    def test_rejects_cue_that_is_below_audibility_threshold(self):
        payload = self.cue_payload(category="tick")
        payload["cues"][0]["gain_db"] = -36
        self.cues.write_text(json.dumps(payload), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 2)
        self.assertIn("cue_inaudible", result.stderr)
        self.assertFalse(self.output.exists())

    def test_rejects_unbundled_category_without_creating_output(self):
        self.cues.write_text(json.dumps(self.cue_payload(category="runtime-url")), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 2)
        self.assertIn("cue_category_unsupported", result.stderr)
        self.assertFalse(self.output.exists())

    def test_skips_sound_pass_without_reencoding_when_no_event_needs_sound(self):
        payload = self.cue_payload()
        payload["status"] = "skipped_no_cues"
        payload["cues"] = []
        payload["reason"] = "The approved visual plan has no event that benefits from sound."
        self.cues.write_text(json.dumps(payload), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output.read_bytes(), self.video.read_bytes())
        evidence = json.loads(self.cues.read_text(encoding="utf-8"))["render_evidence"]
        self.assertEqual(evidence["status"], "skipped_no_cues")
        self.assertEqual(evidence["applied_cues"], [])

    def test_whoosh_is_placed_before_its_visual_event(self):
        self.cues.write_text(json.dumps(self.cue_payload(category="whoosh")), encoding="utf-8")

        result = self.run_pass()

        self.assertEqual(result.returncode, 0, result.stderr)
        evidence = json.loads(self.cues.read_text(encoding="utf-8"))["render_evidence"]
        applied = evidence["applied_cues"][0]
        self.assertLess(applied["applied_start_seconds"], applied["time_seconds"])

    def test_failed_output_commit_preserves_existing_output_and_cue_report(self):
        payload = self.cue_payload()
        payload["render_evidence"] = {"status": "previous"}
        original_cues = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.cues.write_bytes(original_cues)
        original_output = b"previous output"
        self.output.write_bytes(original_output)
        real_replace = os.replace
        failed_once = False

        def fail_video_commit(source, destination):
            nonlocal failed_once
            if Path(destination) == self.output:
                if not failed_once:
                    failed_once = True
                    raise OSError("simulated commit failure")
            return real_replace(source, destination)

        with patch.object(SOUND_PASS.os, "replace", side_effect=fail_video_commit):
            with self.assertRaises(SOUND_PASS.SoundPassError) as failure:
                SOUND_PASS.sound_pass(self.video, self.cues, self.output, 1800)

        self.assertEqual(failure.exception.args[0], "output_commit_failed")
        self.assertEqual(self.output.read_bytes(), original_output)
        self.assertEqual(self.cues.read_bytes(), original_cues)

    def test_failed_cue_report_commit_rolls_back_video(self):
        payload = self.cue_payload()
        payload["render_evidence"] = {"status": "previous"}
        original_cues = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.cues.write_bytes(original_cues)
        original_output = b"previous output"
        self.output.write_bytes(original_output)
        real_replace = os.replace

        def fail_cue_commit(source, destination):
            if Path(destination).resolve() == self.cues.resolve():
                raise OSError("simulated cue report failure")
            return real_replace(source, destination)

        with patch.object(SOUND_PASS.os, "replace", side_effect=fail_cue_commit):
            with self.assertRaises(SOUND_PASS.SoundPassError) as failure:
                SOUND_PASS.sound_pass(self.video, self.cues, self.output, 1800)

        self.assertEqual(failure.exception.args[0], "output_commit_failed")
        self.assertEqual(self.output.read_bytes(), original_output)
        self.assertEqual(self.cues.read_bytes(), original_cues)


if __name__ == "__main__":
    unittest.main()
