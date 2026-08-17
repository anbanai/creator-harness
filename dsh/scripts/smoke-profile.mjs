import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parsePackResult } from './package-integrity.mjs'

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PACKAGE_NAME = '@anban/dsh-plugin'
const PROFILE = 'web'
const PUBLIC_EXPORTS = [
  `${PACKAGE_NAME}/anban-mcp`,
  `${PACKAGE_NAME}/preset-manager`,
  `${PACKAGE_NAME}/skills-provider`,
  `${PACKAGE_NAME}/package.json`,
]
const PUBLIC_EXPORT_NAMES = {
  [`${PACKAGE_NAME}/anban-mcp`]: 'anban-mcp',
  [`${PACKAGE_NAME}/preset-manager`]: 'anban-preset-manager',
  [`${PACKAGE_NAME}/skills-provider`]: 'anban-skills-provider',
}
const CREDENTIAL_ENV_KEY = /(?:auth|credential|key|password|secret|token)/i
const RUNTIME_OVERRIDE_ENV_KEY = /(?:^|_)run_as_node$/i
const REGISTRY_ARTIFACT_PATTERN = new RegExp(
  `^${PACKAGE_NAME.replace('/', '\\/')}@((?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?)$`,
)
const COMMAND_TIMEOUT_MS = 180_000
const COMMAND_MAX_BUFFER = 1024 * 1024

export function portableCommand(
  executable,
  {
    environment = process.env,
    platform = process.platform,
    prefixArgs = [],
  } = {},
) {
  if (
    typeof executable !== 'string' ||
    executable.length === 0 ||
    /[\0\r\n]/.test(executable) ||
    !Array.isArray(prefixArgs) ||
    prefixArgs.some((argument) => typeof argument !== 'string')
  ) {
    throw new Error('Profile smoke command is invalid')
  }

  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) {
    return {
      executable:
        environment.ComSpec ?? environment.COMSPEC ?? 'cmd.exe',
      kind: 'windows-cmd',
      prefixArgs: ['/d', '/s', '/v:off', '/c'],
      shim: executable,
    }
  }

  return { executable, kind: 'native', prefixArgs: [...prefixArgs] }
}

export function nodeEntrypointCommand(
  entrypoint,
  { executable, platform = process.platform } = {},
) {
  const paths = platform === 'win32' ? win32 : posix
  if (
    typeof executable !== 'string' ||
    !paths.isAbsolute(executable) ||
    !paths.isAbsolute(entrypoint) ||
    !/\.(?:c|m)?js$/i.test(entrypoint)
  ) {
    throw new Error('Profile smoke command requires absolute Node paths')
  }
  return portableCommand(executable, { platform, prefixArgs: [entrypoint] })
}

function isPublicNodeRuntime(executable, platform) {
  if (typeof executable !== 'string') return false
  const paths = platform === 'win32' ? win32 : posix
  return (
    paths.isAbsolute(executable) &&
    /^node(?:\.exe)?$/i.test(paths.basename(executable))
  )
}

export function resolvePnpmCommand({
  environment = process.env,
  platform = process.platform,
} = {}) {
  const pathCommand = platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const entrypoint = environment.npm_execpath
  if (typeof entrypoint !== 'string' || entrypoint.length === 0) {
    return portableCommand(pathCommand, { environment, platform })
  }

  if (/\.(?:c|m)?js$/i.test(entrypoint)) {
    const nodeRuntime = environment.npm_node_execpath
    if (!isPublicNodeRuntime(nodeRuntime, platform)) {
      return portableCommand(pathCommand, { environment, platform })
    }
    return nodeEntrypointCommand(entrypoint, {
      executable: nodeRuntime,
      platform,
    })
  }

  return portableCommand(entrypoint, { environment, platform })
}

