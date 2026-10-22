import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./audit-workflows.mjs', import.meta.url))
const qualityGate = fileURLToPath(new URL('../hooks/seednote-quality-gate.sh', import.meta.url))
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'harness-audit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const path of ['skills/demo/references', 'skills/demo/templates', 'packs/article']) await mkdir(join(root, path), { recursive: true })
  await writeFile(join(root, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: Use when testing the audit.\n---\n[Contract](references/contract.md)\n')
  await writeFile(join(root, 'skills/demo/references/contract.md'), 'generate_image(project_id=P, task_id=T, aspect_ratio="1:1")\n')
  await writeFile(join(root, 'skills/demo/templates/test.json'), '{"duration":"__DURATION__"}')
  await writeFile(join(root, 'packs/article/agent-pack.yaml'), 'id: article\nkind: managed\nagent:\n  claude_source: agent.claude.md\n  codex_source: agent.codex.toml\n  skills: [demo]\n')
  const body = '---\nname: article\nskills: [demo]\n---\n禁止 AskUserQuestion；resume_from；set_task_progress_plan\n'
  for (const path of ['agent.claude.md', 'agent.codex.toml']) await writeFile(join(root, 'packs/article', path), body)
  return root
}
function audit(root) {
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  assert.equal(result.signal, null)
  assert.notEqual(result.stdout.trim(), '', result.stderr)
  return { code: result.status, report: JSON.parse(result.stdout) }
}

function pngWithDimensions(width, height) {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  let crc = 0xffffffff
  for (const byte of bytes.subarray(12, 29)) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29)
  return bytes
}

function corruptPngCRC(bytes) {
  const corrupted = Buffer.from(bytes)
  corrupted[32] ^= 0xff
  return corrupted
}

async function qualityFixture(t, qualityStatus = 'passed', width = 3, height = 4, corruptCRC = false) {
  const root = await mkdtemp(join(tmpdir(), 'seednote-quality-gate-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'output'), { recursive: true })
  for (const name of ['content.md', 'request-analysis.json', 'request-analysis.md', 'reference-analysis.json', 'reference-analysis.md', 'image-prompts.md', 'image-review.md']) {
    await writeFile(join(root, 'output', name), name)
  }
  await writeFile(join(root, 'output', 'image-plan.md'), '计划图片数量：2\n\n## cover.png\n\n输出比例：3:4\n\n## image_01.png\n\n输出比例：3:4\n')
  const cover = pngWithDimensions(width, height)
  await writeFile(join(root, 'output', 'cover.png'), corruptCRC ? corruptPngCRC(cover) : cover)
  await writeFile(join(root, 'output', 'image_01.png'), pngWithDimensions(width, height))
  await writeFile(join(root, 'output', 'reference-usage-summary.json'), JSON.stringify({
    outputs: [
      { file_name: 'cover.png', quality_status: qualityStatus },
      { file_name: 'image_01.png', quality_status: qualityStatus },
    ],
  }))
  return root
}

function runQualityGate(root) {
  const result = spawnSync('bash', [qualityGate], {
    cwd: root,
    input: JSON.stringify({ agent_type: 'seednote', task_type: 'seednote' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  })
  assert.equal(result.error, undefined)
  return JSON.parse(result.stdout || '{}')
}

test('Seednote quality gate accepts only passed quality records', async (t) => {
  const root = await qualityFixture(t)
  assert.deepEqual(runQualityGate(root), {})
})

test('Seednote quality gate rejects the obsolete accepted quality state', async (t) => {
  const root = await qualityFixture(t, 'accepted')
  assert.equal(runQualityGate(root).decision, 'block')
})

test('Seednote quality gate rejects image dimensions that disagree with the plan', async (t) => {
  const root = await qualityFixture(t, 'passed', 1, 1)
  assert.equal(runQualityGate(root).decision, 'block')
})

test('Seednote quality gate rejects a PNG with an invalid chunk CRC', async (t) => {
  const root = await qualityFixture(t, 'passed', 3, 4, true)
  assert.equal(runQualityGate(root).decision, 'block')
})
test('valid fixture has exact startup accounting', async (t) => {
  const root = await fixture(t)
  const { code, report } = audit(root)
  assert.equal(code, 0)
  assert.equal(report.startup.article.total_chars, report.startup.article.agent_chars + report.startup.article.skill_chars)
})
test('missing nested reference fails', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'skills/demo/references/contract.md'), '[Missing](missing.md)')
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /missing linked resource missing.md/)
})
test('task identity in reference calls is required', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'skills/demo/references/contract.md'), 'analyze_image(project_id=P, file_path="output/a.png")')
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /missing project_id\/task_id/)
})
test('invalid JSON placeholder is rejected', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'skills/demo/templates/test.json'), '{"duration":__DURATION__}')
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /invalid JSON/)
})
test('startup budget is a failure, including the Agent itself', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'packs/article/agent.claude.md'), '---\nskills: [demo]\n---\nAskUserQuestion resume_from set_task_progress_plan\n' + '长'.repeat(45001))
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /startup .* > 45000/)
})

test('shared Skills cannot invoke a host-specific lifecycle', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'skills/demo/references/contract.md'), 'Call TaskCreate to start each stage.')
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /host lifecycle tools belong in Agent adapters/)
})

test('Agent plugin-root Skill dependencies must exist', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'packs/article/agent.codex.toml'), 'AskUserQuestion resume_from set_task_progress_plan\npath = "__PLUGIN_ROOT__/skills/missing/SKILL.md"')
  const result = audit(root)
  assert.equal(result.code, 1)
  assert.match(result.report.errors.join('\n'), /missing Skill dependency skills\/missing\/SKILL.md/)
})

test('interactive managed Packs require questions without task lifecycle contracts', async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, 'packs/article/agent-pack.yaml'), 'id: article\nkind: managed\ninteraction:\n  user_questions: true\nagent:\n  claude_source: agent.claude.md\n  codex_source: agent.codex.toml\n  skills: [demo]\n')
  for (const name of ['agent.claude.md', 'agent.codex.toml']) {
    await writeFile(join(root, 'packs/article', name), '---\nname: article\nskills: [demo]\n---\nask_user_question\n')
  }
  const result = audit(root)
  assert.equal(result.code, 0)
})

for (const kind of ['plugin', 'managed']) {
  test(`${kind} autonomy checks follow the Pack execution kind`, async (t) => {
    const root = await fixture(t)
    await writeFile(join(root, 'packs/article/agent-pack.yaml'), `id: article\nkind: ${kind}\nagent:\n  claude_source: agent.claude.md\n  codex_source: agent.codex.toml\n  skills: [demo]\n`)
    for (const name of ['agent.claude.md', 'agent.codex.toml']) {
      await writeFile(join(root, 'packs/article', name), '---\nname: article\nskills: [demo]\n---\nLocal file workflow.\n')
    }
    const result = audit(root)
    assert.equal(result.code, kind === 'plugin' ? 0 : 1)
    if (kind === 'managed') assert.match(result.report.errors.join('\n'), /missing autonomy contract set_task_progress_plan/)
  })
}
