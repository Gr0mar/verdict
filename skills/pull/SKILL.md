---
name: pull
description: Brings the repository you are standing in up to date and reports what changed. Fast-forward pull of the current branch, dependency install when the lockfile changed, code generation when package.json has a generator script, and a comparison with what you expected to land.
argument-hint: "[what you expect to have landed]"
disable-model-invocation: true
allowed-tools: Bash(git rev-parse *) Bash(git status *) Bash(git pull --ff-only) Bash(git log *) Bash(git diff *) Bash(git submodule update --init)
---

Bring the repository I am standing in up to date and ready to work on. Only this repository — the one that contains the current working directory.

What I expect to have landed (optional): $ARGUMENTS

When the line above is empty, or still shows the placeholder, take the expectation from my message; when my message has none, I have no particular expectation.

Steps — summarize each in one sentence; on an error stop and say what happened:
1. Repository root: `git rev-parse --show-toplevel` from the cwd. If the cwd is not inside a repository, ask which one I mean. Record the starting commit, `git rev-parse HEAD`, and write that SHA literally into the commands below — shell variables do not survive from one command to the next.
2. Pull only when it is safe: the tree is clean (`git status --porcelain --untracked-files=no` prints nothing) and the branch has an upstream (`git rev-parse --abbrev-ref @{u}` succeeds). Then `git pull --ff-only` (it fetches by itself; the remote need not be called `origin`). A dirty tree, a branch without an upstream, or a pull that is not a fast-forward → skip the pull and say why. Never stash, reset or check out another branch. Report the branch and the pulled range: `git log --oneline <sha>..HEAD`.
3. If the pull changed a lockfile (`git diff --name-only <sha> HEAD` lists `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`, `go.sum`, …), run the matching install in that lockfile's directory (`pnpm install`, `yarn install`, `npm ci`, `uv sync`, `poetry install`, `go mod download`) — this runs the code that just arrived, as any install does. If it changed `.gitmodules` or a submodule pointer, run `git submodule update --init` unless a submodule has local changes; then say so instead.
4. If the pull brought commits and the nearest `package.json` between the cwd and the repository root from step 1 has a generator script — one of `generate-api`, `generate:api`, `api:generate`, `codegen` — run it with the package manager the lockfile implies. Never run a generic `generate`, `build` or `prepare` script for this. Report what changed in the generated code: `git diff --stat` when the output is tracked, otherwise what the generator printed. When the generator reads its input from another repository (for example a backend checkout), report that repository's branch and commit and say that this command did not pull it.
5. If I wrote what I expect to have landed, compare it with what arrived: the pulled commits, the generated code, and the places that wait for it (TODO/FIXME, mock data, hand-written types). Never edit generated files — they are read-only.

Output: the verdict (up to date / what did not work), what was pulled, what changed in generated code, what is still missing, and a short note for whoever owns the missing piece. Full content goes to the report file under ~/claude-out, written with the file-writing tool (Write in Claude Code, apply_patch in Codex) so it opens by itself; only the verdict in the terminal.
