#!/usr/bin/env python3
"""Deterministic post-render quality gate for talking-head videos."""

from __future__ import annotations

import argparse
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


def sync_checks(path: Path, evidence_path: Path | None, frame_duration: float) -> list[Check]:
    if evidence_path is None:
        return [Check("sync_evidence", "blocked", message="sync evidence path is required")]
    try:
        data = json.loads(evidence_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return [Check("sync_evidence", "blocked", message=f"invalid sync evidence: {exc}")]
    checkpoints = data.get("checkpoints", []) if isinstance(data, dict) else []
    required = bool(checkpoints) and all("offset_ms" in item for item in checkpoints)
    if not required:
        return [Check("sync_evidence", "blocked", message="checkpoints with offset_ms are required")]
    offsets = [float(item["offset_ms"]) for item in checkpoints]
    maximum = max(abs(value) for value in offsets)
    jitter = max(offsets) - min(offsets)
    return [
        Check("sync_evidence", "passed", method="file", measured=len(checkpoints), threshold="start/middle/end and segment boundaries", evidence_paths=[str(evidence_path)]),
        Check("sync_jitter", "passed" if maximum <= frame_duration * 1000 and jitter <= frame_duration * 1000 else "blocked", method="file", measured={"max_abs_offset_ms": maximum, "jitter_ms": jitter}, threshold=f"<= {frame_duration * 1000:.3f} ms", evidence_paths=[str(evidence_path)]),
    ]


def run_qc(video: Path, revision_id: str, subtitle_mode: str, listening_status: str, sync_path: Path | None, tail_exempt: bool = False) -> dict[str, Any]:
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
        checks.extend(sync_checks(video, sync_path, frame_duration))
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
    parser.add_argument("--sync-evidence", type=Path)
    parser.add_argument("--tail-voice-exempt", action="store_true")
    args = parser.parse_args(argv)
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        report = {"schema_version": "1.0", "source": "video-production-qc", "revision_id": args.revision_id, "gate": "blocked", "checks": [{"id": "tools", "status": "blocked", "severity": "blocker", "method": "which", "measured": None, "threshold": "ffprobe and ffmpeg", "evidence_paths": []}], "measurement": {}, "listening": {"status": args.listening_status, "windows": []}, "missing": ["ffmpeg", "ffprobe"], "evidence_paths": []}
    else:
        report = run_qc(args.video, args.revision_id, args.subtitle_mode, args.listening_status, args.sync_evidence, args.tail_voice_exempt)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report["gate"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
