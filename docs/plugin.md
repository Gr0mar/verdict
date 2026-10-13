# Installing in Claude Code

Two ways: the plugin (recommended) or a checkout with `install.sh`. Use one of them, not both — with both active every hook runs twice (double log lines, double blocks, double openers, skills as both `/fresh` and `/verdict:fresh`). The checkout installer refuses to run while the plugin is installed.

## Requirements

- Claude Code **2.1.143 or newer** — the Stop hook's `last_assistant_message` field and the cap on hook continuations. On older 2.1 releases the hook sees no reply text, logs `allow_empty` and enforces nothing.
- Node 22 or newer on the `PATH` the agent starts with. An app launched from the Dock may not see an nvm/fnm shim; then every event reports a hook error and nothing is enforced.
- An opener: macOS uses `open -a Cursor` by default, other systems `xdg-open`; set `openCommand` for anything else (see Configuration in the README).

## Plugin

```
/plugin marketplace add Gr0mar/verdict
/plugin install verdict@gr0mar
```

Restart Claude Code. The plugin bundles the hooks, the output style and the skills (`/verdict:fresh`, `/verdict:copilot`, `/verdict:pull`).

- **The style is forced.** While the plugin is enabled, `verdict` overrides your `outputStyle` setting — `/output-style` may still print the old name, but the plugin's style is what runs. The only opt-out is disabling the plugin.
- **Updating.** Third-party marketplaces do not auto-update by default: run `claude plugin update verdict@gr0mar`, or turn on auto-update for `gr0mar` under `/plugin` → Marketplaces.
- **Customising.** Plugin files are a cache copy replaced on every update, so edits to the style or the skills do not stick. `~/.config/verdict/budget.json` still applies. To change the wording, the limits in the text or the output directory, use the checkout install.
- **Uninstalling.** `/plugin uninstall verdict@gr0mar` removes the install record, `/plugin marketplace remove gr0mar` the marketplace. `~/.config/verdict/`, `~/.claude/state/verdict/` (log and session state) and `~/claude-out/` stay — delete them by hand if you want them gone.
- **Migrating from a checkout:** run `./install.sh --uninstall` first.

## Checkout

```sh
git clone https://github.com/Gr0mar/verdict.git ~/verdict
cd ~/verdict
./install.sh
```

`install.sh` symlinks the hooks, the output style and the skills into `~/.claude/` and registers the hooks plus `"outputStyle": "verdict"` in `~/.claude/settings.json`. The settings file is rewritten after a backup, the merge is idempotent, and no other file is touched: a target that already exists and is not our symlink aborts the install. Restart Claude Code afterwards — hooks reload into running sessions, the output style is read at startup.

Because the hooks run through symlinks into the checkout, an edit there is live in every session immediately. They fail open: on any internal error a hook exits 0 and prints nothing. A project's own `outputStyle` setting wins over the user-level `verdict` style.

```sh
./install.sh --uninstall   # removes the symlinks and hook entries, restores the outputStyle active at install time
```

The output style and the skills carry the defaults in their text (`12 lines`, `900 characters`, `~/claude-out`). When you change `maxLines`, `maxChars` or `outDir` in `budget.json`, edit `output-styles/verdict.md` and `skills/*/SKILL.md` to match — the hook enforces the config, the style tells the agent what to aim for.
