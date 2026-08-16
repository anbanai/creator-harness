import { readdir, rm } from 'node:fs/promises'

const packageRoot = new URL('../../', import.meta.url)

await rm(new URL('../lib/', import.meta.url), { force: true, recursive: true })

for (const entry of await readdir(packageRoot)) {
  if (/^anban-dsh-plugin-.*\.tgz$/.test(entry)) {
    await rm(new URL(entry, packageRoot), { force: true })
  }
}
