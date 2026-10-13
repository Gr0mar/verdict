'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeSandbox, writeConfig, cleanup } = require('./helpers');

const ENV_KEYS = ['VERDICT_CONFIG_DIR', 'VERDICT_STATE_DIR'];

// The module reads process.env at call time, so tests point it at the sandbox.
function withSandbox(sandbox, fn) {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]]);
  process.env.VERDICT_CONFIG_DIR = sandbox.configDir;
  process.env.VERDICT_STATE_DIR = sandbox.stateDir;
  try {
    return fn(require('../hooks/budget-config'));
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('loadConfig: defaults apply when the file sets only outDir', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    const loaded = config.loadConfig();
    assert.equal(loaded.maxLines, 12);
    assert.equal(loaded.maxChars, 900);
    assert.equal(loaded.openApp, 'Cursor');
    assert.equal(loaded.outDir, sandbox.outDir);
    assert.ok(loaded.detailRegex instanceof RegExp);
    assert.equal(loaded.detailPattern, config.DEFAULT_DETAIL_PATTERN);
  });
});

test('loadConfig: values of the wrong type fall back to defaults', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { maxLines: '20', maxChars: -5, openApp: '   ', detailPattern: 42 });
  withSandbox(sandbox, (config) => {
    const loaded = config.loadConfig();
    assert.equal(loaded.maxLines, 12);
    assert.equal(loaded.maxChars, 900);
    assert.equal(loaded.openApp, 'Cursor');
    assert.equal(loaded.detailPattern, config.DEFAULT_DETAIL_PATTERN);
  });
});

test('loadConfig: valid overrides win and ~ in outDir expands', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { maxLines: 20, maxChars: 1500, openApp: 'Marked 2', outDir: '~/somewhere' });
  withSandbox(sandbox, (config) => {
    const loaded = config.loadConfig();
    assert.equal(loaded.maxLines, 20);
    assert.equal(loaded.maxChars, 1500);
    assert.equal(loaded.openApp, 'Marked 2');
    assert.equal(loaded.outDir, path.join(os.homedir(), 'somewhere'));
  });
});

test('loadConfig: openCommand is derived from openApp on macOS, xdg-open elsewhere, unless given explicitly', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  const platformDefault = process.platform === 'darwin' ? ['open', '-a', 'Cursor'] : ['xdg-open'];
  withSandbox(sandbox, (config) => {
    assert.deepEqual(config.loadConfig().openCommand, platformDefault);
    writeConfig(sandbox, { openApp: 'Marked 2' });
    assert.deepEqual(config.loadConfig().openCommand, process.platform === 'darwin' ? ['open', '-a', 'Marked 2'] : ['xdg-open']);
    writeConfig(sandbox, { openCommand: ['code', '--reuse-window'] });
    assert.deepEqual(config.loadConfig().openCommand, ['code', '--reuse-window']);
    writeConfig(sandbox, { openCommand: 'code' });
    assert.deepEqual(config.loadConfig().openCommand, platformDefault);
    writeConfig(sandbox, { openCommand: [] });
    assert.deepEqual(config.loadConfig().openCommand, platformDefault);
    writeConfig(sandbox, { openCommand: ['xdg-open', 42] });
    assert.deepEqual(config.loadConfig().openCommand, platformDefault);
  });
});

test('loadConfig: an invalid detailPattern falls back to the default regex', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  writeConfig(sandbox, { detailPattern: '(' });
  withSandbox(sandbox, (config) => {
    const loaded = config.loadConfig();
    assert.equal(loaded.detailRegex.test('rozveď to'), true);
    assert.equal(loaded.detailRegex.test('ok'), false);
  });
});

test('loadConfig: missing or invalid config file yields defaults', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  fs.writeFileSync(path.join(sandbox.configDir, 'budget.json'), '{ not json');
  withSandbox(sandbox, (config) => {
    assert.equal(config.loadConfig().maxLines, 12);
    fs.unlinkSync(path.join(sandbox.configDir, 'budget.json'));
    assert.equal(config.loadConfig().outDir, path.join(os.homedir(), 'claude-out'));
  });
});

test('expandHome', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    assert.equal(config.expandHome('~/x/y'), path.join(os.homedir(), 'x/y'));
    assert.equal(config.expandHome('~'), os.homedir());
    assert.equal(config.expandHome('/abs/path'), '/abs/path');
  });
});

test('measure: trailing newlines never count, CRLF splits lines', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    assert.deepEqual(config.measure('a\nb\nc\n\n'), { chars: 5, lines: 3 });
    assert.deepEqual(config.measure('x'), { chars: 1, lines: 1 });
    assert.deepEqual(config.measure('l1\r\nl2'), { chars: 6, lines: 2 });
  });
});

test('sanitizeSessionId: file-name safe, never empty', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    assert.equal(config.sanitizeSessionId('../../etc/passwd'), 'etcpasswd');
    assert.equal(config.sanitizeSessionId('abc-123_X.y'), 'abc-123_X.y');
    assert.equal(config.sanitizeSessionId(''), 'unknown');
    assert.equal(config.sanitizeSessionId(undefined), 'unknown');
    assert.equal(config.sanitizeSessionId('....'), 'unknown');
    assert.ok(config.statePath('../../x').startsWith(sandbox.stateDir + path.sep));
  });
});

test('writeState/readState round trip with restrictive modes', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    config.writeState('s1', { prompt: 'hi', detail: false, written: [] });
    assert.deepEqual(config.readState('s1'), { prompt: 'hi', detail: false, written: [] });
    assert.equal(fs.statSync(config.statePath('s1')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(sandbox.stateDir).mode & 0o777, 0o700);
    assert.equal(fs.readdirSync(sandbox.stateDir).filter((name) => name.endsWith('.tmp')).length, 0);
  });
});

test('readState: missing or corrupt file yields null', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    assert.equal(config.readState('nope'), null);
    fs.mkdirSync(sandbox.stateDir, { recursive: true });
    fs.writeFileSync(config.statePath('bad'), '{');
    assert.equal(config.readState('bad'), null);
    fs.writeFileSync(config.statePath('num'), '42');
    assert.equal(config.readState('num'), null);
  });
});

test('pruneStateFiles: deletes state older than maxAge, keeps fresh state and the log', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    config.writeState('old', { prompt: '', detail: false, written: [] });
    config.writeState('fresh', { prompt: '', detail: false, written: [] });
    config.appendLog({ decision: 'allow' });
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(config.statePath('old'), eightDaysAgo, eightDaysAgo);
    fs.utimesSync(path.join(sandbox.stateDir, config.LOG_FILE), eightDaysAgo, eightDaysAgo);
    config.pruneStateFiles();
    assert.equal(fs.existsSync(config.statePath('old')), false);
    assert.equal(fs.existsSync(config.statePath('fresh')), true);
    assert.equal(fs.existsSync(path.join(sandbox.stateDir, config.LOG_FILE)), true);
  });
});

test('appendLog: one JSON line per call', (t) => {
  const sandbox = makeSandbox();
  t.after(() => cleanup(sandbox));
  withSandbox(sandbox, (config) => {
    config.appendLog({ decision: 'allow' });
    config.appendLog({ decision: 'block_no_file' });
    const lines = fs.readFileSync(path.join(sandbox.stateDir, config.LOG_FILE), 'utf8').trim().split('\n');
    assert.deepEqual(lines.map((line) => JSON.parse(line).decision), ['allow', 'block_no_file']);
  });
});
