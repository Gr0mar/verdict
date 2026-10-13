---
name: fresh
description: Fresh-eyes review of recent work or a named scope — weak spots, unclear parts, unfinished pieces, anything not strong enough. Usage: /fresh [scope]
disable-model-invocation: true
---

Look at this again with fresh eyes and tell me where it is weak: unclear parts, unfinished pieces, anything that is not strong enough.

Scope: $ARGUMENTS

When the scope is empty, take the work done in this session: whatever changed — code, configuration, docs, migrations (`git diff`, `git status`) — and the latest decisions. Re-read the files, not your memory of them. Look especially for missing states (empty, error, loading), inconsistencies between files, loose ends, and places where text or behaviour promises more than the code does.

Severity:
- Critical — broken behaviour, data loss, a security hole.
- Important — a missing state, an inconsistency, a promise the code does not keep.
- Minor — naming, style, small clean-ups.

Stay inside the scope. Anything worth changing outside it gets at most one line under "Out of scope".

Output: the verdict first; then "Checked:" — the files or areas you actually read; then the findings ordered by severity, each with `file:line` and one sentence on what to do. No praise. Full content to a file under ~/claude-out, only the verdict and the most severe points in the terminal.
