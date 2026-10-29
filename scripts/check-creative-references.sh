#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: check-creative-references.sh must be run inside the Creator Skills Git repository" >&2
  exit 1
}
cd "$repo_root"

check_submodule() {
  path=$1
  url=$2
  entrypoint=$3
  branch=$(git config -f .gitmodules --get "submodule.$path.branch" 2>/dev/null || true)
  configured_url=$(git config -f .gitmodules --get "submodule.$path.url" 2>/dev/null || true)
  if [ "$configured_url" != "$url" ] || [ "$branch" != "main" ]; then
    echo "error: $path must track $url main" >&2
    return 1
  fi

  entry=$(git ls-files --stage -- "$path")
  set -- $entry
  if [ "${1:-}" != "160000" ] || [ "${4:-}" != "$path" ]; then
    echo "error: $path must be recorded as a Git submodule" >&2
    return 1
  fi

  submodule_root=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null || true)
  if [ "$submodule_root" != "$repo_root/$path" ]; then
    echo "error: initialize $path before validation" >&2
    return 1
  fi
  if [ "$(git -C "$path" rev-parse --is-shallow-repository)" != "false" ]; then
    echo "error: $path must have complete history for upstream diff review" >&2
    return 1
  fi
  if [ "$(git -C "$path" remote get-url origin)" != "$url" ]; then
    echo "error: $path origin does not match $url" >&2
    return 1
  fi
  if [ -n "$(git -C "$path" status --porcelain)" ]; then
    echo "error: $path contains local changes; upstream repositories are read-only" >&2
    return 1
  fi
  if [ ! -f "$path/$entrypoint" ]; then
    echo "error: $path is missing expected entrypoint $entrypoint" >&2
    return 1
  fi
  if [ ! -f "$path/LICENSE" ]; then
    echo "error: $path is missing its upstream LICENSE" >&2
    return 1
  fi
}

check_submodule third_party/seedance2-skill https://github.com/dexhunter/seedance2-skill.git zh/SKILL.md
check_submodule third_party/GPT-Image2-Skill https://github.com/wuyoscar/GPT-Image2-Skill.git skills/gpt-image/SKILL.md

for manifest in .claude-plugin/marketplace.json .claude-plugin/plugin.json .codex-plugin/plugin.json; do
  jq -e . "$manifest" >/dev/null
done
marketplace_version=$(jq -r '.plugins[0].version' .claude-plugin/marketplace.json)
claude_version=$(jq -r '.version' .claude-plugin/plugin.json)
codex_version=$(jq -r '.version' .codex-plugin/plugin.json)
package_version=$(jq -r '.version' package.json)
if [ "$marketplace_version" != "$claude_version" ] || [ "$claude_version" != "$codex_version" ] || [ "$codex_version" != "$package_version" ]; then
  echo "error: native plugin and package versions must match" >&2
  exit 1
fi

command -v claude >/dev/null 2>&1 || {
  echo "error: claude CLI is required for strict plugin validation" >&2
  exit 1
}
claude plugin validate --strict "$repo_root"
