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
    const value = line.slice(idx + 1).trim();
    fields[line.slice(0, idx).trim()] = value.replace(/^"(.*)"$/, '$1');
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

const SKILLS = {
  fresh: { hint: '[scope]', phrase: 'fresh eyes' },
  copilot: { hint: '[PR number]', phrase: 'Copilot' },
  pull: { hint: '[what you expect to have landed]', phrase: 'generate-api' },
};

test('skills: frontmatter follows the Claude Code reference, bodies carry the owner wording', () => {
  for (const [name, expected] of Object.entries(SKILLS)) {
    const file = path.join(ROOT, 'skills', name, 'SKILL.md');
    const text = fs.readFileSync(file, 'utf8');
    const { fields, body } = frontmatter(file);
    assert.equal(fields.name, name);
    assert.ok(fields.description.length > 0 && fields.description.length <= 1024, `${name}: description within the documented limit`);
    assert.doesNotMatch(fields.description, /Usage:|\/[a-z]+ \[/, `${name}: arguments belong in argument-hint, not in the description`);
    assert.equal(fields['argument-hint'], expected.hint, `${name}: argument-hint`);
    assert.match(text, /^argument-hint: "\[[^\]]+\]"$/m, `${name}: argument-hint stays quoted; an unquoted [..] is a YAML list`);
    assert.equal(fields['disable-model-invocation'], 'true', `${name}: user-invoked only`);
    assert.ok(body.includes('$ARGUMENTS'), `${name}: $ARGUMENTS`);
    assert.match(body, /placeholder[^.]*(my|the user's) message/, `${name}: Codex leaves the placeholder in place, so the argument is then taken from the message`);
    assert.ok(body.includes(expected.phrase), `${name}: phrase "${expected.phrase}"`);
    // Loaded only when invoked (disable-model-invocation), so the cost is per run, not per turn.
    assert.ok(body.length < 4000, `${name}: body is ${body.length} chars; keep it lean`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'skills', 'odstup')), false, 'old odstup skill removed');
  assert.equal(fs.existsSync(path.join(ROOT, 'skills', 'pullnul')), false, 'old pullnul skill removed');
});

// Snapshot of the pre-approved commands: exact read-only calls, the fast-forward pull and the
// submodule checkout. No wildcard on git diff/log/show — they accept --output=<file>, and a
// reviewed file could talk the model into writing somewhere without a prompt. Installs run
// arriving code, gh api can write, commit and push change history: all of those keep prompting,
// and so does every git call the bodies run with a variable part (a SHA, a path).
const ALLOWED_TOOLS = {
  fresh: 'Bash(git status --short --branch --untracked-files=all) Bash(git diff HEAD) Bash(git log --oneline -15) Bash(git log --oneline origin/HEAD..HEAD) Bash(git diff origin/HEAD...HEAD) Bash(gh pr view *) Bash(gh pr diff *)',
  copilot: 'Bash(gh pr view *) Bash(git branch --show-current) Bash(git rev-parse HEAD)',
  pull: 'Bash(git rev-parse --show-toplevel) Bash(git rev-parse HEAD) Bash(git rev-parse --abbrev-ref @{u}) Bash(git status --porcelain --untracked-files=no) Bash(git pull --ff-only) Bash(git submodule update --init)',
};

test('skills: pre-approved commands are exact read-only calls plus the fast-forward pull (snapshot)', () => {
  for (const [name, rules] of Object.entries(ALLOWED_TOOLS)) {
    const { fields } = frontmatter(path.join(ROOT, 'skills', name, 'SKILL.md'));
    assert.equal(fields['allowed-tools'], rules, name);
  }
});

test('skills: Codex metadata names each skill for the Codex app and keeps it user-invoked only', () => {
  for (const name of Object.keys(SKILLS)) {
    const meta = fs.readFileSync(path.join(ROOT, 'skills', name, 'agents', 'openai.yaml'), 'utf8');
    assert.match(
      meta,
      /^interface:\n {2}display_name: "[^"\n]+"\n {2}short_description: "[^"\n]{1,72}"\npolicy:\n {2}allow_implicit_invocation: false\n$/,
      `${name}: openai.yaml has the documented interface/policy shape, a short description under 72 chars and no implicit invocation`,
    );
  }
});

test('/pull is generic: only the cwd repository, clean tree, fast-forward only, deps by lockfile, no internal tooling', () => {
  const { fields, body } = frontmatter(path.join(ROOT, 'skills', 'pull', 'SKILL.md'));
  assert.match(body, /Only this repository/);
  assert.match(body, /git rev-parse --show-toplevel/);
  assert.match(body, /git status --porcelain/);
  assert.match(body, /pull --ff-only/);
  assert.match(body, /without an upstream/);
  assert.match(body, /git rev-parse --abbrev-ref @\{u\}/);
  assert.match(body, /--untracked-files=no/);
  assert.doesNotMatch(body, /ORIG_HEAD/, 'the pulled range is anchored on a recorded HEAD, not on ORIG_HEAD');
  assert.match(body, /shell variables do not survive/, 'the recorded SHA is written into later commands, a $variable would be empty there');
  assert.match(body, /git log --oneline <sha>\.\.HEAD/);
  assert.match(body, /git diff --name-only <sha> HEAD/);
  assert.match(body, /between the cwd and the repository root/, 'the generator lookup stays inside this repository');
  assert.doesNotMatch(body, /git fetch origin/, 'pull fetches by itself; the remote may not be called origin');
  assert.match(body, /Never stash, reset or check out another branch/);
  assert.match(body, /pnpm install/);
  assert.match(body, /git submodule update --init/);
  assert.match(body, /`generate-api`, `generate:api`, `api:generate`, `codegen`/, 'only clearly named generator scripts run');
  assert.match(body, /Never run a generic `generate`, `build` or `prepare` script/);
  assert.match(body, /Never edit generated files/);
  assert.match(body, /What I expect to have landed/);
  assert.doesNotMatch(`${fields.description}\n${body}`, /from the backend/, 'no frontend\/backend assumption');
});

test('/fresh runs in a forked read-only agent that waits for the result; the other skills stay in the session', () => {
  const { fields, body } = frontmatter(path.join(ROOT, 'skills', 'fresh', 'SKILL.md'));
  assert.equal(fields.context, 'fork', 'fresh eyes means a context that did not write the code');
  assert.equal(fields.agent, 'Explore', 'the built-in read-only agent: no Write or Edit tool at all');
  assert.equal(fields.background, 'false', 'the invoking turn waits for the review');
  assert.equal(fields.model, 'inherit', 'the review runs on the session model, not on a smaller default of the agent type');
  assert.match(body, /you do not run tests or anything that changes state/, 'Explore refuses state changes anyway; say so instead of promising test runs');
  assert.match(body, /`git log --oneline origin\/HEAD\.\.HEAD`/, 'a clean tree has a named base: the default branch');
  assert.match(body, /In-session, write it yourself with the file-writing tool/, 'Codex runs in-session, so the report write is explicit there');
  // The fork sees no conversation, so the repository state is injected before the prompt is sent.
  // --branch keeps the injection non-empty on a clean tree; --untracked-files=all lists the files
  // inside a new directory instead of one "?? dir/" line.
  assert.match(body, /^!`git status --short --branch --untracked-files=all`$/m);
  assert.match(body, /^!`git log --oneline -15`$/m);
  assert.match(body, /run the commands yourself/, 'Codex shows the injection lines literally');
  assert.match(body, /in-session, set aside what you saw/, 'Codex runs the review in the same session');
  assert.match(body, /"Questions"/, 'unknown intent becomes a question, not a finding');
  assert.match(body, /`CLAUDE\.md` and `REVIEW\.md`/, 'Explore skips CLAUDE.md, so the skill reads the project rules itself');
  assert.match(body, /`gh pr diff <n>`/, 'a PR number is a valid scope');
  assert.match(body, /no uncommitted changes and that range is empty, say so and stop/);
  assert.match(body, /ordered by severity, then by what a user would hit first/);
  assert.match(body, /refused or fails is listed under "Checked:" as not run/);
  for (const name of ['copilot', 'pull']) {
    const other = frontmatter(path.join(ROOT, 'skills', name, 'SKILL.md')).fields;
    assert.equal(other.context, undefined, `${name} edits or pulls, it needs the session`);
  }
});

test('/fresh defines severity, lists what was checked, verifies before reporting and stays in scope', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'fresh', 'SKILL.md'));
  assert.match(body, /inputs that break it/);
  assert.match(body, /failure paths/);
  assert.match(body, /assert a mock instead of the behaviour/);
  assert.match(body, /Second pass:/);
  assert.match(body, /Critical — /);
  assert.match(body, /Important — /);
  assert.match(body, /Minor — /);
  assert.match(body, /"Checked:"/);
  assert.match(body, /"Out of scope"/);
  assert.match(body, /code, configuration, docs, migrations/);
  assert.match(body, /git diff HEAD/);
  assert.match(body, /must not change any file/, 'a review changes nothing');
  assert.match(body, /every `\?\?` file/, 'untracked files are part of the review; git diff HEAD does not show them');
  assert.match(body, /Report what you verified/, 'no speculative findings');
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

test('/copilot reads review threads, skips resolved ones, knows both bot logins and resolves only after approval', () => {
  const { body } = frontmatter(path.join(ROOT, 'skills', 'copilot', 'SKILL.md'));
  assert.match(body, /gh api graphql --paginate /, 'gh pages the query itself');
  assert.match(body, /\$endCursor: String\) \{/, 'the variable --paginate needs');
  assert.match(body, /reviewThreads\(first: 100, after: \$endCursor\) \{ pageInfo \{ hasNextPage endCursor \}/, 'threads come from GraphQL, which carries the resolution state');
  assert.match(body, /isResolved isOutdated path line originalLine/, 'outdated threads have line: null, originalLine is what is left');
  assert.match(body, /author \{ login __typename \}/, 'a person and a bot are told apart by type, not by the login spelling');
  assert.match(body, /reviews --paginate/, 'review summaries are paged too');
  assert.match(body, /"Suppressed comments \(N\)"/, 'the section Copilot uses for comments it did not post as threads (seen live on 2026-10-13)');
  assert.match(body, /"Comments suppressed due to low confidence \(N\)"/, 'the older heading of the same section');
  assert.match(body, /skip one that a PR comment already quotes \(`gh pr view <number> --comments`\)/, 'a second run must not raise the same suppressed comment again');
  assert.match(body, /Skip a thread whose last comment is yours unless Copilot answered after it/, 'a reply that posted but did not resolve is not re-judged');
  assert.match(body, /earlier wording:/, 'the older heading is a wording, not an older review');
  assert.match(body, /gh pr view \[<number>\] --json number,url,headRefName,headRefOid,state/, 'one command for both the explicit and the current-branch path');
  assert.match(body, /git rev-parse HEAD/);
  assert.match(body, /or `state` not `OPEN`: say so and stop/, 'a merged or closed PR ends the skill before any edit');
  assert.match(body, /re-read `state` and `headRefOid`; stop unless the PR is still `OPEN` and its head is still your HEAD/, 'checked again right before the push');
  assert.match(body, /a rejected push stops everything — no replies, no resolving/);
  assert.match(body, /Threads with a question stay open/);
  assert.match(body, /a failure goes into the report/, 'failing tests are reported, not papered over');
  assert.match(body, /gh pr comment <number> --body/, 'suppressed comments are answered with a named command');
  assert.match(body, /applied \/ declined \/ asked/, 'the questions waiting on the user are counted too');
  // Threads are resolved only once the fixes are on the PR: approval → commit and push → replies → resolve.
  const approval = body.indexOf('wait for approval');
  const push = body.indexOf('ommit the fixes on the PR branch and push');
  const replies = body.indexOf('/replies');
  const resolve = body.indexOf('resolveReviewThread');
  assert.ok(approval > -1 && push > approval && replies > push && resolve > replies, 'order: approval, push, replies, resolve');
  // Checked on 2026-10-13 against live responses: GraphQL reports the bot as
  // copilot-pull-request-reviewer, REST review comments as Copilot, REST reviews as
  // copilot-pull-request-reviewer[bot]. If GitHub renames it to something that still contains
  // "copilot", the skill lists the logins it saw; a rename without that word is a blind spot.
  assert.match(body, /`copilot-pull-request-reviewer`/);
  assert.match(body, /`Copilot`/);
  assert.match(body, /`copilot-pull-request-reviewer\[bot\]`/);
  assert.match(body, /ignoring case/);
  assert.match(body, /list the logins you saw and stop/);
  assert.match(body, /git branch --show-current/, 'the checked-out branch is compared with the PR head on both paths');
  assert.match(body, /say so and stop/, 'no PR or nothing to do ends the skill');
  assert.match(body, /Do not commit or push yet/);
});
