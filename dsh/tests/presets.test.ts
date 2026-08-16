import {
  chmod,
  copyFile as realCopyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const copyFault = vi.hoisted(() => ({ path: '' }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()

  return {
    ...actual,
    copyFile: async (...args: Parameters<typeof actual.copyFile>) => {
      if (copyFault.path !== '' && String(args[0]) === copyFault.path) {
        copyFault.path = ''
        throw new Error('injected copy interruption')
      }

      return actual.copyFile(...args)
    },
  }
})

import {
  PRESET_IDS,
  installPresets,
  presetTestInternals,
  removePresets,
  statusPresets,
} from '../src/presets.js'

const OWNERSHIP_FILE = '.anban-dsh-preset.json'
const fixtureRoots: string[] = []

interface Fixture {
  dshHome: string
  root: string
  sourceRoot: string
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'anban-dsh-presets-'))
  const dshHome = join(root, 'home')
  const sourceRoot = join(root, 'source')
  fixtureRoots.push(root)

  for (const id of PRESET_IDS) {
    await mkdir(join(sourceRoot, id, 'skills', `${id}-skill`), {
      recursive: true,
    })
    await writeFile(join(sourceRoot, id, 'agent.cordis.yml'), `id: ${id}\n`)
    await writeFile(join(sourceRoot, id, 'preset.yml'), `name: ${id}\n`)
    await writeFile(
      join(sourceRoot, id, 'skills', `${id}-skill`, 'SKILL.md'),
      `# ${id}\n`,
    )
  }

  return { dshHome, root, sourceRoot }
}

function destination(fixture: Fixture, id: string): string {
  return join(fixture.dshHome, '.agent-presets', id)
}

function fixtureOptions(
  fixture: Fixture,
  overrides: {
    force?: boolean
    packageVersion?: string
    presetIds?: readonly string[]
  } = {},
) {
  return {
    dshHome: fixture.dshHome,
    sourceRoot: fixture.sourceRoot,
    packageVersion: overrides.packageVersion ?? '1.2.3',
    ...(overrides.force === undefined ? {} : { force: overrides.force }),
    ...(overrides.presetIds === undefined
      ? {}
      : { presetIds: overrides.presetIds }),
  }
}

