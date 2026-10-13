'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Minimal frontmatter reader: "key: value" lines between the first two --- markers.
function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(match, `${file} has no frontmatter`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { fields, body: match[2] };
}

test('verdict output style: frontmatter and the budget rule', () => {
  const { fields, body } = frontmatter(path.join(ROOT, 'output-styles', 'verdict.md'));
  assert.equal(fields.name, 'verdict');
  assert.equal(fields['keep-coding-instructions'], 'true');
  assert.ok(fields.description.length > 0);
  assert.match(body, /12 lines/);
  assert.match(body, /900 characters/);
  assert.match(body, /~\/claude-out\/<project>\/<YYYY-MM-DD>-<slug>\.md/);
  assert.match(body, /as a Markdown file/);
  assert.doesNotMatch(body, /Write tool/, 'the rule names no agent-specific tool: Codex writes through apply_patch');
});

test('skills: frontmatter name matches the directory, bodies carry the owner wording', () => {
  const expectations = {
    fresh: { argument: true, phrase: 'fresh eyes' },
    copilot: { argument: false, phrase: 'Copilot' },
    pull: { argument: true, phrase: 'generate-api' },
  };
  for (const [name, expected] of Object.entries(expectations)) {
    const { fields, body } = frontmatter(path.join(ROOT, 'skills', name, 'SKILL.md'));
    assert.equal(fields.name, name);
    assert.ok(fields.description.length > 0, `${name}: description`);
    assert.equal(fields['disable-model-invocation'], 'true', `${name}: user-invoked only`);
    assert.equal(body.includes('$ARGUMENTS'), expected.argument, `${name}: $ARGUMENTS`);
    assert.ok(body.includes(expected.phrase), `${name}: phrase "${expected.phrase}"`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'skills', 'odstup')), false, 'old odstup skill removed');
  assert.equal(fs.existsSync(path.join(ROOT, 'skills', 'pullnul')), false, 'old pullnul skill removed');
});

test('/pull is generic: only the cwd repository, clean tree, fast-forward only, deps by lockfile, no internal tooling', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'pull', 'SKILL.md'));
  assert.match(body, /Only this repository/);
  assert.match(body, /git rev-parse --show-toplevel/);
  assert.match(body, /git status --porcelain/);
  assert.match(body, /pull --ff-only/);
  assert.match(body, /Never stash, reset or check out another branch/);
  assert.match(body, /pnpm install/);
  assert.match(body, /Never edit generated files/);
});

test('nothing shipped names a machine-specific path or a specific editor', () => {
  const files = ['output-styles/verdict.md', 'skills/fresh/SKILL.md', 'skills/copilot/SKILL.md', 'skills/pull/SKILL.md'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /\/Users\/|\/home\/|~\/Desktop/, `${file}: machine-specific path`);
  }
  const style = fs.readFileSync(path.join(ROOT, 'output-styles', 'verdict.md'), 'utf8');
  assert.doesNotMatch(style, /Cursor|VS Code/, 'the editor is configuration, not part of the rule');
});

test('/copilot matches the Copilot login ignoring case and resolves threads only after approval', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'copilot', 'SKILL.md'));
  assert.match(body, /ignoring case/);
  const approval = body.indexOf('wait for approval');
  const resolve = body.indexOf('resolveReviewThread');
  assert.ok(approval > -1 && resolve > approval, 'threads are resolved after the approval step');
});
