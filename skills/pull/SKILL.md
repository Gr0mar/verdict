---
name: pull
description: Sync the repository you are standing in — fast-forward pull of the current branch, dependency install when the lockfile changed, code generation when the project has a generator script — and report what changed. Usage: /pull [what you expect to have landed]
disable-model-invocation: true
---

Bring the repository I am standing in up to date and ready to work on. Only this repository — the one that contains the current working directory.

What I expect to have landed (optional): $ARGUMENTS

Steps — summarize each in one sentence; on an error stop and say what happened:
1. Repository root: `git rev-parse --show-toplevel` from the cwd. If the cwd is not inside a repository, ask which one I mean.
2. `git status --porcelain`: clean tree → `git fetch origin && git pull --ff-only`; a dirty tree, a branch without an upstream, or a pull that is not a fast-forward → skip the pull and say why. Never stash, reset or check out another branch. Report the branch and the pulled range (`git log --oneline ORIG_HEAD..HEAD`).
3. If the pull changed a lockfile (`git diff --name-only ORIG_HEAD..HEAD` lists `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`, `go.sum`, …), run the matching install in that lockfile's directory (`pnpm install`, `yarn install`, `npm ci`, `uv sync`, `poetry install`, `go mod download`). If it changed `.gitmodules` or a submodule pointer, run `git submodule update --init`.
4. If the nearest `package.json` above the cwd has a generator script — one of `generate-api`, `generate:api`, `api:generate`, `codegen` — run it with the package manager the lockfile implies and show `git diff --stat` of the generated files: that is what changed in the generated code. Never run a generic `generate`, `build` or `prepare` script for this. When the generator reads its input from another repository (for example a backend checkout), report that repository's branch and commit and say that this command did not pull it.
5. If I wrote what I expect to have landed, compare it with what arrived: the pulled commits, the generated code, and the places that wait for it (TODO/FIXME, mock data, hand-written types). Never edit generated files — they are read-only.

Output: the verdict (up to date / what did not work), what was pulled, what changed in generated code, what is still missing, and a short note for whoever owns the missing piece. Full content to a file under ~/claude-out, only the verdict in the terminal.
