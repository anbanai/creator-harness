import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SKILLS_PROVIDER = '@anban/dsh-plugin/skills-provider'
const PROFILE = 'web'
const CREDENTIAL_ENV_KEY = /(?:auth|credential|key|password|secret|token)/i

function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function smokeEnvironment(dshHome) {
  const env = { ...process.env, DSH_HOME: dshHome }
  for (const key of Object.keys(env)) {
    if (key !== 'DSH_HOME' && CREDENTIAL_ENV_KEY.test(key)) {
      delete env[key]
    }
  }
  return env
}

function defaultRunCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error !== undefined) {
    throw result.error
  }
  if (result.status !== 0) {
    if (result.stdout.length > 0) process.stdout.write(result.stdout)
    if (result.stderr.length > 0) process.stderr.write(result.stderr)
    throw new Error(`Profile smoke command exited ${result.status ?? 1}`)
  }

  return { stdout: result.stdout }
}

async function defaultDiscoverPresets(roots) {
  const { discoverPresets } = await import(
    '@deepseek-ai/dsh-agent-presets'
  )
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
  return import(pathToFileURL(resolved).href)
}

async function defaultHealProfileFallback(dshHome) {
  const requireFromPackage = createRequire(join(PACKAGE_ROOT, 'package.json'))
  const dshManifest = requireFromPackage.resolve(
    '@deepseek-ai/dsh/package.json',
  )
  const requireFromDsh = createRequire(dshManifest)
  const appBoot = await import(
    pathToFileURL(requireFromDsh.resolve('@deepseek-ai/dsh-app-boot')).href
  )
  appBoot.healProfilesModuleFallback(dshManifest, dshHome)
}

function packTarballFrom(stdout, smokeRoot) {
  const line = stdout
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .at(-1)
  if (line === undefined || !line.endsWith('.tgz')) {
    throw new Error('pnpm pack did not report a tarball')
  }

  const tarball = resolve(isAbsolute(line) ? line : join(PACKAGE_ROOT, line))
  const fromRoot = relative(smokeRoot, tarball)
  if (
    fromRoot === '' ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error('pnpm pack reported a tarball outside the smoke root')
  }
  return tarball
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
      (id === 'anban-mcp' || name === '@anban/dsh-plugin/anban-mcp'),
  )

  if (
    mcpRows.length !== 1 ||
    managerRows.length !== 1 ||
    presetLocalMcpRows.length !== 0 ||
    mcpRows[0]?.depth !== 0 ||
    mcpRows[0]?.name !== '@anban/dsh-plugin/anban-mcp' ||
    managerRows[0]?.depth !== 0 ||
    managerRows[0]?.name !== '@anban/dsh-plugin/preset-manager'
  ) {
    throw new Error('Installed profile has invalid Anban Bundle rows')
  }

  return { mcp: mcpRows.length, presetLocalMcp: 0, presetManager: 1 }
}

function requireHealthyPresets(presets) {
  for (const id of ['article', 'seednote']) {
    const preset = presets.find((candidate) => candidate.id === id)
    if (preset === undefined || preset.broken !== undefined) {
      throw new Error(`Installed Preset is not healthy: ${id}`)
    }
  }
}

/** Run a tarball-level smoke test against a fresh DSH web profile. */
export async function smokeProfile(overrides = {}) {
  const dependencies = {
    access,
    discoverPresets: defaultDiscoverPresets,
    healProfileFallback: defaultHealProfileFallback,
    importInstalledExport: defaultImportInstalledExport,
    log: console.log,
    mkdtemp,
    parseConfig: defaultParseConfig,
    rm,
    runCommand: defaultRunCommand,
    tmpdir,
    ...overrides,
  }
  const dshBin = join(
    PACKAGE_ROOT,
    'node_modules',
    '.bin',
    executable('dsh'),
  )

  await dependencies.access(join(PACKAGE_ROOT, 'dsh', 'lib', 'cli.js'))
  const smokeRoot = await dependencies.mkdtemp(
    join(dependencies.tmpdir(), 'anban-dsh-profile-smoke-'),
  )

  try {
    const dshHome = join(smokeRoot, 'home')
    const profileDir = join(dshHome, 'profiles', PROFILE)
    const env = smokeEnvironment(dshHome)
    const packed = await dependencies.runCommand(
      'pnpm',
      ['pack', '--pack-destination', smokeRoot],
      { cwd: PACKAGE_ROOT, env: smokeEnvironment(dshHome) },
    )
    const packTarball = packTarballFrom(packed.stdout, smokeRoot)

    await dependencies.runCommand(
      dshBin,
      ['plugin', '--profile', PROFILE, 'add', packTarball],
      { cwd: PACKAGE_ROOT, env },
    )
    await dependencies.healProfileFallback(dshHome)
    await dependencies.runCommand(
      join(profileDir, 'node_modules', '.bin', executable('anban-dsh')),
      ['install-presets'],
      { cwd: profileDir, env },
    )

    const presets = await dependencies.discoverPresets([
      { path: join(dshHome, '.agent-presets'), trust: 'user' },
    ])
    requireHealthyPresets(presets)

    const dumped = await dependencies.runCommand(
      dshBin,
      ['--profile', PROFILE, '--dump-config'],
      { cwd: PACKAGE_ROOT, env },
    )
    const bundleRows = requireBundleRows(
      await dependencies.parseConfig(dumped.stdout),
    )
    const skillsProvider = await dependencies.importInstalledExport(
      profileDir,
      SKILLS_PROVIDER,
    )
    if (
      skillsProvider.name !== 'anban-skills-provider' ||
      typeof skillsProvider.apply !== 'function'
    ) {
      throw new Error('Installed skills-provider export is invalid')
    }

    dependencies.log(
      `Bundle rows: anban-mcp=${bundleRows.mcp} anban-preset-manager=${bundleRows.presetManager} preset-local-mcp=${bundleRows.presetLocalMcp}`,
    )
    dependencies.log('Healthy Presets: article, seednote')
    dependencies.log(`Export resolution: ${SKILLS_PROVIDER}`)
  } finally {
    await dependencies.rm(smokeRoot, { force: true, recursive: true })
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await smokeProfile()
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Profile smoke failed'}\n`,
    )
    process.exitCode = 1
  }
}
