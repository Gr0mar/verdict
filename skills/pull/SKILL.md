---
name: pull
description: Sync the repository you are standing in — fast-forward pull of the current branch, dependency install when the lockfile changed, API client regeneration when the project has a generate-api script — and report what changed. Usage: /pull [what you expect from the backend]
disable-model-invocation: true
---

Bring the repository I am standing in up to date and ready to work on. Only this repository — the one that contains the current working directory.

What I expect from the backend (optional): $ARGUMENTS

Steps — summarize each in one sentence; on an error stop and say what happened:
1. Repository root: `git rev-parse --show-toplevel` from the cwd. If the cwd is not inside a repository, ask which one I mean.
2. `git status --porcelain`: clean tree → `git fetch origin && git pull --ff-only`; dirty tree, or a pull that is not a fast-forward → skip the pull and say why. Never stash, reset or check out another branch. Report the branch and the pulled range (`git log --oneline ORIG_HEAD..HEAD`).
3. If the pull changed a lockfile (`git diff --name-only ORIG_HEAD..HEAD` lists `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `uv.lock`, `poetry.lock`, `go.sum`, …), run the matching install in that lockfile's directory (`pnpm install`, `yarn install`, `npm ci`, `uv sync`, `poetry install`, `go mod download`).
4. If the nearest `package.json` above the cwd has a `generate-api` script, run it with the package manager the lockfile implies (`pnpm run generate-api`, `yarn generate-api`, `npm run generate-api`) and show `git diff --stat` of the generated files — that is what changed in the API. When the generator reads its spec from another repository (for example a backend checkout), report that repository's branch and commit and say that this command did not pull it.
5. If I wrote what I expect from the backend, compare it with the generated API and with the places in the frontend that wait for the backend (TODO/FIXME around API calls, mock data, hand-written types). Never edit generated files — they are read-only.

Output: verdict (up to date / what did not work), what was pulled, what changed in the API, what the frontend still lacks and a draft ticket for the backend when something is missing. Full content to a file under ~/claude-out, only the verdict in the terminal.
