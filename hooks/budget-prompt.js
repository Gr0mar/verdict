#!/usr/bin/env node
'use strict';
// verdict — UserPromptSubmit hook.
// Stores the prompt and whether it asks for detail, and resets the list of files
// written this turn. Prints nothing: for this event stdout goes into Claude's context.

const { loadConfig, readState, writeState, pruneStateFiles, readStdin } = require('./budget-config');

const PROMPT_STORE_LIMIT = 4000;
// Pasted content arrives expanded between these tags; words inside it are not the user's own.
const PASTED_CONTENT = /<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content\b[^>]*>/g;
// Turns Claude Code starts on its own (a background agent reporting back, a message
// from another session) carry these blocks. The user typed nothing in such a turn.
const SYSTEM_TURN = /<(task-notification|agent-message)\b/;

function ownWords(prompt) {
  return prompt.replace(PASTED_CONTENT, ' ');
}

function isSystemTurn(prompt) {
  return SYSTEM_TURN.test(prompt);
}

// A system turn keeps the files written so far and never lifts the budget: the
// relayed report is exactly the kind of text the budget exists for.
function buildState(prompt, detailRegex, previous) {
  const stored = prompt.slice(0, PROMPT_STORE_LIMIT);
  if (isSystemTurn(prompt)) {
    const written = previous && Array.isArray(previous.written) ? previous.written : [];
    return { prompt: stored, detail: false, written };
  }
  return { prompt: stored, detail: detailRegex.test(ownWords(prompt)), written: [] };
}

function main(raw) {
  try {
    const data = JSON.parse(raw);
    const prompt = typeof data.prompt === 'string' ? data.prompt : '';
    const config = loadConfig();
    pruneStateFiles();
    writeState(data.session_id, buildState(prompt, config.detailRegex, readState(data.session_id)));
  } catch (e) {
    // fail-open: never block, never print
  }
}

if (require.main === module) readStdin(main);

module.exports = { buildState, ownWords, isSystemTurn };
