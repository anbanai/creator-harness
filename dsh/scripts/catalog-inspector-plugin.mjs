import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'anban-dsh-catalog-smoke'
export const inject = ['agentPresets', 'skills']

export function apply(ctx, config) {
  setImmediate(() => {
    void inspectCatalogs(ctx, config)
  })
}

async function inspectCatalogs(ctx, config) {
  let exitCode = 0
  try {
    const catalogs = {}
    const presetId = config?.presetId
    if (typeof presetId !== 'string' || presetId.length === 0) {
      throw new Error('catalog inspector requires a preset id')
    }
    {
      const preset = await ctx.agentPresets.resolve(presetId)
      if (preset.broken !== undefined) {
        throw new Error(`invalid Agent preset ${presetId}: ${preset.broken}`)
      }
      const scopeLease = await ctx.agentPresets.acquireScope(presetId)
      let summaries
      const skills = []
      try {
        const snapshot = await ctx.skills.snapshot({ scope: scopeLease.key })
        if (!snapshot.complete) {
          throw new Error(`incomplete Skill catalog for ${presetId}`)
        }

        summaries = snapshot.skills.filter((skill) =>
          skill.provider.startsWith('anban-'),
        )
        for (const summary of summaries) {
          const loaded = await ctx.skills.get(summary.name, {
            scope: scopeLease.key,
          })
          skills.push({
            contentBytes:
              loaded === undefined
                ? 0
                : Buffer.byteLength(loaded.content, 'utf8'),
            name: summary.name,
            path: loaded?.path,
            provider: summary.provider,
          })
        }
      } finally {
        await scopeLease[Symbol.asyncDispose]()
      }
      catalogs[presetId] = {
        presetPath:
          config.presetPaths?.[presetId] ??
          join(process.env.DSH_HOME ?? '', '.agent-presets', presetId, 'agent.cordis.yml'),
        providers: [...new Set(summaries.map(({ provider }) => provider))],
        skills,
      }
    }
    await writeFile(config.resultPath, JSON.stringify(catalogs), 'utf8')
  } catch (error) {
    exitCode = 1
    await writeFile(
      config.resultPath,
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : 'DSH catalog inspection failed',
      }),
      'utf8',
    )
  } finally {
    setImmediate(() => process.exit(exitCode))
  }
}
