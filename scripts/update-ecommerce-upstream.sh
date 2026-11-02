#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel 2>/dev/null) || {
  echo "error: update-ecommerce-upstream.sh must be run inside the Creator Skills Git repository" >&2
  exit 1
}
cd "$repo_root"

path=skills/ecommerce-visual-copywriting-skill
entrypoint=SKILL.md

submodule_root=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null || true)
if [ "$submodule_root" != "$repo_root/$path" ]; then
  git submodule update --init -- "$path"
fi
if [ "$(git -C "$path" rev-parse --is-shallow-repository)" = "true" ]; then
  git -C "$path" fetch --unshallow origin
fi
if [ -n "$(git -C "$path" status --porcelain)" ]; then
  echo "error: $path contains local changes; refusing to update read-only upstream content" >&2
  exit 1
fi

branch=$(git config -f .gitmodules --get "submodule.$path.branch" 2>/dev/null || true)
url=$(git config -f .gitmodules --get "submodule.$path.url" 2>/dev/null || true)
if [ "$branch" != "main" ] || [ "$(git -C "$path" remote get-url origin)" != "$url" ]; then
  echo "error: $path must use its configured official origin and main branch" >&2
  exit 1
fi

old_revision=$(git -C "$path" rev-parse HEAD)
git -C "$path" fetch --prune origin main
git -C "$path" show "origin/main:$entrypoint" >/dev/null
git -C "$path" checkout --detach origin/main
new_revision=$(git -C "$path" rev-parse HEAD)
printf '%s advanced from %s to %s\n' "$path" "$old_revision" "$new_revision"
git diff --submodule=log -- "$path"
command -v python3 >/dev/null 2>&1 || {
  echo "error: python3 is required to run the upstream offline verifier" >&2
  exit 1
}
(cd "$path" && python3 tools/verify-skill.py)
printf '%s\n' 'Review the upstream diff, then stage the gitlink and run make ecommerce-upstream-check; update adapter references and CHANGELOG when rules move.'
