# Security

## What runs where

The hooks run as your user, outside any sandbox: on every prompt, on every `Write` / `apply_patch` tool call, and on every final reply of your coding agent. They read the agent's hook payload from stdin, read `~/.config/verdict/budget.json` (or `VERDICT_CONFIG_DIR`), read and write session state and a log under `~/.claude/state/verdict/` (or `VERDICT_STATE_DIR`), and start your configured `openCommand` on Markdown files under `outDir`. They make no network connections and never execute content from the agent's reply or from a prompt.

Things worth knowing:

- `openCommand` in `budget.json` is a program the hooks start with your rights. Protect that file like a shell rc file. `VERDICT_OPEN_CMD`, if set in the agent's environment, replaces the executable.
- `budget-open.js` only opens files whose real path (symlinks resolved) lies under `outDir`, and starts the opener without a shell. The `.md` check is on the name the agent gave, so a `.md` symlink inside `outDir` that points to another file inside `outDir` is opened as is.
- `budget-prompt.js` stores at most the first 4 000 characters of each prompt in the session state file (mode 0600, directory 0700); no hook reads it back, and those files are pruned after seven days. The log `budget.log.jsonl` (timestamps, session ids, working directories, file paths, no prompt text) is never pruned — delete it whenever you like.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repository (it is enabled). If the form is not available to you, open a [Discussion](https://github.com/Gr0mar/verdict/discussions) asking for a private channel, without details.

You will get an acknowledgement within a week. Fixes ship as a new release with a note in the release notes; credit is given unless you prefer otherwise.
