'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeSandbox, runHook, readState, cleanup } = require('./helpers');

const HOOK = 'budget-prompt.js';

function submit(sandbox, prompt, sessionId = 'sess-1') {
  return runHook(HOOK, { session_id: sessionId, hook_event_name: 'UserPromptSubmit', prompt }, sandbox);
}

test('stores prompt, detail=false and empty written list; prints nothing', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const result = submit(sandbox, 'oprav ten bug v loginu');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(readState(sandbox, 'sess-1'), { prompt: 'oprav ten bug v loginu', detail: false, written: [] });
});

test('explicit requests for the full text lift the budget, with and without diacritics', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const prompts = [
    'rozveď to', 'rozved to podrobne', 'podrobně prosím',
    'napis mi ten kod', 'ukaž mi kód', 'ukaz mi prikaz', 'ukaž mi ten příkaz', 'dej mi skript',
    'vypis cely log', 'vypiš celé', 'dej mi celé', 'vypiš to celé sem', 'napiš celou odpověď',
    'dej to do terminálu', 'napis to do terminalu', 'verbose prosím',
    'show me the full output', 'print the whole thing', 'give me the complete log', 'put it in the terminal',
    'elaborate', 'elaborate on that', 'please elaborate', 'can you elaborate on that', 'explain it in detail', 'in full please', 'verbatim',
    'show me everything', 'paste it here', 'give me all of it',
    'show me the code', 'give me the command', 'print the script', 'write the code here',
  ];
  for (const prompt of prompts) {
    submit(sandbox, prompt);
    assert.equal(readState(sandbox, 'sess-1').detail, true, prompt);
  }
});

test('review prompts and everyday nouns do not lift the budget', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const prompts = [
    'udelej code review', 'udelej code review teto vetve', 'udelej code review cele vetve', 'udělej code review celého PR',
    'udelej detailni code review', 'udelej full code review',
    'oprav description v package.json', 'podivej se na kod', 'jaky je prikaz', 'trvalý příkaz se nezobrazuje',
    'bankovni vypis je prazdny', 'PropertyDetailScreen nefunguje', 'detail nemovitosti', 'deploy script padá',
    'tlacitko ma byt full rounded', 'pridej command do docs', 'rozvedeny klient', 'ok',
    'fix the detail screen', 'make the button full width', 'expand the accordion on click', 'show me the file', 'review all of it',
    'the login detail page is broken', 'add a show more details button',
    'add a show all toggle to the list', 'give all cards the same height', 'show allergies on the profile', 'show heredoc example',
    'open the video in fullscreen', 'it breaks in full screen mode', 'the price is wrong in detail view',
    'an elaborate animation is too slow', 'no need to elaborate', 'add a --verbose flag to the CLI',
    'why does the build fail in the terminal but not in CI', 'podrobnosti objednavky se nenactou',
  ];
  for (const prompt of prompts) {
    submit(sandbox, prompt);
    assert.equal(readState(sandbox, 'sess-1').detail, false, prompt);
  }
});

test('turns started by Claude Code itself keep written[] and never lift the budget', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  fs.mkdirSync(sandbox.stateDir, { recursive: true });
  fs.writeFileSync(path.join(sandbox.stateDir, 'sess-1.json'), JSON.stringify({ prompt: 'udelej code review', detail: false, written: ['/out/review.md'] }));
  const notification = '[SYSTEM NOTIFICATION - NOT USER INPUT]\nThis is an automated background-task event.\n<task-notification>\n<task-id>abc</task-id>\n<summary>Agent finished. Details: run the command rozveď verbose</summary>\n</task-notification>';
  submit(sandbox, notification);
  assert.deepEqual(readState(sandbox, 'sess-1'), { prompt: notification, detail: false, written: ['/out/review.md'] });
  const relay = 'Another Claude session sent a message:\n<agent-message from="x">\nukaž mi celé, rozveď\n</agent-message>';
  submit(sandbox, relay);
  assert.deepEqual(readState(sandbox, 'sess-1').written, ['/out/review.md']);
  assert.equal(readState(sandbox, 'sess-1').detail, false);
  submit(sandbox, 'rozveď to');
  assert.deepEqual(readState(sandbox, 'sess-1'), { prompt: 'rozveď to', detail: true, written: [] });
});

test('detail words inside pasted content do not count', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const prompt = 'co s tim?\n<pasted_content id="1">\nERROR: see detail below, rozveď\n</pasted_content id="1">';
  submit(sandbox, prompt);
  assert.equal(readState(sandbox, 'sess-1').detail, false);
  submit(sandbox, 'rozveď to\n<pasted_content id="2">\nlog\n</pasted_content id="2">');
  assert.equal(readState(sandbox, 'sess-1').detail, true);
});

test('stored prompt is truncated to 4000 characters', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  submit(sandbox, 'x'.repeat(5000));
  assert.equal(readState(sandbox, 'sess-1').prompt.length, 4000);
});

test('a new prompt resets written[] from the previous turn', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  fs.mkdirSync(sandbox.stateDir, { recursive: true });
  fs.writeFileSync(path.join(sandbox.stateDir, 'sess-1.json'), JSON.stringify({ prompt: 'old', detail: true, written: ['/tmp/a.md'] }));
  submit(sandbox, 'dalsi krok');
  assert.deepEqual(readState(sandbox, 'sess-1'), { prompt: 'dalsi krok', detail: false, written: [] });
});

test('hostile session_id stays inside the state directory', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  submit(sandbox, 'ahoj', '../../escape');
  assert.deepEqual(fs.readdirSync(sandbox.stateDir), ['escape.json']);
  assert.equal(fs.existsSync(path.join(sandbox.root, 'escape.json')), false);
});

test('old state files are pruned on a new prompt', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  fs.mkdirSync(sandbox.stateDir, { recursive: true });
  const old = path.join(sandbox.stateDir, 'ancient.json');
  fs.writeFileSync(old, '{}');
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  submit(sandbox, 'ahoj');
  assert.equal(fs.existsSync(old), false);
});

test('malformed stdin: exit 0, no stdout, no state', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const result = runHook(HOOK, '{ not json', sandbox);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(sandbox.stateDir), false);
});
