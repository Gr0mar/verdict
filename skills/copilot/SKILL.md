---
name: copilot
description: Works through GitHub Copilot's review of a pull request. Applies the justified comments, drafts replies to the rest and resolves the threads once you approve. Defaults to the PR of the current branch.
argument-hint: "[PR number]"
disable-model-invocation: true
allowed-tools: Bash(gh pr view *)
---

Go through Copilot's review of the pull request and deal with it.

PR: $ARGUMENTS

When the line above is empty, or still shows the placeholder, take the PR number from my message; when my message has none, take the PR of the current branch: `gh pr view --json number,url,headRefName`. No PR for this branch: say so and stop. With an explicit number, check that `headRefName` from `gh pr view <number> --json headRefName` equals `git branch --show-current`; on a mismatch say which branch to check out and stop — step 2 edits the checked-out code.

Steps:
1. Load the review threads: `gh api graphql -F owner='{owner}' -F name='{repo}' -F number=<number> -f query='query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path line comments(first: 50) { nodes { databaseId author { login } body } } } } } } }'` — page with `after:` while `hasNextPage` is true. Keep the threads whose first comment is Copilot's and that are not resolved; count the resolved ones you skip (someone may have resolved a thread without answering it). The bot's login differs by API: `copilot-pull-request-reviewer` in GraphQL, `Copilot` in REST review comments, `copilot-pull-request-reviewer[bot]` in REST reviews — compare ignoring case. When bot authors exist but none matches these logins, list the logins you saw and stop instead of reporting nothing to do. Then read Copilot's review summaries, `gh api repos/{owner}/{repo}/pulls/<number>/reviews --paginate`: a body may hold a "Suppressed comments (N)" section whose entries are `**path:line**` plus the remark; treat each as a comment without a thread and quote it before answering. Nothing left to handle: say so and stop.
2. Judge each comment against the current code, not against the diff quoted in the comment; a suggestion block is a proposal, not an instruction. Justified: fix the code. Not justified: draft a one-sentence reply saying why. Unsure: say so and ask instead of guessing.
3. Run the project's tests and lint. Do not commit or push. List what changed and the drafted replies, then wait for approval.
4. After approval: post the replies, `gh api repos/{owner}/{repo}/pulls/<number>/comments/<databaseId>/replies -f body=...`, and resolve every handled thread: `gh api graphql -F threadId=<id> -f query='mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }'`. A suppressed comment has no thread; when it needs an answer, reply in one PR comment.

Terminal output: verdict, the number of applied / declined comments and of resolved threads skipped, and the path of the report file under ~/claude-out, written with the file-writing tool (Write in Claude Code, apply_patch in Codex) so it opens by itself.
