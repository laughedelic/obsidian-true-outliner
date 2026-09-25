// node compare.mjs <main.json> <branch.json>
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const lead = (l) => /^[ \t]*/.exec(l)[0];
// A space in front of a tab, which the re-encoders avoid writing.
const spacesBeforeTab = (t) => t.split('\n').some((l) => / \t/.test(lead(l)));
// A whole tab stop spelled in spaces, in a document that indents with tabs:
// the shape #154 reports, one line indented two ways.
const tabStopInSpaces = (t) => /\t/.test(t) && t.split('\n').some((l) => / {4}/.test(lead(l)));
let rows = 0, verdict = 0, shape = 0, text = 0, sbt = [0, 0], tsp = [0, 0];
for (const k of Object.keys(a)) {
  rows++;
  const x = a[k], y = b[k];
  if (('reject' in x) !== ('reject' in y) || x.reject !== y.reject) { verdict++; continue; }
  if ('reject' in x) continue;
  if (JSON.stringify(x.shape) !== JSON.stringify(y.shape)) { shape++; console.log('SHAPE', k); }
  if (x.text !== y.text) { text++; if (process.env.SHOW) console.log(k, JSON.stringify(x.text), '=>', JSON.stringify(y.text)); }
  if (spacesBeforeTab(x.text)) sbt[0]++;
  if (spacesBeforeTab(y.text)) sbt[1]++;
  if (tabStopInSpaces(x.text)) tsp[0]++;
  if (tabStopInSpaces(y.text)) tsp[1]++;
}
console.log({ rows, verdictChanges: verdict, shapeChanges: shape, textChanges: text, spaceBeforeTab: { main: sbt[0], branch: sbt[1] }, tabStopInSpaces: { main: tsp[0], branch: tsp[1] } });
