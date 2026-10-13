'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'install', 'merge-settings.js');
const HOOKS_DIR = '/Users/me/.claude/hooks';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'merge-settings-'));
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function cli(dir, extra = []) {
  return run(['--settings', path.join(dir, 'settings.json'), '--hooks-dir', HOOKS_DIR, '--install-state', path.join(dir, 'install-state.json'), ...extra]);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('mergeSettings adds three hook groups and the output style, leaves other settings alone', () => {
  const { mergeSettings } = require('../install/merge-settings');
  const input = { model: 'fable', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node caveman.js' }] }] } };
  const out = mergeSettings(input, HOOKS_DIR);
  assert.equal(out.model, 'fable');
  assert.equal(out.outputStyle, 'verdict');
  assert.equal(out.hooks.SessionStart.length, 1);
  assert.deepEqual(out.hooks.UserPromptSubmit, [{ hooks: [{ type: 'command', command: `node "${HOOKS_DIR}/budget-prompt.js"`, timeout: 5 }] }]);
  assert.deepEqual(out.hooks.PostToolUse, [{ matcher: 'Write|apply_patch', hooks: [{ type: 'command', command: `node "${HOOKS_DIR}/budget-open.js"`, timeout: 5 }] }]);
  assert.deepEqual(out.hooks.Stop, [{ hooks: [{ type: 'command', command: `node "${HOOKS_DIR}/budget-stop.js"`, timeout: 5 }] }]);
  assert.notEqual(out, input);
  assert.equal(input.outputStyle, undefined);
});

test('mergeSettings is idempotent', () => {
  const { mergeSettings } = require('../install/merge-settings');
  const once = mergeSettings({}, HOOKS_DIR);
  const twice = mergeSettings(once, HOOKS_DIR);
  assert.deepEqual(twice, once);
  assert.equal(twice.hooks.Stop.length, 1);
});

test('removeSettings removes only our hooks and restores the previous output style', () => {
  const { mergeSettings, removeSettings } = require('../install/merge-settings');
  const foreign = { type: 'command', command: 'node other-stop.js' };
  const input = { outputStyle: 'Concise', hooks: { Stop: [{ hooks: [foreign] }], SessionStart: [{ hooks: [{ type: 'command', command: 'node caveman.js' }] }] } };
  const merged = mergeSettings(input, HOOKS_DIR);
  // Our Stop hook shares the event with a foreign group; put it into the same group to test precision.
  merged.hooks.Stop = [{ hooks: [foreign, ...merged.hooks.Stop[1].hooks] }];
  const removed = removeSettings(merged, HOOKS_DIR, 'Concise');
  assert.deepEqual(removed.hooks.Stop, [{ hooks: [foreign] }]);
  assert.equal(removed.hooks.UserPromptSubmit, undefined);
  assert.equal(removed.hooks.PostToolUse, undefined);
  assert.equal(removed.hooks.SessionStart.length, 1);
  assert.equal(removed.outputStyle, 'Concise');
});

test('removeSettings deletes outputStyle when there was none before and drops an empty hooks object', () => {
  const { mergeSettings, removeSettings } = require('../install/merge-settings');
  const removed = removeSettings(mergeSettings({}, HOOKS_DIR), HOOKS_DIR, undefined);
  assert.deepEqual(removed, {});
});

test('CLI: creates settings when missing, backs up before changing, second run is a no-op', (t) => {
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = cli(dir);
  assert.equal(first.status, 0, first.stderr);
  const settingsFile = path.join(dir, 'settings.json');
  assert.equal(readJson(settingsFile).outputStyle, 'verdict');
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.bak-')).length, 0);

  const before = fs.readFileSync(settingsFile, 'utf8');
  const second = cli(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /settings unchanged/);
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.bak-')).length, 0);
});

test('CLI: existing settings are backed up, previous outputStyle is remembered and restored on --uninstall', (t) => {
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settingsFile = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ outputStyle: 'Concise', permissions: { allow: ['Bash(ls)'] } }));
  assert.equal(cli(dir).status, 0);
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.bak-')).length, 1);
  assert.deepEqual(readJson(path.join(dir, 'install-state.json')), { previousOutputStyle: 'Concise' });
  assert.equal(readJson(settingsFile).outputStyle, 'verdict');
  assert.deepEqual(readJson(settingsFile).permissions, { allow: ['Bash(ls)'] });

  assert.equal(cli(dir, ['--uninstall']).status, 0);
  const after = readJson(settingsFile);
  assert.equal(after.outputStyle, 'Concise');
  assert.equal(after.hooks, undefined);
  assert.deepEqual(after.permissions, { allow: ['Bash(ls)'] });
  assert.deepEqual(readJson(path.join(dir, 'install-state.json')), {}, 'uninstall forgets the restored style');

  // A later cycle restores the style that was active at that install, not the first one.
  fs.writeFileSync(settingsFile, JSON.stringify({ ...after, outputStyle: 'Explanatory' }));
  assert.equal(cli(dir).status, 0);
  assert.equal(cli(dir, ['--uninstall']).status, 0);
  assert.equal(readJson(settingsFile).outputStyle, 'Explanatory');
});

test('CLI --target codex: hooks only, no outputStyle, no install state; uninstall leaves an empty object', (t) => {
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const hooksFile = path.join(dir, 'hooks.json');
  // No --install-state: Codex has nothing to remember between install and uninstall.
  const args = ['--target', 'codex', '--settings', hooksFile, '--hooks-dir', HOOKS_DIR];
  assert.equal(run(args).status, 0);
  const hooks = readJson(hooksFile);
  assert.equal(hooks.outputStyle, undefined);
  assert.deepEqual(Object.keys(hooks), ['hooks']);
  assert.deepEqual(Object.keys(hooks.hooks), ['UserPromptSubmit', 'PostToolUse', 'Stop']);
  assert.equal(hooks.hooks.PostToolUse[0].matcher, 'Write|apply_patch');
  assert.equal(fs.existsSync(path.join(dir, 'install-state.json')), false);
  const before = fs.readFileSync(hooksFile, 'utf8');
  assert.match(run(args).stdout, /settings unchanged/);
  assert.equal(fs.readFileSync(hooksFile, 'utf8'), before);
  assert.equal(run([...args, '--uninstall']).status, 0);
  assert.deepEqual(readJson(hooksFile), {});
});

test('CLI: an unknown --target exits 1', () => {
  const result = run(['--target', 'cursor', '--settings', '/tmp/x.json', '--hooks-dir', HOOKS_DIR, '--install-state', '/tmp/y.json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /merge-settings: /);
});

test('CLI: missing arguments exit 1 with a usage message', () => {
  const result = run(['--settings', '/tmp/x.json']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /merge-settings: /);
});
