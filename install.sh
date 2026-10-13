#!/usr/bin/env bash
# verdict — links hooks, output style and skills into the Claude Code config
# directory and registers them in settings.json. Re-running is safe.
#
#   ./install.sh              install or refresh
#   ./install.sh --uninstall  remove everything this script added
#
# Environment: CLAUDE_CONFIG_DIR (default ~/.claude), VERDICT_CONFIG_DIR
# (default ~/.config/verdict, holds install-state.json).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CONFIG_DIR="${VERDICT_CONFIG_DIR:-$HOME/.config/verdict}"
SETTINGS="$CLAUDE_DIR/settings.json"
INSTALL_STATE="$CONFIG_DIR/install-state.json"
MODE="${1:-install}"

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

# Applies $1 (link or unlink_ours) to every file this repo installs.
each_link() {
  local action="$1" file name
  for file in "$ROOT"/hooks/budget-*.js; do
    "$action" "$file" "$CLAUDE_DIR/hooks/$(basename "$file")"
  done
  "$action" "$ROOT/output-styles/verdict.md" "$CLAUDE_DIR/output-styles/verdict.md"
  for file in "$ROOT"/skills/*/; do
    name="$(basename "$file")"
    "$action" "${file%/}" "$CLAUDE_DIR/skills/$name"
  done
}

case "$MODE" in
  install)
    each_link link
    mkdir -p "$CONFIG_DIR"
    node "$ROOT/install/merge-settings.js" --settings "$SETTINGS" --hooks-dir "$CLAUDE_DIR/hooks" --install-state "$INSTALL_STATE"
    echo "done. Restart Claude Code so it loads the verdict output style and the new hooks."
    ;;
  --uninstall)
    each_link unlink_ours
    node "$ROOT/install/merge-settings.js" --uninstall --settings "$SETTINGS" --hooks-dir "$CLAUDE_DIR/hooks" --install-state "$INSTALL_STATE"
    echo "done. Restart Claude Code."
    ;;
  *)
    echo "usage: $0 [--uninstall]" >&2
    exit 1
    ;;
esac
