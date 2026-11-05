#!/usr/bin/env python3
"""Validate declared generated-video evidence and adoption by the current EDL."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decodable(path: Path) -> bool:
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        return False
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "json", str(path)],
        text=True,
        capture_output=True,
        check=False,
    )
    if probe.returncode != 0:
        return False
    try:
        streams = json.loads(probe.stdout).get("streams", [])
    except json.JSONDecodeError:
        return False
    if not streams or streams[0].get("codec_type") != "video":
        return False
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-an", "-f", "null", "-"],
        text=True,
        capture_output=True,
        check=False,
    )
    return decoded.returncode == 0


def validate(manifest: dict[str, Any], edl: dict[str, Any], root: Path, revision_id: str) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(manifest, dict) or not isinstance(edl, dict):
        return {"schema_version": "1.0", "source": "talking-head-video-generation", "revision_id": revision_id, "gate": "blocked", "checks": [], "core_explanation_video_adopted": False, "errors": ["manifest and EDL must be JSON objects"]}
    items = manifest.get("items")
    if manifest.get("source") != "talking-head-video-generation" or manifest.get("revision_id") != revision_id:
        errors.append("manifest source or revision does not match current run")
    if not isinstance(items, list) or not items:
        errors.append("manifest must contain generated video assets")
        items = []
    segments = edl.get("segments")
    if not isinstance(segments, list):
        errors.append("EDL segments are missing")
        segments = []
    refs: dict[str, list[dict[str, Any]]] = {}
    for segment in segments:
        if not isinstance(segment, dict):
            errors.append("EDL segment must be an object")
            continue
        visual_assets = segment.get("visual_assets", [])
        if not isinstance(visual_assets, list):
            errors.append(f"{segment.get('segment_id', '<unknown>')}: visual_assets must be a list")
            continue
        for ref in visual_assets:
            if not isinstance(ref, dict) or not isinstance(ref.get("asset_id"), str):
                errors.append(f"{segment.get('segment_id', '<unknown>')}: visual asset reference is invalid")
                continue
            refs.setdefault(ref["asset_id"], []).append(ref)
    refs = {
        asset_id: values
        for asset_id, values in refs.items()
    }
    results = []
    seen: set[str] = set()
    core_adoption = False
    for item in items:
        if not isinstance(item, dict):
            errors.append("manifest item must be an object")
            continue
        asset_id = item.get("asset_id")
        problems: list[str] = []
        if not isinstance(asset_id, str) or not asset_id.strip() or asset_id in seen:
            problems.append("asset_id missing or duplicated")
        if isinstance(asset_id, str):
            seen.add(asset_id)
        if item.get("kind") != "ai_video" or item.get("revision_id") != revision_id:
            problems.append("asset kind or revision mismatch")
        generation = item.get("generation") or {}
        review = item.get("review") or {}
        if (generation.get("status") != "succeeded" or not generation.get("provider")
                or not generation.get("model") or not generation.get("request_id")
                or not generation.get("generated_at") or not isinstance(generation.get("parameters"), dict)):
            problems.append("generation result is not a traceable success")
        if (review.get("status") != "approved" or review.get("revision_id") != revision_id
                or not review.get("method") or not review.get("reviewed_at")
                or not review.get("inspected_range")):
            problems.append("asset review is not approved for current revision")
        relative_path = item.get("path")
        path = (root / relative_path).resolve() if isinstance(relative_path, str) else root / "__missing__"
        if not isinstance(relative_path, str) or not relative_path.startswith("output/") or root.resolve() not in path.parents:
            problems.append("asset path must be a task-local output path")
        elif not path.is_file() or not item.get("sha256") or sha256(path) != item.get("sha256"):
            problems.append("asset is missing or its SHA-256 does not match")
        elif not decodable(path):
            problems.append("asset is not a decodable video")
        asset_refs = refs.get(asset_id, [])
        purpose = item.get("purpose") or {}
        if len(asset_refs) != 1:
            problems.append("asset must have exactly one EDL visual reference")
            ref = None
        else:
            ref = asset_refs[0]
        if ref is None or ref.get("kind") != "ai_video" or ref.get("purpose_unit_id") != purpose.get("unit_id"):
            problems.append("asset is not adopted by a matching EDL visual segment")
        elif any(isinstance(ref.get(key), bool) or not isinstance(ref.get(key), int) for key in ("output_start_frame", "output_end_frame")) or ref["output_end_frame"] <= ref["output_start_frame"]:
            problems.append("EDL visual reference has no valid output frame interval")
        elif not isinstance(ref.get("source_in"), (int, float)) or not isinstance(ref.get("source_out"), (int, float)) or isinstance(ref.get("source_in"), bool) or isinstance(ref.get("source_out"), bool) or ref["source_in"] < 0 or ref["source_out"] <= ref["source_in"]:
            problems.append("EDL visual reference has no valid source trim interval")
        elif purpose.get("core_explanation"):
            core_adoption = True
        valid = not problems
        if not valid:
            errors.extend(f"{asset_id or '<unknown>'}: {problem}" for problem in problems)
        results.append({"asset_id": asset_id, "status": "passed" if valid else "blocked", "problems": problems})
    if not core_adoption:
        errors.append("no approved generated video is adopted by a core explanation unit")
    return {
        "schema_version": "1.0",
        "source": "talking-head-video-generation",
        "revision_id": revision_id,
        "gate": "passed" if not errors else "blocked",
        "checks": results,
        "core_explanation_video_adopted": core_adoption,
        "errors": errors,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--edl", required=True, type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--revision-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        report = validate(json.loads(args.manifest.read_text()), json.loads(args.edl.read_text()), args.root, args.revision_id)
    except (OSError, json.JSONDecodeError) as exc:
        report = {"schema_version": "1.0", "source": "talking-head-video-generation", "revision_id": args.revision_id, "gate": "blocked", "checks": [], "errors": [str(exc)]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["gate"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
