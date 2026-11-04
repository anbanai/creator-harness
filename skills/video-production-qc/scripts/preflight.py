#!/usr/bin/env python3
"""Emit a capability report before an IP explainer render."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path


def command_output(command: list[str]) -> tuple[bool, str]:
    try:
        result = subprocess.run(command, text=True, capture_output=True, check=False)
    except OSError as exc:
        return False, str(exc)
    return result.returncode == 0, (result.stdout + result.stderr).strip()


def report(root: Path, output: Path, runtime_mode: str) -> dict[str, object]:
    disk = shutil.disk_usage(root)
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    filters: dict[str, object] = {}
    if ffmpeg:
        ok, text = command_output([ffmpeg, "-hide_banner", "-filters"])
        filters = {
            "command_ok": ok,
            "drawtext": "drawtext" in text,
            "subtitles": "subtitles" in text,
        }
    output_ok = False
    try:
        output.mkdir(parents=True, exist_ok=True)
        output_ok = os.access(output, os.W_OK)
    except OSError:
        output_ok = False
    task_id = os.environ.get("ANBAN_TASK_ID", "").strip()
    project_id = (os.environ.get("ANBAN_PROJECT_ID") or os.environ.get("ANBAN_DEFAULT_PROJECT") or "").strip()
    execution_id = os.environ.get("ANBAN_EXECUTION_ID", "").strip()
    context_file = os.environ.get("ANBAN_EXECUTION_CONTEXT_FILE", "").strip()
    context_file_ok = bool(context_file and Path(context_file).is_file()) if context_file else None
    checks = {
        "runtime_mode_declared": runtime_mode in {"managed", "local_test"},
        "managed_context": all((task_id, project_id, execution_id)) if runtime_mode == "managed" else None,
        "execution_identity": {
            "task_id_present": bool(task_id),
            "project_id_present": bool(project_id),
            "execution_id_present": bool(execution_id),
            "context_file_present": context_file_ok,
        },
        "disk_free_bytes": disk.free,
        "ffmpeg": bool(ffmpeg),
        "ffprobe": bool(ffprobe),
        "ffmpeg_filters": filters,
        "output_writable": output_ok,
        "openmontage_root": bool(os.environ.get("OPENMONTAGE_ROOT")),
        "image_source_configured": bool(os.environ.get("ANBAN_IMAGE_PROVIDER") or os.environ.get("IMAGE_SEARCH_PROVIDER")),
        "music_source_configured": bool(os.environ.get("ANBAN_MUSIC_PROVIDER") or os.environ.get("MUSIC_PROVIDER")),
        "model_quota_declared": bool(os.environ.get("ANBAN_MODEL_QUOTA")),
    }
    missing = [key for key, value in checks.items() if value is False]
    return {
        "schema_version": "1.0",
        "source": "video-production-qc",
        "status": "ready" if not missing else "partial",
        "runtime_mode": runtime_mode,
        "checks": checks,
        "missing": missing,
        "evidence_paths": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime-mode", choices=["managed", "local_test"], required=True)
    args = parser.parse_args()
    data = report(args.root, args.output, args.runtime_mode)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return 0 if data["status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
