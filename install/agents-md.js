#!/usr/bin/env node
'use strict';
// verdict — keeps the terminal-budget rule in an AGENTS.md file (Codex has no output
// styles). The rule is the body of output-styles/verdict.md, wrapped in markers so it
// can be replaced or removed without touching anything else in the file.
//
// Usage:
//   node install/agents-md.js --file <AGENTS.md> --style <verdict.md> [--remove]

const fs = require('fs');
const path = require('path');

const START = '<!-- verdict:start -->';
const END = '<!-- verdict:end -->';
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const USAGE = 'usage: --file <AGENTS.md> --style <verdict.md> [--remove]';

function blockFromStyle(styleText) {
  const body = styleText.replace(FRONTMATTER, '').trim();
  return `${START}\n${body}\n${END}\n`;
}

// Text without our block; the blank line inserted before the block goes with it.
function removeBlock(text) {
  const start = text.indexOf(START);
  if (start === -1) return text;
  const endIndex = text.indexOf(END, start);
  if (endIndex === -1) return text;
  let after = endIndex + END.length;
  if (text[after] === '\n') after += 1;
  let before = start;
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
  const args = { remove: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--remove') {
      args.remove = true;
      continue;
    }
    if (argv[i] === '--file' || argv[i] === '--style') {
      if (argv[i + 1] === undefined) throw new Error(USAGE);
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(USAGE);
  }
  if (!args.file || !args.style) throw new Error(USAGE);
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const current = fs.existsSync(args.file) ? fs.readFileSync(args.file, 'utf8') : '';
  const next = args.remove ? removeBlock(current) : upsertBlock(current, blockFromStyle(fs.readFileSync(args.style, 'utf8')));
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