afterEach(async () => {
  copyFault.path = ''
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

describe('preset public contract', () => {
  it('exports only the supported preset ids and callable operations', () => {
    expect(PRESET_IDS).toEqual(['article', 'seednote'])
    expect(installPresets).toBeTypeOf('function')
    expect(statusPresets).toBeTypeOf('function')
    expect(removePresets).toBeTypeOf('function')
  })
})

describe('preset installation', () => {
  it('installs fresh presets with ownership written last', async () => {
    const fixture = await createFixture()

    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'absent' }),
      expect.objectContaining({ id: 'seednote', state: 'absent' }),
    ])

    const statuses = await presetTestInternals.install(fixtureOptions(fixture))

    expect(statuses).toEqual([
      expect.objectContaining({ id: 'article', state: 'current' }),
      expect.objectContaining({ id: 'seednote', state: 'current' }),
    ])
    for (const status of statuses) {
      expect(
        await readFile(join(destination(fixture, status.id), 'preset.yml'), 'utf8'),
      ).toBe(`name: ${status.id}\n`)
      expect(
        JSON.parse(
          await readFile(
            join(destination(fixture, status.id), OWNERSHIP_FILE),
            'utf8',
          ),
        ),
      ).toEqual({
        schemaVersion: 1,
        packageName: '@anban/dsh-plugin',
        packageVersion: '1.2.3',
        presetId: status.id,
        sourceDigest: status.sourceDigest,
      })
    }
  })

  it('leaves identical current installations untouched', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const before = await lstat(destination(fixture, 'article'))

    const statuses = await presetTestInternals.install(fixtureOptions(fixture))
    const after = await lstat(destination(fixture, 'article'))

    expect(statuses.every((status) => status.state === 'current')).toBe(true)
    expect(after.ino).toBe(before.ino)
  })

  it('upgrades an owned installation when its source or package version changes', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    await writeFile(join(fixture.sourceRoot, 'article', 'preset.yml'), 'name: new\n')

    const before = await presetTestInternals.status(
      fixtureOptions(fixture, { packageVersion: '2.0.0' }),
    )
    expect(before).toEqual([
      expect.objectContaining({
        id: 'article',
        state: 'outdated',
        installedVersion: '1.2.3',
      }),
      expect.objectContaining({
        id: 'seednote',
        state: 'outdated',
        installedVersion: '1.2.3',
      }),
    ])

    const after = await presetTestInternals.install(
      fixtureOptions(fixture, { packageVersion: '2.0.0' }),
    )

    expect(after.every((status) => status.state === 'current')).toBe(true)
    expect(
      await readFile(join(destination(fixture, 'article'), 'preset.yml'), 'utf8'),
    ).toBe('name: new\n')
  })

  it('refuses to replace an unowned directory without force', async () => {
    const fixture = await createFixture()
    const article = destination(fixture, 'article')
    await mkdir(article, { recursive: true })
    await writeFile(join(article, 'personal.txt'), 'keep me')

    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toThrow(/unowned.*force/i)
    expect(await readFile(join(article, 'personal.txt'), 'utf8')).toBe('keep me')
    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'unowned' }),
      expect.objectContaining({ id: 'seednote', state: 'absent' }),
    ])
  })

  it('refuses to replace a modified owned directory without force', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const installedPreset = join(destination(fixture, 'article'), 'preset.yml')
    await writeFile(installedPreset, 'name: locally-modified\n')

    expect(await presetTestInternals.status(fixtureOptions(fixture))).toEqual([
      expect.objectContaining({ id: 'article', state: 'modified' }),
      expect.objectContaining({ id: 'seednote', state: 'current' }),
    ])
    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toThrow(/modified.*force/i)
    expect(await readFile(installedPreset, 'utf8')).toBe(
      'name: locally-modified\n',
    )
  })

  it('force replaces unowned and modified directories without retaining old files', async () => {
    const fixture = await createFixture()
    const article = destination(fixture, 'article')
    await mkdir(article, { recursive: true })
    await writeFile(join(article, 'personal.txt'), 'replace me')
    await presetTestInternals.install(
      fixtureOptions(fixture, { force: true, presetIds: ['seednote'] }),
    )
    await writeFile(join(destination(fixture, 'seednote'), 'preset.yml'), 'modified\n')

    const statuses = await presetTestInternals.install(
      fixtureOptions(fixture, { force: true }),
    )

    expect(statuses.every((status) => status.state === 'current')).toBe(true)
    await expect(lstat(join(article, 'personal.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      await readFile(join(destination(fixture, 'seednote'), 'preset.yml'), 'utf8'),
    ).toBe('name: seednote\n')
  })

  it('cleans operation-owned temporary paths when copying is interrupted', async () => {
    const fixture = await createFixture()
    copyFault.path = join(fixture.sourceRoot, 'article', 'preset.yml')

    await expect(
      presetTestInternals.install(fixtureOptions(fixture)),
    ).rejects.toThrow('injected copy interruption')

    await expect(lstat(destination(fixture, 'article'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const entries = await readdir(join(fixture.dshHome, '.agent-presets'))
    expect(entries).toEqual([])
  })
})

describe('preset removal', () => {
  it('removes directories carrying valid ownership, including modified ones', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    await writeFile(join(destination(fixture, 'article'), 'preset.yml'), 'modified\n')

    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).resolves.toEqual(['article', 'seednote'])
    for (const id of PRESET_IDS) {
      await expect(lstat(destination(fixture, id))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    }
  })

  it('refuses to remove any presets when a selected directory is unowned', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['seednote'] }),
    )
    await mkdir(destination(fixture, 'article'), { recursive: true })
    await writeFile(join(destination(fixture, 'article'), 'personal.txt'), 'keep')

    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).rejects.toThrow(/unowned/i)
    expect(
      await readFile(join(destination(fixture, 'article'), 'personal.txt'), 'utf8'),
    ).toBe('keep')
    expect(await lstat(destination(fixture, 'seednote'))).toBeTruthy()
  })
})

