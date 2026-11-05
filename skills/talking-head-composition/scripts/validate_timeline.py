#!/usr/bin/env python3
"""Validate the shared composition and single-timeline contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any


def load(path: Path) -> Any:
    return json.loads(path.read_text())


def check(condition: bool, check_id: str, message: str, measured: Any = None) -> dict[str, Any]:
    return {"id": check_id, "status": "passed" if condition else "blocked", "severity": "blocker", "method": "composition-lint", "measured": measured, "threshold": "declared contract", "evidence_paths": [], "message": message if not condition else ""}


def source_time_checks(edl: dict[str, Any], fps: float) -> list[dict[str, Any]]:
    segments = edl.get("segments")
    sample_rate = edl.get("sample_rate")
    edl_fps = edl.get("fps")
    valid_header = (
        isinstance(segments, list) and bool(segments)
        and isinstance(sample_rate, (int, float)) and not isinstance(sample_rate, bool)
        and math.isfinite(sample_rate) and sample_rate > 0
        and isinstance(edl_fps, (int, float)) and not isinstance(edl_fps, bool)
        and math.isfinite(edl_fps) and edl_fps > 0
        and math.isclose(float(edl_fps), fps, rel_tol=0, abs_tol=1e-9)
    )
    segment_ids = [segment.get("segment_id") for segment in segments if isinstance(segment, dict)] if isinstance(segments, list) else []
    explicit_fields = valid_header and all(
        isinstance(segment, dict)
        and all(key in segment for key in (
            "segment_id", "source_video_in", "source_video_out",
            "source_audio_sample_start", "source_audio_sample_end",
            "output_start_frame", "output_end_frame",
        ))
        and all(isinstance(segment.get(key), (int, float)) and not isinstance(segment.get(key), bool) and math.isfinite(segment.get(key)) for key in ("source_video_in", "source_video_out"))
        and all(isinstance(segment.get(key), int) and not isinstance(segment.get(key), bool) for key in ("source_audio_sample_start", "source_audio_sample_end", "output_start_frame", "output_end_frame"))
        and not any(key in segment for key in ("sample_start", "samples", "source_in", "source_out"))
        for segment in segments
    ) and all(isinstance(value, str) and value.strip() for value in segment_ids) and len(segment_ids) == len(set(segment_ids))
    checks = [check(
        bool(explicit_fields), "explicit_source_time_fields",
        "each EDL segment must distinguish source media times from output frame positions",
        {"sample_rate": sample_rate, "segments": len(segments) if isinstance(segments, list) else None},
    )]
    results: list[dict[str, Any]] = []
    if explicit_fields:
        tolerance = 1.0 / fps if fps > 0 else 1.0 / 30.0
        for segment in segments:
            try:
                video_in = float(segment["source_video_in"])
                video_out = float(segment["source_video_out"])
                audio_in = int(segment["source_audio_sample_start"]) / float(sample_rate)
                audio_out = int(segment["source_audio_sample_end"]) / float(sample_rate)
                output_valid = int(segment["output_end_frame"]) > int(segment["output_start_frame"])
                finite = all(math.isfinite(value) and value >= 0 for value in (video_in, video_out, audio_in, audio_out))
                start_delta = abs(video_in - audio_in)
                end_delta = abs(video_out - audio_out)
                results.append({"segment_id": segment["segment_id"], "start_delta_seconds": start_delta, "end_delta_seconds": end_delta})
                # Preserve the one-frame boundary despite floating-point noise
                # from converting integer samples back to seconds.
                epsilon = 1e-9
                if not finite or video_out <= video_in or not output_valid or start_delta > tolerance + epsilon or end_delta > tolerance + epsilon:
                    results[-1]["valid"] = False
                else:
                    results[-1]["valid"] = True
            except (TypeError, ValueError, OverflowError):
                results.append({"segment_id": segment.get("segment_id"), "valid": False})
    checks.append(check(
        bool(explicit_fields) and all(item.get("valid") for item in results),
        "source_time_alignment",
        "source audio sample range must match source video range within one frame; output positions are accounting only",
        {"tolerance_seconds": tolerance if explicit_fields else None, "segments": results},
    ))
    return checks


def validate(edl: dict[str, Any], composition: dict[str, Any], visual: dict[str, Any] | None = None, ledger: dict[str, Any] | None = None, expected_timeline_source: str | None = None) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    timeline_source = composition.get("timeline_source")
    expected = expected_timeline_source or timeline_source
    source_matches = timeline_source == expected or Path(timeline_source).name == Path(expected).name
    checks.append(check(source_matches and "edit-decision-list.json" in timeline_source, "single_timeline_source", "composition must reference the Pack-declared EDL as its only timeline source", timeline_source))
    forbidden = [key for key in ("breath_points", "offsets", "reveals", "duration_seconds", "visual_clock") if key in composition]
    checks.append(check(not forbidden, "duplicate_time_decisions", "composition must not contain independently computed timing decisions", forbidden))
    fps = composition.get("master_fps")
    frame_count = composition.get("master_duration_frames")
    checks.append(check(isinstance(fps, (int, float)) and fps > 0 and isinstance(frame_count, int) and frame_count > 0, "frame_derived_duration", "duration must be derived from a positive fps and integer frame count", {"fps": fps, "frames": frame_count}))
    checks.extend(source_time_checks(edl, float(fps) if isinstance(fps, (int, float)) else 0.0))
    bed = composition.get("audio_bed", {})
    checks.append(check(bed.get("source") == "dialogue_bed" and bed.get("start_frame") == 0 and bed.get("end_frame") == frame_count, "continuous_dialogue_bed", "dialogue bed must span the complete master timeline", bed))
    independent = []
    for item in (visual or {}).get("items", []):
        if any(key in item for key in ("offset_seconds", "reveal_seconds", "duration_seconds", "local_clock")):
            independent.append(item.get("asset_id") or item.get("id"))
    checks.append(check(not independent, "independent_visual_clocks", "visual plan may only reference segment IDs and precomputed frames", independent))
    transparent = []
    for layer in composition.get("layer_stack", []):
        if float(layer.get("opacity", 1)) < 1 and not layer.get("blend_mode"):
            transparent.append(layer.get("layer_id"))
    checks.append(check(not transparent, "transparent_cover_layers", "transparent covers require an explicit blend mode and reason", transparent))
    repeated = []
    items = (visual or {}).get("items", [])
    for previous, current in zip(items, items[1:]):
        if previous.get("asset_id") == current.get("asset_id") and previous.get("composition_fingerprint") == current.get("composition_fingerprint"):
            repeated.append(current.get("asset_id"))
    checks.append(check(not repeated, "adjacent_repeated_composition", "adjacent identical asset/composition pairs are forbidden", repeated))
    if ledger is not None:
        ledger_repeats = [entry.get("asset_id") for entry in ledger.get("items", []) if entry.get("reuse_count", 0) > 1 and not entry.get("reuse_reason")]
        checks.append(check(not ledger_repeats, "asset_reuse_reason", "reused assets require an explicit reason", ledger_repeats))
    gate = "blocked" if any(item["status"] == "blocked" for item in checks) else "passed"
    return {"schema_version": "1.0", "source": "talking-head-composition", "gate": gate, "checks": checks, "missing": [], "evidence_paths": []}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--edl", required=True, type=Path)
    parser.add_argument("--composition-plan", required=True, type=Path)
    parser.add_argument("--visual-plan", type=Path)
    parser.add_argument("--asset-ledger", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    report = validate(load(args.edl), load(args.composition_plan), load(args.visual_plan) if args.visual_plan else None, load(args.asset_ledger) if args.asset_ledger else None, args.edl.as_posix())
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["gate"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
