# DeepSeek Harness installation

The full Anban DSH plugin supports DeepSeek Harness Web and Desktop. It adds the
Creator MCP Bundle to a selected profile and materializes generated Article and
Seednote Presets through an explicit second operation. It does not add or
change Anban Server business operations.

## Support matrix

| Surface | Skills | Native Agent | DSH Bundle/MCP | DSH Preset |
| --- | --- | --- | --- | --- |
| Skills-only installer | Yes | No | No | No |
| Claude Code plugin | Yes | Claude Agent | Claude MCP adapter | No |
| Codex plugin | Yes | Codex subagent | Codex MCP adapter | No |
| Full DSH plugin | Article/Seednote generated copies | DSH composition | Official Bundle/MCP adapters | Article/Seednote only |

The Skills-only installer does not install native Agents, a DSH Bundle, MCP
adapters, or Presets. The Claude Code and Codex plugins use their own native
Agent and MCP adapters. The full DSH plugin is the only surface in this table
that installs DSH composition and Presets, and only Article and Seednote have
DSH Presets.

DSH is not a separate Anban business workflow or Skill tree. `harness/skills/**`
is the canonical authored Skill source. Each Agent Pack declares its Skills,
and the Agent Pack generator copies the exact declared Skills into the
generated Article or Seednote Preset. DSH-only code is limited to host
composition, official Bundle/MCP adapters, credentials, the Preset manager, and
the Skill provider.

## Resolve DSH home

Normalize and export the effective DSH home before any filesystem operation.
Node is a DSH prerequisite. This snippet uses a trimmed view only to decide
whether an unset, empty, or whitespace-only value falls back to
`path.join(os.homedir(), '.dsh')`. It otherwise preserves the configured value,
including significant leading or trailing whitespace, expands exact `~`,
`~/...`, and `~\...` forms, and resolves the result to an absolute path. It
refuses an empty result or a filesystem root before creating or changing
permissions:

```bash
NORMALIZED_DSH_HOME="$(
node <<'NODE'
const os = require('node:os')
const path = require('node:path')

const configured = process.env.DSH_HOME ?? ''
let value = configured
if (configured.trim() === '') value = path.join(os.homedir(), '.dsh')
else if (configured === '~') value = os.homedir()
else if (configured.startsWith('~/') || configured.startsWith('~\\')) {
  value = path.join(os.homedir(), configured.slice(2))
}

const normalized = path.resolve(value)
if (normalized === path.parse(normalized).root) {
  console.error('Refusing to use the filesystem root as DSH_HOME')
  process.exit(1)
}
process.stdout.write(normalized)
NODE
)" || {
  printf '%s\n' 'Unable to normalize DSH_HOME' >&2
  exit 1
}
[ -n "$NORMALIZED_DSH_HOME" ] || {
  printf '%s\n' 'Refusing an empty normalized DSH_HOME' >&2
  exit 1
}
export DSH_HOME="$NORMALIZED_DSH_HOME"
unset NORMALIZED_DSH_HOME
install -d -m 700 "$DSH_HOME"
chmod 700 "$DSH_HOME"
```

The Node code mirrors DSH path-resolution semantics on every platform. The
surrounding shell plus `install` and `chmod` lines are a POSIX-only owner-only
permission block (`0700`, with credentials at `0600`); they are not Windows
permission commands.

## Lifecycle boundary

**Two steps, two scopes:** the Bundle is profile-local. Presets are global at
`$DSH_HOME/.agent-presets` and shared by every profile using the same `DSH_HOME`.
Bundle activation never installs, upgrades, or removes Presets. Always run the
explicit Preset command after installing, upgrading, or rolling back the
Bundle.

An upgrade or removal from one profile can therefore have cross-profile
effects when it changes the global Presets. Before `--force` or removal, check
status, back up local changes, and confirm which other profiles still use
`@anban/dsh-plugin`. Activation intentionally never mutates shared Presets.

## Select the active profile

Choose the target profile once and use it for every command in this guide:

```bash
ACTIVE_PROFILE="replace-with-web-or-desktop-profile-name"
```

For public DeepSeek Harness Web, set `ACTIVE_PROFILE` to `web`. For Desktop,
read the exact active profile name from its profile selector or settings and
use the corresponding directory name below `$DSH_HOME/profiles/<name>`. The DSH
CLI does not infer Desktop's active profile. Restart Desktop after changing its
active profile's Bundle so it reloads the Bundle and discovers global Presets.

