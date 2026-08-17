#!/usr/bin/env node

import { access } from 'node:fs/promises'

const cliUrl = new URL('../lib/cli.js', import.meta.url)
const runtimeMissingDiagnostic =
  'ERR_RUNTIME_MISSING: Missing package entrypoint dsh/lib/cli.js. Run pnpm pack, then pnpm add ./anban-dsh-plugin-*.tgz.'
const operationFailedDiagnostic =
  'ERR_PRESET_OPERATION: Anban preset operation failed.'

let entrypointAvailable = true

try {
  await access(cliUrl)
} catch (error) {
  let entrypointMissing = false
  try {
    entrypointMissing =
      typeof error === 'object' && error !== null && error.code === 'ENOENT'
  } catch {
    // Treat uninspectable failures as ordinary operational failures.
  }
  process.stderr.write(
    `${entrypointMissing ? runtimeMissingDiagnostic : operationFailedDiagnostic}\n`,
  )
  process.exitCode = 1
  entrypointAvailable = false
}

if (entrypointAvailable) {
  try {
    const { runCLI } = await import(cliUrl.href)
    process.exitCode = await runCLI(process.argv.slice(2))
  } catch {
    process.stderr.write(`${operationFailedDiagnostic}\n`)
    process.exitCode = 1
  }
}
