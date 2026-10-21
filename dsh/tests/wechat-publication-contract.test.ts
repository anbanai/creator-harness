import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

async function trackedTextFiles(): Promise<Array<[string, string]>> {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr)
  const paths = result.stdout.split('\0').filter(Boolean)
  const files: Array<[string, string]> = []
  for (const path of paths) {
    const absolute = join(root, path)
    let info
    try {
      info = await stat(absolute)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!info.isFile()) continue
    files.push([path, await readFile(absolute, 'utf8')])
  }
  return files
}

describe('WeChat draft lifecycle contract', () => {
  it('accepts completion tags only when both schema and taxonomy are v2', async () => {
    const output = await mkdtemp(join(tmpdir(), 'anban-completion-tags-'))
    const hook = join(root, 'hooks/completion-metadata.sh')
    try {
      for (const [name, taxonomyVersion, wantStatus, wantDiagnostic] of [
        ['schema-only', '', 'failed', 'tagging_invalid_schema'],
        ['taxonomy-v2', '2.0', 'succeeded', ''],
      ] as const) {
        const folder = join(output, name)
        await mkdir(join(folder, 'output'), { recursive: true })
        await writeFile(
          join(folder, 'output', 'content-tags.json'),
          JSON.stringify({
            schema_version: '2.0',
            ...(taxonomyVersion ? { taxonomy_version: taxonomyVersion } : {}),
            status: 'succeeded',
            subjects: [{ artifact_role: 'final_markdown', tags: [], omitted_dimensions: ['domain'] }],
          }),
        )
        const result = spawnSync('bash', [hook], {
          encoding: 'utf8',
          env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: folder,
            ANBAN_TASK_ID: 'task-1',
            ANBAN_EXECUTION_ID: 'execution-1',
            ANBAN_TASK_TYPE: 'wechat-article',
          },
        })
        expect(result.status, result.stderr).toBe(0)
        const metadata = JSON.parse(await readFile(join(folder, 'output', 'completion-metadata.json'), 'utf8'))
        expect(metadata.tagging_status).toBe(wantStatus)
        expect(metadata.tagging_diagnostic).toBe(wantDiagnostic)
      }
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  })

  it('rejects legacy subject roles and flat evidence before completion submission', async () => {
    const output = await mkdtemp(join(tmpdir(), 'anban-completion-tags-legacy-'))
    const hook = join(root, 'hooks/completion-metadata.sh')
    try {
      await mkdir(join(output, 'output'), { recursive: true })
      await writeFile(
        join(output, 'output', 'content-tags.json'),
        JSON.stringify({
          schema_version: '2.0',
          taxonomy_version: '2.0',
          status: 'succeeded',
          subjects: [{
            subject_role: 'content',
            tags: [{
              dimension: 'domain',
              value: '茶文化',
              source_file: 'output/content.md',
              line_start: 1,
              line_end: 1,
              quote: '茶',
              evidence_kind: 'explicit',
            }],
          }],
        }),
      )
      const result = spawnSync('bash', [hook], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: output,
          ANBAN_TASK_ID: 'task-1',
          ANBAN_EXECUTION_ID: 'execution-1',
          ANBAN_TASK_TYPE: 'wechat-picture',
        },
      })
      expect(result.status, result.stderr).toBe(0)
      const metadata = JSON.parse(await readFile(join(output, 'output', 'completion-metadata.json'), 'utf8'))
      expect(metadata.tagging_status).toBe('failed')
      expect(metadata.tagging_diagnostic).toBe('tagging_invalid_subjects')
      expect(metadata.subjects).toEqual([])
    } finally {
      await rm(output, { recursive: true, force: true })
    }
  })

  it('removes the legacy draft tool and fake draft URL from tracked plugin assets', async () => {
	const legacyTool = new RegExp('(?<![A-Za-z0-9_])' + 'publish' + '_' + 'draft(?![A-Za-z0-9_])', 'u')
	const legacyURL = new RegExp('(?<![A-Za-z0-9_])' + 'draft' + '_' + 'url(?![A-Za-z0-9_])', 'u')
    for (const [path, text] of await trackedTextFiles()) {
	  expect(text, path).not.toMatch(legacyTool)
	  expect(text, path).not.toMatch(legacyURL)
    }
  })

  it('documents the create_draft request and lifecycle response exactly', async () => {
    const skill = await readFile(
      join(root, 'skills/article-publishing/SKILL.md'),
      'utf8',
    )
    expect(skill).toContain('`create_draft` (project_id, task_id, articles)')
    expect(skill).toContain('"draft_media_id": "draft_media_id_xxx"')
    expect(skill).toContain('"status": "drafted"')
  })

  it('keeps the server publication package contract across managed article assets', async () => {
    const managedAgentPaths = [
      'agents/wechat-article.md',
      'agents/wechat-article.toml',
      'packs/wechat-article/agent.claude.md',
      'packs/wechat-article/agent.codex.toml',
      'packs/wechat-article/agent.dsh.yml',
      'dsh/presets/wechat-article/agent.cordis.yml',
    ]
    const packagePaths = [...managedAgentPaths, 'skills/article/SKILL.md']
    const interactiveSkill = await readFile(join(root, 'skills/article-publishing/SKILL.md'), 'utf8')
    expect(interactiveSkill).toContain('`create_draft`')
    for (const path of packagePaths) {
      const text = await readFile(join(root, path), 'utf8')
      expect(text, path).toContain('output/draft.json')
      expect(text, path).toContain('schema_version')
      expect(text, path).toContain('content_sha256')
      expect(text, path).toContain('readiness')
    }
    for (const path of managedAgentPaths) {
      const text = await readFile(join(root, path), 'utf8')
      expect(text, path).not.toContain('create_draft')
      expect(text, path).not.toContain('draft-result.json')
      expect(text, path).not.toContain('发布恢复模式')
      expect(text, path).not.toContain('Server publication')
      expect(text, path).not.toContain('publication-state (Server-owned)')
      expect(text, path).not.toContain('本流程不调用外部平台能力')
      expect(text, path).not.toContain('草稿创建由上层系统在任务终态处理')
    }
    const managedArticleSkill = await readFile(join(root, 'skills/article/SKILL.md'), 'utf8')
    expect(managedArticleSkill).not.toContain('create_draft')
    expect(managedArticleSkill).not.toContain('draft-result.json')
    expect(managedArticleSkill).toContain('readiness.status="blocked"')
    expect(managedArticleSkill).toContain('ready 状态严禁携带任何非空 code')
    expect(managedArticleSkill).toContain('不得重复或追加其他路径')

    const contentWritingSkill = await readFile(join(root, 'skills/content-writing/SKILL.md'), 'utf8')
    expect(contentWritingSkill).toContain('readiness 写为 `blocked`')
    expect(contentWritingSkill).not.toContain('skip draft creation')
    expect(contentWritingSkill).not.toContain('skips `create_draft`')

    expect(interactiveSkill).toContain('本节只适用于用户在交互会话中明确要求立即创建草稿')
    expect(interactiveSkill).toContain('调用后不在 Agent 侧重试')
    expect(interactiveSkill).not.toContain('output/draft.json')
    expect(interactiveSkill).not.toContain('托管 Article')
    expect(interactiveSkill).not.toContain('draft.json` 的 `articles`')
    expect(interactiveSkill).not.toContain('articles=draft.json.articles')
    expect(interactiveSkill).not.toContain('retryable=true')
  })

  it('keeps runtime recovery policy out of every managed article agent', async () => {
    const managedAgentPaths = [
      'agents/wechat-article.md',
      'agents/wechat-article.toml',
      'packs/wechat-article/agent.claude.md',
      'packs/wechat-article/agent.codex.toml',
      'packs/wechat-article/agent.dsh.yml',
      'dsh/presets/wechat-article/agent.cordis.yml',
    ]
    for (const path of managedAgentPaths) {
      const text = await readFile(join(root, path), 'utf8')
      expect(text, path).not.toContain('发布恢复模式')
      expect(text, path).not.toContain('Server finalizer')
      expect(text, path).not.toContain('正式发布能力')
      expect(text, path).not.toContain('create_draft')
      expect(text, path).toContain('upload_image')
      expect(text, path).toContain('output/draft.json')
    }
  })

  it('keeps both native manifests and the Claude marketplace at 4.2.74', async () => {
    const paths = [
      '.claude-plugin/plugin.json',
      '.codex-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
    ]
    for (const path of paths) {
      const manifest = JSON.parse(await readFile(join(root, path), 'utf8'))
      const version = path.endsWith('marketplace.json')
        ? manifest.plugins[0].version
        : manifest.version
      expect(version, path).toBe('4.2.74')
    }
  })
})
