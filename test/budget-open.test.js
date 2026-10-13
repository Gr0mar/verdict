'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, writeConfig, runHook, readState, cleanup } = require('./helpers');

const HOOK = 'budget-open.js';
// Arguments the default open command passes before the file path: `open -a Cursor` on macOS, bare `xdg-open` elsewhere.
const DEFAULT_ARGS = process.platform === 'darwin' ? ['-a', 'Cursor'] : [];

function writeEvent(filePath, toolName = 'Write', sessionId = 'sess-1') {
  return { session_id: sessionId, hook_event_name: 'PostToolUse', tool_name: toolName, tool_input: { file_path: filePath, content: '# x' }, tool_response: {} };
}

function createFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '# doc\n');
  return filePath;
}

function openCalls(sandbox) {
  if (!fs.existsSync(sandbox.openLog)) return [];
  return fs.readFileSync(sandbox.openLog, 'utf8').trim().split('\n');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The hook starts the opener detached and exits without waiting for it, so the stub's
// log may appear a moment after runHook returns.
function waitForOpenCalls(sandbox, count, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const calls = openCalls(sandbox);
    if (calls.length >= count) return calls;
    sleep(20);
  }
  return openCalls(sandbox);
}

function assertNotOpened(sandbox) {
  sleep(150);
  assert.deepEqual(openCalls(sandbox), []);
}

test('a Markdown file under outDir is recorded and opened with the open command', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const file = createFile(path.join(sandbox.outDir, 'my-app', '2026-10-13-review.md'));
  const result = runHook(HOOK, writeEvent(file), sandbox);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(file)]);
  assert.deepEqual(waitForOpenCalls(sandbox, DEFAULT_ARGS.length + 1), [...DEFAULT_ARGS, fs.realpathSync(file)]);
});

test('openApp from config is used', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { openApp: 'Marked 2' });
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  runHook(HOOK, writeEvent(file), sandbox);
  const expected = process.platform === 'darwin' ? ['-a', 'Marked 2', fs.realpathSync(file)] : [fs.realpathSync(file)];
  assert.deepEqual(waitForOpenCalls(sandbox, expected.length), expected);
});

test('openCommand from config replaces the default entirely; the file path is appended', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { openCommand: ['code', '--reuse-window'] });
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  // VERDICT_OPEN_CMD swaps the executable for the stub; the remaining arguments stay.
  runHook(HOOK, writeEvent(file), sandbox);
  assert.deepEqual(waitForOpenCalls(sandbox, 2), ['--reuse-window', fs.realpathSync(file)]);
});

test('the hook does not wait for an opener that stays in the foreground', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const slowOpener = path.join(sandbox.root, 'slow-open.sh');
  fs.writeFileSync(slowOpener, `#!/bin/sh\nprintf '%s\\n' "$@" >> "${sandbox.openLog}"\nsleep 5\n`, { mode: 0o755 });
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  const started = Date.now();
  const result = runHook(HOOK, writeEvent(file), sandbox, { VERDICT_OPEN_CMD: slowOpener });
  assert.equal(result.status, 0);
  assert.ok(Date.now() - started < 2000, 'hook returned before the opener finished');
  assert.deepEqual(waitForOpenCalls(sandbox, DEFAULT_ARGS.length + 1), [...DEFAULT_ARGS, fs.realpathSync(file)]);
});

test('existing state is preserved, paths are not duplicated', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  fs.mkdirSync(sandbox.stateDir, { recursive: true });
  fs.writeFileSync(path.join(sandbox.stateDir, 'sess-1.json'), JSON.stringify({ prompt: 'udelej code review', detail: false, written: [] }));
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  runHook(HOOK, writeEvent(file), sandbox);
  runHook(HOOK, writeEvent(file), sandbox);
  assert.deepEqual(readState(sandbox, 'sess-1'), { prompt: 'udelej code review', detail: false, written: [fs.realpathSync(file)] });
});

test('files outside outDir are ignored', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const file = createFile(path.join(sandbox.root, 'elsewhere', 'a.md'));
  runHook(HOOK, writeEvent(file), sandbox);
  assert.equal(fs.existsSync(sandbox.stateDir), false);
  assertNotOpened(sandbox);
});

test('a symlink inside outDir that resolves outside is rejected', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const target = createFile(path.join(sandbox.root, 'secret', 'notes.md'));
  const link = path.join(sandbox.outDir, 'p', 'notes.md');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link);
  runHook(HOOK, writeEvent(link), sandbox);
  assert.equal(fs.existsSync(sandbox.stateDir), false);
  assertNotOpened(sandbox);
});

