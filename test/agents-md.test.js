'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'install', 'agents-md.js');
const STYLE = path.join(__dirname, '..', 'output-styles', 'verdict.md');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-'));
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('blockFromStyle: the style body without frontmatter, wrapped in markers', () => {
  const { blockFromStyle, START, END } = require('../install/agents-md');
  const block = blockFromStyle(fs.readFileSync(STYLE, 'utf8'));
  assert.ok(block.startsWith(`${START}\n`));
  assert.ok(block.endsWith(`\n${END}\n`));
  assert.doesNotMatch(block, /^---$/m, 'no frontmatter in the block');
  assert.match(block, /# Terminal budget/);
  assert.match(block, /12 lines and 900 characters/);
});

test('upsertBlock: appends to existing text, replaces its own block, removes it', () => {
  const { upsertBlock, removeBlock, START, END } = require('../install/agents-md');
  const block = `${START}\nrule v1\n${END}\n`;
  const added = upsertBlock('# My notes\n\nkeep this\n', block);
  assert.equal(added, `# My notes\n\nkeep this\n\n${block}`);
  const replaced = upsertBlock(added, `${START}\nrule v2\n${END}\n`);
  assert.equal(replaced, `# My notes\n\nkeep this\n\n${START}\nrule v2\n${END}\n`);
  assert.equal(upsertBlock(replaced, `${START}\nrule v2\n${END}\n`), replaced, 'idempotent');
  assert.equal(removeBlock(replaced), '# My notes\n\nkeep this\n');
  assert.equal(removeBlock('no block here\n'), 'no block here\n');
  assert.equal(upsertBlock('', block), block, 'empty file gets just the block');
});

test('CLI: creates the file, is idempotent, --remove deletes only the block', (t) => {
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'AGENTS.md');
  const first = run(['--file', file, '--style', STYLE]);
  assert.equal(first.status, 0, first.stderr);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /<!-- verdict:start -->/);
  assert.match(text, /<!-- verdict:end -->/);
  assert.match(text, /# Terminal budget/);
  const second = run(['--file', file, '--style', STYLE]);
  assert.equal(second.status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), text);

  fs.writeFileSync(file, `# Mine\n\n${text}`);
  assert.equal(run(['--file', file, '--style', STYLE, '--remove']).status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), '# Mine\n');
  assert.equal(run(['--file', file, '--style', STYLE, '--remove']).status, 0, 'removing twice is fine');
});

test('broken markers are refused instead of eating user text', () => {
  const { upsertBlock, removeBlock, START, END } = require('../install/agents-md');
  const block = `${START}\nrule\n${END}\n`;
  const noEnd = `# notes\n${START}\nsomething the user typed\n`;
  assert.throws(() => upsertBlock(noEnd, block), /fix the markers by hand/);
  assert.throws(() => removeBlock(noEnd), /fix the markers by hand/);
  const twoStarts = `${block}\nuser text\n${block}`;
  assert.throws(() => upsertBlock(twoStarts, block), /fix the markers by hand/);
  assert.throws(() => removeBlock(twoStarts), /fix the markers by hand/);
});

test('CLI: broken markers exit 1 and leave the file untouched', (t) => {
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'AGENTS.md');
  const broken = '# notes\n<!-- verdict:start -->\nuser text\n';
  fs.writeFileSync(file, broken);
  const result = run(['--file', file, '--style', STYLE]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fix the markers by hand/);
  assert.equal(fs.readFileSync(file, 'utf8'), broken);
});

test('--out-dir writes the absolute output directory into the block', (t) => {
  const { blockFromStyle } = require('../install/agents-md');
  const block = blockFromStyle(fs.readFileSync(STYLE, 'utf8'), '/Users/me/notes');
  assert.match(block, /`\/Users\/me\/notes\/<project>\/<YYYY-MM-DD>-<slug>\.md`/);
  assert.doesNotMatch(block, /~\/claude-out/);
  const dir = tmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'AGENTS.md');
  assert.equal(run(['--file', file, '--style', STYLE, '--out-dir', '/Users/me/notes']).status, 0);
  assert.match(fs.readFileSync(file, 'utf8'), /\/Users\/me\/notes\/<project>/);
});

test('CLI: missing arguments exit 1', () => {
  const result = run(['--file', '/tmp/x.md']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /agents-md: /);
});
