// For each case file run in the app, prints how it ended on each platform and whether the state
// the app produced is the one the issue's own `actual` column draws.
//
//   node compare.mjs <cases-dir> <recorded-dir> <desktop-plain.log> <mobile-plain.log>
//
// <recorded-dir> holds `<case>.<platform>.case` files, which `npm run case -- <files> --record`
// writes under .obsidian-cache/cases/; the two logs are the same files run without `--record`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readColumns, readDocument } from '../../../../scripts/notation.ts';

const [cases, recorded, desktopLog, mobileLog] = process.argv.slice(2);
if (!mobileLog) throw new Error('usage: node compare.mjs <cases-dir> <recorded-dir> <desktop-log> <mobile-log>');

const outcomes = (file) => {
  const found = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s+(✓|✖)\s+(\d+-\d+)/.exec(line);
    if (m) found.set(m[2], m[1] === '✓' ? 'pass' : 'DIFF');
  }
  return found;
};
const columnsOf = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  return readColumns(lines.slice(lines.findIndex((l) => l.startsWith('=== '))).join('\n'));
};
const document = (column) => readDocument(column.lines.filter((l, i, all) => !(i === all.length - 1 && l === '')));

const ran = { desktop: outcomes(desktopLog), mobile: outcomes(mobileLog) };
console.log('case     desktop  mobile   app against the issue\'s actual (desktop | mobile)');
for (const file of readdirSync(cases).filter((f) => f.endsWith('.case')).sort()) {
  const id = file.replace('.case', '');
  if (!ran.desktop.has(id)) continue;
  const issue = columnsOf(`${cases}/${file}`).find((c) => c.header.startsWith('actual'));
  const against = ['desktop', 'mobile'].map((platform) => {
    const path = `${recorded}/${id}.${platform}.case`;
    if (!issue || !existsSync(path)) return 'no actual drawn';
    const app = document(columnsOf(path).filter((c) => c.header.startsWith('after')).at(-1));
    const drawn = document(issue);
    const text = app.text === drawn.text ? 'text same' : 'TEXT DIFFERS';
    const caret = !drawn.selection ? 'no caret drawn' : JSON.stringify(app.selection) === JSON.stringify(drawn.selection) ? 'caret same' : 'CARET DIFFERS';
    return `${text}, ${caret}`;
  });
  console.log(`${id.padEnd(8)} ${(ran.desktop.get(id) ?? '?').padEnd(8)} ${(ran.mobile.get(id) ?? '?').padEnd(8)} ${against.join(' | ')}`);
}
