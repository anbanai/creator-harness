import { writeFile } from 'node:fs/promises'

export const name = 'anban-dsh-catalog-smoke'
export const inject = ['agentPresets', 'skills']

const PRESET_IDS = ['article', 'seednote']

export async function apply(ctx, config) {
  try {
    const catalogs = {}
    for (const presetId of PRESET_IDS) {
      const preset = await ctx.agentPresets.resolve(presetId)
      const scope = await ctx.agentPresets.standingKeyFor(presetId)
      const snapshot = await ctx.skills.snapshot({ scope })
      if (!snapshot.complete) {
        throw new Error(`incomplete Skill catalog for ${presetId}`)
      }

      const summaries = snapshot.skills.filter((skill) =>
        skill.provider.startsWith('anban-'),
      )
      const skills = []
      for (const summary of summaries) {
        const loaded = await ctx.skills.get(summary.name, { scope })
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
      catalogs[presetId] = {
        presetPath: preset.path,
        providers: [...new Set(summaries.map(({ provider }) => provider))],
        skills,
      }
    }
    await writeFile(config.resultPath, JSON.stringify(catalogs), 'utf8')
    setImmediate(() => process.exit(0))
  } catch (error) {
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
    setImmediate(() => process.exit(1))
  }
}
