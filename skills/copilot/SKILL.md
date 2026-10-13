---
name: copilot
description: Process GitHub Copilot review comments on the current PR — apply the justified ones, answer the rest, resolve the threads once I approve. Usage: /copilot
disable-model-invocation: true
---

Go through Copilot's review of the current PR and deal with it.

Steps:
1. Find the PR of the current branch: `gh pr view --json number,url,headRefName`.
2. Load the review comments: `gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate`, keeping those whose `user.login` is `Copilot` (compare ignoring case — inline comments are authored by the `Copilot` bot account).
3. Judge each comment against the current code, not against the diff quoted in the comment. Justified: fix the code. Not justified: draft a one-sentence reply saying why.
4. Run the project's tests and lint. Do not commit or push. List what changed and the drafted replies, then wait for approval.
5. After approval: post the replies (`gh api repos/{owner}/{repo}/pulls/<number>/comments/<id>/replies -f body=...`) and mark every handled thread as resolved with the GraphQL mutation `resolveReviewThread(input: {threadId})`; thread ids come from `pullRequest.reviewThreads`.

Terminal output: verdict, the number of applied / declined comments, and the path of the file with the details under ~/claude-out.
