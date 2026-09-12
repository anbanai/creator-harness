#!/usr/bin/env bash
# install-subagents.sh — Install Anban Creator Codex subagents (idempotent)
#
# What this script does:
#   1. Copies agents/*.toml into ~/.codex/agents/, substituting __PLUGIN_ROOT__
#      with the discovered plugin install path.
#   2. Merges MCP and Agent registration into ~/.codex/config.toml, enforcing
#      the official creator endpoint while preserving unrelated tables and keys.
#   3. Prompts the user to restart Codex and verify with /agents.
#
# Usage:
#   bash harness/install/install-subagents.sh   # from repo root
#   bash install-subagents.sh                    # from inside harness/install/
#
# Environment overrides:
#   ANBAN_PLUGIN_ROOT  Override plugin install path detection (advanced).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENTS_SRC="$PLUGIN_SOURCE_ROOT/agents"
REGISTRATION_SRC="$SCRIPT_DIR/agents-registration.toml"

CODEX_DIR="${HOME}/.codex"
CODEX_AGENTS_DIR="$CODEX_DIR/agents"
CODEX_CONFIG="$CODEX_DIR/config.toml"

# --- 1. Discover plugin install path -------------------------------------

discover_plugin_root() {
  if [[ -n "${ANBAN_PLUGIN_ROOT:-}" ]]; then
    echo "$ANBAN_PLUGIN_ROOT"
    return
  fi

  # Pattern: ~/.codex/plugins/cache/<marketplace>/anban/<version>/skills/article/SKILL.md
  local candidate
  candidate="$(find "$CODEX_DIR/plugins/cache" -maxdepth 6 \
    -path "*/anban/*/skills/article/SKILL.md" -type f 2>/dev/null \
    | head -n 1 | sed 's|/skills/article/SKILL.md$||')"

  if [[ -n "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  # Fallback: assume repo layout (developer mode). The skills stay where they are.
  echo "$PLUGIN_SOURCE_ROOT"
}

PLUGIN_ROOT="$(discover_plugin_root)"

echo "[install-subagents] Detected plugin root: $PLUGIN_ROOT"
if [[ ! -f "$PLUGIN_ROOT/skills/article/SKILL.md" ]]; then
  echo "[install-subagents] WARNING: $PLUGIN_ROOT/skills/article/SKILL.md not found." >&2
  echo "[install-subagents] Subagent skill loading may fail. Install the plugin first:" >&2
  echo "[install-subagents]   codex plugin marketplace add $PLUGIN_SOURCE_ROOT" >&2
  echo "[install-subagents]   codex plugin add anban@anbanai" >&2
  echo "[install-subagents] Or set ANBAN_PLUGIN_ROOT to point at the installed plugin directory." >&2
fi

# --- 2. Copy subagent TOMLs into ~/.codex/agents/ -------------------------

mkdir -p "$CODEX_AGENTS_DIR"

legacy_article_agent="wechat""article"
rm -f "$CODEX_AGENTS_DIR/${legacy_article_agent}.toml"

for toml in "$AGENTS_SRC"/*.toml; do
  name="$(basename "$toml")"
  target="$CODEX_AGENTS_DIR/$name"
  # Substitute __PLUGIN_ROOT__ with discovered path on copy
  sed "s|__PLUGIN_ROOT__|$PLUGIN_ROOT|g" "$toml" > "$target"
  echo "[install-subagents] Installed: $target"
done

# --- 3. Merge registration into ~/.codex/config.toml ----------------------

mkdir -p "$CODEX_DIR"

if [[ ! -f "$CODEX_CONFIG" ]]; then
  cp "$REGISTRATION_SRC" "$CODEX_CONFIG"
  echo "[install-subagents] Created $CODEX_CONFIG"
else
  # Idempotent merge: preserve existing tables, refresh the plugin-owned
  # creator endpoint, and append only missing keys.
  tmp="$(mktemp)"
  cleanup_install_tmp() {
    if [[ -n "${tmp:-}" ]]; then
      rm -f -- "$tmp" || true
    fi
  }
  trap cleanup_install_tmp EXIT
  cp "$CODEX_CONFIG" "$tmp"

  # Idempotent merge: append top-level keys, append missing tables,
  # AND append missing keys within existing tables (key-level merge for [features], [agents]).
  python3 - "$REGISTRATION_SRC" "$tmp" "$legacy_article_agent" <<'PY'
import re, sys

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        raise SystemExit(
            '[install-subagents] ERROR: Python 3.11+ is required to safely update config.toml '
            '(or install the tomli package for this Python interpreter).'
        )

reg_path, tmp_path, legacy_article_agent = sys.argv[1], sys.argv[2], sys.argv[3]
reg_text = open(reg_path, encoding='utf-8').read()
reg_lines = reg_text.splitlines()
try:
    parsed_registration = tomllib.loads(reg_text)
except tomllib.TOMLDecodeError:
    raise SystemExit('[install-subagents] ERROR: bundled agent registration is invalid TOML; config.toml was not changed.')
try:
    tmp_text = open(tmp_path, encoding='utf-8').read()
except UnicodeDecodeError:
    raise SystemExit('[install-subagents] ERROR: existing config.toml must be valid UTF-8 TOML; no changes were made.')
tmp_lines = tmp_text.splitlines()

HEADER_RE = re.compile(r'^\s*(\[\[[^\[\]]+\]\]|\[[^\[\]]+\])\s*(?:#.*)?$')
KV_RE = re.compile(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=')

def strip_toml_comment(line):
    quote = None
    escaped = False
    for index, char in enumerate(line):
        if quote == '"':
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quote = None
            continue
        if quote == "'":
            if char == "'":
                quote = None
            continue
        if char == '#':
            return line[:index]
        if char in ('"', "'"):
            quote = char
    return line

def structural_toml_lines(lines):
    multiline_delimiter = None
    for index, line in enumerate(lines):
        if multiline_delimiter is not None:
            yield index, line, False
            if line.count(multiline_delimiter) % 2 == 1:
                multiline_delimiter = None
            continue

        yield index, line, True
        line_without_comment = strip_toml_comment(line)
        for delimiter in ('"""', "'''"):
            if line_without_comment.count(delimiter) % 2 == 1:
                multiline_delimiter = delimiter
                break

try:
    parsed_target = tomllib.loads(tmp_text)
except tomllib.TOMLDecodeError:
    raise SystemExit('[install-subagents] ERROR: existing config.toml is invalid TOML; fix it before reinstalling. No changes were made.')

mcp_servers = parsed_target.get('mcp_servers')
creator_exists = isinstance(mcp_servers, dict) and 'creator' in mcp_servers
if creator_exists:
    creator_config = mcp_servers['creator']
    bearer_exists = isinstance(creator_config, dict) and 'bearer_token_env_var' in creator_config
    canonical_headers = 0
    bare_url_keys = 0
    bare_bearer_keys = 0
    current_header = ''
    for _, line, structural in structural_toml_lines(tmp_lines):
        header_match = HEADER_RE.match(line) if structural else None
        if header_match:
            current_header = header_match.group(1)
            if current_header == '[mcp_servers.creator]':
                canonical_headers += 1
            continue
        key_match = KV_RE.match(line) if structural else None
        if current_header == '[mcp_servers.creator]' and key_match and key_match.group(1) == 'url':
            bare_url_keys += 1
        if current_header == '[mcp_servers.creator]' and key_match and key_match.group(1) == 'bearer_token_env_var':
            bare_bearer_keys += 1
    if canonical_headers != 1 or bare_url_keys != 1 or (bearer_exists and bare_bearer_keys != 1):
        raise SystemExit(
            '[install-subagents] ERROR: unsupported creator MCP configuration representation; '
            'use [mcp_servers.creator] with a bare url key and bare bearer_token_env_var key. '
            'No changes were made.'
        )

legacy_header = f'[agents.{legacy_article_agent}]'
filtered_lines = []
skip_legacy_table = False
for _, line, structural in structural_toml_lines(tmp_lines):
    header_match = HEADER_RE.match(line) if structural else None
    if header_match:
        skip_legacy_table = header_match.group(1) == legacy_header
    if not skip_legacy_table:
        filtered_lines.append(line)
tmp_lines = filtered_lines

# Creator connection fields are plugin-owned. Refresh their values so upgrades
# cannot retain a stale endpoint or noncanonical credential variable.
creator_header = '[mcp_servers.creator]'
creator_endpoint = 'https://creator.anbanai.com/mcp'
creator_connection_values = {
    'url': creator_endpoint,
    'bearer_token_env_var': 'ANBAN_API_KEY',
}
current_header = ''
for index, line, structural in structural_toml_lines(tmp_lines):
    header_match = HEADER_RE.match(line) if structural else None
    if header_match:
        current_header = header_match.group(1)
        continue
    key_match = KV_RE.match(line) if structural else None
    if current_header != creator_header or not key_match:
        continue
    key = key_match.group(1)
    required_value = creator_connection_values.get(key)
    if required_value is None:
        continue
    value_match = re.match(
        rf'^(\s*{re.escape(key)}\s*=\s*)(?:"[^"]*"|\'[^\']*\')(\s*(?:#.*)?)$',
        line,
    )
    if value_match:
        replacement = f'{value_match.group(1)}"{required_value}"{value_match.group(2)}'
    else:
        replacement = f'{key} = "{required_value}"'
    if replacement != line:
        tmp_lines[index] = replacement
        print(f'[install-subagents] Updated: {creator_header}::{key}')

# Parse target file into: { header_name: [list of kv keys] }
# Top-level (no header) is stored under "".
target_tables = {"": []}
current = ""
for _, line, structural in structural_toml_lines(tmp_lines):
    m = HEADER_RE.match(line) if structural else None
    if m:
        current = m.group(1)
        target_tables.setdefault(current, [])
        continue
    kvm = KV_RE.match(line) if structural else None
    if kvm:
        target_tables[current].append(kvm.group(1))

# Parse registration file into: [(header, [kv lines]), ...]
# Preamble (top-level before first header) is treated as header="".
reg_blocks = []
current_header = ""
current_kvs = []
for _, line, structural in structural_toml_lines(reg_lines):
    m = HEADER_RE.match(line) if structural else None
    if m:
        reg_blocks.append((current_header, current_kvs))
        current_header = m.group(1)
        current_kvs = []
        continue
    # Skip comment-only and blank lines in kv collection (preserve them in original form for append)
    if not structural:
        current_kvs.append(line)
        continue
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    current_kvs.append(line)
reg_blocks.append((current_header, current_kvs))

# Now merge into target
additions = []  # list of (header_to_insert_under, line_to_append)
for header, kvs in reg_blocks:
    header_exists = header == "" or header in target_tables
    if not header_exists:
        # Append entire table block (header + kvs)
        additions.append((None, header))
        for kv in kvs:
            additions.append((header, kv))
        target_tables[header] = [KV_RE.match(kv).group(1) for kv in kvs if KV_RE.match(kv)]
        print(f'[install-subagents] Appended table: {header}')
    else:
        # Key-level merge within existing table
        existing_keys = set(target_tables.get(header, []))
        for kv in kvs:
            kvm = KV_RE.match(kv)
            if not kvm:
                continue
            key = kvm.group(1)
            if key in existing_keys:
                print(f'[install-subagents] Already present: {header or "(top-level)"}::{key} (skipped)')
                continue
            additions.append((header, kv))
            existing_keys.add(key)
            target_tables.setdefault(header, []).append(key)
            print(f'[install-subagents] Merged key: {header or "(top-level)"}::{key}')

# Apply additions to tmp_lines
# Strategy: for table-keyed additions, insert right after the header line in tmp.
# For table-creating additions (header=None first), append at end.
# Re-process tmp_lines to find header line numbers.
header_line_idx = {}  # header -> first line index
for i, line, structural in structural_toml_lines(tmp_lines):
    m = HEADER_RE.match(line) if structural else None
    if m:
        h = m.group(1)
        if h not in header_line_idx:
            header_line_idx[h] = i

# Build insertion map: line_index -> list of lines to insert AFTER that line
# For top-level (header=""), insert at end (after last line).
# For new table creation, append at end of file.
insertions = {}  # line_idx -> [lines]
append_at_end = []

for header, line in additions:
    if header is None:
        # New table header itself
        append_at_end.append('')  # blank separator
        append_at_end.append(line)
    elif header == "":
        append_at_end.append(line)
    else:
        # Insert after the header line in target
        idx = header_line_idx.get(header)
        if idx is None:
            # Header somehow missing from target — append at end as fallback
            append_at_end.append(line)
        else:
            insertions.setdefault(idx, []).append(line)

# Reconstruct file
out = []
for i, line in enumerate(tmp_lines):
    out.append(line)
    if i in insertions:
        out.extend(insertions[i])
out.extend(append_at_end)

out_text = '\n'.join(out) + '\n'
try:
    parsed_out = tomllib.loads(out_text)
except tomllib.TOMLDecodeError:
    raise SystemExit('[install-subagents] ERROR: generated config.toml is invalid TOML; no changes were made.')

try:
    installed_creator = parsed_out['mcp_servers']['creator']
    installed_endpoint = installed_creator['url']
    installed_bearer = installed_creator['bearer_token_env_var']
except (KeyError, TypeError):
    raise SystemExit('[install-subagents] ERROR: generated config.toml is missing required creator connection fields; no changes were made.')
if installed_endpoint != creator_endpoint:
    raise SystemExit('[install-subagents] ERROR: generated config.toml did not retain the fixed creator endpoint; no changes were made.')
if installed_bearer != 'ANBAN_API_KEY':
    raise SystemExit('[install-subagents] ERROR: generated config.toml did not retain the required creator bearer variable; no changes were made.')

def first_required_leaf(value, path):
    if isinstance(value, dict) and value:
        key = next(iter(value))
        return first_required_leaf(value[key], path + (key,))
    return path

def registration_problem(expected, actual, path=()):
    for key, expected_value in expected.items():
        child_path = path + (key,)
        if key not in actual:
            return 'missing required registration key', first_required_leaf(expected_value, child_path)
        actual_value = actual[key]
        if isinstance(expected_value, dict):
            if not isinstance(actual_value, dict):
                return 'required registration table has incompatible type', child_path
            problem = registration_problem(expected_value, actual_value, child_path)
            if problem is not None:
                return problem
    return None

problem = registration_problem(parsed_registration, parsed_out)
if problem is not None:
    reason, path = problem
    key_path = '.'.join(path)
    raise SystemExit(f'[install-subagents] ERROR: {reason} {key_path}; config.toml was not changed.')

with open(tmp_path, 'w', encoding='utf-8') as f:
    f.write(out_text)
PY

  mv "$tmp" "$CODEX_CONFIG"
  tmp=""
  trap - EXIT
  echo "[install-subagents] Merged registration into $CODEX_CONFIG"
fi

# --- 4. Reminders ---------------------------------------------------------

echo
echo "[install-subagents] Done."
echo "[install-subagents] Next steps:"
echo "  1. Set ANBAN_API_KEY in your shell (e.g. ~/.zshrc):"
echo "       export ANBAN_API_KEY=\"<your-api-key>\""
echo "  2. Restart Codex."
echo "  3. Verify with:"
echo "       /agents        # should list 7 Anban Creator subagents"
echo "       /skills        # should list Anban Creator skills"
echo "  4. Trigger explicitly:"
echo "       use the article subagent to write an article about X"
