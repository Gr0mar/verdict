# Contributing

Thanks for looking under the hood. verdict is small on purpose: three hooks, one output style, three skills, one installer. Keep it that way.

## Ground rules

- **Hooks fail open.** On any internal error a hook exits 0 and prints nothing. A hook must never block the user's work because of its own bug.
- **No dependencies.** Node 22+ built-ins only. The installer is plain bash.
- **Tests first.** Every behaviour change comes with a test that failed before the change. Hooks are tested as child processes with real stdin payloads in temporary sandboxes — see `test/helpers.js`.
- **Both agents.** A change to a hook must keep working under Claude Code and Codex; their hook contracts are summarised in the README.
- **Honest docs.** The README states what was verified. If you add a claim, say how you checked it.

## Running the tests

```sh
npm test                    # all
node --test test/budget-stop.test.js   # one file
claude plugin validate . --strict      # plugin and marketplace manifests (needs the Claude Code CLI)
```

## Pull requests

- One topic per PR, with a short description of what changed and why.
- Commit messages use `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` prefixes.
- Bump `version` in `package.json` and `.claude-plugin/plugin.json` when a release is due; the tests check that they agree.

## Where to talk

Bugs and feature requests: GitHub issues (the templates ask for the agent, the version and a few log lines). Everything else: GitHub Discussions.
