#!/usr/bin/env node

import { access } from 'node:fs/promises'

const cliUrl = new URL('../lib/cli.js', import.meta.url)
const runtimeMissingDiagnostic =
  'ERR_RUNTIME_MISSING: Missing package entrypoint dsh/lib/cli.js. Run pnpm pack, then pass the exact .tgz path it reports to pnpm add.'
const operationFailedDiagnostic =
  'ERR_PRESET_OPERATION: Anban preset operation failed.'

function isMissingError(error) {
  try {
    return typeof error === 'object' && error !== null && error.code === 'ENOENT'
  } catch {
    return false
  }
}

async function entrypointStatus() {
  try {
    await access(cliUrl)
    return 'available'
  } catch (error) {
    return isMissingError(error) ? 'missing' : 'failed'
  }
}

let status = await entrypointStatus()

if (status !== 'available') {
  process.stderr.write(
    `${status === 'missing' ? runtimeMissingDiagnostic : operationFailedDiagnostic}\n`,
  )
  process.exitCode = 1
}

if (status === 'available') {
  try {
    const { runCLI } = await import(cliUrl.href)
    process.exitCode = await runCLI(process.argv.slice(2))
  } catch {
    status = await entrypointStatus()
    process.stderr.write(
      `${status === 'missing' ? runtimeMissingDiagnostic : operationFailedDiagnostic}\n`,
    )
    process.exitCode = 1
  }
}
