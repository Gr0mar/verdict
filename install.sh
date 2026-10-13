#!/usr/bin/env bash
# verdict — installs the terminal budget into Claude Code (default) or Codex.
# Re-running is safe; --uninstall removes exactly what this script added.
#
#   ./install.sh                      Claude Code: symlinks into ~/.claude, hooks + outputStyle in settings.json
#   ./install.sh --uninstall
#   ./install.sh --codex              Codex: hooks in ~/.codex/hooks.json, the rule in ~/.codex/AGENTS.md, skills in ~/.agents/skills
#   ./install.sh --codex --uninstall
#
# Environment: CLAUDE_CONFIG_DIR (default ~/.claude), CODEX_HOME (default ~/.codex),
# VERDICT_AGENTS_SKILLS_DIR (default ~/.agents/skills), VERDICT_CONFIG_DIR (default
# ~/.config/verdict, holds the Claude Code install state).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
AGENTS_SKILLS_DIR="${VERDICT_AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
CONFIG_DIR="${VERDICT_CONFIG_DIR:-$HOME/.config/verdict}"
STYLE="$ROOT/output-styles/verdict.md"

TARGET=claude
ACTION=install
for arg in "$@"; do
  case "$arg" in
    --codex) TARGET=codex ;;
    --uninstall) ACTION=uninstall ;;
    *)
      echo "usage: $0 [--codex] [--uninstall]" >&2
      exit 1
      ;;
  esac
done

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ]; then
    [ "$(readlink "$dst")" = "$src" ] && return 0
    echo "refusing: $dst is a symlink to $(readlink "$dst")" >&2
    exit 1
  fi
  if [ -e "$dst" ]; then
    echo "refusing: $dst exists and is not a symlink" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dst")"
  ln -s "$src" "$dst"
  echo "linked: $dst"
}

unlink_ours() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    rm "$dst"
    echo "removed: $dst"
  fi
}

# Applies $1 (link or unlink_ours) to every skill, linking into $2/<name>.
each_skill() {
  local action="$1" base="$2" dir name
  for dir in "$ROOT"/skills/*/; do
    name="$(basename "$dir")"
    "$action" "${dir%/}" "$base/$name"
  done
}

# Applies $1 to the files Claude Code loads from its config directory.
each_claude_link() {
  local action="$1" file
  for file in "$ROOT"/hooks/budget-*.js; do
    "$action" "$file" "$CLAUDE_DIR/hooks/$(basename "$file")"
  done
  "$action" "$STYLE" "$CLAUDE_DIR/output-styles/verdict.md"
  each_skill "$action" "$CLAUDE_DIR/skills"
}

# Removes a file that only our uninstall left behind: an empty AGENTS.md or a hooks.json holding `{}`.
remove_if_empty() {
  local file="$1"
  [ -f "$file" ] || return 0
  if [ ! -s "$file" ] || [ "$(tr -d '[:space:]' < "$file")" = "{}" ]; then
    rm "$file"
    echo "removed: $file"
  fi
}

case "$TARGET/$ACTION" in
  claude/install)
    mkdir -p "$CONFIG_DIR"
    each_claude_link link
    node "$ROOT/install/merge-settings.js" --settings "$CLAUDE_DIR/settings.json" --hooks-dir "$CLAUDE_DIR/hooks" --install-state "$CONFIG_DIR/install-state.json"
    echo "done. Restart Claude Code so it loads the verdict output style and the new hooks."
    ;;
  claude/uninstall)
    each_claude_link unlink_ours
    node "$ROOT/install/merge-settings.js" --uninstall --settings "$CLAUDE_DIR/settings.json" --hooks-dir "$CLAUDE_DIR/hooks" --install-state "$CONFIG_DIR/install-state.json"
    echo "done. Restart Claude Code."
    ;;
  codex/install)
    # Skills first: a conflicting target aborts before anything else is written.
    each_skill link "$AGENTS_SKILLS_DIR"
    OUT_DIR="$(node -e 'process.stdout.write(require(process.argv[1]).loadConfig().outDir)' "$ROOT/hooks/budget-config.js")"
    mkdir -p "$CODEX_DIR"
    node "$ROOT/install/merge-settings.js" --target codex --settings "$CODEX_DIR/hooks.json" --hooks-dir "$ROOT/hooks"
    node "$ROOT/install/agents-md.js" --file "$CODEX_DIR/AGENTS.md" --style "$STYLE" --out-dir "$OUT_DIR"
    cat <<EOF
done. Three more things on the Codex side:
  1. Restart Codex — AGENTS.md is read at startup (an AGENTS.override.md next to it would hide the rule).
  2. Let Codex write outside the repository: in ~/.codex/config.toml add
       [sandbox_workspace_write]
       writable_roots = ["$OUT_DIR"]
     or approve the write when Codex asks.
  3. Optional, for enforcement and auto-opening: run /hooks in the Codex CLI and trust the three verdict hooks
     (trust is per hook hash — repeat after updating this checkout).
EOF
    ;;
  codex/uninstall)
    each_skill unlink_ours "$AGENTS_SKILLS_DIR"
    node "$ROOT/install/agents-md.js" --file "$CODEX_DIR/AGENTS.md" --style "$STYLE" --remove
    node "$ROOT/install/merge-settings.js" --target codex --uninstall --settings "$CODEX_DIR/hooks.json" --hooks-dir "$ROOT/hooks"
    remove_if_empty "$CODEX_DIR/AGENTS.md"
    remove_if_empty "$CODEX_DIR/hooks.json"
    echo "done. Restart Codex."
    ;;
esac
