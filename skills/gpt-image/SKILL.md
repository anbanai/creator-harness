---
name: gpt-image
description: "Use when a request needs model-aware prompting for GPT Image 2 / 2.5 visuals, reference-image editing, inpainting, typography, posters, or the Reference Gallery; use the host image capability for execution."
---

# gpt-image

Prompt-planning and image-generation guidance for GPT Image 2 / 2.5 workflows. In Anban managed runs, this Skill supplies model-aware prompts and reference choices; the caller performs generation through the registered image capability (the `creator` MCP `generate_image` tool). Do not invoke a provider CLI/API, create an HTTP client, or read `OPENAI_API_KEY` from a Skill workflow.

## Operating loop

1. **Classify request and resolve model**: `generate`, `edit`, `inpaint`, or `multi-reference`; identify asset type, exact text, aspect ratio, references, safety constraints, and budget/quality. Apply the model-choice rules below before the generation call.
2. **Choose the reference path**: Image 2 keeps the gallery-first workflow below. For 2.5, a precise brief needs no reference loading; otherwise choose one short task slice.
3. **Refine only as needed**: preserve the brief. Add a specific gallery case, craft section or template only to fill a concrete gap; do not load them as a bundle for 2.5.
4. **Confer when useful**: before costly/ambiguous/high-polish calls, present 1–3 matched directions plus planned size/quality; ask at most one concise question at a time. Skip long discussion for precise “generate now” requests with a resolved model.
5. **Preflight, no side effects**: confirm that the caller has a registered image-generation capability and the required task/project context. Do not assume a local home path, shell executable, provider SDK, or API key in cloud/hosted runtimes.
6. **Generate through the caller**: pass the resolved prompt, references, aspect ratio, and task output path to the host capability. In Anban, use `creator` MCP `generate_image`; let the Server-owned capability resolve provider access and billing. Do not create a new SDK wrapper or ad-hoc HTTP client.
7. **Review and report**: when available, use the host image-analysis capability after generation, then report the returned artifact path and the review result. Record a structured failure when generation or review is unavailable.

Fast path: confirmed model intent + precise prompt + “generate now” → resolve the prompt and call the registered host capability without a mandatory reference/craft pass. Do not reconfirm an exact valid model.

## Model choice and prompt adaptation

| Choice | API model ID | Suggested use |
|---|---|---|
| Flare | `gpt-image-2.5-flare` | Fast general generation and drafts |
| Sunburst | `gpt-image-2.5-sunburst` | Precise reference edits and detailed control |
| Image 2 | `gpt-image-2` | Existing Image 2 workflows and compatibility |

- If the model is absent, ambiguous (such as “GPT 2.5”), or misspelled, ask one clear question offering **Flare, Sunburst, and Image 2** with these trade-offs, then wait. For a typo, suggest the likely intended choice without silently correcting it. Do not treat `gpt-image-2.5` as an API model ID.
- Use an exact supported model ID, an unambiguous choice from this menu, or the user's already confirmed choice for the current task without asking again. If the user explicitly says “you choose,” explain the pick briefly and proceed; consider their task and budget rather than always selecting the most expensive settings.
- Preserve the resolved model intent in the prompt or generation request when the host capability supports model selection. Do not invent a provider parameter that the registered host tool does not expose; Server configuration is authoritative for provider routing.
- Keep model confirmation, cost discussion, and API flags separate from the final image prompt. Use the model-specific reference path below only when it helps the task. Preserve the user's exact text, intended content, reference identity, and edit invariants; obtain confirmation before material prompt changes.
- Generate one image unless the user requested more. Do not silently switch models, change material prompt content, or run multiple model/prompt variants or comparisons. Ask before additional paid variants. For an authorized same-prompt comparison, keep the prompt, size, and quality identical unless the user asks to vary them.
- Consult `references/models.md` when parameter support or validation status needs checking. On an invalid-model, access/403, quota, or policy failure, report the failure and stop; do not switch models or rewrite the prompt to retry automatically.

## Host integration

This Skill does not choose a shell command or provider SDK. Use the host's
registered image-generation capability with the prompt and references selected
above. For Anban, the managed contract is:

