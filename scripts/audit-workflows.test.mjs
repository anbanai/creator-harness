import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./audit-workflows.mjs', import.meta.url))
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
  return { code: result.status, report: JSON.parse(result.stdout) }
}
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
