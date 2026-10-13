#!/usr/bin/env node
'use strict';
// verdict — PostToolUse hook (matcher: Write|apply_patch).
// When the agent writes a Markdown file under outDir — Claude Code's Write tool or
// Codex's apply_patch — records it in the session state and opens it in the
// configured app. Never blocks, never prints to stdout.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadConfig, readState, writeState, readStdin } = require('./budget-config');

function isInside(child, parent) {
  return child === parent || child.startsWith(parent + path.sep);
}

// The resolved path when filePath is an existing .md file inside outDir, else null.
// Both sides are realpath'd, so a symlink pointing outside outDir is rejected.
function resolveOutFile(filePath, outDir) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.md') return null;
  try {
    const resolved = fs.realpathSync(filePath);
    const root = fs.realpathSync(outDir);
    return isInside(resolved, root) ? resolved : null;
  } catch (e) {
    return null;
  }
}

// Codex edits files through apply_patch; the patch names each file it adds or updates.
const PATCH_FILE_LINE = /^\*\*\* (?:Add|Update) File: (.+?)\s*$/gm;

function patchedPaths(command, cwd) {
  if (typeof command !== 'string' || typeof cwd !== 'string') return [];
  const paths = [];
  for (const match of command.matchAll(PATCH_FILE_LINE)) {
    const file = match[1];
    paths.push(path.isAbsolute(file) ? file : path.resolve(cwd, file));
  }
  return paths;
}

// Every path the tool call may have written, before the outDir check.
function candidatePaths(data) {
  const input = data.tool_input || {};
  if (data.tool_name === 'Write') return [input.file_path];
  if (data.tool_name === 'apply_patch') return patchedPaths(input.command, data.cwd);
  return [];
}

function recordWritten(sessionId, resolved) {
  const state = readState(sessionId) || { prompt: '', detail: false, written: [] };
  const written = Array.isArray(state.written) ? state.written : [];
  if (!written.includes(resolved)) written.push(resolved);
  writeState(sessionId, { ...state, written });
}

// Starts the configured open command with the file path appended and lets it live on
// its own: an editor that stays in the foreground must not hold the hook. VERDICT_OPEN_CMD
// swaps the executable (tests point it at a stub); the configured arguments stay.
function openFile(resolved, config) {
  const [executable, ...args] = config.openCommand;
  const command = process.env.VERDICT_OPEN_CMD || executable;
  const child = spawn(command, [...args, resolved], { detached: true, stdio: 'ignore' });
  child.on('error', (e) => {
    process.stderr.write(`budget-open: could not open ${resolved} with ${[command, ...args].join(' ')}: ${e.message}\n`);
  });
  child.unref();
}

function main(raw) {
  try {
    const data = JSON.parse(raw);
    const candidates = candidatePaths(data);
    if (candidates.length === 0) return;
    const config = loadConfig();
    for (const candidate of candidates) {
      const resolved = resolveOutFile(candidate, config.outDir);
      if (!resolved) continue;
      recordWritten(data.session_id, resolved);
      openFile(resolved, config);
    }
  } catch (e) {
    // fail-open: never block, never print
  }
}

if (require.main === module) readStdin(main);

module.exports = { isInside, resolveOutFile, recordWritten, patchedPaths, candidatePaths };
