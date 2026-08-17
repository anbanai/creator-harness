# DeepSeek Harness installation

The Anban DSH plugin supports the generated Article and Seednote Presets on
DeepSeek Harness Web and Desktop. It uses official DSH credential, MCP, and
Skill adapters. The plugin does not add or change Anban Server business
operations.

## Prerequisites

Create an API key at <https://creator.anbanai.com/settings>, then expose only
this credential to the DSH profile:

```bash
export ANBAN_API_KEY="your API key"
```

The MCP endpoint is fixed at `https://creator.anbanai.com/mcp`. It is not a
profile option. Do not put the key or a serialized Authorization header in a
Preset, command argument, log, or generated artifact.

## Web profile

Install the plugin into the Web profile and materialize its generated Presets:

```bash
dsh plugin --profile web add @anban/dsh-plugin
dsh --profile web --dump-config
dsh plugin --profile web exec anban-dsh install-presets
```

The official profile boot is required only to initialize or refresh the
profile's peer fallback before the first standalone Bundle CLI command.
`dsh plugin ... exec` runs the installed package bin from the Web profile's
`node_modules/.bin`; it does not depend on the caller's `PATH`.

In an active-profile terminal, and only when that profile's
`node_modules/.bin` is already on `PATH`, the final command can use this
shorthand:

```bash
anban-dsh install-presets
```

## Desktop active profile

The DSH CLI does not infer Desktop's active profile. Read the profile name from
Desktop's profile selector or settings; it is the directory name below
`$DSH_HOME/profiles/`. The CLI syntax is `--profile <active-profile>`; assign
that exact name before running the commands:

```bash
ACTIVE_PROFILE="replace-with-desktop-profile-name"
dsh plugin --profile "$ACTIVE_PROFILE" add @anban/dsh-plugin
dsh --profile "$ACTIVE_PROFILE" --dump-config
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh install-presets
```

Restart DeepSeek Harness Desktop after installation so the active profile
reloads the Bundle and Presets.

## Status and removal

Check whether the Web profile's generated Presets are current:

```bash
dsh plugin --profile web exec anban-dsh status
```

remove-presets removes Anban-owned Presets even if they are modified. Run the
profile-explicit status command and back up any local modifications from
`$DSH_HOME/.agent-presets/<id>` before removing Presets. It refuses to remove
unowned Preset directories.

Remove only the Web profile's Anban-generated Presets before removing its
plugin dependency:

```bash
dsh plugin --profile web exec anban-dsh remove-presets
dsh plugin --profile web remove @anban/dsh-plugin
```

Use the same sequence for Desktop after substituting its actual profile name:

```bash
ACTIVE_PROFILE="replace-with-desktop-profile-name"
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh status
dsh plugin --profile "$ACTIVE_PROFILE" exec anban-dsh remove-presets
dsh plugin --profile "$ACTIVE_PROFILE" remove @anban/dsh-plugin
```

## Git-source installs

When installing from a Git source, pnpm may hold dependency build scripts for
approval. Review the packages and forward approval to the same profile where
the plugin was added:

```bash
dsh plugin --profile web approve-builds
ACTIVE_PROFILE="replace-with-desktop-profile-name"
dsh plugin --profile "$ACTIVE_PROFILE" approve-builds
```

Run only the line for the profile being installed, then repeat that profile's
plugin and Preset installation commands.

## Runtime limitation

The MCP connection can be healthy while task-context operations still fail.
Operations that require an Anban task or execution context need a valid current
task and execution; without that context, report the failure and continue only
with capabilities that do not require it.
