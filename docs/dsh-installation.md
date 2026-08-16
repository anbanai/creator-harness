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
anban-dsh install-presets
```

Run `anban-dsh install-presets` from the installed profile environment so the
command resolves that profile's DSH home.

## Desktop active profile

Open a terminal for the active Desktop profile, then run:

```bash
dsh plugin add @anban/dsh-plugin
anban-dsh install-presets
```

Restart DeepSeek Harness Desktop after installation so the active profile
reloads the Bundle and Presets.

## Status and removal

Check whether the generated Presets are current:

```bash
anban-dsh status
```

Remove only the Anban-generated Presets before removing the plugin:

```bash
anban-dsh remove-presets
dsh plugin remove @anban/dsh-plugin
```

For the Web profile, address the profile explicitly when removing the plugin:

```bash
dsh plugin --profile web remove @anban/dsh-plugin
```

The removal command refuses to delete an unowned or modified Preset. Inspect
its status instead of deleting profile files manually.

## Git-source installs

When installing from a Git source, pnpm may hold dependency build scripts for
approval. Review the packages and run:

```bash
pnpm approve-builds
```

Then repeat the plugin and Preset installation commands.

## Runtime limitation

The MCP connection can be healthy while task-context operations still fail.
Operations that require an Anban task or execution context need a valid current
task and execution; without that context, report the failure and continue only
with capabilities that do not require it.
