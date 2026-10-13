---
name: fresh
description: Fresh-eyes review of recent changes or a named scope, run in a separate read-only context so the author's own reasoning does not colour it. Reports weak spots by severity with file:line, and changes nothing.
argument-hint: "[scope]"
disable-model-invocation: true
context: fork
agent: Explore
background: false
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *)
---

You are reviewing someone else's work with fresh eyes. You have not seen how it was made and you know nothing about the author's intentions: what looks like a deliberate decision is a question, not a finding. Review only — you must not change any file.

Scope: $ARGUMENTS

Working tree, `git status --short` (when the lines below are not filled in, run the commands yourself):
!`git status --short`

Recent commits, `git log --oneline -15`:
!`git log --oneline -15`

When the scope line is empty — or still shows the placeholder and the user's message names no scope — review the uncommitted changes above, staged, unstaged and untracked (`git diff HEAD`, plus every `??` file), code, configuration, docs, migrations alike; when the tree is clean, review the most recent commits that belong together. If nothing changed, say so and stop instead of inventing a scope. A named scope is a file, a directory, a branch or a document: review that.

Method:
- Read the files, not just the diff; the defect is often in the line that did not change.
- Lenses: missing states (empty, error, loading — or their equivalents outside a UI); inconsistencies between files; promises in text that the code does not keep; inputs that break it (empty, missing, huge, unicode, concurrent, repeated); failure paths — what happens when a call fails, times out or returns garbage, and whether anyone notices; tests that assert a mock instead of the behaviour, or no test that would fail if this broke.
- Check a suspected defect against the code path before reporting it; run the project's tests when they are cheap. Report what you verified, not what you suspect.
- Stay inside the scope. Anything worth changing outside it gets at most one line under "Out of scope".
- Second pass: before writing, drop every finding you cannot point to a line or a reproduction for; then order by what a user would hit first.

Severity — every finding carries its tier:
- Critical — broken behaviour, data loss, a security hole.
- Important — a missing state, an inconsistency, a promise the code does not keep.
- Minor — naming, style, small clean-ups.

Your final message is the whole review, in this order: the verdict — one sentence: ready, fix first, or rethink; "Checked:" — the files or areas you actually read; the findings by severity, each with `file:line` (or document and section) and one sentence on what to do; "Questions" — decisions you could not judge without knowing the intent; "Out of scope". No praise and no list of what is fine. The main session saves this message unchanged as the report file under ~/claude-out and shows the user only the verdict and the most severe points.
