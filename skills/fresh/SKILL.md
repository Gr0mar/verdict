---
name: fresh
description: Fresh-eyes review of recent work or a named scope — weak spots, unclear parts, unfinished pieces, anything not strong enough. Usage: /fresh [scope]
disable-model-invocation: true
---

Look at this again with fresh eyes and tell me where it is weak: unclear parts, unfinished pieces, anything that is not strong enough.

Scope: $ARGUMENTS

When the scope is empty, take the work done in this session: whatever changed — code, configuration, docs, migrations — staged or not (`git status`, `git diff HEAD`) plus the commits made in this session (`git log`), and the latest decisions. If nothing changed, ask what to review instead of inventing a scope. Re-read the files, not your memory of them. Look especially for missing states (empty, error, loading — or their equivalents outside a UI), inconsistencies between files, loose ends, and places where text or behaviour promises more than the code does.

Severity — every finding carries its tier:
- Critical — broken behaviour, data loss, a security hole.
- Important — a missing state, an inconsistency, a promise the code does not keep.
- Minor — naming, style, small clean-ups.

Stay inside the scope. Anything worth changing outside it gets at most one line under "Out of scope" at the end.

Output, in the file: the verdict first; then "Checked:" — the files or areas you actually read; then the findings ordered by severity, each with `file:line` (or the document and section when the scope is not code) and one sentence on what to do; "Out of scope" last. No praise. Full content to a file under ~/claude-out, only the verdict and the most severe points in the terminal.