function quoteWindowsCommandArgument(argument) {
  if (typeof argument !== 'string' || /[\0\r\n"]/.test(argument)) {
    throw new Error('Profile smoke Windows command argument is invalid')
  }
  return `"${argument.replaceAll('%', '%%')}"`
}

export function commandInvocation(command, args) {
  if (command.kind === 'native') {
    return {
      executable: command.executable,
      args: [...command.prefixArgs, ...args],
    }
  }
  if (command.kind === 'windows-cmd') {
    const line = [command.shim, ...args]
      .map(quoteWindowsCommandArgument)
      .join(' ')
    return {
      executable: command.executable,
      args: [...command.prefixArgs, `"${line}"`],
    }
  }
  throw new Error('Profile smoke command kind is invalid')
}

export function smokeEnvironment(dshHome, source = process.env) {
  const environment = { ...source, DSH_HOME: dshHome }
  for (const key of Object.keys(environment)) {
    if (
      key !== 'DSH_HOME' &&
      (CREDENTIAL_ENV_KEY.test(key) || RUNTIME_OVERRIDE_ENV_KEY.test(key))
    ) {
      delete environment[key]
    }
  }
  return environment
}

function defaultRunCommand(command, args, options) {
  const invocation = commandInvocation(command, args)
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: COMMAND_MAX_BUFFER,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  })

  if (result.error !== undefined) {
    const code = result.error.code ?? 'unknown error'
    if (code === 'ETIMEDOUT') {
      throw new Error('Profile smoke command timed out')
    }
    throw new Error(`Profile smoke command failed to start: ${code}`)
  }
  if (result.status !== 0) {
    throw new Error(`Profile smoke command exited ${result.status ?? 1}`)
  }

  return { stdout: result.stdout }
}

async function packageBinCommand(anchor, packageName, binName) {
  const requireFromAnchor = createRequire(anchor)
  const manifestPath = requireFromAnchor.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const bin =
    typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName]
  if (typeof bin !== 'string') {
    throw new Error(`Profile smoke package has no ${binName} bin`)
  }

  const packageDir = dirname(manifestPath)
  const entrypoint = resolve(packageDir, bin)
  const fromPackage = relative(packageDir, entrypoint)
  if (
    fromPackage === '' ||
    fromPackage === '..' ||
    fromPackage.startsWith(`..${sep}`) ||
    isAbsolute(fromPackage)
  ) {
    throw new Error(`Profile smoke package has an invalid ${binName} bin`)
  }

  if (process.platform !== 'win32') return portableCommand(entrypoint)
  const nodeRuntime = process.env.npm_node_execpath
  if (!isPublicNodeRuntime(nodeRuntime, process.platform)) {
    throw new Error('Profile smoke requires a public Node runtime on Windows')
  }
  return nodeEntrypointCommand(entrypoint, {
    executable: nodeRuntime,
    platform: process.platform,
  })
}

function defaultResolveDshCommand() {
  return packageBinCommand(
    join(PACKAGE_ROOT, 'package.json'),
    '@deepseek-ai/dsh',
    'dsh',
  )
}

function defaultResolveInstalledCommand(profileDir) {
  return packageBinCommand(
    join(profileDir, 'package.json'),
    PACKAGE_NAME,
    'anban-dsh',
  )
}

async function defaultDiscoverPresets(roots) {
  const { discoverPresets } = await import('@deepseek-ai/dsh-agent-presets')
  return discoverPresets(roots)
}

async function defaultParseConfig(source) {
  const yaml = await import('js-yaml')
  const jsExpression = new yaml.Type('tag:yaml.org,2002:js', {
    construct: (value) => value,
    kind: 'scalar',
  })
  return yaml.load(source, {
    schema: yaml.DEFAULT_SCHEMA.extend([jsExpression]),
  })
}

async function defaultImportInstalledExport(profileDir, specifier) {
  const requireFromProfile = createRequire(join(profileDir, 'package.json'))
  const resolved = requireFromProfile.resolve(specifier)
  if (specifier.endsWith('/package.json')) {
    return JSON.parse(await readFile(resolved, 'utf8'))
  }
  return import(pathToFileURL(resolved).href)
}

function safeInventoryPath(path) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path)
  ) {
    return false
  }
  const segments = path.split('/')
  return (
    segments.every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..',
    ) && posix.normalize(path) === path
  )
}

function manifestTargets(value, targets = []) {
  if (typeof value === 'string') {
    targets.push(value)
    return targets
  }
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) manifestTargets(child, targets)
  }
  return targets
}

