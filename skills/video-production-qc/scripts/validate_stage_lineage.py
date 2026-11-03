#!/usr/bin/env python3
"""Check declared stage-event order and current artifact hashes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("event timestamp is missing")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("event timestamp must include a timezone")
    return parsed


def validate(data: dict[str, Any], root: Path, revision_id: str, required_paths: list[str]) -> dict[str, Any]:
    errors: list[str] = []
    unverifiable_outputs: list[str] = []
    if not isinstance(data, dict):
        return {
            "schema_version": "1.0", "source": "video-production-qc", "revision_id": revision_id,
            "gate": "blocked", "event_count": 0, "stages": [],
            "checks": [{"id": "stage_lineage", "status": "blocked", "errors": ["progress state must be a JSON object"]}],
            "errors": ["progress state must be a JSON object"],
        }
    events = data.get("events")
    if data.get("schema_version") != "1.0" or data.get("source") not in {"talking-head-montage", "viral-ip-video-editor"} or data.get("revision_id") != revision_id:
        errors.append("progress state schema, source or revision does not match")
    if not isinstance(events, list) or not events:
        events = []
        errors.append("progress state must contain stage events")

    last_index: int | None = None
    last_completed: datetime | None = None
    declared_outputs: dict[str, tuple[str, dict[str, Any]]] = {}
    stages: list[str] = []
    for event in events:
        if not isinstance(event, dict):
            errors.append("stage event must be an object")
            continue
        index = event.get("event_index")
        stage = event.get("stage")
        if not isinstance(index, int) or isinstance(index, bool) or (last_index is not None and index <= last_index):
            errors.append(f"event index is not strictly increasing: {index!r}")
        else:
            last_index = index
        if not isinstance(stage, str) or not stage.strip():
            errors.append("stage name is missing")
        else:
            stages.append(stage)
        event_revision = event.get("revision_id")
        if not isinstance(event_revision, str) or event_revision != revision_id:
            errors.append(f"event {index!r} revision does not match current revision")
        try:
            started = timestamp(event.get("started_at"))
            completed = timestamp(event.get("completed_at"))
            if completed < started:
                errors.append(f"event {index!r} completes before it starts")
            last_completed = max(last_completed, completed) if last_completed is not None else completed
        except (TypeError, ValueError, OverflowError) as exc:
            errors.append(f"event {index!r} has invalid timestamps: {exc}")

        outputs = event.get("outputs")
        if not isinstance(outputs, list):
            errors.append(f"event {index!r} has no output artifact list")
            continue
        for artifact in outputs:
            if not isinstance(artifact, dict):
                errors.append(f"event {index!r} output artifact must be an object")
                continue
            relative = artifact.get("path")
            if not isinstance(relative, str) or not relative.strip():
                errors.append(f"event {index!r} output artifact path is missing")
                continue
            path = (root / relative).resolve()
            if root.resolve() not in path.parents:
                errors.append(f"event {index!r} output is outside the task workspace: {relative}")
                continue
            if not path.is_file():
                if relative in required_paths:
                    errors.append(f"required event output is missing: {relative}")
                else:
                    unverifiable_outputs.append(relative)
                continue
            if artifact.get("revision_id") != event_revision or artifact.get("created_at_stage") != stage:
                errors.append(f"event {index!r} output has incorrect revision or created_at_stage: {relative}")
            actual = sha256(path)
            declared = artifact.get("sha256")
            declared_outputs[relative] = (actual, artifact)

    for relative in required_paths:
        path = (root / relative).resolve()
        if root.resolve() not in path.parents or not path.is_file():
            errors.append(f"required current artifact is missing: {relative}")
            continue
        current_hash = sha256(path)
        declared = declared_outputs.get(relative)
        if declared is None or declared[0] != current_hash or declared[1].get("revision_id") != revision_id or declared[1].get("sha256") != current_hash:
            errors.append(f"required current artifact is not bound to its latest stage event: {relative}")

    return {
        "schema_version": "1.0",
        "source": "video-production-qc",
        "revision_id": revision_id,
        "gate": "passed" if not errors else "blocked",
        "method": "declared-stage-order-and-current-artifact-hash-recomputation",
        "event_count": len(events),
        "stages": stages,
        "checks": [{"id": "stage_lineage", "status": "passed" if not errors else "blocked", "errors": errors}],
        "errors": errors,
        "unverifiable_outputs": sorted(set(unverifiable_outputs)),
        "limitation": "This verifies internal consistency of Agent-authored records; it does not authenticate when or by whom events were created.",
    }
