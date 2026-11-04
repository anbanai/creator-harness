# Provider-neutral Music MCP Contract

This contract keeps the BGM Skill independent of a specific music vendor. Each
operation is atomic and records the execution scope supplied by the runtime.

## Common fields

Every request and response includes:

- `schema_version`: contract version, currently `1.0`.
- `provider`: registered provider identifier, never an ad-hoc URL.
- `capability`: one of `search`, `select`, `license`, `download`.
- `capability_version`: provider capability version.
- `task_id`, `project_id`, `execution_id`: execution-scoped identity when running under Server.
- `requested_at` or `accessed_at`: RFC 3339 timestamp.
- `rights_evidence`: a stable license record reference or `null` while searching.
- `sha256`: exact downloaded file hash, required for `download` success.

## Request shape

```json
{
  "schema_version": "1.0",
  "provider": "registered-provider",
  "capability": "search",
  "capability_version": "2026-01",
  "query": {"mood": ["restrained", "curious"], "instrumental": true},
  "task_id": "task-1",
  "project_id": "project-1",
  "execution_id": "execution-1"
}
```

`select` adds candidate identifiers and selection constraints. `license` adds
the selected track identifier and intended use. `download` adds the selected
track identifier and a task-local `output_path`; it must never accept a host
path or an unregistered arbitrary URL.

## Success response

```json
{
  "schema_version": "1.0",
  "status": "succeeded",
  "provider": "registered-provider",
  "capability": "download",
  "capability_version": "2026-01",
  "accessed_at": "2026-11-05T00:00:00Z",
  "rights_evidence": {"status": "verified", "ref": "license-123"},
  "file_path": "output/music/track-123.wav",
  "sha256": "<sha256>",
  "missing": []
}
```

`search` and `select` may return `items[]` instead of `file_path`; they still
return `rights_evidence` for each candidate when known. A response with a
missing license is `status="partial"` and cannot be used for final mixing.

## Failure response

```json
{
  "schema_version": "1.0",
  "status": "failed",
  "failure_status": "provider_unavailable",
  "provider": "registered-provider",
  "capability": "search",
  "capability_version": "2026-01",
  "accessed_at": "2026-11-05T00:00:00Z",
  "message": "sanitized provider error",
  "retryable": true,
  "missing": ["rights_evidence"]
}
```

Allowed `failure_status` values are `provider_unavailable`,
`capability_unsupported`, `rights_unverified`, `download_failed`,
`identity_mismatch`, and `invalid_request`. Error messages must be sanitized;
credentials, cookies, and authorization headers are never written to the
artifact.