```text
Tool: `generate_image`
project_id=$PROJECT_ID
task_id=$TASK_ID
prompt=<final prompt>
image_type=<cover|content|other>
output_path=output/<task-owned-file>
aspect_ratio=<resolved ratio>
ref_image_paths=<ordered references when needed>
```

The MCP schema and Server response are authoritative. Do not add unsupported
model, quality, provider, or API-key arguments.

## Access and cost rules

- Provider access, model availability, billing, retries, and credentials belong
  to the registered host capability and Server configuration.
- If the required host capability is unavailable, report that capability is
  unavailable and stop or follow the caller's failure contract; do not fall
  back to a direct provider request.
- Never request, write, or print API keys, `.env` contents, or credential
  values.

## Generation settings

Use the host capability's supported settings and keep the user's agreed values.
For 2.5, these quality starting points take precedence over fixed quality advice
in older craft references:
- `low`: cheap drafts and broad exploration; multiple variants require user authorization.
- `medium`: normal exploration, style probing, balanced cost.
- `high`: a candidate for final assets, dense text, diagrams and UI. On 2.5, evaluate against the task requirements; do not assume `medium` fails or a higher setting always wins.
- `xhigh` / `max`: 2.5-only options for higher-quality work; discuss the cost trade-off before increasing an already agreed quality. Do not use them automatically for budget-conscious requests.

Size policy:
- default/social square: `1k` / `1024x1024`
- poster/mobile/beauty: `portrait`
- landscape/gameplay/photo: `landscape`
- print/paper figure: `2k`
- widescreen hero: `4k`
- vertical story/banner: `tall`

## Operation routing

| Mode | Trigger | Host operation |
|---|---|---|
| Text-to-image | no reference image | generation with no references |
| Reference edit | one or more references | generation with ordered references |
| Inpaint | references plus a mask | generation with the mask and ordered references |

## Reference loading

- **Image 2**: open `references/gallery.md`, then one matching `references/gallery-*.md` category and its actual prompt text. Read only relevant sections of `references/craft.md` or the historical `references/openai-cookbook.md` when needed.
- **Image 2.5**: no mandatory references for a precise brief. If guidance is needed, choose **one** directly: `references/openai-image-2.5-generation.md` (photo/product/illustration), `references/openai-image-2.5-layout-and-text.md` (text/UI/diagrams/panels), or `references/openai-image-2.5-editing.md` (references/masks/translation).
- **Other questions**: `references/openai-image-2.5.md` is an optional index; `references/openai-image-2.5-migration.md` covers migration/comparison; `references/models.md` owns current API parameters and validation status.
- **Extra inspiration only**: gallery cases, a targeted craft section, or `references/templates-gpt-image-2.5.md` (community adaptations, not verified outputs). Do not preload them or the old Cookbook for 2.5.

Load the smallest useful slice, not both model routes. Add a second task slice only for a genuine hybrid. Historical examples do not override current API notes or the user's model/settings.

For direct progressive disclosure, the long references are indexed here: [craft.md](references/craft.md), [models.md](references/models.md), [openai-cookbook.md](references/openai-cookbook.md), [gallery-anime-and-manga.md](references/gallery-anime-and-manga.md), [gallery-gaming.md](references/gallery-gaming.md), [gallery-infographics-and-field-guides.md](references/gallery-infographics-and-field-guides.md), [gallery-photography.md](references/gallery-photography.md), [gallery-research-paper-figures.md](references/gallery-research-paper-figures.md), and [gallery-typography-and-posters.md](references/gallery-typography-and-posters.md).

## Verification

- Before generation: check the resolved model intent, endpoint mode, size or
  aspect ratio, output path, and required reference/mask files. Do not pass
  parameters that the registered host tool does not support.
- After generation: use the host response as the source of truth for the
  artifact path and status; verify the file exists before reporting success.
- For edits/inpaints: verify all reference and mask paths exist and record
  their order in the generation evidence.

Provider-specific CLI and API examples retained in `references/` are reference
material only. They do not authorize direct network calls from this Skill.

Preserve `Curated` vs `Author + Source` metadata when adapting examples. Add new collected prompts to the Reference Gallery before README promotion.
