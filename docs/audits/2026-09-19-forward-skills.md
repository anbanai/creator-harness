# Harness packs: static forward simulation

Scope: current `article`, `seednote`, and `ecommerce` pack instructions and their named high-overlap skills. This is a contract walk-through only: no MCP, image, research, or publication service was invoked. It checks routing, artifacts, stop/continue behavior, and declared gates. It does **not** demonstrate real generated-content quality or prove that textual quality rules cause a model to validate images correctly.

## Result

The revised Seednote contract now defines the aggregate quality outcome: after all planned pages are attempted, **any** remaining `quality_status=failed` writes `output/failure-state.json` with `error_code=image_quality_failed`, `stage=image_generation`, and `resume_from=image_generation`; recovery redoes only failed pages before full delivery validation. See [SKILL.md](../../skills/seednote-visual-design/SKILL.md) and [reference-contract.md](../../skills/seednote-visual-design/references/reference-contract.md).

`artifacts_by_task_type` is a complete override, not additive: `viral_analysis` therefore correctly requires only its analysis/template outputs. This was verified against `server/agentpack/types.go:108-125` and the dedicated catalog test.

## Article scenarios

| Condition | Skills that should run | Expected forward path and artifacts | Terminal behavior |
|---|---|---|---|
| `article_image_mode=text_only` | `content-writing`, `seo-optimization`, `article-viral-strategy`; visual skill only for template/rhythm plan | Skip cover and content-image planning/generation/upload; retain layout slots with `image_url=null`. Generate `01-research.md`, `02-outline.md`, `context-brief.md`, `04-article-final.md`, `seo-result.md`, `visual-rhythm-plan.md`, `marketing-scan.json`, `05-article.html`, `final-review.md`, and `draft.json`. | Text-only visual checks are N/A. HTML is still rendered by `render_template`; readiness may become `ready` only if all nonvisual gates pass. |
| Content-image visual failure after retries or upload failure | Same, plus `article-visual-design`; cover skill only when cover mode is on | Preserve generated/local files and record warnings; failed image slots keep no CDN URL. Still render `05-article.html`, write final review, and write the normal `draft.json` schema. | Continue core Markdown/HTML; `draft.json.readiness.status=blocked` with a stable cause. |
| HTML generated successfully while marketing/final/viral readiness is blocked | `content-writing`, `seo-optimization`, `article-viral-strategy`; visual skills by image mode | `render_template` output is saved as `05-article.html`; final review cites blocked evidence. | HTML existence is not publication readiness. The draft remains `blocked`, pointing to marketing scan/final review/viral audit evidence. |

Evidence: article image-mode table and visual exception are in [agent.claude.md](../../packs/article/agent.claude.md) and [agent.claude.md](../../packs/article/agent.claude.md); the final review gate is [agent.claude.md](../../packs/article/agent.claude.md). The visual skill independently preserves the text-only guard and blocked-draft handling in [SKILL.md](../../skills/article-visual-design/SKILL.md) and [SKILL.md](../../skills/article-visual-design/SKILL.md).

## Seednote scenarios

| Condition | Skills that should run | Expected forward path and artifacts | Terminal behavior |
|---|---|---|---|
| Original topic; external research unavailable | `seednote-research`, `seednote-writing`, `seednote-visual-design` | Do not invent feed metrics. Write `topic-analysis.md` with actual source (`task_topic`, `topic_pool`, or `project_context`), tool availability, missing fields and fallback reason; then write content, lock title, plan/generate permitted images, and validate. | Continue; no `failure-state.json` solely for unavailable original research. |
| Replicate request with retrievable source | `seednote-research`, `seednote-viral-analysis`, `seednote-writing`, `seednote-visual-design` | Obtain actual MCP-derived source identifiers/content, then `source-note.md`, evidence-backed `source-analysis.md`, `viral-template.json`, rewritten `content.md`, title lock, image plan/review and replicate compliance report. | Continue to delivery if all gates pass. A link/ID with no retrievable source instead stops at `research` with failure state. |
| `task_type=viral_analysis` | `seednote-research`, `seednote-viral-analysis` only | Fetch source, produce `source-analysis.md` and `viral-template.json`; no `content.md`, humanizer, visual plan/images, writing, or publishing. | Stop after those two outputs and feedback. The artifact override selects exactly these required files. |
| One image exhausts quality retries | `seednote-visual-design` | Record that page as `quality_status=failed`, retain its trace, and continue the other planned pages. | After all planned pages, write `failure-state.json` with `error_code=image_quality_failed`, `stage=image_generation`, and `resume_from=image_generation`; stop successful delivery. Recovery retries only failed images, then reruns full delivery validation. |
| `generate_image` fails or times out | `seednote-visual-design` | Preserve already generated files, write structured `failure-state.json` at image generation, retain recovery point. | Stop image stage; no successful delivery until recovery validates all planned files and removes stale failure state. |

