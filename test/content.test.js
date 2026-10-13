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
  assert.match(body, /Claude Code: the Write tool; Codex: apply_patch/, 'the rule names the writes the hook can see');
  assert.match(body, /not a shell command/);
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

test('skills: Codex metadata keeps every skill user-invoked only', () => {
  for (const name of ['fresh', 'copilot', 'pull']) {
    const meta = fs.readFileSync(path.join(ROOT, 'skills', name, 'agents', 'openai.yaml'), 'utf8');
    assert.match(meta, /allow_implicit_invocation:\s*false/, `${name}: Codex must not start this skill on its own`);
  }
});

test('/pull is generic: only the cwd repository, clean tree, fast-forward only, deps by lockfile, no internal tooling', () => {
  const { fields, body } = frontmatter(path.join(ROOT, 'skills', 'pull', 'SKILL.md'));
  assert.match(body, /Only this repository/);
  assert.match(body, /git rev-parse --show-toplevel/);
  assert.match(body, /git status --porcelain/);
  assert.match(body, /pull --ff-only/);
  assert.match(body, /without an upstream/);
  assert.match(body, /Never stash, reset or check out another branch/);
  assert.match(body, /pnpm install/);
  assert.match(body, /git submodule update --init/);
  assert.match(body, /`generate-api`, `generate:api`, `api:generate`, `codegen`/, 'only clearly named generator scripts run');
  assert.match(body, /Never run a generic `generate`, `build` or `prepare` script/);
  assert.match(body, /Never edit generated files/);
  assert.match(body, /What I expect to have landed/);
  assert.doesNotMatch(`${fields.description}\n${body}`, /from the backend/, 'no frontend\/backend assumption');
});

test('/fresh defines severity, lists what was checked and stays in scope', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'fresh', 'SKILL.md'));
  assert.match(body, /Critical — /);
  assert.match(body, /Important — /);
  assert.match(body, /Minor — /);
  assert.match(body, /"Checked:"/);
  assert.match(body, /"Out of scope"/);
  assert.match(body, /code, configuration, docs, migrations/);
});

test('community files exist and the issue templates ask which agent is affected', () => {
  for (const file of ['CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/config.yml']) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
  for (const form of ['bug.yml', 'feature.yml']) {
    const text = fs.readFileSync(path.join(ROOT, '.github', 'ISSUE_TEMPLATE', form), 'utf8');
    assert.match(text, /Claude Code/);
    assert.match(text, /Codex/);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), /## Contributing/);
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

test('plugin manifests: one repo is the plugin and its own marketplace, versions agree', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'verdict');
  assert.equal(plugin.version, pkg.version);
  assert.ok(plugin.description.length > 0);
  const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(marketplace.name, 'gr0mar');
  assert.equal(marketplace.owner.name, 'Gr0mar');
  // The entry carries no display fields of its own: plugin.json is the single source of truth.
  assert.deepEqual(marketplace.plugins, [{ name: 'verdict', source: './' }]);
});

test('plugin hooks.json: exactly what the installer registers, rooted at CLAUDE_PLUGIN_ROOT', () => {
  const { mergeHooks, HOOK_EVENTS } = require('../install/merge-settings');
  const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  assert.deepEqual(bundled, { hooks: mergeHooks({}, '${CLAUDE_PLUGIN_ROOT}/hooks').hooks });
  for (const { script } of HOOK_EVENTS) {
    assert.ok(fs.existsSync(path.join(ROOT, 'hooks', script)), `${script} exists`);
  }
});

test('verdict output style applies automatically when installed as a plugin', () => {
  const { fields } = frontmatter(path.join(ROOT, 'output-styles', 'verdict.md'));
  assert.equal(fields['force-for-plugin'], 'true');
});

test('/copilot matches the Copilot login ignoring case and resolves threads only after approval', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'copilot', 'SKILL.md'));
  assert.match(body, /ignoring case/);
  const approval = body.indexOf('wait for approval');
  const resolve = body.indexOf('resolveReviewThread');
  assert.ok(approval > -1 && resolve > approval, 'threads are resolved after the approval step');
});
