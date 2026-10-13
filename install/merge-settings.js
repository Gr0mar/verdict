#!/usr/bin/env node
'use strict';
// verdict — registers (or removes) the budget hooks and the verdict output style
// in a Claude Code settings.json. Idempotent: a second run changes nothing.
//
// Usage:
//   node install/merge-settings.js --settings <path> --hooks-dir <path> --install-state <path> [--uninstall]

const fs = require('fs');
const path = require('path');

const HOOK_TIMEOUT_SECONDS = 5;
const OUTPUT_STYLE = 'verdict';

const HOOK_EVENTS = [
  { event: 'UserPromptSubmit', script: 'budget-prompt.js' },
  { event: 'PostToolUse', script: 'budget-open.js', matcher: 'Write' },
  { event: 'Stop', script: 'budget-stop.js' },
];

const FLAGS = { '--settings': 'settings', '--hooks-dir': 'hooksDir', '--install-state': 'installState' };
const USAGE = 'usage: --settings <path> --hooks-dir <path> --install-state <path> [--uninstall]';

function hookCommand(hooksDir, script) {
  return `node "${path.join(hooksDir, script)}"`;
}

function hookEntry(hooksDir, script) {
  return { type: 'command', command: hookCommand(hooksDir, script), timeout: HOOK_TIMEOUT_SECONDS };
}

function hasCommand(groups, command) {
  return groups.some((group) => Array.isArray(group.hooks) && group.hooks.some((hook) => hook.command === command));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// New settings object with our hook groups and output style added.
function mergeSettings(settings, hooksDir) {
  const next = clone(settings || {});
  next.hooks = next.hooks || {};
  for (const { event, script, matcher } of HOOK_EVENTS) {
    const groups = Array.isArray(next.hooks[event]) ? next.hooks[event] : [];
    const command = hookCommand(hooksDir, script);
    if (!hasCommand(groups, command)) {
      const group = matcher ? { matcher, hooks: [hookEntry(hooksDir, script)] } : { hooks: [hookEntry(hooksDir, script)] };
      groups.push(group);
    }
    next.hooks[event] = groups;
  }
  next.outputStyle = OUTPUT_STYLE;
  return next;
}

// New settings object with our hook objects removed and outputStyle restored.
function removeSettings(settings, hooksDir, previousOutputStyle) {
  const next = clone(settings || {});
  const ours = new Set(HOOK_EVENTS.map(({ script }) => hookCommand(hooksDir, script)));
  if (next.hooks) {
    for (const { event } of HOOK_EVENTS) {
      if (!Array.isArray(next.hooks[event])) continue;
      const groups = next.hooks[event]
        .map((group) => ({ ...group, hooks: (group.hooks || []).filter((hook) => !ours.has(hook.command)) }))
        .filter((group) => group.hooks.length > 0);
      if (groups.length > 0) next.hooks[event] = groups;
      else delete next.hooks[event];
    }
    if (Object.keys(next.hooks).length === 0) delete next.hooks;
  }
  if (next.outputStyle === OUTPUT_STYLE) {
    if (previousOutputStyle === undefined) delete next.outputStyle;
    else next.outputStyle = previousOutputStyle;
  }
  return next;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = { uninstall: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--uninstall') {
      args.uninstall = true;
      continue;
    }
    const key = FLAGS[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(USAGE);
    args[key] = argv[i + 1];
    i += 1;
  }
  for (const key of Object.values(FLAGS)) {
    if (!args[key]) throw new Error(USAGE);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const settings = readJson(args.settings, {});
  const installState = readJson(args.installState, {});
  let next;
  if (args.uninstall) {
    next = removeSettings(settings, args.hooksDir, installState.previousOutputStyle);
    // The restored style is consumed: the next install remembers whatever is active then.
    if ('previousOutputStyle' in installState) {
      const { previousOutputStyle, ...rest } = installState;
      writeJson(args.installState, rest);
    }
  } else {
    next = mergeSettings(settings, args.hooksDir);
    if (settings.outputStyle !== OUTPUT_STYLE && !('previousOutputStyle' in installState)) {
      writeJson(args.installState, { ...installState, previousOutputStyle: settings.outputStyle });
    }
  }
  if (JSON.stringify(settings) === JSON.stringify(next)) {
    console.log(`settings unchanged: ${args.settings}`);
    return;
  }
  if (fs.existsSync(args.settings)) {
    const backup = `${args.settings}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(args.settings, backup);
    console.log(`backup: ${backup}`);
  }
  writeJson(args.settings, next);
  console.log(`${args.uninstall ? 'removed from' : 'updated'}: ${args.settings}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`merge-settings: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { mergeSettings, removeSettings, hookCommand, HOOK_EVENTS, OUTPUT_STYLE };
