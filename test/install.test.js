'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INSTALL = path.join(ROOT, 'install.sh');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
  return { root, claudeDir: path.join(root, 'claude'), configDir: path.join(root, 'config') };
}

function run(box, args = []) {
  return spawnSync('bash', [INSTALL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: box.claudeDir, VERDICT_CONFIG_DIR: box.configDir },
  });
}

const LINKS = [
  ['hooks/budget-config.js', 'hooks/budget-config.js'],
  ['hooks/budget-prompt.js', 'hooks/budget-prompt.js'],
  ['hooks/budget-open.js', 'hooks/budget-open.js'],
  ['hooks/budget-stop.js', 'hooks/budget-stop.js'],
  ['output-styles/verdict.md', 'output-styles/verdict.md'],
  ['skills/fresh', 'skills/fresh'],
  ['skills/copilot', 'skills/copilot'],
  ['skills/pull', 'skills/pull'],
];

test('install links every file, registers hooks, is idempotent, uninstall removes all of it', (t) => {
  const box = sandbox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));

  const first = run(box);
  assert.equal(first.status, 0, first.stderr);
  for (const [source, target] of LINKS) {
    const link = path.join(box.claudeDir, target);
    assert.ok(fs.lstatSync(link).isSymbolicLink(), `${target} is a symlink`);
    assert.equal(fs.readlinkSync(link), path.join(ROOT, source));
  }
  const settings = JSON.parse(fs.readFileSync(path.join(box.claudeDir, 'settings.json'), 'utf8'));
  assert.equal(settings.outputStyle, 'verdict');
  assert.equal(settings.hooks.Stop[0].hooks[0].command, `node "${path.join(box.claudeDir, 'hooks', 'budget-stop.js')}"`);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Write');
  assert.match(first.stdout, /Restart Claude Code/);

  const second = run(box);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /settings unchanged/);

  const removed = run(box, ['--uninstall']);
  assert.equal(removed.status, 0, removed.stderr);
  for (const [, target] of LINKS) {
    assert.equal(fs.existsSync(path.join(box.claudeDir, target)), false, `${target} removed`);
  }
  const after = JSON.parse(fs.readFileSync(path.join(box.claudeDir, 'settings.json'), 'utf8'));
  assert.equal(after.hooks, undefined);
  assert.equal(after.outputStyle, undefined);
});

test('install refuses to replace a real file at a target path', (t) => {
  const box = sandbox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(box.claudeDir, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(box.claudeDir, 'hooks', 'budget-stop.js'), '// someone else');
  const result = run(box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing: .*budget-stop\.js exists and is not a symlink/);
  assert.equal(fs.readFileSync(path.join(box.claudeDir, 'hooks', 'budget-stop.js'), 'utf8'), '// someone else');
  assert.equal(fs.existsSync(path.join(box.claudeDir, 'settings.json')), false);
});

test('unknown argument prints usage and exits 1', (t) => {
  const box = sandbox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  const result = run(box, ['--bogus']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:/);
});
