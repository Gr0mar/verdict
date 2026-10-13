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
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Write|apply_patch');
  assert.equal(fs.existsSync(path.join(box.claudeDir, 'hooks', 'hooks.json')), false, 'the plugin wiring is never linked');
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

function codexBox() {
  const box = sandbox();
  box.codexHome = path.join(box.root, 'codex');
  box.skillsDir = path.join(box.root, 'agents', 'skills');
  box.run = (args = []) => spawnSync('bash', [INSTALL, '--codex', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: box.claudeDir,
      VERDICT_CONFIG_DIR: box.configDir,
      CODEX_HOME: box.codexHome,
      VERDICT_AGENTS_SKILLS_DIR: box.skillsDir,
      VERDICT_STATE_DIR: path.join(box.root, 'state'),
    },
  });
  return box;
}

test('--codex installs hooks.json, the AGENTS.md block with the absolute outDir and skills; uninstall removes exactly that', (t) => {
  const box = codexBox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  fs.mkdirSync(box.configDir, { recursive: true });
  fs.writeFileSync(path.join(box.configDir, 'budget.json'), JSON.stringify({ outDir: path.join(box.root, 'out') }));

  const first = box.run();
  assert.equal(first.status, 0, first.stderr);
  const hooks = JSON.parse(fs.readFileSync(path.join(box.codexHome, 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(hooks.hooks), ['UserPromptSubmit', 'PostToolUse', 'Stop']);
  assert.equal(hooks.hooks.Stop[0].hooks[0].command, `node "${path.join(ROOT, 'hooks', 'budget-stop.js')}"`);
  assert.equal(hooks.outputStyle, undefined);
  const agents = fs.readFileSync(path.join(box.codexHome, 'AGENTS.md'), 'utf8');
  assert.match(agents, /<!-- verdict:start -->[\s\S]*# Terminal budget[\s\S]*<!-- verdict:end -->/);
  assert.ok(agents.includes(`${path.join(box.root, 'out')}/<project>/`), 'the block names the absolute outDir from budget.json');
  assert.doesNotMatch(agents, /~\/claude-out/);
  for (const name of ['fresh', 'copilot', 'pull']) {
    assert.equal(fs.readlinkSync(path.join(box.skillsDir, name)), path.join(ROOT, 'skills', name));
  }
  assert.equal(fs.existsSync(path.join(box.codexHome, 'skills')), false, 'skills go to ~/.agents/skills, not the deprecated ~/.codex/skills');
  assert.equal(fs.existsSync(box.claudeDir), false, 'the Claude side is untouched');
  assert.match(first.stdout, /\/hooks/);
  assert.match(first.stdout, /writable_roots/);

  const second = box.run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /settings unchanged/);

  const removed = box.run(['--uninstall']);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.existsSync(path.join(box.codexHome, 'hooks.json')), false, 'an empty hooks.json we created is removed');
  assert.equal(fs.existsSync(path.join(box.codexHome, 'AGENTS.md')), false, 'an AGENTS.md that held only our block is removed');
  for (const name of ['fresh', 'copilot', 'pull']) {
    assert.equal(fs.existsSync(path.join(box.skillsDir, name)), false);
  }
});

test('--codex keeps other people\'s hooks and AGENTS.md text on uninstall', (t) => {
  const box = codexBox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  fs.mkdirSync(box.codexHome, { recursive: true });
  fs.writeFileSync(path.join(box.codexHome, 'AGENTS.md'), '# Mine\n\nkeep me\n');
  fs.writeFileSync(path.join(box.codexHome, 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node other.js' }] }] } }));
  assert.equal(box.run().status, 0);
  assert.equal(box.run(['--uninstall']).status, 0);
  assert.equal(fs.readFileSync(path.join(box.codexHome, 'AGENTS.md'), 'utf8'), '# Mine\n\nkeep me\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(box.codexHome, 'hooks.json'), 'utf8')), { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node other.js' }] }] } });
});

test('--codex links skills before touching hooks.json or AGENTS.md, so a conflict changes nothing', (t) => {
  const box = codexBox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(box.skillsDir, 'pull'), { recursive: true });
  const result = box.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refusing: .*pull exists and is not a symlink/);
  assert.equal(fs.existsSync(path.join(box.codexHome, 'hooks.json')), false);
  assert.equal(fs.existsSync(path.join(box.codexHome, 'AGENTS.md')), false);
});

test('install refuses while the verdict plugin is installed in the same config dir', (t) => {
  const box = sandbox();
  t.after(() => fs.rmSync(box.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(box.claudeDir, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(box.claudeDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'verdict@gr0mar': [{ scope: 'user' }] } }));
  const result = run(box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /plugin verdict@gr0mar is installed/);
  assert.equal(fs.existsSync(path.join(box.claudeDir, 'hooks')), false);
  assert.equal(fs.existsSync(path.join(box.claudeDir, 'settings.json')), false);
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