## Credentials

Create an Anban API key at <https://creator.anbanai.com/settings>. The official
DSH credential precedence is exactly:

```text
inherited process environment (read-only, highest priority) -> `$DSH_HOME/.credentials.yaml` (managed, writable) -> invocation-project `.env` -> `$DSH_HOME/.env`
```

For persistent Web or Desktop use, edit `$DSH_HOME/.credentials.yaml` as a YAML
mapping containing this placeholder key and replace the placeholder locally:

```yaml
ANBAN_API_KEY: <value>
```

On POSIX, keep the credential file at mode `0600`; the resolved DSH home is
already owner-only (`0700`) from the initialization above:

```bash
chmod 600 "$DSH_HOME/.credentials.yaml"
```

An inherited process environment value is a temporary or CI override. It is
read-only, wins over every file, and changes only after DSH restarts. DSH model
onboarding does not configure arbitrary third-party credentials. It configures
supported model-provider credentials, so configure `ANBAN_API_KEY` through the
official credential document above instead.

The Creator MCP endpoint is fixed at `https://creator.anbanai.com/mcp`. It is
not a profile option. Never put a key or serialized Authorization header in a
Preset, command argument, log, screenshot, test fixture, or generated artifact.

## 4.1.30 release-operator checklist

Perform this manual production check after automated code gates and before
public announcement:

1. Create a dedicated low-privilege Anban API key for the release check. Keep it
   outside Git and do not put it in a fixture, workflow, command argument, log,
   screenshot, or artifact.
2. Install the exact release artifact into a clean DSH profile, configure the
   key through the official credential document, and call the real Creator MCP
   `list_projects` operation. Use one returned project with
   `get_project_profile` to confirm authenticated read-only access end to end.
3. Record the account, environment, time, and result in the private release
   record without recording the key or an Authorization header.
4. Immediately rotate or revoke the dedicated key after the check.

A missing valid key is an explicit manual release gate: do not announce the
release until an authorized operator completes and records this check. The
automated missing-key and invalid-key tests remain required, but they do not
replace this real authenticated MCP verification.

## Supported artifacts

Install only a published, immutable artifact. In priority order:

1. **public npm package (primary)**: an exact stable SemVer specifier such as
   `@anban/dsh-plugin@4.1.18`; do not use an unversioned package, dist-tag, or
   version range.
2. **checksummed GitHub Release**: the exact versioned
   `anban-dsh-plugin-X.Y.Z.tgz` and matching SHA-256 file attached to the same
   version tag.
3. **immutable Git tag or full commit**: an advanced source install from the
   approved `anbanai/creator-harness` repository whose prepare build is
   explicitly approved and allowed to complete.

Use only a version that resolves anonymously from npm or has completed release
assets. An unreleased repository revision is not a published artifact.

### Public npm

Replace `<published-version>` with one exact version from the public registry:

```bash
PUBLISHED_VERSION="replace-with-published-version"
npm view "@anban/dsh-plugin@${PUBLISHED_VERSION}" version
dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"
```

### Checksummed release tarball

For release `v<published-version>`, download both
`anban-dsh-plugin-<published-version>.tgz` and
`anban-dsh-plugin-<published-version>.tgz.sha256` from the matching
`anbanai/anban-creator` GitHub Release. Verify before installation:

```bash
PUBLISHED_VERSION="replace-with-published-version"
curl -fLO "https://github.com/anbanai/anban-creator/releases/download/v${PUBLISHED_VERSION}/anban-dsh-plugin-${PUBLISHED_VERSION}.tgz"
curl -fLO "https://github.com/anbanai/anban-creator/releases/download/v${PUBLISHED_VERSION}/anban-dsh-plugin-${PUBLISHED_VERSION}.tgz.sha256"
shasum -a 256 -c "anban-dsh-plugin-${PUBLISHED_VERSION}.tgz.sha256"
dsh plugin --profile "$ACTIVE_PROFILE" add "./anban-dsh-plugin-${PUBLISHED_VERSION}.tgz"
```

