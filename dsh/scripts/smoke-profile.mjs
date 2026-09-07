import { createRequire } from 'node:module'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
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

import crossSpawn from 'cross-spawn'

import {
  parsePackResult,
  runBoundedCommand,
} from './package-integrity.mjs'

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
const EXPECTED_SKILL_NAMES = {
  article: [
    'article-cover-design',
    'article-publishing',
    'article-viral-strategy',
    'article-visual-design',
    'content-writing',
    'humanizer',
    'seo-optimization',
    'topic-research',
  ],
  seednote: [
    'humanizer',
    'seednote-research',
    'seednote-viral-analysis',
    'seednote-visual-design',
    'seednote-writing',
  ],
}
const REGISTRY_ARTIFACT_PATTERN = new RegExp(
  `^${PACKAGE_NAME.replace('/', '\\/')}@((?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?)$`,
)
const COMMAND_TIMEOUT_MS = 180_000
const INHERITED_ENV_KEYS = [
  'COMSPEC',
  'ComSpec',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SystemRoot',
  'WINDIR',
]

export function portableCommand(
  executable,
  { prefixArgs = [] } = {},
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

  return { executable, prefixArgs: [...prefixArgs] }
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
  return portableCommand(executable, { prefixArgs: [entrypoint] })
}

function isPublicNodeRuntime(executable, platform) {
  if (typeof executable !== 'string') return false
  const paths = platform === 'win32' ? win32 : posix
  return (
    paths.isAbsolute(executable) &&
    /^node(?:\.exe)?$/i.test(paths.basename(executable))
  )
}

function isPnpmExecutable(executable, platform) {
  if (typeof executable !== 'string') return false
  const paths = platform === 'win32' ? win32 : posix
  return /^pnpm(?:\.cmd|\.exe)?$/i.test(paths.basename(executable))
}

export function resolvePnpmCommand({
  environment = process.env,
  platform = process.platform,
  processExecutable = process.execPath,
} = {}) {
  const pathCommand = platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const entrypoint = environment.npm_execpath
  if (typeof entrypoint !== 'string' || entrypoint.length === 0) {
    return portableCommand(pathCommand)
  }

  if (/\.(?:c|m)?js$/i.test(entrypoint)) {
    const nodeRuntime = isPublicNodeRuntime(
      environment.npm_node_execpath,
      platform,
    )
      ? environment.npm_node_execpath
      : processExecutable
    if (!isPublicNodeRuntime(nodeRuntime, platform)) {
      return portableCommand(pathCommand)
    }
    return nodeEntrypointCommand(entrypoint, {
      executable: nodeRuntime,
      platform,
    })
  }

  return portableCommand(
    isPnpmExecutable(entrypoint, platform) ? entrypoint : pathCommand,
  )
}

export function commandInvocation(command, args) {
  return {
    executable: command.executable,
    args: [...command.prefixArgs, ...args],
  }
}

export function smokeEnvironment(dshHome, smokeRoot, source = process.env) {
  const environment = {}
  for (const key of INHERITED_ENV_KEYS) {
    if (source[key] !== undefined) environment[key] = source[key]
  }
  const temporary = join(smokeRoot, 'tmp')
  return {
    ...environment,
    DSH_HOME: dshHome,
    HOME: dshHome,
    NPM_CONFIG_USERCONFIG: join(smokeRoot, '.npmrc'),
    TEMP: temporary,
    TMP: temporary,
    TMPDIR: temporary,
    USERPROFILE: dshHome,
    XDG_CONFIG_HOME: join(smokeRoot, 'xdg-config'),
  }
}

export async function prepareSmokeEnvironment(
  smokeRoot,
  {
    mkdir: makeDirectory = mkdir,
    source = process.env,
    writeFile: writeEnvironmentFile = writeFile,
  } = {},
) {
  const dshHome = join(smokeRoot, 'home')
  const xdgConfig = join(smokeRoot, 'xdg-config')
  const temporary = join(smokeRoot, 'tmp')
  for (const directory of [dshHome, xdgConfig, temporary]) {
    await makeDirectory(directory, { recursive: true })
  }
  await writeEnvironmentFile(join(smokeRoot, '.npmrc'), '', { flag: 'wx' })
  return smokeEnvironment(dshHome, smokeRoot, source)
}

