# Installing in Codex

Codex has the same lifecycle hooks as Claude Code (`UserPromptSubmit`, `PostToolUse`, `Stop`, with matching fields), so the three scripts run there unchanged. It has no output styles, so the rule goes into `~/.codex/AGENTS.md` instead.

## Requirements

- Codex **0.124.0 or newer** — stable lifecycle hooks, on by default, with `apply_patch` visible to `PostToolUse`.
- Node 22 or newer on the `PATH` Codex starts with.

## Install

```sh
git clone https://github.com/Gr0mar/verdict.git ~/verdict
cd ~/verdict
./install.sh --codex
```

This registers the hooks in `~/.codex/hooks.json` (pointing at the checkout), writes the rule into `~/.codex/AGENTS.md` between `<!-- verdict:start -->` and `<!-- verdict:end -->` markers with the absolute output directory filled in (`apply_patch` does not expand `~`; the rest of the file is left alone), and links the skills into `~/.agents/skills/`. A file with broken markers is refused rather than edited.

Then:

1. **Restart Codex** — `AGENTS.md` is read at startup, and an `AGENTS.override.md` next to it would hide the rule.
2. **Let Codex write outside the repository.** Add the output directory to `~/.codex/config.toml` (the installer prints the exact lines):
   ```toml
   [sandbox_workspace_write]
   writable_roots = ["/Users/you/claude-out"]
   ```
   or approve the write when Codex asks.
3. **Optional — enforcement and automatic opening.** Codex skips hooks it has not been told to trust: run `/hooks` in the Codex CLI once and trust the three verdict hooks. Trust is per hook hash, so repeat it after updating the checkout. Without the hooks the rule still works, but nothing measures the replies and files are not opened by themselves.

Re-run `./install.sh --codex` after editing `output-styles/verdict.md`: the `AGENTS.md` block is a copy.

## What is verified

In the Codex desktop app the rule alone produces a verdict plus a link to the full file. The hooks have not yet been run in a live Codex session (CLI or app) — reports welcome in [issues](https://github.com/Gr0mar/verdict/issues).

## Skills in Codex

The skills are invoked as `$fresh`, `$copilot`, `$pull` (or through `/skills`). Codex does not substitute the `$ARGUMENTS` placeholder — the model sees the literal text and treats what you type after the skill name as the argument. It also ignores `context: fork` and shows the `` !`git …` `` injection lines of `$fresh` literally, so there the review runs in the same session and the model runs those git commands itself. Each skill ships `agents/openai.yaml` with `allow_implicit_invocation: false`, so Codex never starts them on its own, plus `interface.display_name` and `short_description`, the user-facing name and description the ChatGPT desktop app shows for a skill.

Pasted text arrives inline in Codex, so unlike Claude Code, words inside it can lift the budget for that turn.

## Uninstall

```sh
./install.sh --codex --uninstall
```

Removes the hook entries, the `AGENTS.md` block and the skill links — and `hooks.json` / `AGENTS.md` themselves when nothing else is left in them. The configuration, state and log under `~/.config/verdict/` and `~/.claude/state/verdict/` are shared with the Claude Code install and stay.