The checksum file names the exact tarball. A tarball add must resolve to a
versioned `anban-dsh-plugin-X.Y.Z.tgz` path or URL. A `file:` specifier is
acceptable only when it names that exact archive, for example
`file:/absolute/path/anban-dsh-plugin-4.1.30.tgz`; a `file:` directory and an
arbitrarily named `.tgz` are not supported. Do not install when verification
fails or when the asset tag and package version differ.

### Immutable Git source

Git installs must use the approved repository and name a full 40-character
commit or an exact protected release tag, never a branch, `HEAD`, or floating
repository URL. A Git tag can be moved unless repository protection prevents
it, so verify the protected release tag and prefer the full commit SHA for the
strongest immutable pin. pnpm runs the package's `prepare` build for Git-hosted
dependencies and can block that build until it is approved. Review the
packages, approve builds in the same profile, then repeat the exact add
command:

```bash
SOURCE_REF="replace-with-immutable-tag-or-full-40-character-commit"
dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#${SOURCE_REF}"
dsh plugin --profile "$ACTIVE_PROFILE" approve-builds
dsh plugin --profile "$ACTIVE_PROFILE" add "git+https://github.com/anbanai/creator-harness.git#${SOURCE_REF}"
```

The first add may stop while pnpm reports the exact build approval it needs.
Do not continue until the prepare build succeeds and the installed package
contains its runtime output.

### Local development

From the plugin repository, build a real package archive and read the
structured result:

```bash
pnpm pack --json
PACKED_TARBALL="/absolute/path/anban-dsh-plugin-4.1.30.tgz"
dsh plugin --profile "$ACTIVE_PROFILE" add "$PACKED_TARBALL"
```

Pass the exact tarball path reported in the `filename` field to the target
profile, then compose its configuration and install Presets. Never install this
plugin from a source directory with a `file:` specifier, including an arbitrary
source checkout directory; a package-manager snapshot can otherwise exist
without the generated runtime files.

## Initial installation and configuration

Install an exact public version into the selected Web or Desktop profile,
compose that profile's configuration to prepare its peer fallback, then
materialize the global Presets:

```bash
PUBLISHED_VERSION="replace-with-published-version"
dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"
dsh --profile "$ACTIVE_PROFILE" --dump-config
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets
```

The dump-config step composes the selected profile configuration and prepares
its peer fallback before the first standalone Bundle CLI command.

`dsh plugin ... exec` runs the installed package bin from the profile's
`node_modules/.bin`; it does not depend on the caller's `PATH`.

In an active-profile terminal, and only when that profile's
`node_modules/.bin` is already on `PATH`, the final command can use this
shorthand:

```bash
anban-dsh install-presets
```

## Shell and interactive commands

The public plugin executable exposes these exact profile-explicit commands:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets
```

Inside interactive Web and Desktop sessions, the registered commands are:

```text
/anban-presets-install
/anban-presets-status
/anban-presets-install force
/anban-presets-remove confirm
```

Both surfaces call the same Preset manager. Use the shell CLI for automation
and recovery, and use the registered commands inside interactive Web and
Desktop sessions. Interactive confirmation differs from the already-explicit
shell CLI removal: `/anban-presets-remove` requires `confirm`, while
`remove-presets` is itself an explicit host command and takes no extra flag.

## Status and backups

Status is read-only and does not acquire the global mutation lock. Run it
before an upgrade, rollback, `--force`, or removal:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
```

The states are `absent`, `current`, `outdated`, `modified`, and `unowned`.
Back up any locally changed owned directory from
`$DSH_HOME/.agent-presets/<preset-id>` before a destructive operation. Do not copy a
credential file into that backup.

## Upgrade

Check every profile using the same `DSH_HOME` before changing the global
Presets. Upgrade the profile-local Bundle first, compose its configuration,
explicitly reconcile Presets, and check status again:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
PUBLISHED_VERSION="replace-with-published-version"
dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"
dsh --profile "$ACTIVE_PROFILE" --dump-config
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
```

Normal upgrade replaces `outdated` owned Presets. It refuses `modified` and
`unowned` state. After reviewing and backing up trusted modified content, an
intentional replacement uses:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force
```

Force is destructive. It can replace changed content, so status and backup
must come first.

## Rollback and recovery

