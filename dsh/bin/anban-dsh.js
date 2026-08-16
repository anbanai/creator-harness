#!/usr/bin/env node

import { runCLI } from '../lib/cli.js'

try {
  await runCLI()
} catch {
  process.stderr.write('anban-dsh: command failed\n')
  process.exitCode = 1
}
