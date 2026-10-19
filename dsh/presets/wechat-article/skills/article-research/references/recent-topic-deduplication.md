# Recent Topic Deduplication

## Comparison

Compare each candidate with prior content on four dimensions:

- reader problem or decision;
- core claim or promised answer;
- audience segment;
- article angle and intended reader action.

Titles and keywords are discovery clues, not the deduplication unit. Treat a candidate as the same angle when it addresses the same reader problem with substantially the same answer, even if its title uses different wording. A different model, product name, list length, or title hook alone does not make an angle new.

## Time Windows

Use these defaults when history records include reliable topic-lock timestamps:

- **0-30 days:** hard exclusion for the same reader problem and angle. Pick another candidate or materially change the problem being solved.
- **31-90 days:** soft exclusion for the same topic family. Reuse only with a clear new angle, audience need, evidence, or meaningful development.
- **More than 90 days:** eligible for reconsideration, but explain what is newly useful or different.

An explicit user topic remains the controlling request. When it overlaps recent work, preserve the requested subject while finding a materially distinct question or treatment where possible, and disclose the overlap in the research record.

## History Evidence

`list_project_titles` returns the legacy `titles` array plus `history` records with `task_id`, `title`, `topic`, `angle`, `topic_locked_at`, and `created_at`. The history includes every titled task with a topic lock or legacy creation date in the last 90 days, plus up to 200 older records for long-term context. `history_older_count` and `history_older_truncated` state whether older records were omitted; compare every returned record and disclose truncation. Use `topic_locked_at` for the rolling window when present; `created_at` is only a fallback timestamp for legacy title context and does not prove when a topic was selected. A successful empty history is different from a failed or unavailable call.

For records without semantic fields, compare the title and any available draft/published metadata manually, but mark topic/angle evidence as incomplete. `data_at` is the query time, never a substitute for a record timestamp. Report exact history counts, closest matches, missing fields, and the reason for excluding or retaining each close candidate.

The Server rejects an exact normalized topic-and-angle match locked in the prior 30 days when the selected title is finalized. This deterministic guard catches repeated submissions; it does not replace semantic comparison. The 31-90 day soft exclusion and older-content reconsideration remain Agent judgments under the windows above.

## Recording The Selection

After selecting the working title, call `finalize_task_title(task_id, title, topic, angle)` before writing the outline. For a WeChat article, `topic` must name the reader problem/decision and `angle` the distinct promised answer and treatment. This records selection metadata on the current task, including work that has not reached WeChat draft creation. If the Server rejects a title or recent topic-angle duplicate, choose a materially different topic or angle; changing title wording alone is not a resolution.

If a later edit changes the title, persist the replacement with `finalize_task_title`, passing the same topic and angle, before delivery. Treat returned Server success as evidence that the title and semantic selection were stored; only the exact normalized 30-day topic-angle guard is Server-enforced. The 31-90 day judgment remains the Agent's responsibility.
