#!/usr/bin/env node
'use strict';
// verdict — shared configuration, state and measurement for the budget hooks.
//
// Config: $VERDICT_CONFIG_DIR/budget.json  (default ~/.config/verdict/budget.json)
// State:  $VERDICT_STATE_DIR/<session_id>.json and budget.log.jsonl
//         (default ~/.claude/state/verdict)
//
// Every function fails soft: a missing or invalid file yields defaults or null,
// never an exception that could block Claude Code.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Phrases that mean "I want the full text in the terminal", Czech with and without
// diacritics plus English. Only request phrases (verb + object), never bare nouns:
// "detail", "celé", "příkaz", "script" or "full" appear in everyday prompts
// ("detail nemovitosti", "trvalý příkaz", "full rounded") and "udelej code review
// celé větve" is a review that must stay within the budget. No \b next to a letter
// with diacritics — without the u flag \b treats "ě" as a non-word character.
const LETTER = 'a-zA-Zá-ž';
const DEFAULT_DETAIL_PATTERN = [
  `rozve(ď|d(?![${LETTER}]))`,
  `podrobn[ěe](?![${LETTER}])`,
  'do\\s+termin[aá]lu',
  `(?<![${LETTER}])(vypi[sš]|uka[zž]|napi[sš]|dej)\\s+(mi\\s+)?(to\\s+|ten\\s+|tu\\s+)?(cel[aáeéoyý]\\w*|k[oó]d|p[rř][ií]kaz|skript|script|command)`,
  `(?<![-${LETTER}])verbose(?![-${LETTER}])(?!\\s+(flag|mode|option|logging))`,
  '(put|print|show|keep|write|paste|leave|answer|reply)\\s+(it\\s+|that\\s+|this\\s+)?in\\s+(the\\s+)?terminal',
  `(?<![${LETTER}])(show|give|print)\\s+(me\\s+)?(the\\s+)?(full|whole|entire|complete)(?![${LETTER}])`,
  `(?<![${LETTER}])(show|give|print|paste|write)\\s+(me\\s+)?(the\\s+)?(code|command|script)(?![${LETTER}])`,
  `(?<![${LETTER}])(show|give|print|paste)\\s+(me\\s+(it\\s+|that\\s+)?|it\\s+|that\\s+)(all|everything|here)(?![${LETTER}])`,
  '(^|[.!?]\\s*|please\\s+|(can|could|would)\\s+you\\s+)elaborate',
  `(?<![${LETTER}])in\\s+(full|detail)(?![${LETTER}])(?!\\s+(screen|view|page|mode|width))`,
  'verbatim',
].join('|');

const DEFAULTS = Object.freeze({
  maxLines: 12,
  maxChars: 900,
  outDir: '~/claude-out',
  openApp: 'Cursor',
  detailPattern: DEFAULT_DETAIL_PATTERN,
});

const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_FILE = 'budget.log.jsonl';

function configDir() {
  return process.env.VERDICT_CONFIG_DIR || path.join(os.homedir(), '.config', 'verdict');
}

function stateDir() {
  return process.env.VERDICT_STATE_DIR || path.join(os.homedir(), '.claude', 'state', 'verdict');
}

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// A command is an executable followed by its arguments; the file path is appended at run time.
function isCommand(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

// Keeps only fields of the expected type; everything else falls back to the default.
function pickValid(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  if (isPositiveInteger(raw.maxLines)) out.maxLines = raw.maxLines;
  if (isPositiveInteger(raw.maxChars)) out.maxChars = raw.maxChars;
  if (isNonEmptyString(raw.outDir)) out.outDir = raw.outDir;
  if (isNonEmptyString(raw.openApp)) out.openApp = raw.openApp;
  if (isCommand(raw.openCommand)) out.openCommand = raw.openCommand.slice();
  if (isNonEmptyString(raw.detailPattern)) out.detailPattern = raw.detailPattern;
  return out;
}

function compileDetailRegex(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch (e) {
    return new RegExp(DEFAULT_DETAIL_PATTERN, 'i');
  }
}

function loadConfig() {
  let fileValues = {};
  try {
    fileValues = JSON.parse(fs.readFileSync(path.join(configDir(), 'budget.json'), 'utf8'));
  } catch (e) {
    // no config file or invalid JSON: defaults apply
  }
  const merged = { ...DEFAULTS, ...pickValid(fileValues) };
  merged.outDir = path.resolve(expandHome(merged.outDir));
  // openCommand is the portable form and wins when set. Without it, macOS gets
  // `open -a <openApp>`; everywhere else the desktop's default handler via xdg-open.
  if (!merged.openCommand) merged.openCommand = process.platform === 'darwin' ? ['open', '-a', merged.openApp] : ['xdg-open'];
  merged.detailRegex = compileDetailRegex(merged.detailPattern);
  return merged;
}

// Session ids become file names: drop anything outside [A-Za-z0-9._-] and leading dots.
function sanitizeSessionId(sessionId) {
  const cleaned = String(sessionId == null ? '' : sessionId).replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 128) : 'unknown';
}

function ensureStateDir() {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
}

function statePath(sessionId) {
  return path.join(stateDir(), `${sanitizeSessionId(sessionId)}.json`);
}

function readState(sessionId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

// Temp file + rename: a crash never leaves a half-written state behind.
function writeState(sessionId, state) {
  ensureStateDir();
  const target = statePath(sessionId);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

function pruneStateFiles(maxAgeMs = STATE_MAX_AGE_MS, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(stateDir());
  } catch (e) {
    return;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(stateDir(), name);
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch (e) {
      // already gone or unreadable: skip
    }
  }
}

function appendLog(entry) {
  ensureStateDir();
  fs.appendFileSync(path.join(stateDir(), LOG_FILE), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

// Trailing whitespace is invisible in the terminal, so it counts for neither limit.
function measure(text) {
  const trimmed = text.trimEnd();
  return { chars: trimmed.length, lines: trimmed.split('\n').length };
}

function readStdin(callback) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => callback(input));
}

module.exports = {
  DEFAULTS,
  DEFAULT_DETAIL_PATTERN,
  LOG_FILE,
  configDir,
  stateDir,
  expandHome,
  loadConfig,
  sanitizeSessionId,
  statePath,
  readState,
  writeState,
  pruneStateFiles,
  appendLog,
  measure,
  readStdin,
};