describe('preset containment and digest safety', () => {
  it('rejects a symlinked preset root before inspecting destinations', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside-presets')
    await mkdir(outside)
    await mkdir(fixture.dshHome)
    await symlink(outside, join(fixture.dshHome, '.agent-presets'))

    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
    expect(await readdir(outside)).toEqual([])
  })

  it('rejects symlinks in sources and at destination boundaries', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'keep.txt'), 'outside')
    await mkdir(join(fixture.dshHome, '.agent-presets'), { recursive: true })
    await symlink(outside, destination(fixture, 'article'))

    await expect(
      presetTestInternals.install(fixtureOptions(fixture, { force: true })),
    ).rejects.toThrow(/symbolic link/i)
    await expect(
      presetTestInternals.remove(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link|unowned/i)
    expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('outside')

    await rm(destination(fixture, 'article'))
    await symlink(
      join(outside, 'keep.txt'),
      join(fixture.sourceRoot, 'article', 'linked-file'),
    )
    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
  })

  it('rejects symlinks inside an owned destination tree', async () => {
    const fixture = await createFixture()
    await presetTestInternals.install(fixtureOptions(fixture))
    const outside = join(fixture.root, 'outside.txt')
    await writeFile(outside, 'keep')
    await symlink(outside, join(destination(fixture, 'article'), 'linked-file'))

    await expect(
      presetTestInternals.status(fixtureOptions(fixture)),
    ).rejects.toThrow(/symbolic link/i)
    expect(await readFile(outside, 'utf8')).toBe('keep')
  })

  it('rejects invalid preset ids before constructing filesystem paths', async () => {
    const fixture = await createFixture()

    for (const id of ['', '../escape', 'Uppercase', 'a/b', 'a'.repeat(65)]) {
      await expect(
        Promise.resolve().then(() =>
          presetTestInternals.status(
            fixtureOptions(fixture, { presetIds: [id] }),
          ),
        ),
      ).rejects.toThrow(/invalid preset id/i)
    }
    await expect(lstat(join(fixture.dshHome, 'escape'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('includes only slash-normalized paths, mode class, and bytes in digests', async () => {
    const fixture = await createFixture()
    const skillPath = join(
      fixture.sourceRoot,
      'article',
      'skills',
      'article-skill',
      'SKILL.md',
    )
    const initial = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )

    await realCopyFile(skillPath, `${skillPath}.copy`)
    const withExtraFile = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(withExtraFile[0]?.sourceDigest).not.toBe(initial[0]?.sourceDigest)

    await rm(`${skillPath}.copy`)
    await chmod(skillPath, 0o600)
    const nonExecutable = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(nonExecutable[0]?.sourceDigest).toBe(initial[0]?.sourceDigest)
    await chmod(skillPath, 0o700)
    const executable = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(executable[0]?.sourceDigest).not.toBe(initial[0]?.sourceDigest)
    await chmod(skillPath, 0o600)

    await presetTestInternals.install(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    const ownershipPath = join(destination(fixture, 'article'), OWNERSHIP_FILE)
    const ownership = JSON.parse(await readFile(ownershipPath, 'utf8'))
    await writeFile(ownershipPath, `${JSON.stringify(ownership, null, 4)}\n`)
    expect(
      await presetTestInternals.status(
        fixtureOptions(fixture, { presetIds: ['article'] }),
      ),
    ).toEqual([expect.objectContaining({ state: 'current' })])
  })

  it('sorts digest paths by a stable lexical order instead of locale', async () => {
    const fixture = await createFixture()
    await writeFile(join(fixture.sourceRoot, 'article', 'Z.txt'), 'upper')
    await writeFile(join(fixture.sourceRoot, 'article', 'a.txt'), 'lower')

    const files = [
      ['Z.txt', 'upper'],
      ['a.txt', 'lower'],
      ['agent.cordis.yml', 'id: article\n'],
      ['preset.yml', 'name: article\n'],
      ['skills/article-skill/SKILL.md', '# article\n'],
    ] as const
    const expected = createHash('sha256')
    for (const [relativePath, contents] of [...files].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      expected.update(relativePath)
      expected.update('\0')
      expected.update('file')
      expected.update('\0')
      expected.update(contents)
      expected.update('\0')
    }

    const [status] = await presetTestInternals.status(
      fixtureOptions(fixture, { presetIds: ['article'] }),
    )
    expect(status?.sourceDigest).toBe(expected.digest('hex'))
  })
})
