---
name: fresh
description: Fresh-eyes review of the work done in this session or of a named scope. Reports weak spots, unclear parts and unfinished pieces by severity with file:line, and changes nothing.
argument-hint: "[scope]"
disable-model-invocation: true
allowed-tools: Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git show *)
---

Look at this again with fresh eyes and tell me where it is weak: unclear parts, unfinished pieces, anything that is not strong enough. Review only: change no project file and fix nothing; the only thing you write is the report.

Scope: $ARGUMENTS

When the line above is empty, or still shows the placeholder, take the scope from my message; when my message names none, take the work done in this session: whatever changed — code, configuration, docs, migrations — staged, unstaged or untracked (`git status --short`, `git diff HEAD`, and read every `??` file the status lists) plus the commits made in this session (you know which; `git log --oneline -20` lists them) and the latest decisions. If nothing changed, ask what to review instead of inventing a scope.

Method:
- Re-read the files, not your memory of them, and form your own view before comparing it with what the session concluded.
- Look especially for missing states (empty, error, loading — or their equivalents outside a UI), inconsistencies between files, loose ends, and places where text or behaviour promises more than the code does.
- Check a suspected defect against the code path before reporting it; when the project's tests are cheap, run them. Report what you verified, not what you suspect.
- Stay inside the scope. Anything worth changing outside it gets at most one line under "Out of scope" at the end.

Severity — every finding carries its tier:
- Critical — broken behaviour, data loss, a security hole.
- Important — a missing state, an inconsistency, a promise the code does not keep.
- Minor — naming, style, small clean-ups.

Output: the full review goes to the report file `~/claude-out/<project>/<YYYY-MM-DD>-<slug>.md`, written with the file-writing tool (Write in Claude Code, apply_patch in Codex) so it opens by itself; the terminal gets the verdict and the most severe points. In the file: the verdict first — one sentence: ready, fix first, or rethink; then "Checked:" — the files or areas you actually read; then the findings ordered by severity, each with `file:line` (or the document and section when the scope is not code) and one sentence on what to do; "Out of scope" last. No praise and no list of what is fine.
