'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, writeConfig, runHook, readLog, cleanup } = require('./helpers');

const HOOK = 'budget-stop.js';

function seedState(sandbox, state, sessionId = 'sess-1') {
  fs.mkdirSync(sandbox.stateDir, { recursive: true });
  fs.writeFileSync(path.join(sandbox.stateDir, `${sessionId}.json`), JSON.stringify({ prompt: '', detail: false, written: [], ...state }));
}

function stop(sandbox, message, extra = {}) {
  return runHook(HOOK, { session_id: 'sess-1', hook_event_name: 'Stop', cwd: '/Users/me/Desktop/my-app', stop_hook_active: false, last_assistant_message: message, ...extra }, sandbox);
}

const SHORT = 'Hotovo.\n- a\n- b';
const LONG_LINES = Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n');
const LONG_CHARS = 'x'.repeat(901);

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('within budget: no stdout, logged as allow', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const result = stop(sandbox, SHORT);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  const [entry] = readLog(sandbox);
  assert.equal(entry.decision, 'allow');
  assert.equal(entry.lines, 3);
  assert.equal(entry.chars, SHORT.length);
  assert.equal(entry.session_id, 'sess-1');
  assert.equal(entry.cwd, '/Users/me/Desktop/my-app');
  assert.deepEqual(entry.written, []);
  assert.equal(entry.detail, false);
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test('too many lines without a file: block_no_file with a concrete target path', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const result = stop(sandbox, LONG_LINES);
  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /^Terminal budget: the reply has 13 lines \/ \d+ characters \(limit 12 \/ 900\)\./);
  assert.ok(out.reason.includes(path.join(sandbox.outDir, 'my-app', `${today()}-<slug>.md`)), out.reason);
  assert.match(out.reason, /verdict or question first, up to 3 bullets, the file path \(<slug>: 2–5 kebab-case words without diacritics\)\.$/);
  assert.equal(readLog(sandbox)[0].decision, 'block_no_file');
});

test('too many characters on one line also blocks', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const out = JSON.parse(stop(sandbox, LONG_CHARS).stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /1 line \/ 901 characters/);
});

test('over budget with a file already written: block_shorten names the file', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const file = path.join(sandbox.outDir, 'my-app', '2026-10-13-review.md');
  seedState(sandbox, { written: [file] });
  const out = JSON.parse(stop(sandbox, LONG_LINES).stdout);
  assert.equal(out.decision, 'block');
  assert.equal(out.reason, `The file ${file} already exists. The terminal reply still has 13 lines / ${LONG_LINES.length} characters (limit 12 / 900). Shorten it: verdict, up to 3 bullets, the file path.`);
  const [entry] = readLog(sandbox);
  assert.equal(entry.decision, 'block_shorten');
  assert.deepEqual(entry.written, [file]);
});

test('stop_hook_active: never blocks again, logged as allow_after_block', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const result = stop(sandbox, LONG_LINES, { stop_hook_active: true });
  assert.equal(result.stdout, '');
  assert.equal(readLog(sandbox)[0].decision, 'allow_after_block');
});

test('detail requested: allow_detail', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, { detail: true });
  assert.equal(stop(sandbox, LONG_LINES).stdout, '');
  assert.equal(readLog(sandbox)[0].decision, 'allow_detail');
});

test('empty or missing message: allow_empty', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  assert.equal(stop(sandbox, '').stdout, '');
  assert.equal(stop(sandbox, undefined).stdout, '');
  assert.deepEqual(readLog(sandbox).map((e) => e.decision), ['allow_empty', 'allow_empty']);
});

test('no state for the session: allow without blocking', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  assert.equal(stop(sandbox, LONG_LINES).stdout, '');
  assert.equal(readLog(sandbox)[0].decision, 'allow');
});

test('boundary: exactly 12 lines and 900 chars passes; trailing blank lines never count', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const twelve = Array.from({ length: 12 }, () => 'y'.repeat(74)).join('\n');
  assert.equal(twelve.length, 12 * 74 + 11);
  assert.equal(stop(sandbox, twelve).stdout, '');
  assert.equal(stop(sandbox, `${twelve}\n\n\n`).stdout, '');
  assert.equal(stop(sandbox, 'z'.repeat(900)).stdout, '');
  assert.deepEqual(readLog(sandbox).map((e) => e.decision), ['allow', 'allow', 'allow']);
});

test('custom limits from config are respected', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { maxLines: 20, maxChars: 2000 });
  seedState(sandbox, {});
  assert.equal(stop(sandbox, LONG_LINES).stdout, '');
  const out = JSON.parse(stop(sandbox, Array.from({ length: 21 }, () => 'l').join('\n')).stdout);
  assert.match(out.reason, /limit 20 \/ 2000/);
});

test('missing cwd falls back to a "misc" project directory', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  seedState(sandbox, {});
  const out = JSON.parse(stop(sandbox, LONG_LINES, { cwd: undefined }).stdout);
  assert.ok(out.reason.includes(path.join(sandbox.outDir, 'misc', `${today()}-<slug>.md`)), out.reason);
});

test('malformed stdin: exit 0, no stdout, no log', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const result = runHook(HOOK, '{ nope', sandbox);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readLog(sandbox), []);
});
