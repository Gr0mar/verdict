# verdict

[![tests](https://github.com/Gr0mar/verdict/actions/workflows/tests.yml/badge.svg)](https://github.com/Gr0mar/verdict/actions/workflows/tests.yml)
[![licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
![Node 22+](https://img.shields.io/badge/node-22%2B-lightgrey)

A terminal budget for [Claude Code](https://code.claude.com) and [Codex](https://developers.openai.com/codex). Every reply is the verdict first, up to three bullets, 12 lines max. Anything longer — a code review, a research summary, a plan — lands in a Markdown file that opens in your editor. A Stop hook measures every reply, so the rule holds when the model drifts.

![Without: a 75-line review in the terminal. With verdict: a three-line verdict in the terminal and the full review open in the editor.](docs/demo.svg)

## Install

Claude Code:

```
/plugin marketplace add Gr0mar/verdict
/plugin install verdict@gr0mar
```

Codex, or Claude Code from a checkout:

```sh
git clone https://github.com/Gr0mar/verdict.git ~/verdict && cd ~/verdict
./install.sh            # Claude Code
./install.sh --codex    # Codex
```

Restart the agent afterwards. Needs Node 22+ on the `PATH`, Claude Code 2.1.143+ or Codex 0.124+. Caveats, updating and uninstalling: [Claude Code](docs/plugin.md) · [Codex](docs/codex.md).

## Why

- **You are there to decide, not to read.** Each turn you need the answer, the question the agent has for you, or the sign that something went wrong — not pages of text. Verdict first makes the decision take seconds, and you keep an overview of what the AI is doing.
- **The details are moved, not lost.** The full review or plan sits in a file in your editor: rendered, searchable, reopenable, ready to paste into a ticket — not in scrollback that is gone after the next command.
- **Measured, not just requested.** Instructions in `CLAUDE.md` drift under long sessions and plugins. A hook runs on every reply and sends the agent back when it ignores the rule.

## How it works

| piece | event | job |
|---|---|---|
| `budget-prompt.js` | `UserPromptSubmit` | notes whether you asked for the full text this turn |
| `budget-open.js` | `PostToolUse` (`Write` / `apply_patch`) | opens every Markdown file written under `outDir` |
| `budget-stop.js` | `Stop` | measures the final reply; over budget without a file, blocks once with "write the file, answer briefly" |
| `verdict.md` | output style / `AGENTS.md` | the rule itself |

The second round is never blocked, so there is no loop. The hook cannot take text back: on a blocked turn you see the long reply, the file being written, then the short answer. Every `block_*` line in the log is a turn where the style was not followed — the number to watch.

## Asking for the full text

Say so in the prompt and the budget is lifted for that one turn:

- English: `elaborate`, `in detail`, `in full`, `verbatim`, `show me everything`, `show me the code`, `put it in the terminal`, `verbose`
- Czech: `rozveď`, `podrobně`, `do terminálu`, `vypiš celé`, `ukaž mi kód`

Request phrases only — `detail view`, `full width` or `code review of the whole branch` do not count. Configurable regex (`detailPattern`).

## Configuration

`~/.config/verdict/budget.json`, every field optional:

| field | default | meaning |
|---|---|---|
| `maxLines` | `12` | terminal line budget (trailing blank lines do not count) |
| `maxChars` | `900` | terminal character budget |
| `outDir` | `"~/claude-out"` | where long content goes: `<outDir>/<project>/<YYYY-MM-DD>-<slug>.md` |
| `openApp` | `"Cursor"` | macOS: `open -a <app>` |
| `openCommand` | `["open","-a","Cursor"]` / `["xdg-open"]` | executable plus arguments, file path appended; overrides `openApp` |
| `detailPattern` | request phrases, English + Czech | case-insensitive regex that lifts the budget for one turn |

The style text and the three skills carry the defaults (`12 lines`, `~/claude-out`); if you change them, edit `output-styles/verdict.md` and `skills/*/SKILL.md` to match (checkout install only — see [docs/plugin.md](docs/plugin.md)).

## Skills

- `fresh [scope]` — fresh-eyes review of the uncommitted changes (or the latest commits when the tree is clean), a named scope or a PR number, run in Claude Code as a separate agent without Write or Edit tools so the context that wrote the code does not grade it (Codex: in-session): weak spots by severity, open questions, nothing changed. Reads the repository's `CLAUDE.md` and `REVIEW.md` as review rules.
- `copilot [PR number]` — work through Copilot's review of a PR (default: the current branch's PR); already-resolved threads are skipped, and the push, the replies and the resolving wait for your approval.
- `pull [what you expect to have landed]` — fast-forward pull on a clean tree, dependency install when the lockfile changed, a `generate-api` / `generate:api` / `api:generate` / `codegen` script when package.json has one, report.

Called `/fresh` from a checkout, `/verdict:fresh` from the plugin, `$fresh` in Codex.

### Why `/fresh` runs in a fork

A review written in the conversation that produced the code inherits that conversation's assumptions. In Claude Code, `/fresh` therefore runs as a separate subagent (`context: fork`, the Explore agent without Write or Edit tools, on the session's model): a fresh context that has never seen the conversation, gets the repository state injected, reads the files and the project's rules, and returns the review for the session to save. Codex has no forked skills, so there `$fresh` runs in-session and is told to set aside what it saw. On its first run it reviewed this repository's own `/copilot` skill and found three flaws — threads resolved before the fixes were pushed, a stop rule that fired on any bot, suppressed comments raised again on every run — fixed in [#6](https://github.com/Gr0mar/verdict/pull/6).

The skills pre-approve only exact read commands (`git status`, `git diff HEAD`, `git log`, `gh pr view`, `gh pr diff`) plus, for `/pull`, the fast-forward pull and the submodule checkout it exists for. `git diff`, `git log` and `git show` accept `--output=<file>`, so a wildcard rule such as `Bash(git diff *)` would let a reviewed file talk the model into writing somewhere without a prompt; every other command asks.

## Log

Every Stop decision appends a line to `~/.claude/state/verdict/budget.log.jsonl` — `allow`, `block_no_file`, `block_shorten`, `allow_detail`, `allow_empty`, `allow_after_block`:

```sh
grep -c '"decision":"block' ~/.claude/state/verdict/budget.log.jsonl              # turns that needed the nudge
grep -vc '"decision":"allow_after_block"' ~/.claude/state/verdict/budget.log.jsonl   # all turns
```

## Limitations

- Only the final message of a turn is measured; the retry after a block is not measured again.
- Lines are counted on `\n`, not rendered height; the character budget bounds wrapping.
- Files are detected through `Write` (Claude Code) and `apply_patch` (Codex); a file written by a shell command is not opened.
- Hooks fail open: on an internal error they exit 0 and print nothing.

## Contributing

Bugs and feature requests: [issues](https://github.com/Gr0mar/verdict/issues). Setups and questions: [Discussions](https://github.com/Gr0mar/verdict/discussions). Before a pull request read [CONTRIBUTING.md](CONTRIBUTING.md) — tests first, hooks fail open, no dependencies. `npm test` runs everything.

## Licence

[MIT](LICENSE)
