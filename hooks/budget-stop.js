#!/usr/bin/env node
'use strict';
// verdict — Stop hook.
// Measures Claude's final reply. Over the terminal budget it blocks once with an
// instruction to move the content into a file under outDir and answer briefly.
// Every decision is appended to budget.log.jsonl.

const path = require('path');
const { loadConfig, readState, appendLog, measure, readStdin } = require('./budget-config');

function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function projectName(cwd) {
  const base = typeof cwd === 'string' ? path.basename(cwd) : '';
  return base.length > 0 ? base : 'misc';
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function measured(size, config) {
  return `${plural(size.lines, 'line')} / ${plural(size.chars, 'character')} (limit ${config.maxLines} / ${config.maxChars})`;
}

function noFileReason(size, config, cwd, now) {
  const target = path.join(config.outDir, projectName(cwd), `${localDate(now)}-<slug>.md`);
  return `Terminal budget: the reply has ${measured(size, config)}. ` +
    `Write the full content with the Write tool to ${target} and reply again: verdict or question first, up to 3 bullets, ` +
    'the file path (<slug>: 2–5 kebab-case words without diacritics).';
}

function shortenReason(file, size, config) {
  return `The file ${file} already exists. The terminal reply still has ${measured(size, config)}. Shorten it: verdict, up to 3 bullets, the file path.`;
}

// Pure decision over the hook input, the session state and the config.
function decide(data, state, config, now = new Date()) {
  const message = data.last_assistant_message;
  const hasText = typeof message === 'string' && message.length > 0;
  const size = hasText ? measure(message) : { chars: 0, lines: 0 };
  const written = state && Array.isArray(state.written) ? state.written : [];
  const base = { lines: size.lines, chars: size.chars, written, detail: Boolean(state && state.detail) };

  if (data.stop_hook_active === true) return { ...base, decision: 'allow_after_block' };
  if (!state) return { ...base, decision: 'allow' };
  if (state.detail === true) return { ...base, decision: 'allow_detail' };
  if (!hasText) return { ...base, decision: 'allow_empty' };
  if (size.lines <= config.maxLines && size.chars <= config.maxChars) return { ...base, decision: 'allow' };
  if (written.length === 0) return { ...base, decision: 'block_no_file', reason: noFileReason(size, config, data.cwd, now) };
  return { ...base, decision: 'block_shorten', reason: shortenReason(written[written.length - 1], size, config) };
}

function main(raw) {
  try {
    const data = JSON.parse(raw);
    const config = loadConfig();
    const result = decide(data, readState(data.session_id), config);
    appendLog({
      ts: new Date().toISOString(),
      session_id: data.session_id,
      cwd: data.cwd,
      lines: result.lines,
      chars: result.chars,
      decision: result.decision,
      written: result.written,
      detail: result.detail,
    });
    if (result.reason) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
  } catch (e) {
    // fail-open: never block, never print
  }
}

if (require.main === module) readStdin(main);

module.exports = { decide, localDate, projectName };