export async function runProfileCommand(command, args, options) {
  const invocation = commandInvocation(command, args)
  let result
  try {
    result = await runBoundedCommand(invocation.executable, invocation.args, {
      cwd: options.cwd,
      environment: options.env,
      errorPrefix: 'Profile smoke command',
      label: options.label,
      spawnProcess: crossSpawn,
      timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    })
  } catch (error) {
    throw profileCommandFailure(error, options)
  }
  if (result.status !== 0) {
    throw new Error(
      `Profile smoke command "${options.label}" exited ${result.status ?? 1}`,
    )
  }

  return result
}

export function profileCommandFailure(error, options) {
  if (error?.commandFailure === 'spawn') {
    return new Error(
      `Profile smoke command "${options.label}" failed to start: ${error.code ?? 'unknown error'}`,
    )
  }
  if (error?.commandFailure === 'timeout') {
    return new Error(
      `Profile smoke command "${options.label}" timed out after ${options.timeoutMs ?? COMMAND_TIMEOUT_MS}ms`,
    )
  }
  if (error?.commandFailure === 'output') {
    return new Error(
      `Profile smoke command "${options.label}" exceeded the output byte limit`,
    )
  }
  if (error?.commandFailure === 'cleanup') {
    return new Error(
      `Profile smoke command "${options.label}" did not exit after forced termination`,
    )
  }
  return new Error(
    `Profile smoke command "${options.label}" failed unexpectedly`,
  )
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
  const nodeRuntime = isPublicNodeRuntime(
    process.env.npm_node_execpath,
    process.platform,
  )
    ? process.env.npm_node_execpath
    : process.execPath
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

async function defaultInspectMountedSkillCatalogs({
  dshCommand,
  env,
  profile,
  profileDir,
  smokeRoot,
}) {
  const inspectorName = 'anban-dsh-catalog-smoke'
  const inspectorDir = join(profileDir, 'node_modules', inspectorName)
  const inspectorEntrypoint = join(inspectorDir, 'index.mjs')
  const patchPath = join(smokeRoot, 'catalog-inspector.patch.yml')
  const resultPath = join(smokeRoot, 'mounted-skill-catalogs.json')
  await mkdir(inspectorDir, { recursive: true })
  await writeFile(
    join(inspectorDir, 'package.json'),
    `${JSON.stringify({
      name: inspectorName,
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: './index.mjs',
    })}\n`,
    'utf8',
  )
  await writeFile(
    inspectorEntrypoint,
    await readFile(
      new URL('./catalog-inspector-plugin.mjs', import.meta.url),
      'utf8',
    ),
    'utf8',
  )
  await writeFile(
    patchPath,
    `${JSON.stringify([
      {
        insert: [
          {
            id: inspectorName,
            name: inspectorName,
            config: { resultPath },
          },
        ],
      },
    ])}\n`,
    'utf8',
  )
  try {
    await runProfileCommand(
      dshCommand,
      ['--profile', profile, '--patch', patchPath],
      {
        cwd: profileDir,
        env,
        label: 'DSH mounted Skill catalog inspection',
      },
    )
    return JSON.parse(await readFile(resultPath, 'utf8'))
  } finally {
    await rm(inspectorDir, { force: true, recursive: true })
  }
}

function exactPath(path, expected) {
  return typeof path === 'string' && resolve(path) === resolve(expected)
}

export function requireMountedSkillCatalogs(catalogs, dshHome) {
  if (
    catalogs === null ||
    typeof catalogs !== 'object' ||
    Array.isArray(catalogs) ||
    Object.keys(catalogs).sort().join(',') !== 'article,seednote'
  ) {
    throw new Error('Mounted Skill catalog is invalid')
  }

  const counts = {}
  for (const [presetId, expectedNames] of Object.entries(
    EXPECTED_SKILL_NAMES,
  )) {
    const catalog = catalogs[presetId]
    const provider = `anban-${presetId}`
    const presetRoot = join(dshHome, '.agent-presets', presetId)
    const skillRoot = join(presetRoot, 'skills')
    const providers = catalog?.providers
    const skills = catalog?.skills
    const names = Array.isArray(skills)
      ? skills.map(({ name }) => name).sort()
      : []
    if (
      !exactPath(catalog?.presetPath, join(presetRoot, 'agent.cordis.yml')) ||
      !Array.isArray(providers) ||
      providers.length !== 1 ||
      providers.some((candidate) => candidate !== provider) ||
      !Array.isArray(skills) ||
      names.join(',') !== [...expectedNames].sort().join(',') ||
      skills.some(
        (skill) =>
          skill?.provider !== provider ||
          !Number.isInteger(skill?.contentBytes) ||
          skill.contentBytes <= 0 ||
          !exactPath(
            skill?.path,
            join(skillRoot, skill?.name ?? '', 'SKILL.md'),
          ),
      )
    ) {
      throw new Error('Mounted Skill catalog is invalid')
    }
    counts[presetId] = skills.length
  }
  return counts
}

export async function verifyInstalledProfile(overrides = {}) {
  const profile = overrides.profile ?? PROFILE
  const dshHome = overrides.dshHome
  if (
    typeof profile !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(profile) ||
    typeof dshHome !== 'string' ||
    !isAbsolute(dshHome)
  ) {
    throw new Error('Installed profile smoke requires a profile and DSH_HOME')
  }

  const ownsSmokeRoot = overrides.smokeRoot === undefined
  const dependencies = {
    access,
    discoverPresets: defaultDiscoverPresets,
    environment: process.env,
    importInstalledExport: defaultImportInstalledExport,
    inspectMountedSkillCatalogs: defaultInspectMountedSkillCatalogs,
    log: console.log,
    mkdir,
    mkdtemp,
    parseConfig: defaultParseConfig,
    readFile,
    resolveDshCommand: defaultResolveDshCommand,
    rm,
    runCommand: runProfileCommand,
    tmpdir,
    writeFile,
    ...overrides,
  }
  const smokeRoot =
    overrides.smokeRoot ??
    (await dependencies.mkdtemp(
      join(dependencies.tmpdir(), 'anban-dsh-installed-smoke-'),
    ))
  const profileDir =
    overrides.profileDir ?? join(dshHome, 'profiles', profile)
  const environment = smokeEnvironment(
    dshHome,
    smokeRoot,
    dependencies.environment,
  )

  try {
    if (ownsSmokeRoot) {
      await dependencies.mkdir(join(smokeRoot, 'tmp'), { recursive: true })
      await dependencies.mkdir(join(smokeRoot, 'xdg-config'), {
        recursive: true,
      })
      await dependencies.writeFile(join(smokeRoot, '.npmrc'), '', {
        flag: 'wx',
      })
    }
    const dshCommand = await dependencies.resolveDshCommand()
    const presets = await dependencies.discoverPresets([
      { path: join(dshHome, '.agent-presets'), trust: 'user' },
    ])
    requireHealthyPresets(presets)
    const mountedCatalogCounts = requireMountedSkillCatalogs(
      await dependencies.inspectMountedSkillCatalogs({
        dshCommand,
        dshHome,
        env: environment,
        profile,
        profileDir,
        smokeRoot,
      }),
      dshHome,
    )
    const dumped = await dependencies.runCommand(
      dshCommand,
      ['--profile', profile, '--dump-config'],
      {
        cwd: profileDir,
        env: environment,
        label: 'Installed DSH profile validation',
      },
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
    const manifest = exportsBySpecifier.get(`${PACKAGE_NAME}/package.json`)
    validateInstalledExports(exportsBySpecifier, manifest?.version)
    dependencies.log(
      `Bundle rows: anban-mcp=${bundleRows.mcp} anban-preset-manager=${bundleRows.presetManager} preset-local-mcp=${bundleRows.presetLocalMcp}`,
    )
    dependencies.log('Healthy Presets: article, seednote')
    dependencies.log(
      `Mounted Skill catalogs: article=${mountedCatalogCounts.article} seednote=${mountedCatalogCounts.seednote}`,
    )
    dependencies.log(`Export resolution: ${PUBLIC_EXPORTS.join(', ')}`)
  } finally {
    if (ownsSmokeRoot) {
      await dependencies.rm(smokeRoot, { force: true, recursive: true })
    }
  }
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
  const version = matched?.[1]
  const versionWithoutBuild = version?.split('+', 1)[0]
  const prereleaseStart = versionWithoutBuild?.indexOf('-') ?? -1
  const prerelease =
    prereleaseStart === -1
      ? undefined
      : versionWithoutBuild?.slice(prereleaseStart + 1).split('.')
  if (
    version === undefined ||
    prerelease?.some(
      (identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier),
    )
  ) {
    throw new Error(
      'Profile smoke registry source must be an exact @anban/dsh-plugin version',
    )
  }
  return version
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
    environment: process.env,
    importInstalledExport: defaultImportInstalledExport,
    inspectMountedSkillCatalogs: defaultInspectMountedSkillCatalogs,
    log: console.log,
    mkdir,
    mkdtemp,
    parseConfig: defaultParseConfig,
    prepareEnvironment: prepareSmokeEnvironment,
    readFile,
    resolveDshCommand: defaultResolveDshCommand,
    resolvePnpmCommand,
    rm,
    runCommand: runProfileCommand,
    tmpdir,
    writeFile,
    ...dependencyOverrides,
  }
  await dependencies.access(join(PACKAGE_ROOT, 'dsh', 'lib', 'cli.js'))
  const dshCommand = await dependencies.resolveDshCommand()
  const smokeRoot = await dependencies.mkdtemp(
    join(dependencies.tmpdir(), 'anban-dsh-profile-smoke-'),
  )

  let primaryFailure
  try {
    const dshHome = join(smokeRoot, 'home')
    const profileDir = join(dshHome, 'profiles', PROFILE)
    const environment = await dependencies.prepareEnvironment(smokeRoot, {
      mkdir: dependencies.mkdir,
      source: dependencies.environment,
      writeFile: dependencies.writeFile,
    })
    let artifact = artifactSource
    let expectedVersion = registryArtifactVersion

    if (artifact === undefined) {
      const pnpmCommand = await dependencies.resolvePnpmCommand()
      const packed = await dependencies.runCommand(
        pnpmCommand,
        ['pack', '--json', '--pack-destination', smokeRoot],
        { cwd: PACKAGE_ROOT, env: environment, label: 'pnpm pack' },
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
      { cwd: PACKAGE_ROOT, env: environment, label: 'DSH plugin add' },
    )
    await dependencies.runCommand(
      dshCommand,
      ['--profile', PROFILE, '--dump-config'],
      { cwd: PACKAGE_ROOT, env: environment, label: 'DSH profile boot' },
    )
    await dependencies.runCommand(
      dshCommand,
      [
        'plugin',
        '--profile',
        PROFILE,
        'exec',
        'anban-dsh',
        'install-presets',
      ],
      { cwd: PACKAGE_ROOT, env: environment, label: 'Anban preset install' },
    )

    const presets = await dependencies.discoverPresets([
      { path: join(dshHome, '.agent-presets'), trust: 'user' },
    ])
    requireHealthyPresets(presets)

    const mountedCatalogCounts = requireMountedSkillCatalogs(
      await dependencies.inspectMountedSkillCatalogs({
        dshCommand,
        dshHome,
        env: environment,
        profile: PROFILE,
        profileDir,
        smokeRoot,
      }),
      dshHome,
    )

    const dumped = await dependencies.runCommand(
      dshCommand,
      ['--profile', PROFILE, '--dump-config'],
      { cwd: PACKAGE_ROOT, env: environment, label: 'DSH profile validation' },
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
    dependencies.log(
      `Mounted Skill catalogs: article=${mountedCatalogCounts.article} seednote=${mountedCatalogCounts.seednote}`,
    )
    dependencies.log(`Export resolution: ${PUBLIC_EXPORTS.join(', ')}`)
  } catch (error) {
    primaryFailure = error
  } finally {
    try {
      await dependencies.rm(smokeRoot, { force: true, recursive: true })
    } catch (cleanupFailure) {
      if (primaryFailure !== undefined) {
        throw new AggregateError(
          [primaryFailure, cleanupFailure],
          primaryFailure instanceof Error
            ? primaryFailure.message
            : 'Profile smoke failed',
        )
      }
      throw cleanupFailure
    }
  }
  if (primaryFailure !== undefined) {
    throw primaryFailure
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--existing-profile') {
      if (args.length !== 2) {
        throw new Error(
          'usage: smoke-profile.mjs --existing-profile <profile>',
        )
      }
      await verifyInstalledProfile({
        dshHome: process.env.DSH_HOME,
        profile: args[1],
      })
    } else {
      const artifactSource = args[0]
      if (args.length > 1) {
        throw new Error(
          'usage: smoke-profile.mjs [@anban/dsh-plugin@<version>]',
        )
      }
      await smokeProfile(
        artifactSource === undefined ? {} : { artifactSource },
      )
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Profile smoke failed'}\n`,
    )
    process.exitCode = 1
  }
}