function validatePackResult(result, smokeRoot, manifest) {
  if (result.name !== manifest.name || result.version !== manifest.version) {
    throw new Error('pnpm pack metadata does not match package.json')
  }
  if (!result.filename.endsWith('.tgz')) {
    throw new Error('pnpm pack returned an unsafe tarball filename')
  }

  const tarball = resolve(
    isAbsolute(result.filename)
      ? result.filename
      : join(smokeRoot, result.filename),
  )
  if (tarball !== join(smokeRoot, basename(result.filename))) {
    throw new Error('pnpm pack reported a tarball outside the smoke root')
  }
  if (result.files.some((path) => !safeInventoryPath(path))) {
    throw new Error('pnpm pack returned an unsafe file inventory')
  }

  const required = manifestTargets(manifest.exports)
    .concat(manifestTargets(manifest.bin))
    .map((path) => path.replace(/^\.\//, ''))
  const inventory = new Set(result.files)
  const missing = required.filter((path) => !inventory.has(path))
  if (missing.length > 0) {
    throw new Error(`pnpm pack inventory is missing ${missing.join(', ')}`)
  }
  return tarball
}

function registryVersion(artifactSource) {
  if (artifactSource === undefined) return undefined
  const matched = REGISTRY_ARTIFACT_PATTERN.exec(artifactSource)
  if (matched === null) {
    throw new Error(
      'Profile smoke registry source must be an exact @anban/dsh-plugin version',
    )
  }
  return matched[1]
}

function configRows(config) {
  if (!Array.isArray(config)) {
    throw new Error('DSH dump config must be a top-level row array')
  }

  const rows = []
  function visit(value, depth) {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth)
      return
    }
    if (value === null || typeof value !== 'object') return

    if (typeof value.id === 'string') {
      rows.push({ depth, id: value.id, name: value.name })
    }
    for (const child of Object.values(value)) {
      if (child !== value && typeof child === 'object') {
        visit(child, depth + 1)
      }
    }
  }
  visit(config, 0)
  return rows
}

function requireBundleRows(config) {
  const rows = configRows(config)
  const mcpRows = rows.filter(({ id }) => id === 'anban-mcp')
  const managerRows = rows.filter(({ id }) => id === 'anban-preset-manager')
  const presetLocalMcpRows = rows.filter(
    ({ depth, id, name }) =>
      depth > 0 &&
      (id === 'anban-mcp' ||
        name === `${PACKAGE_NAME}/anban-mcp` ||
        name === '@deepseek-ai/dsh-mcp-client'),
  )

  if (
    mcpRows.length !== 1 ||
    managerRows.length !== 1 ||
    presetLocalMcpRows.length !== 0 ||
    mcpRows[0]?.depth !== 0 ||
    mcpRows[0]?.name !== `${PACKAGE_NAME}/anban-mcp` ||
    managerRows[0]?.depth !== 0 ||
    managerRows[0]?.name !== `${PACKAGE_NAME}/preset-manager`
  ) {
    throw new Error('Installed profile has invalid Anban Bundle rows')
  }

  return { mcp: 1, presetLocalMcp: 0, presetManager: 1 }
}

function requireHealthyPresets(presets) {
  for (const id of ['article', 'seednote']) {
    const preset = presets.find((candidate) => candidate.id === id)
    if (preset === undefined || preset.broken !== undefined) {
      throw new Error(`Installed Preset is not healthy: ${id}`)
    }
  }
}

function validateInstalledExports(exportsBySpecifier, expectedVersion) {
  for (const [specifier, expectedName] of Object.entries(PUBLIC_EXPORT_NAMES)) {
    const exported = exportsBySpecifier.get(specifier)
    if (
      exported?.name !== expectedName ||
      typeof exported.apply !== 'function'
    ) {
      throw new Error(`Installed package export is invalid: ${specifier}`)
    }
  }

  const manifest = exportsBySpecifier.get(`${PACKAGE_NAME}/package.json`)
  const declared = Object.keys(manifest?.exports ?? {}).sort()
  const expected = PUBLIC_EXPORTS.map((specifier) =>
    specifier === `${PACKAGE_NAME}/package.json`
      ? './package.json'
      : `./${specifier.slice(PACKAGE_NAME.length + 1)}`,
  ).sort()
  if (
    manifest?.name !== PACKAGE_NAME ||
    manifest?.version !== expectedVersion ||
    JSON.stringify(declared) !== JSON.stringify(expected)
  ) {
    throw new Error('Installed package.json export is invalid')
  }
}

