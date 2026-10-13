# Security

## What runs where

The hooks run as your user, outside any sandbox, on every prompt, tool call and reply of your coding agent. They read the agent's hook payload from stdin, read and write files under `~/.claude/state/verdict/` (or `VERDICT_STATE_DIR`) and `~/.config/verdict/`, and start your configured `openCommand` on Markdown files under `outDir`. They make no network connections and never execute content from the agent's reply or from a prompt.

`budget-open.js` only opens files whose real path (symlinks resolved) lies under `outDir`, and it starts the opener without a shell. `budget-prompt.js` stores at most the first 4 000 characters of each prompt in the session state file (mode 0600) and prunes those files after seven days.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repository. If that option is not available to you, open an issue titled "security" without details and the maintainer will get in touch.

You will get an acknowledgement within a week. Fixes ship as a new release with a note in the release notes; credit is given unless you prefer otherwise.