test('non-Write tools and non-Markdown files are ignored', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const md = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  runHook(HOOK, writeEvent(md, 'Edit'), sandbox);
  const txt = createFile(path.join(sandbox.outDir, 'p', 'a.txt'));
  runHook(HOOK, writeEvent(txt), sandbox);
  assert.equal(fs.existsSync(sandbox.stateDir), false);
  assertNotOpened(sandbox);
});

test('a missing open command is reported on stderr with the command that ran; state is still recorded; exit 0', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  const missing = path.join(sandbox.root, 'missing-open');
  const result = runHook(HOOK, writeEvent(file), sandbox, { VERDICT_OPEN_CMD: missing });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`budget-open: could not open ${fs.realpathSync(file)} with ${missing}`), result.stderr);
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(file)]);
});

function patchEvent(command, cwd, sessionId = 'sess-1') {
  return { session_id: sessionId, hook_event_name: 'PostToolUse', cwd, tool_name: 'apply_patch', tool_input: { command }, tool_response: {} };
}

test('Codex apply_patch: files added or updated under outDir are recorded and opened, relative to cwd', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const added = createFile(path.join(sandbox.outDir, 'my-app', '2026-10-13-review.md'));
  const updated = createFile(path.join(sandbox.outDir, 'my-app', '2026-10-13-plan.md'));
  const command = [
    '*** Begin Patch',
    '*** Add File: claude-out/my-app/2026-10-13-review.md',
    '+# Review',
    '*** Update File: claude-out/my-app/2026-10-13-plan.md',
    '@@',
    '+more',
    '*** Delete File: claude-out/my-app/old.md',
    '*** End Patch',
  ].join('\n');
  const result = runHook(HOOK, patchEvent(command, sandbox.root), sandbox);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(added), fs.realpathSync(updated)]);
  // Two detached openers; their log lines may interleave, so compare as multisets.
  const calls = waitForOpenCalls(sandbox, 2 * (DEFAULT_ARGS.length + 1));
  assert.deepEqual([...calls].sort(), [...DEFAULT_ARGS, fs.realpathSync(added), ...DEFAULT_ARGS, fs.realpathSync(updated)].sort());
});

test('Codex apply_patch: absolute paths work, files outside outDir and non-Markdown files are ignored', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const inside = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  createFile(path.join(sandbox.root, 'src', 'index.ts'));
  createFile(path.join(sandbox.outDir, 'p', 'notes.txt'));
  const command = `*** Begin Patch\n*** Update File: ${inside}\n@@\n+x\n*** Update File: src/index.ts\n@@\n+y\n*** Add File: claude-out/p/notes.txt\n+z\n*** End Patch`;
  runHook(HOOK, patchEvent(command, sandbox.root), sandbox);
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(inside)]);
  assert.deepEqual(waitForOpenCalls(sandbox, DEFAULT_ARGS.length + 1), [...DEFAULT_ARGS, fs.realpathSync(inside)]);
});

test('Codex apply_patch: relative paths need a cwd, absolute paths do not; a non-string command is ignored', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const file = createFile(path.join(sandbox.outDir, 'p', 'a.md'));
  runHook(HOOK, patchEvent('*** Begin Patch\n*** Add File: claude-out/p/a.md\n+x\n*** End Patch', undefined), sandbox);
  runHook(HOOK, patchEvent({ not: 'a string' }, sandbox.root), sandbox);
  assert.equal(fs.existsSync(sandbox.stateDir), false);
  assertNotOpened(sandbox);
  runHook(HOOK, patchEvent(`*** Begin Patch\n*** Update File: ${file}\n@@\n+x\n*** End Patch`, undefined), sandbox);
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(file)]);
});

test('Codex apply_patch: a rename into outDir and indented headers are detected', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const moved = createFile(path.join(sandbox.outDir, 'p', 'moved.md'));
  const added = createFile(path.join(sandbox.outDir, 'p', 'added.md'));
  const command = `*** Begin Patch\n*** Update File: notes/draft.md\n*** Move to: claude-out/p/moved.md\n@@\n+x\n   *** Add File: claude-out/p/added.md\n+y\n*** End Patch`;
  runHook(HOOK, patchEvent(command, sandbox.root), sandbox);
  assert.deepEqual(readState(sandbox, 'sess-1').written, [fs.realpathSync(moved), fs.realpathSync(added)]);
});

test('malformed stdin or missing tool_input: exit 0, no stdout', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  assert.deepEqual(runHook(HOOK, '{ nope', sandbox).status, 0);
  const result = runHook(HOOK, { session_id: 'sess-1', tool_name: 'Write' }, sandbox);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});
