import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from './project-creator-context.js'

const homes = []

afterEach(() => {
  delete process.env.ANBAN_DSH_BRIDGE_INITIAL_CONTEXT_FILE
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function setup(context) {
  const home = mkdtempSync(join(tmpdir(), 'project-creator-context-test-'))
  homes.push(home)
  const file = join(home, 'context.json')
  if (context !== undefined) writeFileSync(file, context)
  process.env.ANBAN_DSH_BRIDGE_INITIAL_CONTEXT_FILE = file
  const listeners = new Map()
  const injected = []
  const root = {
    session: { header: {} },
    inject: (message) => injected.push(['root', message]),
  }
  const child = {
    session: { header: { parentSession: 'root' } },
    inject: (message) => injected.push(['child', message]),
  }
  const ctx = {
    on: (event, listener) => listeners.set(event, listener),
    agents: { list: () => [root, child] },
  }
  apply(ctx)
  listeners.get('agent/created')({ agent: root })
  listeners.get('agent/created')({ agent: child })
  return { injected }
}

describe('Project Creator initial context plugin', () => {
  it('injects only the root agent through the runtime-context source', () => {
    const { injected } = setup('{"kind":"anban.project_profile_reference"}')
    expect(injected).toHaveLength(1)
    expect(injected[0][0]).toBe('root')
    expect(injected[0][1].source).toEqual({ kind: 'runtime-context', form: 'snapshot' })
  })

  it('fails closed for missing or oversized snapshots', () => {
    expect(setup(undefined).injected).toHaveLength(0)
    expect(setup('x'.repeat(256 * 1024 + 1)).injected).toHaveLength(0)
  })
})
