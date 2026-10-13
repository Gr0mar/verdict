#!/usr/bin/env node
'use strict';
// verdict — keeps the terminal-budget rule in an AGENTS.md file (Codex has no output
// styles). The rule is the body of output-styles/verdict.md, wrapped in markers so it
// can be replaced or removed without touching anything else in the file.
//
// Usage:
//   node install/agents-md.js --file <AGENTS.md> --style <verdict.md> [--out-dir <absolute path>] [--remove]

const fs = require('fs');
const path = require('path');

const START = '<!-- verdict:start -->';
const END = '<!-- verdict:end -->';
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const DEFAULT_OUT_DIR = '~/claude-out';
const USAGE = 'usage: --file <AGENTS.md> --style <verdict.md> [--out-dir <absolute path>] [--remove]';
const BROKEN = 'the file has a verdict marker without its pair, or more than one block — fix the markers by hand';

// The style says `~/claude-out`; Codex's apply_patch does not expand `~`, so the block
// names the absolute directory the hooks actually watch.
function blockFromStyle(styleText, outDir = DEFAULT_OUT_DIR) {
  const body = styleText.replace(FRONTMATTER, '').trim().split(DEFAULT_OUT_DIR).join(outDir);
  return `${START}\n${body}\n${END}\n`;
}

function count(text, marker) {
  return text.split(marker).length - 1;
}

// Exactly one block (or none), start before end — anything else is refused rather than guessed at.
function locateBlock(text) {
  const starts = count(text, START);
  const ends = count(text, END);
  if (starts === 0 && ends === 0) return null;
  const start = text.indexOf(START);
  const endIndex = text.indexOf(END);
  if (starts !== 1 || ends !== 1 || endIndex < start) throw new Error(BROKEN);
  return { start, end: endIndex + END.length };
}

// Text without our block; the blank line inserted before the block goes with it.
function removeBlock(text) {
  const block = locateBlock(text);
  if (!block) return text;
  let after = block.end;
  if (text[after] === '\n') after += 1;
  let before = block.start;
  if (before >= 2 && text[before - 1] === '\n' && text[before - 2] === '\n') before -= 1;
  return text.slice(0, before) + text.slice(after);
}

function upsertBlock(text, block) {
  const stripped = removeBlock(text);
  if (stripped.length === 0) return block;
  const separator = stripped.endsWith('\n') ? '\n' : '\n\n';
  return `${stripped}${separator}${block}`;
}

function parseArgs(argv) {
  const args = { remove: false, outDir: DEFAULT_OUT_DIR };
  const valued = { '--file': 'file', '--style': 'style', '--out-dir': 'outDir' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--remove') {
      args.remove = true;
      continue;
    }
    const key = valued[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(USAGE);
    args[key] = argv[i + 1];
    i += 1;
  }
  if (!args.file || !args.style) throw new Error(USAGE);
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const current = fs.existsSync(args.file) ? fs.readFileSync(args.file, 'utf8') : '';
  const next = args.remove
    ? removeBlock(current)
    : upsertBlock(current, blockFromStyle(fs.readFileSync(args.style, 'utf8'), args.outDir));
  if (next === current) {
    console.log(`unchanged: ${args.file}`);
    return;
  }
  fs.mkdirSync(path.dirname(args.file), { recursive: true });
  fs.writeFileSync(args.file, next);
  console.log(`${args.remove ? 'removed block from' : 'updated'}: ${args.file}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`agents-md: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { START, END, blockFromStyle, removeBlock, upsertBlock };
