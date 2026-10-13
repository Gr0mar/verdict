---
name: copilot
description: Works through GitHub Copilot's review of a pull request. Applies the justified comments, drafts replies to the rest and, once you approve, pushes the fixes and resolves the threads. Defaults to the PR of the current branch.
argument-hint: "[PR number]"
disable-model-invocation: true
allowed-tools: Bash(gh pr view *) Bash(git branch --show-current) Bash(git rev-parse *)
---

Go through Copilot's review of the pull request and deal with it.

PR: $ARGUMENTS

When the line above is empty, or still shows the placeholder, take the PR number from my message; when my message has none, take the PR of the current branch: `gh pr view --json number,url,headRefName,headRefOid`. No PR for this branch: say so and stop. The checked-out code must be the PR head: `git branch --show-current` equals `headRefName` and `git rev-parse HEAD` equals `headRefOid`; otherwise say which branch to check out or pull and stop — step 2 edits the checked-out code.

Steps:
1. Load the review threads, paged by gh itself: `gh api graphql --paginate -F owner='{owner}' -F name='{repo}' -F number=<number> -f query='query($owner: String!, $name: String!, $number: Int!, $endCursor: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100, after: $endCursor) { pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { databaseId author { login __typename } body } } } } } } }'`. Keep the threads whose first comment is Copilot's and that are not resolved; count the resolved ones you skip. An outdated thread has `line: null` — judge it at `originalLine` against the current code. The bot's login differs by API: `copilot-pull-request-reviewer` in GraphQL, `Copilot` in REST review comments, `copilot-pull-request-reviewer[bot]` in REST reviews — compare ignoring case. If nothing matches but a `Bot` author's login contains `copilot`, list the logins you saw and stop; other bots do not matter. Then read Copilot's latest review, `gh api repos/{owner}/{repo}/pulls/<number>/reviews --paginate`: its body may hold a "Suppressed comments (N)" section (older reviews: "Comments suppressed due to low confidence (N)") with `**path:line**` entries; treat each as a comment without a thread, quote it before answering, and skip one that a PR comment already quotes. Nothing left to handle: say so and stop.
2. Judge each comment against the current code, not against the diff quoted in the comment; a suggestion block is a proposal, not an instruction. Justified: fix the code. Not justified: draft a one-sentence reply saying why. Unsure: say so and ask instead of guessing.
3. Run the project's tests and lint; a failure goes into the report as it is, not as "ready". Do not commit or push yet. List what changed, the drafted replies and the commit message, then wait for approval.
4. After approval: commit the fixes on the PR branch and push; reply to every handled thread, `gh api repos/{owner}/{repo}/pulls/<number>/comments/<databaseId>/replies -f body=...`, with "Fixed in <short sha>" or the reason it was declined; then resolve each: `gh api graphql -F threadId=<id> -f query='mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } } }'`. Suppressed comments that need an answer get one PR comment quoting them: `gh pr comment <number> --body ...`.

Terminal output: verdict, the counts of applied / declined / asked comments and of resolved threads skipped, and the path of the report file under ~/claude-out, written with the file-writing tool (Write in Claude Code, apply_patch in Codex) so it opens by itself.