Rollback installs an exact previously published Bundle version and then
reconciles the global Presets from that version. Because newer owned Presets
may appear modified to an older package, review status and back them up before
forcing replacement:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
PUBLISHED_VERSION="replace-with-published-version"
dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"
dsh --profile "$ACTIVE_PROFILE" --dump-config
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets --force
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
```

If Bundle installation succeeds but Preset installation does not, the system
is in an incomplete two-step state. Keep the Bundle installed, resolve the
reported error, rerun `install-presets`, and confirm `current` status. Do not
assume Bundle activation repaired Presets.

## Removal

remove-presets removes Anban-owned Presets even if they are modified. Run the
profile-explicit status command and back up any local modifications from
`$DSH_HOME/.agent-presets/<id>` before removing Presets. Removal of unowned
Preset directories is always refused; remove-presets refuses to remove unowned
Preset directories.

First confirm no other Web or Desktop profile sharing this `DSH_HOME` still
needs the global Presets. Then remove the global Presets before the profile-local
Bundle:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets
dsh plugin --profile "$ACTIVE_PROFILE" remove @anban/dsh-plugin
```

Removing a Bundle from one profile does not remove the global Presets. Removing
the Presets changes discovery for every profile using the same `DSH_HOME`.

## Troubleshooting

The CLI prints stable, secret-safe operational codes:

| Code | Meaning and recovery |
| --- | --- |
| `ERR_RUNTIME_MISSING` | An incomplete package or source install lacks a runtime entrypoint. Remove that profile dependency, install the exact verified npm version or packed `.tgz`, compose the profile configuration, and rerun Preset installation. |
| `ERR_PRESET_UNOWNED` | A target directory has no matching Anban ownership record. Inspect it; removal is refused, and replacement requires an explicit trust decision. |
| `ERR_PRESET_MODIFIED` | An owned Preset differs from its recorded digest. Run status, back it up, and use `--force` only when replacement is intended. |
| `ERR_PRESET_LOCKED` | Another mutation is active or ownership cannot yet be proven stale. Wait for that operation, then rerun status; do not disturb its lock. |
| `ERR_PRESET_LOCK_INVALID` | Lock ownership is malformed, remote, or indeterminate. Stop DSH writers and perform the manual lock-residue procedure below. |
| `ERR_PRESET_ROLLBACK` | Automatic rollback failed. Preserve the reported recovery path and inspect it with the Preset directory before retrying. |
| `ERR_PRESET_OPERATION` | Another bounded Preset operation failed. Run status, check filesystem access and space, then retry the same explicit step. |

### Incomplete source install recovery

An old source-directory snapshot may appear in the profile dependency list but
lack `dsh/lib/cli.js`. Remove only that profile dependency, then reinstall a
verified artifact and finish both lifecycle steps:

```bash
dsh plugin --profile "$ACTIVE_PROFILE" remove @anban/dsh-plugin
PUBLISHED_VERSION="replace-with-published-version"
dsh plugin --profile "$ACTIVE_PROFILE" add "@anban/dsh-plugin@${PUBLISHED_VERSION}"
dsh --profile "$ACTIVE_PROFILE" --dump-config
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
```

### Lock residue and manual recovery

The manager automatically reclaims a valid stale lock only when it proves that
the recorded owner is a dead process on the current host. For
`ERR_PRESET_LOCKED`, wait and rerun status. For `ERR_PRESET_LOCK_INVALID`, stop
all DSH processes sharing this home, back up `$DSH_HOME/.agent-presets`, inspect
`.anban-dsh.lock/owner.json`, and confirm no owner process is live.

Only after that evidence, move the lock residue to a unique quarantine path;
never recursively delete it:

```bash
LOCK_QUARANTINE="$DSH_HOME/.agent-presets/.anban-dsh.lock.manual-recovery-<unique-suffix>"
mv -- "$DSH_HOME/.agent-presets/.anban-dsh.lock" "$LOCK_QUARANTINE"
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
```

Keep the quarantine directory until status and the next explicit mutation
succeed. If ownership or process state remains uncertain, stop and ask the DSH
administrator to inspect it instead of deleting anything.

## Runtime limitation

The MCP connection can be healthy while task-context operations still fail.
Operations that require an Anban task or execution context need a valid current
task and execution; without that context, report the failure and continue only
with capabilities that do not require it.
