#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: check-ecommerce-upstream.sh must be run inside the Creator Skills Git repository" >&2
  exit 1
}
cd "$repo_root"

path=skills/ecommerce-visual-copywriting-skill
url=https://github.com/feichanggege/ecommerce-visual-copywriting-skill.git

branch=$(git config -f .gitmodules --get "submodule.$path.branch" 2>/dev/null || true)
configured_url=$(git config -f .gitmodules --get "submodule.$path.url" 2>/dev/null || true)
if [ "$configured_url" != "$url" ] || [ "$branch" != "main" ]; then
  echo "error: $path must track $url main" >&2
  exit 1
fi

entry=$(git ls-files --stage -- "$path")
set -- $entry
if [ "${1:-}" != "160000" ] || [ "${4:-}" != "$path" ]; then
  echo "error: $path must be recorded as a Git submodule" >&2
  exit 1
fi
gitlink_sha=${2:-}

submodule_root=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$submodule_root" != "$repo_root/$path" ]; then
  echo "error: initialize $path before validation (git submodule update --init $path)" >&2
  exit 1
fi
checkout_sha=$(git -C "$path" rev-parse HEAD 2>/dev/null || true)
if [ -z "$gitlink_sha" ] || [ "$checkout_sha" != "$gitlink_sha" ]; then
  echo "error: $path checkout $checkout_sha does not match parent gitlink $gitlink_sha" >&2
  exit 1
fi
if [ "$(git -C "$path" rev-parse --is-shallow-repository)" != "false" ]; then
  echo "error: $path must have complete history for upstream diff review" >&2
  exit 1
fi
if [ "$(git -C "$path" remote get-url origin)" != "$url" ]; then
  echo "error: $path origin does not match $url" >&2
  exit 1
fi
if [ -n "$(git -C "$path" status --porcelain)" ]; then
  echo "error: $path contains local changes; upstream repositories are read-only" >&2
  exit 1
fi

for required in \
  SKILL.md \
  LICENSE \
  references/compliance-rules.md \
  references/copy-quality-rules.md \
  references/output-contracts.md \
  references/platform-playbooks.md \
  references/source-notes.md \
  references/category-notes.md \
  scripts/count-copy.py \
  scripts/scan-final-copy.py; do
  if [ ! -f "$path/$required" ]; then
    echo "error: $path is missing required upstream file $required" >&2
    exit 1
  fi
done

command -v python3 >/dev/null 2>&1 || {
  echo "error: python3 is required to run the upstream offline verifier" >&2
  exit 1
}
(cd "$path" && python3 tools/verify-skill.py)

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

printf '%s\n' "ecommerce upstream reference OK: $path @ $checkout_sha"
