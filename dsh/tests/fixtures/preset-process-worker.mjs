import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const [presetsModuleUrl, action, dshHome] = process.argv.slice(2)

if (presetsModuleUrl === undefined || action === undefined || dshHome === undefined) {
  throw new Error('preset process worker requires module, action, and DSH home')
}

if (action === 'exit-before-ready') {
  process.exit(31)
}

function send(message) {
  return new Promise((resolve, reject) => {
    if (process.send === undefined) {
      reject(new Error('preset process worker requires an IPC channel'))
      return
    }
    process.send(message, (error) =>
      error === null ? resolve() : reject(error),
    )
  })
}

function serializeError(error) {
  if (typeof error !== 'object' || error === null) {
    return { message: String(error) }
  }
  return {
    code: 'code' in error ? error.code : undefined,
    message: 'message' in error ? error.message : String(error),
    name: 'name' in error ? error.name : undefined,
    recovery: 'recovery' in error ? error.recovery : undefined,
  }
}

if (action === 'delayed-ready-without-result') {
  await new Promise((resolve) => {
    process.once('message', (message) => {
      if (message?.type === 'begin-setup') resolve()
    })
  })
  await send({ type: 'setup-started' })
  await new Promise((resolve) => setTimeout(resolve, 120))
}

const presets = await import(presetsModuleUrl)
await send({ type: 'ready' })
await new Promise((resolve) => process.once('message', resolve))

if (action === 'exit-without-result') {
  process.exit(0)
}
if (
  action === 'wait-without-result' ||
  action === 'delayed-ready-without-result'
) {
  await new Promise(() => setInterval(() => {}, 60_000))
}

try {
  if (action === 'crash-lock') {
    const { acquirePresetLock } = await import(
      new URL('./preset-lock.js', presetsModuleUrl).href
    )
    const presetRoot = join(dshHome, '.agent-presets')
    await mkdir(presetRoot, { recursive: true })
    await acquirePresetLock(presetRoot, { packageVersion: '9.8.7' })
    await send({ type: 'acquired' })
    process.exit(73)
  }

  let value
  if (action === 'install') {
    value = await presets.installPresets({ dshHome })
  } else if (action === 'force-install') {
    value = await presets.installPresets({ dshHome, force: true })
  } else if (action === 'remove') {
    value = await presets.removePresets({ dshHome })
  } else if (action === 'status') {
    value = await presets.statusPresets({ dshHome })
  } else {
    throw new Error(`unknown worker action: ${action}`)
  }

  await send({ ok: true, type: 'result', value })
} catch (error) {
  await send({ error: serializeError(error), ok: false, type: 'result' })
} finally {
  process.disconnect?.()
}