Evidence: research fallback is [agent.claude.md](../../packs/seednote/agent.claude.md), replicate source handling is [agent.claude.md](../../packs/seednote/agent.claude.md), and per-image versus generation failure is [agent.claude.md](../../packs/seednote/agent.claude.md).

## Ecommerce scenarios

| Condition | Skills that should run | Expected forward path and artifacts | Terminal behavior |
|---|---|---|---|
| No accessible `ecommerce_product` photos | None of the four production skills after input validation | Validate attachment index/count/accessibility; write structured failure diagnosis before product analysis. | Stop. `product-bible.md`, `copywriting.md`, and `manifest.json` are success artifacts and should not be fabricated. |
| Only `detail` selected | `ecommerce-product-analysis`, `ecommerce-copywriting`, `ecommerce-visual-design`, `ecommerce-platform-specs` | Build product bible and copywriting, then plan/generate only `detail_*.png`. `asset-plan.md` and manifest must omit main/cover/share/SKU. Scan only selected asset text and write compliance report. | Deliver after the detail core scene passes and planned detail files/manifests agree. |
| One noncritical selected image fails quality review | Same as detail-only path | Strengthen constraints and retry up to three attempts; then record `needs_reference` plus post-production recommendation in `best-refs.md` and manifest. | Continue and disclose if it is noncritical. A detail core scene must PASS, so a failure there prevents full success. |
| All selected modules/images pass | Same four skills | Product bible -> copywriting -> selected-only asset plan/prompts/best refs -> images -> compliance report -> manifest. | Manifest lists each selected file and PASS/compliance result; no unselected module artifacts. |

Evidence: product-photo stop condition and selected-module boundary are [agent.claude.md](../../packs/ecommerce/agent.claude.md) and [agent.claude.md](../../packs/ecommerce/agent.claude.md); quality and full-success conditions are [agent.claude.md](../../packs/ecommerce/agent.claude.md) and [agent.claude.md](../../packs/ecommerce/agent.claude.md).

## Routing matrix

| Skill | Should trigger | Should not trigger |
|---|---|---|
| Article visual | Article enters visual planning/rhythm design, including `text_only`; content-image generation/review/upload runs only when its mode permits. | A standalone cover request, which belongs to Article cover. |
| Article cover | Article image mode includes a cover. | `content_only`, `text_only`, or ordinary body-image work. |
| Article viral | Selected Article topic, retention writing, title audit, or final viral audit. | Generic SEO metadata or body copy editing alone. |
| Article SEO | Final Article draft needs title, keywords, digest, or search variants. | Viral retention structure or body rewrite. |
| Article content | Article body drafting, compliance/preflight, or render handoff. | SEO metadata and viral strategy. |
| Ecommerce product analysis | Accessible product photos need evidence extraction and an anchor. | Missing product photos or a generic image request. |
| Ecommerce copywriting | A product bible exists and buyer-facing benefits/module copy are needed. | Product recognition or image self-review alone. |
| Ecommerce visual | Selected ecommerce modules need asset planning, generation, or consistency review. | No valid product photos or no selected visual module. |
| Ecommerce platform specs | A target platform needs dimensions/rules or final prohibited-word scanning. | General product image ideation without a platform/compliance stage. |
| Seednote writing | Original/replicate Seednote body, title, compression, or compliance. | `task_type=viral_analysis` evidence-only run. |
| Seednote visual | Regular Seednote image planning/generation/review after title lock. | `viral_analysis`, or before content/title finalization. |
| Seednote research | Original topic research or replicate source retrieval. | Visual-only generation from an already complete content package. |
| Seednote viral analysis | Retrieved replicate source, or dedicated `viral_analysis`. | Original topic research without source-note evidence. |

## With-skill comparisons

