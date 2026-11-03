#!/usr/bin/env python3
"""Deterministic post-render quality gate for talking-head videos."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Check:
    check_id: str
    status: str
    severity: str = "blocker"
    method: str = ""
    measured: Any = None
    threshold: Any = None
    evidence_paths: list[str] | None = None
    message: str = ""

    def as_dict(self) -> dict[str, Any]:
        result = {
            "id": self.check_id,
            "status": self.status,
            "severity": self.severity,
            "method": self.method,
            "measured": self.measured,
            "threshold": self.threshold,
            "evidence_paths": self.evidence_paths or [],
        }
        if self.message:
            result["message"] = self.message
        return result


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def probe(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return json.loads(result.stdout)


def frame_rate(stream: dict[str, Any]) -> float:
    value = stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1"
    try:
        numerator, denominator = value.split("/", 1)
        return float(numerator) / float(denominator)
    except (ValueError, ZeroDivisionError):
        return 0.0


def duration(data: dict[str, Any], stream: dict[str, Any] | None = None) -> float:
    value = (stream or {}).get("duration") or data.get("format", {}).get("duration") or 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def parse_intervals(text: str, prefix: str, end_key: str) -> list[tuple[float, float]]:
    starts: list[float] = []
    intervals: list[tuple[float, float]] = []
    for line in text.splitlines():
        if prefix not in line:
            continue
        start_match = re.search(r"(?:lavfi\.[^=]+_start|start):\s*([0-9.]+)", line)
        end_match = re.search(rf"(?:lavfi\.[^=]+_{end_key}|{end_key}):\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
        if end_match and starts:
            intervals.append((starts.pop(0), float(end_match.group(1))))
    return intervals


def silence_intervals(path: Path) -> tuple[list[tuple[float, float]], str]:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "silencedetect=noise=-45dB:d=0.05", "-f", "null", "-"
    ])
    text = result.stderr + result.stdout
    intervals: list[tuple[float, float]] = []
    starts: list[float] = []
    for line in text.splitlines():
        start_match = re.search(r"silence_start:\s*([0-9.]+)", line)
        end_match = re.search(r"silence_end:\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
        if end_match and starts:
            intervals.append((starts.pop(0), float(end_match.group(1))))
    return intervals, text


def energy_windows(path: Path, window: float = 10.0) -> tuple[list[float], str]:
    # astats emits one RMS level per reset window. `-inf` is treated as no energy.
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"astats=metadata=1:reset={window},ametadata=print:file=-",
        "-f", "null", "-"
    ])
    text = result.stderr + result.stdout
    values: list[float] = []
    for line in text.splitlines():
        if "lavfi.astats.Overall.RMS_level" not in line:
            continue
        try:
            value = float(line.rsplit("=", 1)[1])
        except ValueError:
            continue
        values.append(value)
    return values, text


def tail_energy(path: Path, tail: float = 0.5) -> bool:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-sseof", f"-{tail}", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-"
    ])
    text = result.stderr + result.stdout
    match = re.search(r"mean_volume:\s*(-?inf|[-+0-9.]+) dB", text)
    return bool(match and match.group(1) != "-inf")


def freeze_intervals(path: Path) -> tuple[list[tuple[float, float]], str]:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-vf", "freezedetect=n=-60dB:d=0.5", "-an", "-f", "null", "-"
    ])
    text = result.stderr + result.stdout
    starts: list[float] = []
    intervals: list[tuple[float, float]] = []
    for line in text.splitlines():
        start_match = re.search(r"freeze_start:\s*([0-9.]+)", line)
        end_match = re.search(r"freeze_end:\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
        if end_match and starts:
            intervals.append((starts.pop(0), float(end_match.group(1))))
    return intervals, text


def decode_ok(path: Path) -> tuple[bool, str]:
    result = run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])
    return result.returncode == 0, result.stderr.strip()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audio_track_sha256(path: Path) -> str:
    """Hash decoded PCM from the first final-media audio stream."""
    process = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0",
            "-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "s16le", "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    digest = hashlib.sha256()
    assert process.stdout is not None
    for chunk in iter(lambda: process.stdout.read(1024 * 1024), b""):
        digest.update(chunk)
    if process.wait() != 0:
        raise RuntimeError("unable to decode final audio stream")
    return digest.hexdigest()


def normalized_text(value: str) -> str:
    return re.sub(r"[\W_]+", "", value, flags=re.UNICODE).casefold()


def repeated_phrases(texts: list[str], minimum: int = 5, segment_ids: list[str] | None = None) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    normalized = [normalized_text(text) for text in texts]
    seen: set[str] = set()
    for text in normalized:
        for start in range(0, max(0, len(text) - minimum + 1)):
            phrase = text[start:start + minimum]
            if not phrase:
                continue
            if phrase in seen:
                continue
            seen.add(phrase)
            locations = [position for position, other in enumerate(normalized) if phrase in other]
            repeated_in_segment = any(other.count(phrase) > 1 for other in normalized)
            if len(locations) > 1 or repeated_in_segment:
                candidates.append({"phrase": phrase, "segment_ids": [segment_ids[position] for position in locations] if segment_ids else locations})
    return candidates


def transcript_timing_checks(path: Path, evidence_path: Path | None, revision_id: str | None = None, edl_path: Path | None = None, transcript_path: Path | None = None) -> list[Check]:
    if evidence_path is None or edl_path is None or transcript_path is None:
        return [Check("transcript_timing_evidence", "blocked", message="current EDL, ASR transcript and transcript coverage evidence are required")]
    try:
        data = json.loads(evidence_path.read_text())
        edl = json.loads(edl_path.read_text())
        transcript = json.loads(transcript_path.read_text())
        edl_rows = edl.get("segments")
        transcript_rows = transcript.get("segments")
        if not isinstance(edl_rows, list) or not isinstance(transcript_rows, list) or not edl_rows:
            raise ValueError("EDL and ASR segments are required")
        edl_ids = [str(row.get("segment_id")) for row in edl_rows if isinstance(row, dict)]
        transcript_ids = [str(row.get("segment_id")) for row in transcript_rows if isinstance(row, dict)]
        if len(edl_ids) != len(edl_rows) or len(edl_ids) != len(set(edl_ids)) or any(not value.strip() for value in edl_ids):
            raise ValueError("EDL segment IDs must be present and unique")
        if len(transcript_ids) != len(transcript_rows) or len(transcript_ids) != len(set(transcript_ids)) or set(edl_ids) != set(transcript_ids):
            raise ValueError("ASR transcript must map exactly one reviewed segment to each EDL segment")
        fps = edl.get("fps")
        if not isinstance(fps, (int, float)) or isinstance(fps, bool) or not math.isfinite(fps) or fps <= 0:
            raise ValueError("EDL fps must be finite and positive")
        if not (
            isinstance(data, dict)
            and data.get("schema_version") == "1.0"
            and data.get("source") == "video-production-qc"
            and data.get("method") == "edl-transcript-coverage"
            and (revision_id is None or data.get("revision_id") == revision_id)
            and data.get("video_sha256") == file_sha256(path)
            and data.get("edl_sha256") == file_sha256(edl_path)
            and data.get("transcript_sha256") == file_sha256(transcript_path)
            and data.get("audio_sha256") == audio_track_sha256(path)
            and transcript.get("source") == "independent-final-track-asr"
            and transcript.get("audio_sha256") == data.get("audio_sha256")
        ):
            raise ValueError("coverage evidence is stale or not bound to the current candidate, EDL, transcript and revision")
        transcript_by_id = {str(row["segment_id"]): row for row in transcript_rows}
        coverage = []
        tolerance = 1.0 / float(fps)
        for row in edl_rows:
            segment_id = str(row["segment_id"])
            start_frame = row.get("output_start_frame")
            end_frame = row.get("output_end_frame")
            asr = transcript_by_id[segment_id]
            start_time = asr.get("start_time")
            end_time = asr.get("end_time")
            values = (start_frame, end_frame, start_time, end_time)
            if any(not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) for value in values):
                raise ValueError(f"segment {segment_id} has invalid frame or ASR timestamps")
            output_start = float(start_frame) / float(fps)
            output_end = float(end_frame) / float(fps)
            if end_frame <= start_frame or start_time < 0 or end_time <= start_time or start_time < output_start - tolerance or end_time > output_end + tolerance:
                raise ValueError(f"ASR speech interval for {segment_id} falls outside its EDL output segment")
            coverage.append({"segment_id": segment_id, "output_start_frame": start_frame, "output_end_frame": end_frame, "asr_start_time": start_time, "asr_end_time": end_time})
        if data.get("segments") != coverage:
            raise ValueError("coverage evidence does not match recomputed EDL and ASR segment intervals")
        return [Check("transcript_timing_evidence", "passed", method="recomputed-edl-transcript-segment-coverage", measured={"segments": len(coverage)}, threshold="ASR intervals within its assigned EDL output interval, within one frame", evidence_paths=[str(evidence_path), str(edl_path), str(transcript_path)])]
    except (OSError, json.JSONDecodeError, TypeError, ValueError, KeyError, AttributeError, OverflowError) as exc:
        return [Check("transcript_timing_evidence", "blocked", message=f"invalid EDL/transcript coverage evidence: {exc}")]


def audio_content_checks(evidence_path: Path | None, revision_id: str, video: Path | None = None, edl_path: Path | None = None, transcript_path: Path | None = None) -> list[Check]:
    if evidence_path is None or video is None or edl_path is None or transcript_path is None:
        return [Check("audio_content_check", "blocked", message="current audio content evidence, final video, EDL and ASR transcript are required")]
    try:
        data = json.loads(evidence_path.read_text())
        edl = json.loads(edl_path.read_text())
        transcript = json.loads(transcript_path.read_text())
        if not isinstance(data, dict) or not isinstance(edl, dict) or not isinstance(transcript, dict):
            raise ValueError("EDL, transcript and audio content evidence must be objects")
        segments = data.get("segments", [])
        if not isinstance(segments, list):
            raise ValueError("audio content evidence segments must be a list")
        sample_rate = edl.get("sample_rate")
        fps = edl.get("fps")
        if not isinstance(edl.get("segments"), list):
            raise ValueError("EDL segments must be a list")
        edl_segments = {str(item.get("segment_id")): item for item in edl.get("segments", []) if isinstance(item, dict)}
        asr_rows = transcript.get("segments")
        edl_rows = edl.get("segments")
        if not isinstance(asr_rows, list) or not isinstance(edl_rows, list):
            raise ValueError("EDL and transcript segments are required")
        edl_ids = [str(item.get("segment_id")) for item in edl_rows if isinstance(item, dict)]
        asr_ids = [str(item.get("segment_id")) for item in asr_rows if isinstance(item, dict)]
        if len(edl_ids) != len(edl_rows) or len(edl_ids) != len(set(edl_ids)) or not edl_ids or any(not value.strip() for value in edl_ids):
            raise ValueError("EDL segment IDs must be present and unique")
        if len(asr_ids) != len(asr_rows) or len(asr_ids) != len(set(asr_ids)) or any(not value.strip() for value in asr_ids):
            raise ValueError("ASR segment IDs must be present and unique")
        asr_segments = {str(item.get("segment_id")): item for item in asr_rows if isinstance(item, dict)}
        decoded_audio_sha256 = audio_track_sha256(video)
        asr_ids = [str(item.get("segment_id")) for item in asr_rows]
        computed_repeats = repeated_phrases([str(item.get("text", "")) for item in asr_rows], segment_ids=asr_ids)
        evidence_repeats = data.get("duplicate_phrase_candidates")
        repeats_by_segment = {
            str(segment_id): [candidate for candidate in computed_repeats if str(segment_id) in {str(value) for value in candidate.get("segment_ids", [])}]
            for segment_id in edl_segments
        }
        repeated_review_rows_valid = all(
            isinstance(review, dict)
            and review.get("phrase") == candidate["phrase"]
            and review.get("segment_ids") == candidate["segment_ids"]
            and review.get("reviewed") is True
            and review.get("decision") == "keep"
            and isinstance(review.get("reason"), str) and bool(review["reason"].strip())
            for review, candidate in zip(data.get("duplicate_phrase_reviews", []), computed_repeats)
        ) and len(data.get("duplicate_phrase_reviews", [])) == len(computed_repeats)
        rows_valid = bool(segments) and evidence_repeats == computed_repeats and all(
            str(item.get("segment_id")) in edl_segments
            and str(item.get("segment_id")) in asr_segments
            and normalized_text(str(item.get("expected_dialogue", ""))) == normalized_text(str(edl_segments[str(item["segment_id"])].get("dialogue", "")))
            and normalized_text(str(item.get("asr_text", ""))) == normalized_text(str(asr_segments[str(item["segment_id"])].get("text", "")))
            and normalized_text(str(item.get("asr_text", ""))) == normalized_text(str(item.get("expected_dialogue", "")))
            and item.get("dialogue_match") is True
            and item.get("duplicate_phrase_check") is True
            and item.get("duplicate_phrase_candidates") == repeats_by_segment[str(item["segment_id"])]
            and item.get("source_time_alignment") is True
            and isinstance(sample_rate, (int, float)) and sample_rate > 0
            and isinstance(fps, (int, float)) and fps > 0
            and isinstance(asr_segments[str(item["segment_id"])].get("start_time"), (int, float))
            and isinstance(asr_segments[str(item["segment_id"])].get("end_time"), (int, float))
            and asr_segments[str(item["segment_id"])]["start_time"] >= 0
            and asr_segments[str(item["segment_id"])]["end_time"] > asr_segments[str(item["segment_id"])]["start_time"]
            and float(asr_segments[str(item["segment_id"])]["start_time"]) >= float(edl_segments[str(item["segment_id"])]["output_start_frame"]) / float(fps) - 1 / fps
            and float(asr_segments[str(item["segment_id"])]["end_time"]) <= float(edl_segments[str(item["segment_id"])]["output_end_frame"]) / float(fps) + 1 / fps
            and abs(float(edl_segments[str(item["segment_id"])] ["source_audio_sample_start"]) / sample_rate - float(edl_segments[str(item["segment_id"])] ["source_video_in"])) <= 1 / fps
            and abs(float(edl_segments[str(item["segment_id"])] ["source_audio_sample_end"]) / sample_rate - float(edl_segments[str(item["segment_id"])] ["source_video_out"])) <= 1 / fps
            and item.get("segment_id")
            and Path(str(item.get("asr_evidence_path"))).as_posix() == transcript_path.as_posix()
            for item in segments
        ) and set(map(str, edl_segments)) == set(map(str, asr_segments)) == {str(item.get("segment_id")) for item in segments}
        valid = (
            data.get("schema_version") == "1.0"
            and data.get("source") == "video-production-qc"
            and data.get("method") == "independent-asr-script"
            and data.get("revision_id") == revision_id
            and data.get("video_sha256") == file_sha256(video)
            and data.get("edl_sha256") == file_sha256(edl_path)
            and data.get("transcript_sha256") == file_sha256(transcript_path)
            and data.get("asr_source") == "final-audio-track"
            and transcript.get("schema_version") == "1.0"
            and transcript.get("source") == "independent-final-track-asr"
            and transcript.get("audio_sha256") == decoded_audio_sha256
            and data.get("audio_sha256") == decoded_audio_sha256
            and rows_valid
            and repeated_review_rows_valid
        )
        return [Check("audio_content_check", "passed" if valid else "blocked", method="decoded-audio-hash-and-transcript-recomputation", measured={"segments": len(segments), "duplicate_phrase_candidates": computed_repeats, "video_sha256": data.get("video_sha256"), "audio_sha256": decoded_audio_sha256, "edl_sha256": data.get("edl_sha256"), "transcript_sha256": data.get("transcript_sha256")}, threshold="all EDL segments match independent ASR bound to the decoded final audio track", evidence_paths=[str(evidence_path), str(video), str(edl_path), str(transcript_path)])]
    except (OSError, json.JSONDecodeError, TypeError, ValueError, KeyError, AttributeError, OverflowError) as exc:
        return [Check("audio_content_check", "blocked", message=f"invalid audio content evidence: {exc}")]


def generated_video_check(manifest_path: Path | None, edl_path: Path | None, revision_id: str, root: Path) -> Check:
    if manifest_path is None or edl_path is None:
        return Check("generated_video_adoption", "blocked", method="talking-head-video-generation validator", message="current generated-video manifest and EDL are required")
    validator_path = Path(__file__).parents[2] / "talking-head-video-generation" / "scripts" / "validate_generated_video.py"
    spec = importlib.util.spec_from_file_location("talking_head_video_generation_validator", validator_path)
    if spec is None or spec.loader is None:
        return Check("generated_video_adoption", "blocked", method="talking-head-video-generation validator", message="generated-video validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    try:
        manifest = json.loads(manifest_path.read_text())
        edl = json.loads(edl_path.read_text())
        result = module.validate(manifest, edl, root, revision_id)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        return Check("generated_video_adoption", "blocked", method="talking-head-video-generation validator", message=str(exc))
    return Check(
        "generated_video_adoption",
        "passed" if result.get("gate") == "passed" else "blocked",
        method="recomputed asset hash, ffprobe, revision and EDL-reference validation",
        measured={"assets": result.get("checks"), "core_explanation_video_adopted": result.get("core_explanation_video_adopted")},
        threshold="at least one reviewed AI-video asset adopted by a core EDL explanation unit",
        evidence_paths=[str(manifest_path), str(edl_path)],
        message="; ".join(result.get("errors", [])),
    )


def stage_lineage_check(progress_path: Path | None, revision_id: str, root: Path, required_paths: list[str]) -> Check:
    if progress_path is None:
        return Check("stage_lineage", "blocked", method="validate_stage_lineage", message="current progress-state evidence is required")
    try:
        data = json.loads(progress_path.read_text())
        result = stage_lineage_check_value(data, root, revision_id, required_paths)
    except (OSError, json.JSONDecodeError, RuntimeError, TypeError, ValueError) as exc:
        return Check("stage_lineage", "blocked", method="validate_stage_lineage", message=str(exc))
    return Check(
        "stage_lineage",
        "passed" if result.get("gate") == "passed" else "blocked",
        method="declared-stage-order-and-current-artifact-hash-recomputation",
        measured={"event_count": result.get("event_count"), "stages": result.get("stages")},
        threshold="current required artifacts are bound to ordered revision-matching stage events",
        evidence_paths=[str(progress_path)],
        message="; ".join(result.get("errors", [])),
    )


def stage_lineage_check_value(data: dict[str, Any], root: Path, revision_id: str, required_paths: list[str]) -> dict[str, Any]:
    validator_path = Path(__file__).with_name("validate_stage_lineage.py")
    spec = importlib.util.spec_from_file_location("video_production_stage_lineage_value", validator_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("stage-lineage validator is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.validate(data, root, revision_id, required_paths)


def run_qc(video: Path, revision_id: str, subtitle_mode: str, listening_status: str, sync_path: Path | None, tail_exempt: bool = False, edl_path: Path | None = None, audio_content_path: Path | None = None, transcript_path: Path | None = None, generated_video_manifest: Path | None = None, root: Path | None = None, require_generated_video: bool = False, progress_path: Path | None = None, require_stage_lineage: bool = False) -> dict[str, Any]:
    checks: list[Check] = []
    missing: list[str] = []
    measurements: dict[str, Any] = {}
    try:
        metadata = probe(video)
        streams = metadata.get("streams", [])
        video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
        if video_stream:
            checks.append(Check("video_stream", "passed", method="ffprobe", measured=video_stream.get("codec_name")))
        else:
            checks.append(Check("video_stream", "blocked", method="ffprobe", message="no video stream"))
        if audio_stream:
            checks.append(Check("audio_stream", "passed", method="ffprobe", measured=audio_stream.get("codec_name")))
        else:
            checks.append(Check("audio_stream", "blocked", method="ffprobe", message="no audio stream"))
        if not video_stream or not audio_stream:
            missing.append("video_or_audio_stream")
        ok, error = decode_ok(video)
        checks.append(Check("decode", "passed" if ok else "blocked", method="ffmpeg", message=error))
        fps = frame_rate(video_stream or {})
        frame_duration = 1.0 / fps if fps > 0 else 1.0 / 30.0
        video_duration = duration(metadata, video_stream)
        audio_duration = duration(metadata, audio_stream)
        delta = abs(video_duration - audio_duration)
        measurements.update({"fps": fps, "video_duration": video_duration, "audio_duration": audio_duration, "duration_delta": delta})
        checks.append(Check("duration_delta", "passed" if delta <= frame_duration else "blocked", method="ffprobe", measured=delta, threshold=f"<= {frame_duration:.6f}s"))
        if audio_stream:
            windows, window_log = energy_windows(video)
            missing_windows = [index for index, value in enumerate(windows) if not math.isfinite(value) or value <= -60]
            checks.append(Check("audio_energy_windows", "passed" if windows and not missing_windows else "blocked", method="ffmpeg astats", measured={"windows": len(windows), "missing": missing_windows}, threshold="energy in every 10s window"))
            silences, _ = silence_intervals(video)
            longest = max((end - start for start, end in silences), default=0.0)
            checks.append(Check("max_silence_gap", "passed" if longest <= 0.5 else "blocked", method="ffmpeg silencedetect", measured=longest, threshold="<= 0.5s"))
            has_tail = tail_exempt or tail_energy(video)
            checks.append(Check("tail_voice_energy", "passed" if has_tail else "blocked", method="ffmpeg volumedetect", measured=has_tail, threshold="voice in final 0.5s"))
        else:
            checks.extend([
                Check("audio_energy_windows", "blocked", message="audio stream unavailable"),
                Check("max_silence_gap", "blocked", message="audio stream unavailable"),
                Check("tail_voice_energy", "blocked", message="audio stream unavailable"),
            ])
        freezes, _ = freeze_intervals(video)
        checks.append(Check("freeze_detect", "passed" if not freezes else "blocked", method="ffmpeg freezedetect", measured=freezes, threshold="no intervals"))
        checks.extend(transcript_timing_checks(video, sync_path, revision_id, edl_path, transcript_path))
        checks.extend(audio_content_checks(audio_content_path, revision_id, video, edl_path, transcript_path))
        if require_generated_video or generated_video_manifest is not None:
            checks.append(generated_video_check(generated_video_manifest, edl_path, revision_id, root or video.parent.parent))
        if require_stage_lineage:
            required_paths = [
                "output/edit-decision-list.json",
                "output/final.mp4",
                "output/final-audio-transcript.json",
                "output/audio-content-check.json",
                "output/sync-evidence.json",
                "output/generated-video-manifest.json",
                "output/generated-video-review.json",
                "output/generated-video-lint.json",
            ]
            checks.append(stage_lineage_check(progress_path, revision_id, root or video.parent.parent, required_paths))
        has_subtitle_stream = any(stream.get("codec_type") == "subtitle" for stream in streams)
        subtitle_ok = subtitle_mode == "off" or has_subtitle_stream
        checks.append(Check("subtitle_stream", "passed" if subtitle_ok else "blocked", method="ffprobe", measured={"mode": subtitle_mode, "present": has_subtitle_stream}, threshold="matches declared mode"))
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        missing.append("ffprobe_or_media")
        checks.append(Check("decode", "blocked", message=str(exc)))
    gate = "blocked" if any(item.status == "blocked" for item in checks) else ("passed" if listening_status == "complete" else "degraded")
    return {
        "schema_version": "1.0",
        "source": "video-production-qc",
        "revision_id": revision_id,
        "gate": gate,
        "checks": [item.as_dict() for item in checks],
        "measurement": measurements,
        "listening": {"status": listening_status, "windows": []},
        "missing": missing,
        "evidence_paths": [str(video)] + ([str(sync_path)] if sync_path else []),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--revision-id", required=True)
    parser.add_argument("--subtitle-mode", choices=["off", "required"], default="off")
    parser.add_argument("--listening-status", choices=["complete", "partial", "unavailable"], default="unavailable")
    parser.add_argument("--edl", required=True, type=Path)
    parser.add_argument("--sync-evidence", required=True, type=Path)
    parser.add_argument("--audio-content-check", required=True, type=Path)
    parser.add_argument("--asr-transcript", required=True, type=Path)
    parser.add_argument("--generated-video-manifest", type=Path)
    parser.add_argument("--progress-state", type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--require-generated-video", action="store_true")
    parser.add_argument("--require-stage-lineage", action="store_true")
    parser.add_argument("--tail-voice-exempt", action="store_true")
    args = parser.parse_args(argv)
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        report = {"schema_version": "1.0", "source": "video-production-qc", "revision_id": args.revision_id, "gate": "blocked", "checks": [{"id": "tools", "status": "blocked", "severity": "blocker", "method": "which", "measured": None, "threshold": "ffprobe and ffmpeg", "evidence_paths": []}], "measurement": {}, "listening": {"status": args.listening_status, "windows": []}, "missing": ["ffmpeg", "ffprobe"], "evidence_paths": []}
    else:
        report = run_qc(args.video, args.revision_id, args.subtitle_mode, args.listening_status, args.sync_evidence, args.tail_voice_exempt, args.edl, args.audio_content_check, args.asr_transcript, args.generated_video_manifest, args.root, args.require_generated_video, args.progress_state, args.require_stage_lineage)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report["gate"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
