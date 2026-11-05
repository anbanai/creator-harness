#!/usr/bin/env python3
"""Generate revision-bound audio content evidence from final-track ASR.

The ASR engine runs outside this script. This command only consumes its
file-backed result, recomputes hashes/timing/text checks, and fails closed when
the supplied transcript does not match the EDL or a repeated phrase has no
explicit review decision.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
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


def audio_sha256(path: Path) -> str:
    process = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "s16le", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    digest = hashlib.sha256()
    assert process.stdout is not None
    for block in iter(lambda: process.stdout.read(1024 * 1024), b""):
        digest.update(block)
    stderr = process.stderr.read().decode(errors="replace") if process.stderr else ""
    if process.wait() != 0:
        raise RuntimeError(stderr.strip() or "unable to decode final audio stream")
    return digest.hexdigest()


def normalized(value: Any) -> str:
    return re.sub(r"[\W_]+", "", str(value or ""), flags=re.UNICODE).casefold()


def repeated_phrases(texts: list[str], segment_ids: list[str], minimum: int = 5) -> list[dict[str, Any]]:
    normalized_texts = [normalized(text) for text in texts]
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    for text in normalized_texts:
        for start in range(max(0, len(text) - minimum + 1)):
            phrase = text[start:start + minimum]
            if not phrase or phrase in seen:
                continue
            locations = [index for index, other in enumerate(normalized_texts) if phrase in other]
            repeated_in_segment = any(other.count(phrase) > 1 for other in normalized_texts)
            if len(locations) > 1 or repeated_in_segment:
                found.append({"phrase": phrase, "segment_ids": [segment_ids[index] for index in locations]})
                seen.add(phrase)
    return found


def generate(video: Path, edl_path: Path, transcript_path: Path, revision_id: str, reviews_path: Path | None = None) -> dict[str, Any]:
    edl = json.loads(edl_path.read_text())
    transcript = json.loads(transcript_path.read_text())
    if not isinstance(edl, dict) or not isinstance(transcript, dict):
        raise ValueError("EDL and transcript must be JSON objects")
    fps = edl.get("fps")
    sample_rate = edl.get("sample_rate")
    if not isinstance(fps, (int, float)) or isinstance(fps, bool) or not math.isfinite(fps) or fps <= 0:
        raise ValueError("EDL fps must be finite and positive")
    if not isinstance(sample_rate, (int, float)) or isinstance(sample_rate, bool) or not math.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("EDL sample_rate must be finite and positive")
    edl_rows = edl.get("segments")
    asr_rows = transcript.get("segments")
    if not isinstance(edl_rows, list) or not isinstance(asr_rows, list) or not edl_rows:
        raise ValueError("EDL and transcript segments are required")
    edl_ids = [row.get("segment_id") if isinstance(row, dict) else None for row in edl_rows]
    asr_ids = [row.get("segment_id") if isinstance(row, dict) else None for row in asr_rows]
    if any(not isinstance(value, str) or not value.strip() for value in edl_ids + asr_ids) or len(edl_ids) != len(set(edl_ids)) or len(asr_ids) != len(set(asr_ids)) or set(edl_ids) != set(asr_ids):
        raise ValueError("EDL and ASR must contain the same unique segment IDs")
    asr_by_id = {row["segment_id"]: row for row in asr_rows}
    tolerance = 1.0 / float(fps)
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    for edl_row in edl_rows:
        segment_id = edl_row["segment_id"]
        asr = asr_by_id[segment_id]
        start = asr.get("start_time")
        end = asr.get("end_time")
        numeric = all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in (start, end))
        output_start = float(edl_row.get("output_start_frame", -1)) / float(fps)
        output_end = float(edl_row.get("output_end_frame", -1)) / float(fps)
        source_start = edl_row.get("source_audio_sample_start")
        source_end = edl_row.get("source_audio_sample_end")
        video_start = edl_row.get("source_video_in")
        video_end = edl_row.get("source_video_out")
        source_aligned = all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in (source_start, source_end, video_start, video_end)) and abs(float(source_start) / float(sample_rate) - float(video_start)) <= tolerance and abs(float(source_end) / float(sample_rate) - float(video_end)) <= tolerance
        dialogue_match = normalized(edl_row.get("dialogue")) == normalized(asr.get("text")) and bool(normalized(edl_row.get("dialogue")))
        timing_match = numeric and start >= 0 and end > start and start >= output_start - tolerance and end <= output_end + tolerance
        if not dialogue_match:
            errors.append(f"{segment_id}: ASR text does not match EDL dialogue")
        if not timing_match:
            errors.append(f"{segment_id}: ASR interval is outside its EDL output interval")
        if not source_aligned:
            errors.append(f"{segment_id}: source audio/video times are not aligned")
        rows.append({"segment_id": segment_id, "expected_dialogue": edl_row.get("dialogue", ""), "asr_text": asr.get("text", ""), "dialogue_match": dialogue_match, "duplicate_phrase_check": False, "duplicate_phrase_candidates": [], "source_time_alignment": source_aligned, "asr_evidence_path": transcript_path.as_posix()})
    candidates = repeated_phrases([str(row.get("text", "")) for row in asr_rows], [str(value) for value in asr_ids])
    reviews = json.loads(reviews_path.read_text()).get("reviews", []) if reviews_path else []
    if not isinstance(reviews, list):
        raise ValueError("duplicate review file must contain a reviews list")
    reviews_by_key = {(item.get("phrase"), tuple(item.get("segment_ids", []))): item for item in reviews if isinstance(item, dict)}
    for row in rows:
        row["duplicate_phrase_candidates"] = [candidate for candidate in candidates if row["segment_id"] in candidate["segment_ids"]]
        row["duplicate_phrase_check"] = all((candidate["phrase"], tuple(candidate["segment_ids"])) in reviews_by_key and reviews_by_key[(candidate["phrase"], tuple(candidate["segment_ids"]))].get("reviewed") is True and reviews_by_key[(candidate["phrase"], tuple(candidate["segment_ids"]))].get("decision") == "keep" for candidate in row["duplicate_phrase_candidates"])
    for candidate in candidates:
        review = reviews_by_key.get((candidate["phrase"], tuple(candidate["segment_ids"])))
        if not review or not isinstance(review.get("reason"), str) or not review["reason"].strip() or review.get("decision") != "keep" or review.get("reviewed") is not True:
            errors.append(f"repeated phrase requires an explicit keep review: {candidate['phrase']}")
    try:
        decoded_audio = audio_sha256(video)
    except (OSError, RuntimeError, FileNotFoundError) as exc:
        errors.append(f"final audio cannot be decoded: {exc}")
        decoded_audio = ""
    if transcript.get("source") != "independent-final-track-asr" or transcript.get("audio_sha256") != decoded_audio:
        errors.append("ASR transcript is not bound to the decoded final audio track")
    return {"schema_version": "1.0", "source": "video-production-qc", "method": "independent-asr-script", "revision_id": revision_id, "gate": "passed" if not errors else "blocked", "video_sha256": sha256(video), "audio_sha256": decoded_audio, "edl_sha256": sha256(edl_path), "transcript_sha256": sha256(transcript_path), "asr_source": "final-audio-track", "segments": rows, "duplicate_phrase_candidates": candidates, "duplicate_phrase_reviews": reviews, "errors": errors}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--edl", required=True, type=Path)
    parser.add_argument("--transcript", required=True, type=Path)
    parser.add_argument("--revision-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--duplicate-reviews", type=Path)
    args = parser.parse_args(argv)
    try:
        report = generate(args.video, args.edl, args.transcript, args.revision_id, args.duplicate_reviews)
    except (OSError, json.JSONDecodeError, TypeError, ValueError, RuntimeError) as exc:
        report = {"schema_version": "1.0", "source": "video-production-qc", "method": "independent-asr-script", "revision_id": args.revision_id, "gate": "blocked", "errors": [str(exc)]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0 if report.get("gate") == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
