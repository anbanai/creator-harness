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
    def test_stage_required_paths_do_not_require_generated_video_by_default(self):
        required = render_qc.stage_required_paths(False)
        self.assertNotIn("output/generated-video-manifest.json", required)
        self.assertNotIn("output/generated-video-review.json", required)
        self.assertNotIn("output/generated-video-lint.json", required)

    def test_stage_required_paths_include_generated_video_when_declared(self):
        required = render_qc.stage_required_paths(True)
        self.assertIn("output/generated-video-manifest.json", required)

    def test_first_audio_residue_blocks_short_flash_before_declared_dialogue(self):
        original_run = render_qc.run
        try:
            render_qc.run = lambda command: type("Result", (), {"returncode": 0, "stdout": "", "stderr": "[silencedetect] silence_start: 0.08\n[silencedetect] silence_end: 0.14\n"})()
            check = render_qc.first_audio_residue_check(Path("video.mp4"), 0.5)
        finally:
            render_qc.run = original_run
        self.assertEqual(check.status, "blocked")

    def test_first_audio_residue_blocks_when_lead_in_is_unverifiable(self):
        original_run = render_qc.run
        try:
            render_qc.run = lambda command: type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()
            check = render_qc.first_audio_residue_check(Path("video.mp4"), 0.5)
        finally:
            render_qc.run = original_run
        self.assertEqual(check.status, "blocked")

    def test_first_audio_residue_passes_verified_leading_silence(self):
        original_run = render_qc.run
        try:
            render_qc.run = lambda command: type("Result", (), {"returncode": 0, "stdout": "", "stderr": "[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.5\n"})()
            check = render_qc.first_audio_residue_check(Path("video.mp4"), 0.5)
        finally:
            render_qc.run = original_run
        self.assertEqual(check.status, "passed")

    def test_first_dialogue_start_uses_final_asr_when_edl_begins_at_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / "asr.json"
            transcript.write_text(json.dumps({"segments": [{"start_time": 0.42}]}))
            self.assertEqual(render_qc.first_declared_dialogue_start(None, 30, transcript), 0.42)

    def test_first_dialogue_start_preserves_zero_start_from_final_asr(self):
        with tempfile.TemporaryDirectory() as directory:
            transcript = Path(directory) / "asr.json"
            transcript.write_text(json.dumps({"segments": [{"start_time": 0.0}]}))
            self.assertEqual(render_qc.first_declared_dialogue_start(None, 30, transcript), 0.0)

    def test_run_qc_blocks_unverifiable_first_audio_residue(self):
        original = {
            "probe": render_qc.probe,
            "decode_ok": render_qc.decode_ok,
            "frame_rate": render_qc.frame_rate,
            "duration": render_qc.duration,
            "energy_windows": render_qc.energy_windows,
            "silence_intervals": render_qc.silence_intervals,
            "tail_energy": render_qc.tail_energy,
            "first_audio_residue_check": render_qc.first_audio_residue_check,
            "true_peak_check": render_qc.true_peak_check,
            "freeze_intervals": render_qc.freeze_intervals,
            "transcript_timing_checks": render_qc.transcript_timing_checks,
            "audio_content_checks": render_qc.audio_content_checks,
        }
        try:
            render_qc.probe = lambda _: {"streams": [{"codec_type": "video", "codec_name": "h264", "r_frame_rate": "30/1", "duration": "1.0"}, {"codec_type": "audio", "codec_name": "aac", "duration": "1.0"}]}
            render_qc.decode_ok = lambda _: (True, "")
            render_qc.frame_rate = lambda _: 30.0
            render_qc.duration = lambda metadata, stream: 1.0
            render_qc.energy_windows = lambda _: ([-20.0], "")
            render_qc.silence_intervals = lambda _: ([], "")
            render_qc.tail_energy = lambda _: True
            render_qc.first_audio_residue_check = lambda *_: render_qc.Check("first_audio_residue", "blocked", message="unverifiable")
            render_qc.true_peak_check = lambda _: render_qc.Check("true_peak", "passed")
            render_qc.freeze_intervals = lambda _: ([], "")
            render_qc.transcript_timing_checks = lambda *args, **kwargs: []
            render_qc.audio_content_checks = lambda *args, **kwargs: []
            report = render_qc.run_qc(Path("video.mp4"), "rev-1", "off", "complete", None)
        finally:
            for name, value in original.items():
                setattr(render_qc, name, value)
        self.assertEqual(report["gate"], "blocked")
        residue = next(item for item in report["checks"] if item["id"] == "first_audio_residue")
        self.assertEqual(residue["status"], "blocked")

    def test_true_peak_check_blocks_clipping(self):
        original_run = render_qc.run
        try:
            render_qc.run = lambda command: type("Result", (), {"returncode": 0, "stdout": "", "stderr": "Peak: -0.2 dBFS\n"})()
            check = render_qc.true_peak_check(Path("video.mp4"))
        finally:
            render_qc.run = original_run
        self.assertEqual(check.status, "blocked")

    def test_generated_video_gate_blocks_when_required_inputs_are_missing(self):
        check = render_qc.generated_video_check(None, None, "rev-1", Path.cwd())
        self.assertEqual(check.status, "blocked")
        self.assertEqual(check.check_id, "generated_video_adoption")

    def test_stage_lineage_recomputes_order_revision_and_current_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "output" / "final.mp4"
            artifact.parent.mkdir()
            artifact.write_bytes(b"current render")
            digest = render_qc.file_sha256(artifact)
            event = {
                "event_index": 1,
                "stage": "final_render",
                "revision_id": "rev-1",
                "started_at": "2026-11-03T10:00:00Z",
                "completed_at": "2026-11-03T10:01:00Z",
                "outputs": [{"path": "output/final.mp4", "sha256": digest, "revision_id": "rev-1", "created_at_stage": "final_render"}],
            }
            state = {"schema_version": "1.0", "source": "ip-explainer", "revision_id": "rev-1", "events": [event]}
            valid = render_qc.stage_lineage_check_value(state, root, "rev-1", ["output/final.mp4"])
            self.assertEqual(valid["gate"], "passed")
            artifact.write_bytes(b"changed after evidence")
            stale = render_qc.stage_lineage_check_value(state, root, "rev-1", ["output/final.mp4"])
            self.assertEqual(stale["gate"], "blocked")

    def test_transcript_timing_evidence_requires_checkpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sync.json"
            path.write_text(json.dumps({"checkpoints": []}))
            checks = render_qc.transcript_timing_checks(Path("video.mp4"), path, revision_id="rev-1")
            self.assertEqual(checks[0].status, "blocked")

    def test_transcript_coverage_is_recomputed_from_edl_and_asr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sync.json"
            video = Path(directory) / "video.mp4"
            edl = Path(directory) / "edl.json"
            transcript = Path(directory) / "asr.json"
            video.write_bytes(b"video")
            edl.write_text(json.dumps({"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "source_video_in": 0, "source_video_out": 2,
                "source_audio_sample_start": 0, "source_audio_sample_end": 96000,
                "output_start_frame": 0, "output_end_frame": 60,
            }]}))
            transcript.write_text(json.dumps({"segments": [{"segment_id": "s1", "text": "hello", "start_time": 0.12, "end_time": 1.94}]}))
            original_audio_hash = render_qc.audio_track_sha256
            render_qc.audio_track_sha256 = lambda _: "audio-hash"
            transcript_data = json.loads(transcript.read_text())
            transcript_data.update({"schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio-hash"})
            transcript.write_text(json.dumps(transcript_data))
            path.write_text(json.dumps({
                "schema_version": "1.0",
                "source": "video-production-qc",
                "method": "edl-transcript-coverage",
                "revision_id": "rev-1",
                "video_sha256": render_qc.file_sha256(video),
                "edl_sha256": render_qc.file_sha256(edl),
                "transcript_sha256": render_qc.file_sha256(transcript),
                "audio_sha256": "audio-hash",
                "segments": [{"segment_id": "s1", "output_start_frame": 0, "output_end_frame": 60, "asr_start_time": 0.12, "asr_end_time": 1.94}],
            }))
            checks = render_qc.transcript_timing_checks(video, path, revision_id="rev-1", edl_path=edl, transcript_path=transcript)
            self.assertEqual(checks[0].status, "passed")
            self.assertIn("within its assigned EDL output interval", checks[0].threshold)
            render_qc.audio_track_sha256 = original_audio_hash

    def test_transcript_interval_outside_edl_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video, edl, transcript, evidence = (root / name for name in ("video.mp4", "edl.json", "asr.json", "sync.json"))
            video.write_bytes(b"video")
            edl.write_text(json.dumps({"fps": 30, "segments": [{"segment_id": "s1", "output_start_frame": 0, "output_end_frame": 30}]}))
            transcript.write_text(json.dumps({"schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio-hash", "segments": [{"segment_id": "s1", "text": "hello", "start_time": 0.2, "end_time": 1.2}]}))
            original_audio_hash = render_qc.audio_track_sha256
            render_qc.audio_track_sha256 = lambda _: "audio-hash"
            evidence.write_text(json.dumps({
                "schema_version": "1.0", "source": "video-production-qc", "method": "edl-transcript-coverage", "revision_id": "rev-1",
                "video_sha256": render_qc.file_sha256(video), "edl_sha256": render_qc.file_sha256(edl), "transcript_sha256": render_qc.file_sha256(transcript), "audio_sha256": "audio-hash",
                "segments": [{"segment_id": "s1", "output_start_frame": 0, "output_end_frame": 30, "asr_start_time": 0.2, "asr_end_time": 1.2}],
            }))
            try:
                checks = render_qc.transcript_timing_checks(video, evidence, revision_id="rev-1", edl_path=edl, transcript_path=transcript)
            finally:
                render_qc.audio_track_sha256 = original_audio_hash
            self.assertEqual(checks[0].status, "blocked")

    def test_transcript_timing_evidence_rejects_unattributed_all_zero_offsets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sync.json"
            path.write_text(json.dumps({
                "schema_version": "1.0",
                "source": "manual",
                "revision_id": "rev-1",
                "checkpoints": [{"segment_id": "s1", "offset_ms": 0}, {"segment_id": "s1", "offset_ms": 0}],
            }))
            checks = render_qc.transcript_timing_checks(Path("video.mp4"), path, revision_id="rev-1")
            self.assertEqual(checks[0].status, "blocked")

    def test_transcript_timing_rejects_non_monotonic_asr_times(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video, edl, transcript, evidence = (root / name for name in ("video.mp4", "edl.json", "asr.json", "sync.json"))
            video.write_bytes(b"video")
            edl.write_text(json.dumps({"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "output_start_frame": 0, "output_end_frame": 30,
            }]}))
            transcript.write_text(json.dumps({"schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio-hash", "segments": [{
                "segment_id": "s1", "start_time": 1.0, "end_time": 0.5,
            }]}))
            original_audio_hash = render_qc.audio_track_sha256
            render_qc.audio_track_sha256 = lambda _: "audio-hash"
            evidence.write_text(json.dumps({
                "schema_version": "1.0", "source": "video-production-qc", "method": "edl-source-time-audit", "revision_id": "rev-1",
                "video_sha256": render_qc.file_sha256(video), "edl_sha256": render_qc.file_sha256(edl), "transcript_sha256": render_qc.file_sha256(transcript), "audio_sha256": "audio-hash",
                "checkpoints": [],
            }))
            try:
                checks = render_qc.transcript_timing_checks(video, evidence, revision_id="rev-1", edl_path=edl, transcript_path=transcript)
            finally:
                render_qc.audio_track_sha256 = original_audio_hash
            self.assertEqual(checks[0].status, "blocked")

    def test_audio_content_check_requires_all_three_verifications(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio-content-check.json"
            path.write_text(json.dumps({
                "schema_version": "1.0",
                "source": "video-production-qc",
                "revision_id": "rev-1",
                "method": "independent-asr-script",
                "inputs": {"video": "output/final.mp4", "edl": "output/edit-decision-list.json"},
                "segments": [{"segment_id": "s1", "dialogue_match": True, "duplicate_phrase_check": True}],
            }))
            checks = render_qc.audio_content_checks(path, revision_id="rev-1")
            self.assertEqual(checks[0].status, "blocked")

    def test_audio_content_check_blocks_stale_revision(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audio-content-check.json"
            path.write_text(json.dumps({
                "schema_version": "1.0",
                "source": "video-production-qc",
                "revision_id": "rev-old",
                "method": "independent-asr-script",
                "inputs": {"video": "output/final.mp4", "edl": "output/edit-decision-list.json"},
                "segments": [{"segment_id": "s1", "dialogue_match": True, "duplicate_phrase_check": True, "source_time_alignment": True}],
            }))
            checks = render_qc.audio_content_checks(path, revision_id="rev-1")
            self.assertEqual(checks[0].status, "blocked")

    def test_audio_content_check_recomputes_dialogue_and_source_alignment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "final.mp4"
            edl_path = root / "edl.json"
            transcript_path = root / "asr.json"
            evidence_path = root / "audio-content-check.json"
            video.write_bytes(b"candidate")
            edl = {"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "dialogue": "你好世界", "source_video_in": 2.0,
                "source_video_out": 3.0, "source_audio_sample_start": 96000,
                "source_audio_sample_end": 144000,
                "output_start_frame": 0, "output_end_frame": 30,
            }]}
            transcript = {"segments": [{"segment_id": "s1", "text": "你好世界", "start_time": 0.0, "end_time": 1.0}]}
            original_audio_hash = render_qc.audio_track_sha256
            render_qc.audio_track_sha256 = lambda _: "audio-hash"
            edl_path.write_text(json.dumps(edl))
            transcript.update({"schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio-hash"})
            transcript_path.write_text(json.dumps(transcript))
            evidence_path.write_text(json.dumps({
                "schema_version": "1.0", "source": "video-production-qc",
                "method": "independent-asr-script", "revision_id": "rev-1",
                "video_sha256": render_qc.file_sha256(video),
                "edl_sha256": render_qc.file_sha256(edl_path),
                "transcript_sha256": render_qc.file_sha256(transcript_path),
                "audio_sha256": "audio-hash",
                "asr_source": "final-audio-track",
                "duplicate_phrase_candidates": [],
                "duplicate_phrase_reviews": [],
                "segments": [{
                    "segment_id": "s1", "expected_dialogue": "你好世界", "asr_text": "你好世界",
                    "dialogue_match": True, "duplicate_phrase_check": True,
                    "duplicate_phrase_candidates": [],
                    "source_time_alignment": True, "asr_evidence_path": transcript_path.as_posix(),
                }],
            }))
            checks = render_qc.audio_content_checks(evidence_path, "rev-1", video, edl_path, transcript_path)
            self.assertEqual(checks[0].status, "passed")

            edl["segments"][0]["source_audio_sample_start"] = 0
            edl_path.write_text(json.dumps(edl))
            checks = render_qc.audio_content_checks(evidence_path, "rev-1", video, edl_path, transcript_path)
            self.assertEqual(checks[0].status, "blocked")
            render_qc.audio_track_sha256 = original_audio_hash

    def test_audio_content_check_blocks_false_duplicate_review(self):
        repeated_text = "这是一个完整重复短语这是一个完整重复短语"
        repeated = render_qc.repeated_phrases([repeated_text], segment_ids=["s1"])
        self.assertNotEqual(repeated, [])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "final.mp4"
            edl_path = root / "edl.json"
            transcript_path = root / "asr.json"
            evidence_path = root / "audio-content-check.json"
            video.write_bytes(b"candidate")
            edl = {"fps": 30, "sample_rate": 48000, "segments": [{
                "segment_id": "s1", "dialogue": repeated_text, "source_video_in": 2.0,
                "source_video_out": 3.0, "source_audio_sample_start": 96000,
                "source_audio_sample_end": 144000, "output_start_frame": 0, "output_end_frame": 30,
            }]}
            transcript = {"schema_version": "1.0", "source": "independent-final-track-asr", "audio_sha256": "audio-hash", "segments": [{
                "segment_id": "s1", "text": repeated_text, "start_time": 0.0, "end_time": 1.0,
            }]}
            edl_path.write_text(json.dumps(edl))
            transcript_path.write_text(json.dumps(transcript))
            original_audio_hash = render_qc.audio_track_sha256
            render_qc.audio_track_sha256 = lambda _: "audio-hash"
            base_evidence = {
                "schema_version": "1.0", "source": "video-production-qc", "method": "independent-asr-script",
                "revision_id": "rev-1", "video_sha256": render_qc.file_sha256(video),
                "edl_sha256": render_qc.file_sha256(edl_path), "transcript_sha256": render_qc.file_sha256(transcript_path),
                "audio_sha256": "audio-hash", "asr_source": "final-audio-track",
                "duplicate_phrase_candidates": repeated,
                "segments": [{"segment_id": "s1", "expected_dialogue": repeated_text, "asr_text": repeated_text,
                              "dialogue_match": True, "duplicate_phrase_check": True,
                              "duplicate_phrase_candidates": repeated, "source_time_alignment": True,
                              "asr_evidence_path": transcript_path.as_posix()}],
            }
            try:
                valid_reviews = [{**candidate, "reviewed": True, "decision": "keep", "reason": "intentional repetition"} for candidate in repeated]
                removed_reviews = [{**candidate, "reviewed": True, "decision": "remove", "reason": "claimed removed"} for candidate in repeated]
                for reviews, expected_status in (([], "blocked"), (removed_reviews, "blocked"), (valid_reviews, "passed")):
                    evidence = {**base_evidence, "duplicate_phrase_reviews": reviews}
                    evidence_path.write_text(json.dumps(evidence))
                    checks = render_qc.audio_content_checks(evidence_path, "rev-1", video, edl_path, transcript_path)
                    self.assertEqual(checks[0].status, expected_status)
            finally:
                render_qc.audio_track_sha256 = original_audio_hash

    def test_audio_content_check_rejects_duplicate_segment_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video, edl_path, transcript_path, evidence_path = (root / name for name in ("final.mp4", "edl.json", "asr.json", "check.json"))
            video.write_bytes(b"candidate")
            edl_path.write_text(json.dumps({"fps": 30, "sample_rate": 48000, "segments": [
                {"segment_id": "s1"}, {"segment_id": "s1"},
            ]}))
            transcript_path.write_text(json.dumps({"segments": []}))
            evidence_path.write_text(json.dumps({"segments": []}))
            checks = render_qc.audio_content_checks(evidence_path, "rev-1", video, edl_path, transcript_path)
            self.assertEqual(checks[0].status, "blocked")

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
            self.assertFalse(any(item["id"] in ("asr_provenance", "rendered_av_sync", "generated_video_render_presence") for item in report["checks"]))


if __name__ == "__main__":
    unittest.main()
