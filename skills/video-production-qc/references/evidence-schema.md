# Quality evidence schema

The report is revision-scoped and file-backed:

```json
{
  "schema_version": "1.0",
  "source": "video-production-qc",
  "revision_id": "rev-001",
  "gate": "passed|blocked|degraded",
  "checks": [
    {
      "id": "duration_delta",
      "status": "passed|blocked|unavailable",
      "severity": "blocker|warning",
      "method": "ffprobe",
      "measured": 0.012,
      "threshold": "<= one video frame",
      "evidence_paths": []
    }
  ],
  "measurement": {},
  "listening": {
    "status": "complete|partial|unavailable",
    "windows": []
  },
  "missing": [],
  "evidence_paths": []
}
```

`measurement.status` describes deterministic checks only. `listening.status`
describes actual playback or monitored review. Do not collapse them into one
boolean.
