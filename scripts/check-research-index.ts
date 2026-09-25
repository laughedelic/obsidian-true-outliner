/**
 * Checks that `docs/research/index.md` and the notes beside it agree.
 *
 * The index is the only shared file a new note has to touch, and it merges by
 * union (`.gitattributes`) so parallel branches never conflict over it. Union
 * resolves the collision without reading the rows, which is exactly what makes
 * this check necessary: it catches the three states union can leave behind —
 * a row duplicated, a row pointing at no file, a file with no row.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs', 'research');

/** Files that describe the collection rather than belonging to it. */
const NOT_NOTES = new Set(['README.md', 'index.md']);

const ROW = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/;

const rows = readFileSync(path.join(dir, 'index.md'), 'utf8')
  .split('\n')
  .map((line, i) => ({ line, number: i + 1, match: ROW.exec(line) }))
  .filter((r) => r.match)
  .map((r) => ({ number: r.number, text: r.match[1], target: r.match[2] }));

const notes = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && !NOT_NOTES.has(f))
  .sort();

const problems = [];

const seen = new Map();
for (const row of rows) {
  const first = seen.get(row.target);
  if (first === undefined) seen.set(row.target, row.number);
  else problems.push(`${row.target}: listed twice (lines ${first} and ${row.number})`);
  if (!notes.includes(row.target)) problems.push(`${row.target}: row on line ${row.number} points at no file`);
  if (row.text !== row.target) problems.push(`${row.target}: row on line ${row.number} is labelled "${row.text}"`);
}

for (const note of notes) {
  if (!seen.has(note)) problems.push(`${note}: no row in the index`);
}

if (problems.length > 0) {
  console.error('docs/research/index.md does not match the directory:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nEvery note takes exactly one row, labelled with its own filename.');
  process.exit(1);
}

console.log(`docs/research/index.md: ${notes.length} notes, all listed once.`);
