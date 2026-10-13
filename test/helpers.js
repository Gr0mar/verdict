'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOKS_DIR = path.join(__dirname, '..', 'hooks');

// Fresh temporary tree per test: config dir, state dir, outDir and a stub "open"
// command that records its arguments, one per line, into open.log.
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-'));
  const sandbox = {
    root,
    configDir: path.join(root, 'config'),
    stateDir: path.join(root, 'state'),
    outDir: path.join(root, 'claude-out'),
    openLog: path.join(root, 'open.log'),
    openCmd: path.join(root, 'open-stub.sh'),
  };
  fs.mkdirSync(sandbox.configDir, { recursive: true });
  fs.mkdirSync(sandbox.outDir, { recursive: true });
  fs.writeFileSync(sandbox.openCmd, `#!/bin/sh\nprintf '%s\\n' "$@" >> "${sandbox.openLog}"\n`, { mode: 0o755 });
  writeConfig(sandbox, {});
  return sandbox;
}

function writeConfig(sandbox, values) {
  fs.writeFileSync(path.join(sandbox.configDir, 'budget.json'), JSON.stringify({ outDir: sandbox.outDir, ...values }));
}

function env(sandbox, extra = {}) {
  return {
    ...process.env,
    VERDICT_CONFIG_DIR: sandbox.configDir,
    VERDICT_STATE_DIR: sandbox.stateDir,
    VERDICT_OPEN_CMD: sandbox.openCmd,
    ...extra,
  };
}

function runHook(name, input, sandbox, extraEnv = {}) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const result = spawnSync(process.execPath, [path.join(HOOKS_DIR, name)], {
    input: raw,
    env: env(sandbox, extraEnv),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function readState(sandbox, sessionId) {
  return JSON.parse(fs.readFileSync(path.join(sandbox.stateDir, `${sessionId}.json`), 'utf8'));
}

function readLog(sandbox) {
  const file = path.join(sandbox.stateDir, 'budget.log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function cleanup(sandbox) {
  fs.rmSync(sandbox.root, { recursive: true, force: true });
}

module.exports = { HOOKS_DIR, makeSandbox, writeConfig, env, runHook, readState, readLog, cleanup };
