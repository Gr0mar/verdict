#!/usr/bin/env bash
# verdict — installs the terminal budget into Claude Code (default) or Codex.
# Re-running is safe; --uninstall removes exactly what this script added.
#
#   ./install.sh                      Claude Code: symlinks into ~/.claude, hooks + outputStyle in settings.json
#   ./install.sh --uninstall
#   ./install.sh --codex              Codex: hooks in ~/.codex/hooks.json, the rule in ~/.codex/AGENTS.md, skills
#   ./install.sh --codex --uninstall
#
# Environment: CLAUDE_CONFIG_DIR (default ~/.claude), CODEX_HOME (default ~/.codex),
# VERDICT_CONFIG_DIR (default ~/.config/verdict, holds the install state).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
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

mkdir -p "$CONFIG_DIR"

case "$TARGET/$ACTION" in
  claude/install)
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
    mkdir -p "$CODEX_DIR"
    node "$ROOT/install/merge-settings.js" --target codex --settings "$CODEX_DIR/hooks.json" --hooks-dir "$ROOT/hooks" --install-state "$CONFIG_DIR/codex-install-state.json"
    node "$ROOT/install/agents-md.js" --file "$CODEX_DIR/AGENTS.md" --style "$STYLE"
    each_skill link "$CODEX_DIR/skills"
    echo "done. In Codex run /hooks and trust the verdict hooks — Codex skips hooks until they are trusted."
    ;;
  codex/uninstall)
    each_skill unlink_ours "$CODEX_DIR/skills"
    node "$ROOT/install/agents-md.js" --file "$CODEX_DIR/AGENTS.md" --style "$STYLE" --remove
    node "$ROOT/install/merge-settings.js" --target codex --uninstall --settings "$CODEX_DIR/hooks.json" --hooks-dir "$ROOT/hooks" --install-state "$CONFIG_DIR/codex-install-state.json"
    echo "done."
    ;;
esac
