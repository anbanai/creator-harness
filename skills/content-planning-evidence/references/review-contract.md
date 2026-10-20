# Review and failure contract

Every JSON result carries schema_version=1.0, exact task_id, execution_id, task_kind,
status=ready|blocked|data_insufficient and explicit missing array. Read the Pack schema for exact fields.

Research writes proposed candidates plus evidence, with a nonempty source reference
for every proposal and assessment. A source's operation_id resolves to a successful
search/fetch receipt from this exact execution; its URL, fetched_at and published_at
must match the receipt. Facts are exact nonempty excerpts of that receipt title/snippet/summary/content;
keep semantic interpretation in the proposal rationale, never in quoted facts. No source
facts means blocked/data_insufficient; do not fabricate receipts or confidence.

Validation review uses validation_kind=semantic_only and checks facts, evidence,
compliance, target_fit. Script review additionally checks timing and materials.
Every check includes pass|blocked, rationale and evidence source IDs. The review's
content_sha256 hashes the exact validation-article.md or video-script.json bytes.
A semantic pass is never audience, market or empirical validation.

Script scenes start at zero, follow contiguous increasing timing, and include nonempty
spoken_text, visuals and material_requirements. Join spoken text in scene order for
the script spoken_text. SRT timing precision is milliseconds; the last end time may
not exceed the frozen target duration. Keep source IDs from accepted evidence.

Unavailable capability or unresolved evidence: preserve partial outputs, write a failure artifact under the Pack-declared failure-state path with schema_version, task/execution identity, status=blocked,
code, missing, preserved_paths and resume_from, then end unsuccessfully. Do not mark
checks passed or switch to paid rendering to work around a text-stage failure.

Research-only degradation: an honest completed search with no usable evidence may
write both research JSON files with status=data_insufficient, zero candidates and
nonempty missing codes chosen from no_relevant_sources, source_evidence_insufficient,
internal_history_unavailable. Any partial sources still require real citations.
These files are deliverable diagnostic evidence and cannot unlock validation/script.
A provider/authentication/runtime failure remains blocked with the Pack failure artifact;
never disguise a missing configured capability as a successful empty search.
