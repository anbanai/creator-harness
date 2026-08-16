#!/usr/bin/env node

try {
  const { runCLI } = await import('../lib/cli.js')
  process.exitCode = await runCLI(process.argv.slice(2))
} catch {
  process.stderr.write('anban-dsh: command failed\n')
  process.exitCode = 1
}
