# verdict

[![tests](https://github.com/Gr0mar/verdict/actions/workflows/tests.yml/badge.svg)](https://github.com/Gr0mar/verdict/actions/workflows/tests.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-lightgrey)

A terminal budget for [Claude Code](https://code.claude.com) and [Codex](https://developers.openai.com/codex). The output style asks for replies within **12 lines / 900 characters** — the verdict first, up to three bullets, done — with anything longer (a code review, a research summary, a design proposal, a message you will forward) written to a Markdown file under `~/claude-out/` that opens in your editor by itself. A Stop hook measures every final reply; when one is over budget and no file was written, the agent is sent back once to move the content to a file and answer briefly.

![Without: a 75-line review in the terminal. With the terminal budget: a three-line verdict in the terminal and the full review open in the editor.](docs/demo.svg)

## Why

- **You are there to decide, not to read.** Claude Code answers with pages; what you need from each turn is the answer, the question it has for you, or the sign that something went wrong. With the verdict first, the decision takes seconds — and you keep an overview of what the AI is doing without reading everything it writes.
- **The details are moved, not lost.** The full review, research or plan lands in a file that opens in your editor — rendered, searchable, reopenable, ready to paste into a ticket — instead of a 5 000-character block in scrollback that is gone after the next command.
- **Measured, not just requested.** Instructions in `CLAUDE.md` drift under long sessions and plugins. A hook runs on every reply: when the model ignores the rule, it is sent back to write the file and answer again.
- **Long content becomes files.** Reviews, research and plans live under `~/claude-out/<project>/` where you can reopen, diff and share them instead of losing them in the scrollback.
- **One phrase lifts the budget** for a single turn when you do want the whole thing in the terminal.
- **Logged.** Every decision is recorded, so you can see how often the model needed the nudge — and whether your wording of the rule works.
- Three small dependency-free Node scripts; `install.sh --uninstall` restores your settings.

## How it works

| piece | event | job |
|---|---|---|
| `hooks/budget-prompt.js` | `UserPromptSubmit` | notes whether you asked for the full text this turn; resets the list of files written |
| `hooks/budget-open.js` | `PostToolUse` on `Write` (Claude Code) or `apply_patch` (Codex) | records every Markdown file written under `outDir` and starts `openCommand` on it |
| `hooks/budget-stop.js` | `Stop` | measures the final reply; over budget it blocks once with an instruction to write the file and answer briefly |
| `output-styles/verdict.md` | output style | the rule itself: verdict first, long content to a file |

One turn: you send a prompt → Claude works, writes `~/claude-out/<project>/<date>-<slug>.md` when the content is long (the file opens) → the Stop hook measures the reply. Within budget: done. Over budget without a file: the hook blocks, Claude writes the file and replies again. The second round is never blocked (and Claude Code caps hook continuations at eight), so there is no loop.

What the hook cannot do: take text back. It runs after the reply is on screen, so on a blocked turn you see the long reply, the hook's note, the file being written, and then the short answer. The output style is what keeps the long text off the screen in the first place; every `block_*` line in the log is one turn where the style was not followed — the number to watch.

## Requirements

- Claude Code **2.1.143 or newer** (the Stop hook's `last_assistant_message` field and the cap on hook continuations). On older 2.1 releases the hook sees no reply text, logs `allow_empty` and enforces nothing.
- Or Codex **0.124.0 or newer** (stable lifecycle hooks, on by default, with `apply_patch` visible to PostToolUse). The same three scripts run there — Codex's hook events and fields match.
- Node 22 or newer on the `PATH` the agent starts with (an app launched from the Dock may not see an nvm/fnm shim; then every event reports a hook error and nothing is enforced). No npm dependencies.
- An opener: macOS uses `open -a <openApp>` (default Cursor); other systems default to `xdg-open`. Set `openCommand` for anything else.

## Install

**Claude Code, as a plugin** (recommended — two commands, nothing to clone):

```
/plugin marketplace add Gr0mar/verdict
/plugin install verdict@gr0mar
```

The plugin bundles the hooks, the output style and the skills, which run as `/verdict:fresh`, `/verdict:copilot` and `/verdict:pull`. Restart Claude Code after installing. What to know:

- **The style is forced.** While the plugin is enabled, `verdict` overrides your `outputStyle` setting — `/output-style` may still print the old name, but the plugin's style is what runs. The only opt-out is disabling the plugin. (With the checkout install below, a project's `outputStyle` wins instead.)
- **Updating.** Third-party marketplaces do not auto-update by default: run `claude plugin update verdict@gr0mar`, or turn on auto-update for `gr0mar` under `/plugin` → Marketplaces.
- **Customising.** Plugin files are a cache copy replaced on every update, so edits to the style or the skills do not stick; `~/.config/verdict/budget.json` still applies. To change the wording, limits in the text or the output directory, use the checkout install.
- **Uninstalling.** `/plugin uninstall verdict@gr0mar` removes the install record and `/plugin marketplace remove gr0mar` the marketplace. `~/.config/verdict/`, `~/.claude/state/verdict/` (log and session state) and `~/claude-out/` stay — delete them by hand if you want them gone.
- **One Claude Code install, not two.** If you ran `install.sh` earlier, run `./install.sh --uninstall` before installing the plugin (the installer refuses to run while the plugin is installed). With both active every hook runs twice: double log lines, double blocks, double openers, skills as both `/fresh` and `/verdict:fresh`. The plugin and `install.sh --codex` do not conflict.

**From a checkout** (Claude Code via `install.sh`, or Codex):

```sh
git clone https://github.com/Gr0mar/verdict.git ~/verdict
cd ~/verdict
./install.sh            # Claude Code
./install.sh --codex    # Codex
```

**Claude Code:** `install.sh` symlinks the hooks, the output style and the skills into `~/.claude/` and registers the hooks plus `"outputStyle": "verdict"` in `~/.claude/settings.json` — the file is rewritten after a backup, the merge is idempotent, and no other file is touched: a target that already exists and is not our symlink aborts the install. Restart Claude Code afterwards: hooks reload into running sessions, the output style is read at startup.

**Codex:** `install.sh --codex` registers the hooks in `~/.codex/hooks.json` (pointing at this checkout), puts the rule into `~/.codex/AGENTS.md` between `<!-- verdict:start -->` and `<!-- verdict:end -->` markers with the absolute output directory filled in (Codex has no output styles and `apply_patch` does not expand `~`; the rest of the file is left alone — re-run the install after editing `output-styles/verdict.md`, the block is a copy), and links the skills into `~/.agents/skills/`. Then:

- restart Codex — `AGENTS.md` is read at startup, and an `AGENTS.override.md` next to it would hide the rule;
- let Codex write outside the repository: add the output directory to `[sandbox_workspace_write] writable_roots` in `~/.codex/config.toml` (the installer prints the exact lines), or approve the write when Codex asks;
- optional, for enforcement and automatic opening: run `/hooks` in the Codex CLI and trust the three verdict hooks — Codex skips untrusted hooks, and trust is per hook hash, so repeat it after updating the checkout.

Verified so far: in the Codex desktop app the rule alone produces a verdict plus a link to the full file. The hooks have not yet been run in a live Codex session (CLI or app) — reports welcome. In Codex the skills are invoked as `$fresh`, `$copilot`, `$pull` (or via `/skills`), their `$ARGUMENTS` placeholder is not substituted (the model sees the literal text), and each ships `agents/openai.yaml` so Codex never starts them on its own.

```sh
./install.sh --uninstall           # Claude Code: removes the symlinks and hook entries, restores the outputStyle active at install time
./install.sh --codex --uninstall   # Codex: removes the hook entries, the AGENTS.md block and the skill links (and the files if nothing else is left in them)
```

## Asking for the full text

Say so in the prompt and the budget is lifted for that one turn:

- English: `elaborate`, `in detail`, `in full`, `verbatim`, `show me everything`, `paste it here`, `show me the code`, `give me the command`, `show me the full output`, `print the whole thing`, `put it in the terminal`, `verbose`
- Czech: `rozveď`, `podrobně`, `do terminálu`, `vypiš celé`, `ukaž mi kód`, `dej mi ten příkaz`

The pattern matches request phrases, not bare words: `detail view`, `full width`, `show all toggle`, `--verbose flag` or `code review of the whole branch` do not lift the budget. It is a configurable regex (`detailPattern`); in Claude Code, words inside pasted content are ignored (Codex pastes text inline, so there they count). The output style also tells the agent to keep security warnings, confirmations of destructive actions and requested code in the terminal — but the hook measures those replies like any other, so ask with one of the phrases above when such a reply will be long.

## Configuration

`~/.config/verdict/budget.json`, every field optional:

| field | default | meaning |
|---|---|---|
| `maxLines` | `12` | terminal line budget (trailing blank lines do not count) |
| `maxChars` | `900` | terminal character budget |
| `outDir` | `"~/claude-out"` | where long content is written; files are opened only from here |
| `openApp` | `"Cursor"` | macOS shorthand for `openCommand: ["open", "-a", "<app>"]`; ignored once `openCommand` is set and on other systems |
| `openCommand` | `["open", "-a", "Cursor"]` on macOS, `["xdg-open"]` elsewhere | JSON array: executable plus arguments, the file path is appended; `~` is not expanded in the executable |
| `detailPattern` | request phrases, English + Czech | case-insensitive regex that lifts the budget for one turn |

Files land in `<outDir>/<project>/<YYYY-MM-DD>-<slug>.md`, where `<project>` is the basename of the agent's working directory.

The output style and the skills carry the defaults in their text (`12 lines`, `900 characters`, `~/claude-out`). When you change `maxLines`, `maxChars` or `outDir`, edit `output-styles/verdict.md` and `skills/*/SKILL.md` to match (and re-run `install.sh --codex`, which copies the rule into `AGENTS.md`) — the hook enforces the config, the style tells the agent what to aim for. The configuration, the state and the log live in the same places for Claude Code and Codex.

## Log and metrics

Every Stop decision appends one line to `~/.claude/state/verdict/budget.log.jsonl`:

```json
{"ts":"2026-10-13T12:46:51.710Z","session_id":"…","cwd":"/Users/me/project","lines":14,"chars":690,"decision":"block_no_file","written":[],"detail":false}
```

`decision` is one of `allow`, `block_no_file`, `block_shorten`, `allow_detail`, `allow_empty`, `allow_after_block`. A blocked turn logs two lines (the block and the retry), so count turns without the retries:

```sh
grep -c '"decision":"block' ~/.claude/state/verdict/budget.log.jsonl             # turns that needed the nudge
grep -vc '"decision":"allow_after_block"' ~/.claude/state/verdict/budget.log.jsonl   # all turns
```

Per-session state lives next to the log (`<session_id>.json`, mode 0600) and is pruned after seven days.

## Skills

Three slash commands for prompts people type again and again. Each is a plain `SKILL.md`; with the checkout install, edit the wording to taste. Names: `/fresh` with the checkout install, `/verdict:fresh` with the plugin, `$fresh` in Codex.

- `fresh [scope]` — a fresh-eyes review of the work in this session, or of a named scope: weak spots, unclear parts, unfinished pieces.
- `copilot` — process GitHub Copilot's review comments on the current PR: apply the justified ones, draft replies for the rest, and — after you approve — post the replies and resolve the threads.
- `pull [what you expect]` — bring the repository you are in up to date: fast-forward pull on a clean tree, dependency install when the lockfile changed, `generate-api` when the project has that script, and a report of what changed.

## Limitations

- Only the final message of a turn is measured; narration between tool calls is not, and the retry after a block is not measured again.
- Lines are counted on `\n`, not on rendered height; the character budget bounds wrapping.
- Files are detected through Claude Code's `Write` tool and Codex's `apply_patch`; a file produced by a shell command is not opened.
- With the checkout install the hooks run from this checkout (symlinks for Claude Code, direct paths for Codex), so an edit here is live in every session immediately. They fail open: on any internal error a hook exits 0 and prints nothing.

## Development

```sh
npm test   # node:test; hooks run as child processes in temporary sandboxes
```

```
.claude-plugin/   plugin.json, marketplace.json — the repo is the plugin and its own marketplace
hooks/            budget-config.js (shared), budget-prompt.js, budget-open.js, budget-stop.js, hooks.json (plugin wiring)
output-styles/    verdict.md
skills/           fresh/, copilot/, pull/ (each with agents/openai.yaml for Codex)
install/          merge-settings.js — idempotent hooks merge for settings.json (Claude Code) and hooks.json (Codex)
                  agents-md.js — the rule as a marked block in Codex's AGENTS.md
install.sh
test/
```

## Contributing

Bugs and feature requests go to [issues](https://github.com/Gr0mar/verdict/issues) (the templates ask for the agent, the version and a few log lines); setups and questions to [Discussions](https://github.com/Gr0mar/verdict/discussions). Before a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md): tests first, hooks fail open, no dependencies.

## Licence

[MIT](LICENSE)
