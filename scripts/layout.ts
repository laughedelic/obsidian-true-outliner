/**
 * Lays editor states out as side-by-side columns for the presenting-examples skill.
 *
 * Input on stdin, one column after another:
 *
 *   === before         a header line starts a column
 *   - a
 *   ▒- b               a leading ▒ marks a block-selected line
 *   - «big»┃ c         «…» is a selection, drawn underlined; it may close on a later line
 *   \t- d              real tabs and spaces, drawn by the rules below
 *   ∅
 *
 * Tabs become "⏵   ". Spaces touching a tab, and spaces at the end of a line (before any
 * closing ┃, ‸ or ∅), become "·"; every other space stays plain. Empty lines at the end of a
 * column are dropped, so columns can be separated by an empty line; a line of spaces is content.
 *
 *   node scripts/layout.ts          columns on stdin -> the drawn block
 *   node scripts/layout.ts --read   a drawn block on stdin -> the columns that draw it
 *   node scripts/layout.ts --case   a case file on stdin -> its keys and setup, then the columns
 */

import { readFileSync } from 'node:fs';
import { keysLine, layout, parseCase, readColumns, undraw } from './notation.ts';

const mode = process.argv[2];
const input = readFileSync(0, 'utf8');

if (mode === '--read') {
  console.log(
    undraw(input)
      .map((c) => `=== ${c.header}\n${c.lines.join('\n')}\n`)
      .join('\n')
      .trimEnd(),
  );
} else if (mode === '--case') {
  const c = parseCase(input, { record: true });
  const setup = [`outline ${c.outline ? 'on' : 'off'}`, `tabs ${c.tabs ? 'on' : 'off'}`, c.platform ?? 'desktop and mobile'];
  if (c.title) console.log(c.title);
  console.log(`keys: ${keysLine(c.phases) || '(none)'} · ${setup.join(' · ')}`);
  const rows = input.split('\n');
  console.log(layout(readColumns(rows.slice(rows.findIndex((l) => l.startsWith('=== '))).join('\n'))));
} else if (mode === undefined) {
  console.log(layout(readColumns(input)));
} else {
  console.error(`unknown option ${mode}`);
  process.exit(1);
}
