#!/usr/bin/env node
// Static checks complement the scenario evaluations; they do not measure model quality.
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'

const rootIndex = process.argv.indexOf('--root')
const root = rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = process.argv.includes('--baseline')
const errors = []
const warnings = []
const rel = (path) => relative(root, path).replaceAll('\\', '/')
async function walk(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}
async function read(path) {
  if (!baseline || path.includes('/humanizer/')) return readFile(path, 'utf8')
  try { return execFileSync('git', ['show', `HEAD:${rel(path)}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { return null }
}
function frontmatter(text, label) {
  try {
    const block = text.match(/^---\n([\s\S]+?)\n---(?:\n|$)/)?.[1]
    if (!block) throw new Error('missing YAML frontmatter')
    return yaml.load(block)
  } catch (error) { errors.push(`${label}: ${error.message}`); return {} }
}
function calls(path, text) {
  for (const tool of ['get_project_profile', 'generate_image', 'analyze_image']) {
    // Cover examples as well as Markdown tool parameter tables.
    for (const match of text.matchAll(new RegExp(`${tool}(?:\u0060)?\\s*\\(([^)]*)\\)`, 'g'))) {
      if (!['project_id', 'task_id'].every((key) => match[1].includes(key)))
        errors.push(`${rel(path)}: ${tool}(...) missing project_id/task_id`)
      if (tool === 'generate_image' && !match[1].includes('aspect_ratio'))
        errors.push(`${rel(path)}: generate_image(...) missing aspect_ratio`)
    }
  }
}
function links(path, text) {
  for (const match of text.matchAll(/!?\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].replace(/^<|>$/g, '')
    if (!target || /^(https?:|mailto:)/.test(target) || /[${}<>*]/.test(target) || /^(?:URL|CDN_URL|image_url)$/.test(target)) continue
    // Bare illustrative output names aren't authored resources.
    if (!target.includes('/') && !/\.(md|json|ya?ml|mjs|py|sh|png|webp)$/.test(target)) continue
    if (!existsSync(resolve(dirname(path), decodeURI(target)))) errors.push(`${rel(path)}: missing linked resource ${target}`)
  }
  // Also verify explicit resource paths in code spans (excluding runtime output paths).
  for (const match of text.matchAll(/`((?:references|templates|scripts)\/[^`]+)`/g)) {
    const target = match[1]
    if (/[ *${}<>|]/.test(target) || !/\.[a-z0-9]+$/i.test(target)) continue
    const skillRoot = path.includes('/references/') ? dirname(dirname(path)) : dirname(path)
    if (![resolve(skillRoot, target), resolve(root, target)].some(existsSync)) errors.push(`${rel(path)}: missing resource ${target}`)
  }
}
const files = await walk(join(root, 'skills'))
const documents = new Map()
const skills = new Map()
for (const path of files.filter((p) => p.endsWith('.md'))) {
  const text = await read(path)
  if (text === null) continue
  const humanizer = path.includes('/humanizer/')
  if (!humanizer) {
    documents.set(rel(path), text)
    if (!baseline) {
      calls(path, text); links(path, text)
      if (/\bTask(?:Create|Update)\b/.test(text)) errors.push(`${rel(path)}: host lifecycle tools belong in Agent adapters, not shared Skills`)
    }
  }
  if (!path.endsWith('/SKILL.md')) continue
  const meta = frontmatter(text, rel(path))
  const lines = text.trimEnd().split('\n').length
  if (!meta.name || !meta.description) errors.push(`${rel(path)}: missing name/description`)
  if (!humanizer && lines > 280) errors.push(`${rel(path)}: ${lines} lines exceeds 280; move conditional detail to references`)
  skills.set(meta.name, { chars: text.length, lines, description: meta.description })
}
for (const path of files.filter((p) => p.includes('/templates/') && p.endsWith('.json'))) {
  const text = await read(path)
  if (text !== null) try { JSON.parse(text) } catch (error) { errors.push(`${rel(path)}: invalid JSON: ${error.message}`) }
}
const startup = {}
for (const path of (await walk(join(root, 'packs'))).filter((p) => p.endsWith('/agent-pack.yaml'))) {
  const manifest = yaml.load(await read(path))
  const claude = await read(join(dirname(path), manifest.agent.claude_source))
  const meta = frontmatter(claude, rel(path))
  const preloaded = meta.skills ?? []
  for (const skill of preloaded) if (!skills.has(skill)) errors.push(`${manifest.id}: missing preload ${skill}`)
  const skillChars = preloaded.reduce((sum, name) => sum + (skills.get(name)?.chars ?? 0), 0)
  const limit = { article: 45000, seednote: 38000, ecommerce: 34000 }[manifest.id]
  startup[manifest.id] = {
    preloaded_skills: preloaded, agent_chars: claude.length, skill_chars: skillChars,
    total_chars: claude.length + skillChars, limit_chars: limit ?? null,
    deferred_humanizer_chars: preloaded.includes('humanizer') ? 0 : (manifest.agent.skills.includes('humanizer') ? skills.get('humanizer').chars : 0),
    distributed_skills: manifest.agent.skills.length,
  }
  if (limit && startup[manifest.id].total_chars > limit) errors.push(`${manifest.id}: startup ${startup[manifest.id].total_chars} > ${limit}`)
  documents.set(rel(join(dirname(path), manifest.agent.claude_source)), claude)
  if (!baseline) {
    for (const source of [manifest.agent.claude_source, manifest.agent.codex_source, manifest.agent.dsh_source].filter(Boolean)) {
      const body = await read(join(dirname(path), source))
      calls(join(dirname(path), source), body)
      for (const match of body.matchAll(/(?:__PLUGIN_ROOT__|\$CLAUDE_PLUGIN_ROOT)\/(skills\/[^`\s"')]+)/g)) {
        if (!existsSync(resolve(root, match[1]))) errors.push(`${manifest.id}/${source}: missing Skill dependency ${match[1]}`)
      }
      if (manifest.kind === 'managed') {
        for (const term of ['AskUserQuestion', 'resume_from', 'set_task_progress_plan']) if (!body.includes(term)) errors.push(`${manifest.id}/${source}: missing autonomy contract ${term}`)
      }
      if (/无法判断时向用户列出候选|跳过剩余视觉与交付包|不得生成交付包/.test(body)) errors.push(`${manifest.id}/${source}: obsolete interaction/delivery branch`)
    }
    if (manifest.id === 'seednote') {
      for (const key of ['artifacts_by_task_type', 'delivery_by_task_type']) {
        const paths = manifest[key]?.viral_analysis?.map((entry) => entry.path).sort()
        if (JSON.stringify(paths) !== JSON.stringify(['output/source-analysis.md', 'output/viral-template.json'])) errors.push(`seednote: ${key} viral_analysis must contain only analysis and template`)
      }
    }
  }
}
// Ignore headings, tables, fences and short boilerplate. Do not compare generated or host copies.
const paragraphs = new Map()
for (const [path, text] of documents) {
  if (path.includes('/references/')) continue
  for (const paragraph of text.split(/\n\s*\n/)) {
    const normalized = paragraph.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim()
    if (normalized.length < 120 || /^[#|]/.test(normalized)) continue
    const entries = paragraphs.get(normalized) ?? []
    entries.push(path); paragraphs.set(normalized, entries)
  }
}
const duplicates = [...paragraphs.entries()].filter(([, paths]) => paths.length > 1)
const duplicateChars = duplicates.reduce((sum, [text, paths]) => sum + text.length * (paths.length - 1), 0)
if (!baseline && duplicateChars > 6000) errors.push(`duplicated entrypoint prose: ${duplicateChars} chars exceeds 6000`)
const report = {
  mode: baseline ? 'HEAD baseline' : 'working tree',
  measurement: 'UTF-16 characters; startup = Claude Agent source + eagerly preloaded SKILL.md; Codex enabled Skills are discoverable, not eagerly loaded; references and deferred Humanizer are additional stage costs.',
  skill_count: skills.size,
  authored_skill_chars: [...skills.entries()].filter(([name]) => name !== 'humanizer').reduce((n, [, v]) => n + v.chars, 0),
  authored_skill_lines: [...skills.entries()].filter(([name]) => name !== 'humanizer').reduce((n, [, v]) => n + v.lines, 0),
  authored_document_chars: [...documents.values()].reduce((n, text) => n + text.length, 0),
  authored_document_lines: [...documents.values()].reduce((n, text) => n + text.trimEnd().split('\n').length, 0),
  authored_agent_chars: [...documents.entries()].filter(([path]) => path.startsWith('packs/')).reduce((n, [, text]) => n + text.length, 0),
  duplicate_paragraphs: duplicates.length, duplicate_chars: duplicateChars,
  startup, warnings, errors,
}
console.log(JSON.stringify(report, null, 2))
if (!baseline && errors.length) process.exitCode = 1
