import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("generate_audio_content_check", ROOT / "scripts" / "generate_audio_content_check.py")
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


class GenerateAudioContentCheckTests(unittest.TestCase):
    def test_generator_recomputes_content_and_source_alignment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "final.mp4"; video.write_bytes(b"video")
            edl = root / "edl.json"; edl.write_text(json.dumps({"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "dialogue": "保留这句话", "source_video_in": 1.0, "source_video_out": 2.0,
                "source_audio_sample_start": 48000, "source_audio_sample_end": 96000,
                "output_start_frame": 0, "output_end_frame": 30,
            }]}))
            transcript = root / "asr.json"; transcript.write_text(json.dumps({
                "schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio",
                "segments": [{"segment_id": "s1", "text": "保留这句话", "start_time": 0.1, "end_time": 0.9}],
            }))
            with patch.object(module, "audio_sha256", return_value="audio"):
                report = module.generate(video, edl, transcript, "rev-1")
            self.assertEqual(report["gate"], "passed")
            self.assertTrue(report["segments"][0]["dialogue_match"])

    def test_generator_blocks_mismatched_dialogue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "final.mp4"; video.write_bytes(b"video")
            edl = root / "edl.json"; edl.write_text(json.dumps({"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "dialogue": "原台词", "source_video_in": 1.0, "source_video_out": 2.0,
                "source_audio_sample_start": 48000, "source_audio_sample_end": 96000,
                "output_start_frame": 0, "output_end_frame": 30,
            }]}))
            transcript = root / "asr.json"; transcript.write_text(json.dumps({
                "schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio",
                "segments": [{"segment_id": "s1", "text": "错误台词", "start_time": 0.1, "end_time": 0.9}],
            }))
            with patch.object(module, "audio_sha256", return_value="audio"):
                report = module.generate(video, edl, transcript, "rev-1")
            self.assertEqual(report["gate"], "blocked")
            self.assertTrue(any("ASR text" in error for error in report["errors"]))


if __name__ == "__main__":
    unittest.main()
