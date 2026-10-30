#!/usr/bin/env python3
"""Mix bundled, verified sound effects into an approved talking-head render."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any


SKILL_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = SKILL_ROOT / "assets" / "sfx"
MANIFEST_PATH = ASSET_ROOT / "manifest.json"
UPSTREAM_ROOT = SKILL_ROOT.parents[1] / "third_party" / "motion-graphics"
UPSTREAM_MANIFEST_PATH = UPSTREAM_ROOT / "skills" / "sound-effects" / "sfx" / "manifest.json"
UPSTREAM_ASSET_ROOT = UPSTREAM_ROOT / "skills" / "sound-effects" / "sfx"
MAX_CUES = 120
MAX_CUE_FILE_BYTES = 2 * 1024 * 1024
MAX_TIMEOUT_SECONDS = 3600
MAX_CUE_GAIN_DB = -6
MIN_CUE_GAIN_DB = -36
INAUDIBLE_RELATIVE_RMS_DB = -24.0
MARGINAL_RELATIVE_RMS_DB = -18.0
CUE_WINDOW_SECONDS = 0.5
CATEGORY_TARGETS = {
    "whoosh": {"min_relative_rms_db": -24.0, "max_relative_rms_db": -10.0},
    "riser": {"min_relative_rms_db": -24.0, "max_relative_rms_db": -10.0},
    "impact": {"min_relative_rms_db": -18.0, "max_relative_rms_db": -6.0},
    "reveal": {"min_relative_rms_db": -18.0, "max_relative_rms_db": -6.0},
}


class SoundPassError(Exception):
    """A validated, user-facing sound pass failure."""


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise SoundPassError("media_command_timeout", f"{Path(command[0]).name} exceeded its time limit") from exc
    except OSError as exc:
        raise SoundPassError("media_runtime_unavailable", f"{Path(command[0]).name} is unavailable") from exc
    if result.returncode != 0:
        raise SoundPassError("media_command_failed", f"{Path(command[0]).name} exited with status {result.returncode}")
    return result


def require_regular_file(path: Path, label: str) -> Path:
    try:
        info = path.lstat()
    except OSError as exc:
        raise SoundPassError("file_unavailable", f"{label} is missing or unreadable") from exc
    if path.is_symlink() or not path.is_file() or info.st_size <= 0:
        raise SoundPassError("file_invalid", f"{label} must be a non-empty regular file")
    return path.resolve(strict=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def probe_video(path: Path, timeout: int) -> tuple[float, float]:
    result = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,avg_frame_rate,r_frame_rate",
        "-of", "json", str(path),
    ], timeout)
    try:
        details = json.loads(result.stdout)
        duration = float(details["format"]["duration"])
        video = next(stream for stream in details["streams"] if stream.get("codec_type") == "video")
        next(stream for stream in details["streams"] if stream.get("codec_type") == "audio")
        frame_rate = video.get("avg_frame_rate") or video.get("r_frame_rate")
        fps = float(Fraction(frame_rate))
    except (KeyError, StopIteration, ValueError, ZeroDivisionError, TypeError, json.JSONDecodeError) as exc:
        raise SoundPassError("video_probe_invalid", "Input must contain readable video and dialogue audio tracks") from exc
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(fps) or not 1 <= fps <= 240:
        raise SoundPassError("video_probe_invalid", "Input duration or frame rate is outside the supported range")
    return duration, fps


def load_manifest() -> dict[str, dict[str, Any]]:
    try:
        manifest_path = UPSTREAM_MANIFEST_PATH if UPSTREAM_MANIFEST_PATH.is_file() else MANIFEST_PATH
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SoundPassError("sound_manifest_invalid", "Bundled sound manifest is unavailable or malformed") from exc
    if UPSTREAM_MANIFEST_PATH.is_file():
        raw_entries = [entry for entry in payload.get("bundled", []) if isinstance(entry, dict)]
        root = UPSTREAM_ASSET_ROOT
        default_entries = {
            entry.get("category"): entry
            for entry in payload.get("default_kit", [])
            if isinstance(entry, dict) and entry.get("file") and entry.get("license") == "CC0 1.0"
        }
        raw_entries.extend(entry for entry in default_entries.values() if entry.get("file"))
    else:
        raw_entries = payload.get("sounds", [])
        root = ASSET_ROOT
        default_entries = {entry.get("category"): entry for entry in raw_entries if isinstance(entry, dict)}
    if not raw_entries:
        raise SoundPassError("sound_manifest_invalid", "Bundled sound manifest contains no redistributable assets")
    sounds: dict[str, dict[str, Any]] = {}
    for entry in raw_entries:
        if not isinstance(entry, dict) or entry.get("license") != "CC0 1.0":
            continue
        category = entry.get("category")
        filename = entry.get("file")
        if not isinstance(category, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,31}", category):
            raise SoundPassError("sound_manifest_invalid", "Sound manifest contains an invalid category")
        if not isinstance(filename, str) or Path(filename).is_absolute() or any(part in {"", ".", ".."} for part in Path(filename).parts) or Path(filename).suffix.lower() != ".ogg":
            raise SoundPassError("sound_manifest_invalid", f"Sound asset {category} has an unsafe filename")
        asset = require_regular_file(root / filename, f"Bundled sound {category}")
        sound_id = category if default_entries.get(category, {}).get("file") == filename else f"{category}-{Path(filename).stem}"
        sounds[sound_id] = {
            **entry,
            "id": sound_id,
            "category": category,
            "title": entry.get("title", Path(filename).stem),
            "attribution": entry.get("attribution") or entry.get("credit", ""),
            "source_url": entry.get("source_url", ""),
            "sha256": sha256_file(asset),
            "path": asset,
        }
    if not sounds:
        raise SoundPassError("sound_manifest_invalid", "Sound manifest has no CC0 assets available to the runtime")
    # Category lookup always resolves to the upstream default kit when present.
    for category, entry in default_entries.items():
        if entry.get("file"):
            default_id = next((key for key, value in sounds.items() if value.get("category") == category and value.get("path") == (root / entry["file"]).resolve()), None)
            if default_id and default_id != category:
                sounds[category] = {**sounds[default_id], "id": category}
    # Categories without an upstream default still need a stable cue selector.
    # Use the first manifest entry; callers may select another asset_id explicitly.
    for category in sorted({value["category"] for value in sounds.values()}):
        if category not in sounds:
            selected = next(value for value in sounds.values() if value["category"] == category)
            sounds[category] = {**selected, "id": category}
    return sounds


def read_cues(path: Path, duration: float, sounds: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        if path.stat().st_size > MAX_CUE_FILE_BYTES:
            raise SoundPassError("cue_file_too_large", "Cue file exceeds the supported size")
        cues = json.loads(path.read_text(encoding="utf-8"))
    except SoundPassError:
        raise
    except (OSError, json.JSONDecodeError) as exc:
        raise SoundPassError("cue_file_invalid", "Cue file is missing or malformed JSON") from exc
    status = cues.get("status") if isinstance(cues, dict) else None
    if (
        not isinstance(cues, dict)
        or cues.get("schema_version") != "1.0"
        or status not in {"ready", "skipped_no_cues"}
        or cues.get("source") != "talking-head-editor"
        or not isinstance(cues.get("data_at"), str)
        or not isinstance(cues.get("missing"), list)
    ):
        raise SoundPassError("cue_contract_invalid", "Cue file must use schema_version 1.0 and status ready")
    raw_cues = cues.get("cues")
    if not isinstance(raw_cues, list) or len(raw_cues) > MAX_CUES:
        raise SoundPassError("cue_contract_invalid", f"Cue file must contain 0 to {MAX_CUES} cues")
    if status == "skipped_no_cues":
        reason = cues.get("reason")
        if raw_cues or not isinstance(reason, str) or not reason.strip() or len(reason) > 500:
            raise SoundPassError("cue_contract_invalid", "A skipped cue file must contain no cues and a concise reason")
        return []
    if not raw_cues:
        raise SoundPassError("cue_contract_invalid", "A ready cue file must contain at least one cue")
    ids: set[str] = set()
    parsed: list[dict[str, Any]] = []
    for raw in raw_cues:
        if not isinstance(raw, dict):
            raise SoundPassError("cue_contract_invalid", "Every cue must be a JSON object")
        cue_id = raw.get("cue_id")
        category = raw.get("category")
        time_seconds = raw.get("time_seconds")
        gain_db = raw.get("gain_db", -18.0)
        asset_id = raw.get("asset_id", category)
        if not isinstance(cue_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", cue_id) or cue_id in ids:
            raise SoundPassError("cue_contract_invalid", "Cue IDs must be unique, non-empty identifiers")
        if category not in sounds:
            raise SoundPassError("cue_category_unsupported", f"Cue {cue_id} must select a bundled category")
        if not isinstance(asset_id, str) or asset_id not in sounds or sounds[asset_id]["category"] != category:
            raise SoundPassError("cue_asset_unsupported", f"Cue {cue_id} must select an asset in category {category}")
        if isinstance(time_seconds, bool) or not isinstance(time_seconds, (int, float)) or not math.isfinite(time_seconds) or not 0 <= time_seconds < duration:
            raise SoundPassError("cue_time_invalid", f"Cue {cue_id} time must fall within the final video")
        if isinstance(gain_db, bool) or not isinstance(gain_db, (int, float)) or not math.isfinite(gain_db) or not MIN_CUE_GAIN_DB <= gain_db <= MAX_CUE_GAIN_DB:
            raise SoundPassError("cue_gain_invalid", f"Cue {cue_id} gain must be between {MIN_CUE_GAIN_DB} and {MAX_CUE_GAIN_DB} dB")
        for text_field in ("event", "purpose"):
            value = raw.get(text_field)
            if not isinstance(value, str) or not value.strip() or len(value) > 240:
                raise SoundPassError("cue_contract_invalid", f"Cue {cue_id} needs a concise {text_field}")
        ids.add(cue_id)
        parsed.append({**raw, "asset_id": asset_id, "gain_db": float(gain_db), "time_seconds": float(time_seconds)})
    return parsed


def measure_audio(path: Path, timeout: int) -> dict[str, float]:
    result = run([
        "ffmpeg", "-nostdin", "-hide_banner", "-nostats", "-i", str(path),
        "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-",
    ], timeout)
    integrated = re.findall(r"^\s*I:\s+(-?\d+(?:\.\d+)?)\s+LUFS\s*$", result.stderr, re.MULTILINE)
    peak = re.findall(r"^\s*Peak:\s+(-?\d+(?:\.\d+)?)\s+dBFS\s*$", result.stderr, re.MULTILINE)
    if not integrated or not peak:
        raise SoundPassError("audio_measurement_failed", "FFmpeg did not report integrated loudness and true peak")
    return {"integrated_lufs": float(integrated[-1]), "true_peak_dbfs": float(peak[-1])}


def measure_level(path: Path, timeout: int, gain_db: float = 0.0, start_seconds: float | None = None, duration_seconds: float | None = None) -> dict[str, float]:
    filters = "volumedetect"
    if gain_db:
        filters = f"volume={gain_db:.2f}dB,{filters}"
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-nostats"]
    if start_seconds is not None:
        command.extend(["-ss", f"{max(0.0, start_seconds):.6f}"])
    command.extend(["-i", str(path)])
    if duration_seconds is not None:
        command.extend(["-t", f"{max(0.01, duration_seconds):.6f}"])
    command.extend(["-vn", "-af", filters, "-f", "null", "-"])
    result = run(command, timeout)
    mean = re.findall(r"mean_volume:\s+(-?\d+(?:\.\d+)?)\s+dB", result.stderr)
    peak = re.findall(r"max_volume:\s+(-?\d+(?:\.\d+)?)\s+dB", result.stderr)
    if not mean or not peak:
        raise SoundPassError("audio_level_measurement_failed", "FFmpeg did not report cue level")
    return {"rms_dbfs": float(mean[-1]), "peak_dbfs": float(peak[-1])}


def assess_cue_audibility(cues: list[dict[str, Any]], sounds: dict[str, dict[str, Any]], source: Path, timeout: int) -> dict[str, Any]:
    checks = []
    for cue in cues:
        asset = sounds[cue["asset_id"]]
        effect_duration = min(float(asset.get("duration_s", CUE_WINDOW_SECONDS)), CUE_WINDOW_SECONDS)
        window_start = max(0.0, cue["time_seconds"] - effect_duration / 2)
        voice = measure_level(source, timeout, start_seconds=window_start, duration_seconds=effect_duration)
        effect = measure_level(asset["path"], timeout, cue["gain_db"], duration_seconds=effect_duration)
        relative = effect["rms_dbfs"] - voice["rms_dbfs"]
        target = CATEGORY_TARGETS.get(cue["category"], {"min_relative_rms_db": MARGINAL_RELATIVE_RMS_DB, "max_relative_rms_db": -8.0})
        if relative < target["min_relative_rms_db"]:
            status = "inaudible"
        elif relative < MARGINAL_RELATIVE_RMS_DB:
            status = "marginal"
        else:
            status = "audible"
        checks.append({
            "cue_id": cue["cue_id"],
            "asset_id": cue["asset_id"],
            "category": cue["category"],
            "window": {"start_seconds": round(window_start, 4), "end_seconds": round(window_start + effect_duration, 4)},
            "measured_peak_dbfs": round(effect["peak_dbfs"], 2),
            "measured_rms_dbfs": round(effect["rms_dbfs"], 2),
            "voice_reference_rms_dbfs": round(voice["rms_dbfs"], 2),
            "relative_rms_db": round(relative, 2),
            "target_relative_rms_db": target,
            "status": status,
        })
    return {
        "window_seconds": CUE_WINDOW_SECONDS,
        "thresholds": {
            "inaudible_below_relative_rms_db": INAUDIBLE_RELATIVE_RMS_DB,
            "marginal_below_relative_rms_db": MARGINAL_RELATIVE_RMS_DB,
        },
        "cues": checks,
    }


def ffmpeg_version(timeout: int) -> str:
    result = run(["ffmpeg", "-version"], timeout)
    return result.stdout.splitlines()[0]


def build_mix_filter(cues: list[dict[str, Any]], sounds: dict[str, dict[str, Any]], duration: float, fps: float, gain_reduction_db: float) -> str:
    labels = ["[voice]" ]
    graph = [f"[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration={duration:.6f}[voice]"]
    for index, cue in enumerate(cues):
        start = cue["time_seconds"] - (2 / fps if cue["category"] == "whoosh" else 0)
        start = max(0.0, start)
        delay_ms = max(0, round(start * 1000))
        gain = cue["gain_db"] - gain_reduction_db
        label = f"fx{index}"
        graph.append(
            f"[{index + 1}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"volume={gain:.2f}dB,adelay={delay_ms}|{delay_ms},apad,atrim=duration={duration:.6f}[{label}]"
        )
        labels.append(f"[{label}]")
        cue["applied_gain_db"] = round(gain, 2)
        cue["applied_start_seconds"] = round(start, 4)
        cue["asset"] = sounds[cue["asset_id"]]
    graph.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0:dropout_transition=0[out]")
    return ";".join(graph)


def render(input_path: Path, output_path: Path, cues: list[dict[str, Any]], sounds: dict[str, dict[str, Any]], duration: float, fps: float, reduction: float, timeout: int) -> None:
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(input_path)]
    for cue in cues:
        command.extend(["-i", str(sounds[cue["asset_id"]]["path"])])
    command.extend([
        "-filter_complex", build_mix_filter(cues, sounds, duration, fps, reduction),
        "-map", "0:v:0", "-map", "[out]", "-map_metadata", "0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
        "-t", f"{duration:.6f}", "-movflags", "+faststart", str(output_path),
    ])
    run(command, timeout)


def stage_json(path: Path, payload: dict[str, Any]) -> Path:
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix=".sfx-cues-", suffix=".tmp", delete=False) as target:
            temporary = Path(target.name)
            json.dump(payload, target, ensure_ascii=False, indent=2)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        return temporary
    except OSError as exc:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        raise SoundPassError("cue_report_write_failed", "Could not stage the cue report") from exc


def sound_pass(video: Path, cue_path: Path, output: Path, timeout: int) -> dict[str, Any]:
    source = require_regular_file(video, "Input video")
    cues_file = require_regular_file(cue_path, "Cue file")
    if source == output.resolve(strict=False) or cues_file == output.resolve(strict=False):
        raise SoundPassError("output_path_conflict", "Input and output paths must be different")
    if output.suffix.lower() != ".mp4":
        raise SoundPassError("output_path_invalid", "Output path must end in .mp4")
    if output.exists() and (output.is_symlink() or not output.is_file()):
        raise SoundPassError("output_path_invalid", "Existing output must be a regular file")
    if cues_file.is_symlink():
        raise SoundPassError("cue_file_invalid", "Cue file must not be a symbolic link")

    duration, fps = probe_video(source, timeout)
    sounds = load_manifest()
    cues = read_cues(cues_file, duration, sounds)
    before = measure_audio(source, timeout)
    audibility = assess_cue_audibility(cues, sounds, source, timeout) if cues else {"cues": []}
    inaudible = [item["cue_id"] for item in audibility.get("cues", []) if item["status"] == "inaudible"]
    if inaudible:
        raise SoundPassError("cue_inaudible", "Cue level is below the audible threshold: " + ", ".join(inaudible))
    source_digest = sha256_file(source)

    temp_fd, temp_name = tempfile.mkstemp(prefix=".sfx-render-", suffix=".mp4", dir=output.parent)
    os.close(temp_fd)
    temporary = Path(temp_name)
    staged_cues: Path | None = None
    output_backup: Path | None = None
    output_existed = output.exists()
    try:
        reduction = 0.0
        target_peak = max(before["true_peak_dbfs"], -1.0)
        if cues:
            for attempt in range(9):
                render(source, temporary, cues, sounds, duration, fps, reduction, timeout)
                after = measure_audio(temporary, timeout)
                if after["true_peak_dbfs"] <= target_peak + 0.05:
                    break
                if attempt == 8:
                    raise SoundPassError("mix_peak_uncontrolled", "Sound-effect mix remained above the permitted peak after eight gain reductions")
                reduction += max(1.0, after["true_peak_dbfs"] - target_peak + 0.5)
        else:
            shutil.copy2(source, temporary)
            after = measure_audio(temporary, timeout)
        final_digest = sha256_file(temporary)
        evidence = {
            "schema_version": "1.0",
            "status": "ready" if cues else "skipped_no_cues",
            "source": "talking-head-editor",
            "producer": "talking-head-sound-design",
            "data_at": datetime.now(timezone.utc).isoformat(),
            "missing": [],
            "render": {
                "input_sha256": source_digest,
                "output_path": str(output.resolve(strict=False)),
                "output_sha256": final_digest,
                "duration_seconds": round(duration, 4),
                "frame_rate": round(fps, 6),
                "ffmpeg_version": ffmpeg_version(timeout),
                "gain_reduction_db": round(reduction, 2),
                "before": before,
                "after": after,
                "true_peak_ceiling_dbfs": round(target_peak, 2),
                "audibility_check": audibility,
            },
            "applied_cues": [
                {
                    "cue_id": cue["cue_id"],
                    "time_seconds": cue["time_seconds"],
                    "applied_start_seconds": cue["applied_start_seconds"],
                    "category": cue["category"],
                    "event": cue["event"],
                    "purpose": cue["purpose"],
                    "asset_id": cue["asset"]["id"],
                    "gain_db": cue["applied_gain_db"],
                    "asset_sha256": cue["asset"]["sha256"],
                    "title": cue["asset"]["title"],
                    "creator": cue["asset"].get("creator", ""),
                    "source_url": cue["asset"]["source_url"],
                    "license": "CC0 1.0",
                    "attribution": cue["asset"]["attribution"],
                }
                for cue in cues
            ],
        }
        cue_payload = json.loads(cues_file.read_text(encoding="utf-8"))
        cue_payload["render_evidence"] = evidence
        staged_cues = stage_json(cues_file, cue_payload)
        if output_existed:
            backup_fd, backup_name = tempfile.mkstemp(prefix=".sfx-output-backup-", suffix=".mp4", dir=output.parent)
            os.close(backup_fd)
            output_backup = Path(backup_name)
            shutil.copy2(output, output_backup)
        try:
            os.replace(temporary, output)
            os.replace(staged_cues, cues_file)
        except OSError as exc:
            try:
                if output_backup is not None:
                    os.replace(output_backup, output)
                    output_backup = None
                elif not output_existed:
                    output.unlink(missing_ok=True)
            except OSError as rollback_exc:
                backup_path = str(output_backup) if output_backup is not None else "unavailable"
                output_backup = None
                raise SoundPassError("output_rollback_failed", f"Final video commit failed and the previous output could not be restored; backup retained at {backup_path}") from rollback_exc
            raise SoundPassError("output_commit_failed", "Could not atomically replace the final video and cue report") from exc
        return evidence
    finally:
        temporary.unlink(missing_ok=True)
        if staged_cues is not None:
            staged_cues.unlink(missing_ok=True)
        if output_backup is not None:
            output_backup.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", required=True, type=Path, help="Approved final-picture render with dialogue audio")
    parser.add_argument("--cues", required=True, type=Path, help="Validated sfx-cues.json in output/")
    parser.add_argument("--output", required=True, type=Path, help="Final output MP4 (must differ from input)")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    args = parser.parse_args()
    if not 30 <= args.timeout_seconds <= MAX_TIMEOUT_SECONDS:
        print("error_code=timeout_invalid: timeout must be between 30 and 3600 seconds", file=sys.stderr)
        return 2
    try:
        if not args.output.parent.is_dir():
            raise SoundPassError("output_directory_missing", "Output directory must already exist")
        evidence = sound_pass(args.video, args.cues, args.output, args.timeout_seconds)
    except SoundPassError as exc:
        print(f"error_code={exc.args[0]}: {exc.args[1]}", file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print(f"error_code=sound_pass_failed: {type(exc).__name__}", file=sys.stderr)
        return 2
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