These are static counterfactuals, not test results. “Without” identifies constraints the Agent still explicitly owns and the further rules that would no longer be supplied by the removed Skill; it does **not** assert that a run would necessarily make an error or have lower model-quality output.

| Skill / scenario | With Skill | If that Skill were removed: constraints retained by Agent | Skill-specific detail no longer supplied |
|---|---|---|---|
| Article visual / `text_only` | Produces visual rhythm/template plan and sets image slots to `null`; skips image phases. | Agent still reads `article_image_mode`, skips cover/content generation, renders HTML, and blocks readiness when its own final gate requires it. | Template selection, slot/rhythm mapping, three-dimensional visual style analysis, and the visual artifact/audit schema. |
| Article cover / cover mode | Creates the cover plan/prompt, quality scorecards, and cover-specific review/upload path. | Agent still limits cover work to cover-enabled modes and requires a blocked draft if visual readiness fails. | Cover metaphor, safe-area/cropping decisions, cover effectiveness scorecard, and person-reference handling. |
| Article viral / final review | Adds topic framing, retention criteria, title audit, and the seven-dimensional `viral-audit.md`. | Agent still performs content/SEO/final review and never treats HTML as a publication request. | Social-currency framing, hook/emotion/retention rubric, title-CTR overlay, and viral-audit evidence requirements. |
| Article SEO / metadata | Produces compliant keyword, title, digest, and CTR-variant record in `seo-result.md`. | Agent still keeps title/digest sourced from its final SEO result and applies overall content/readiness gates. | Keyword extraction, title/digest optimization protocol, title-variant scoring, and SEO output schema. |
| Article content / draft and preflight | Creates body/final Markdown, content-quality report, marketing scan, and render handoff. | Agent still orchestrates phases, calls `render_template`, and writes its delivery package. | Writer-resource-based drafting, section-anchor/content-detail checks, marketing scan protocol, and content compliance rubric. |
| Ecommerce product analysis / detail-only | Extracts product evidence, resolves conflicts/missing data, and selects the anchor reference in the Product Bible. | Agent still rejects missing product photos and requires an output product-bible before later success stages. | Per-photo attribute extraction, evidence confidence/missing-data method, subject naming, and anchor-selection criteria. |
| Ecommerce copywriting / detail-only | Converts Product Bible evidence into ranked FABE/value copy for selected assets. | Agent still applies selected-module boundaries, humanizer handoff, and later platform compliance. | Benefit-evidence framing, copy structure and module-level copy composition. |
| Ecommerce visual / one noncritical quality failure | Plans selected-only assets, binds exact product-reference subsets, retries quality failures, and records `needs_reference`. | Agent still prohibits unselected modules, requires selected files in manifest, and requires the detail core scene to PASS. | Asset-plan schema, named-reference prompt discipline, visual self-review criteria, retry/`needs_reference` workflow, and post-production recommendation. |
| Ecommerce platform specs / selected detail | Applies target-platform dimensions/module rules and scans buyer-facing text for prohibited claims. | Agent still uses configured target platform and requires a compliance report before delivery. | Platform normalization/dimension rules, platform-specific word checks, false-positive treatment, and required high-risk regeneration path. |
| Seednote writing / original or replicate content | Produces formatted, length-controlled content and writing-stage compliance/title rules. | Agent still chooses original versus replicate, locks a final title before visuals, and stops a failed title-finalization call. | Body format/length method, title and interaction-language rules, and content compliance remediation detail. |
| Seednote visual / one failed page | Plans mode-permitted pages, records prompts/reviews, retries each page, and deterministically writes `image_quality_failed` after an exhausted page. | Agent still enforces `seednote_image_mode`, preserves generated files, and blocks delivery if failure state remains. | Per-page information grouping, reference selection, prompt/text rules, image review schema, and failed-page-only recovery rule. |
| Seednote research / original outage or replicate | Records truthful research provenance/fallback, or retrieves a source note with MCP-derived identifiers. | Agent still selects original/replicate based on task signals and stops a replicate task that lacks usable source content. | Search/detail/profile method, data-source attribution, missing-fields and fallback record, and source evidence collection rules. |
| Seednote viral analysis / replicate or `viral_analysis` | Extracts source-backed conclusions and the task-local viral template without generating copy/images. | Agent still enforces the `viral_analysis` stop gate and requires its two output artifacts. | Evidence-to-conclusion mapping, confidence/missing-data treatment, cloning depth and `do_not_copy` template guidance. |