/** Run a package-level smoke test against a fresh DSH web profile. */
export async function smokeProfile(overrides = {}) {
  const { artifactSource, ...dependencyOverrides } = overrides
  const registryArtifactVersion = registryVersion(artifactSource)
  const dependencies = {
    access,
    discoverPresets: defaultDiscoverPresets,
    importInstalledExport: defaultImportInstalledExport,
    log: console.log,
    mkdtemp,
    parseConfig: defaultParseConfig,
    readFile,
    resolveDshCommand: defaultResolveDshCommand,
    resolveInstalledCommand: defaultResolveInstalledCommand,
    resolvePnpmCommand,
    rm,
    runCommand: defaultRunCommand,
    tmpdir,
    ...dependencyOverrides,
  }
  await dependencies.access(join(PACKAGE_ROOT, 'dsh', 'lib', 'cli.js'))
  const dshCommand = await dependencies.resolveDshCommand()
  const smokeRoot = await dependencies.mkdtemp(
    join(dependencies.tmpdir(), 'anban-dsh-profile-smoke-'),
  )

  try {
    const dshHome = join(smokeRoot, 'home')
    const profileDir = join(dshHome, 'profiles', PROFILE)
    const environment = smokeEnvironment(dshHome)
    let artifact = artifactSource
    let expectedVersion = registryArtifactVersion

    if (artifact === undefined) {
      const pnpmCommand = await dependencies.resolvePnpmCommand()
      const packed = await dependencies.runCommand(
        pnpmCommand,
        ['pack', '--json', '--pack-destination', smokeRoot],
        { cwd: PACKAGE_ROOT, env: environment },
      )
      const manifest = JSON.parse(
        await dependencies.readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
      )
      const result = parsePackResult(packed.stdout)
      artifact = validatePackResult(result, smokeRoot, manifest)
      expectedVersion = manifest.version
      await dependencies.access(artifact)
    }

    await dependencies.runCommand(
      dshCommand,
      ['plugin', '--profile', PROFILE, 'add', artifact],
      { cwd: PACKAGE_ROOT, env: environment },
    )
    await dependencies.runCommand(
      dshCommand,
      ['--profile', PROFILE, '--dump-config'],
      { cwd: PACKAGE_ROOT, env: environment },
    )
    const installedCommand = await dependencies.resolveInstalledCommand(
      profileDir,
    )
    await dependencies.runCommand(installedCommand, ['install-presets'], {
      cwd: profileDir,
      env: environment,
    })

    const presets = await dependencies.discoverPresets([
      { path: join(dshHome, '.agent-presets'), trust: 'user' },
    ])
    requireHealthyPresets(presets)

    const dumped = await dependencies.runCommand(
      dshCommand,
      ['--profile', PROFILE, '--dump-config'],
      { cwd: PACKAGE_ROOT, env: environment },
    )
    const bundleRows = requireBundleRows(
      await dependencies.parseConfig(dumped.stdout),
    )
    const exportsBySpecifier = new Map()
    for (const specifier of PUBLIC_EXPORTS) {
      exportsBySpecifier.set(
        specifier,
        await dependencies.importInstalledExport(profileDir, specifier),
      )
    }
    validateInstalledExports(exportsBySpecifier, expectedVersion)

    dependencies.log(
      `Bundle rows: anban-mcp=${bundleRows.mcp} anban-preset-manager=${bundleRows.presetManager} preset-local-mcp=${bundleRows.presetLocalMcp}`,
    )
    dependencies.log('Healthy Presets: article, seednote')
    dependencies.log(`Export resolution: ${PUBLIC_EXPORTS.join(', ')}`)
  } finally {
    await dependencies.rm(smokeRoot, { force: true, recursive: true })
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const artifactSource = process.argv[2]
    if (process.argv.length > 3) {
      throw new Error('usage: smoke-profile.mjs [@anban/dsh-plugin@<version>]')
    }
    await smokeProfile(artifactSource === undefined ? {} : { artifactSource })
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Profile smoke failed'}\n`,
    )
    process.exitCode = 1
  }
}
