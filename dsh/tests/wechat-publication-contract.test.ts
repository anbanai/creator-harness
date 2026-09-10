import { spawnSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
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
    if (!(await stat(absolute)).isFile()) continue
    files.push([path, await readFile(absolute, 'utf8')])
  }
  return files
}

describe('WeChat draft lifecycle contract', () => {
  it('removes the legacy draft tool and fake draft URL from tracked plugin assets', async () => {
	const legacyTool = 'publish' + '_draft'
	const legacyURL = 'draft' + '_url'
    for (const [path, text] of await trackedTextFiles()) {
	  expect(text, path).not.toContain(legacyTool)
	  expect(text, path).not.toContain(legacyURL)
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

  it('keeps the single-article request and lifecycle result contract across active article assets', async () => {
    const paths = [
      'skills/article-publishing/SKILL.md',
      'agents/article.md',
      'agents/article.toml',
      'packs/article/agent.claude.md',
      'packs/article/agent.codex.toml',
      'packs/article/agent.dsh.yml',
      'dsh/presets/article/agent.cordis.yml',
      'dsh/presets/article/skills/article-publishing/SKILL.md',
    ]
    for (const path of paths) {
      const text = await readFile(join(root, path), 'utf8')
      expect(text, path).toContain('create_draft')
      expect(text, path).toContain('project_id')
      expect(text, path).toContain('task_id')
      expect(text, path).toContain('articles')
      expect(text, path).toContain('draft_media_id')
      expect(text, path).toContain('status')
    }
  })

  it('keeps both native manifests and the Claude marketplace at 4.1.18', async () => {
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
      expect(version, path).toBe('4.1.18')
    }
  })
})
