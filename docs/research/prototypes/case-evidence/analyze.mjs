import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseCase } from '../../../../scripts/notation.ts';

// node analyze.mjs <root>: <root> holds cases/pr<N>/*.case and runs/records/pr<N>-{head,main}/<case>.<platform>.case
const S = process.argv[2] ?? '.';
const prs = [264, 270, 274];
const rows = [];
for (const pr of prs) {
  const names = readdirSync(`${S}/cases/pr${pr}`).filter((f) => f.endsWith('.case')).map((f) => f.replace('.case', ''));
  for (const name of names) {
    const drawn = parseCase(readFileSync(`${S}/cases/pr${pr}/${name}.case`, 'utf8'), { record: true });
    for (const plat of ['desktop', 'mobile']) {
      const rec = (side) => {
        const f = `${S}/runs/records/pr${pr}-${side}/${name}.${plat}.case`;
        return existsSync(f) ? parseCase(readFileSync(f, 'utf8'), { record: true }) : null;
      };
      const head = rec('head'), main = rec('main');
      const cmp = (a, b) => a.map((r, i) => {
        const e = b.results[i];
        if (!e) return 'no-drawn';
        const t = r.text === e.text;
        const c = !e.selection ? 'n/a' : (r.selection && r.selection.anchor === e.selection.anchor && r.selection.head === e.selection.head) ? 'ok' : 'DIFF';
        return `${t ? 'text-ok' : 'TEXT-DIFF'}/${c}`;
      });
      const headVsDrawn = head ? cmp(head.results, drawn) : ['missing'];
      const mainVsDrawn = main ? cmp(main.results, drawn) : ['missing'];
      const headVsMain = head && main ? head.results.map((r, i) => (r.text === main.results[i]?.text ? (JSON.stringify(r.selection) === JSON.stringify(main.results[i]?.selection) ? 'same' : 'caret-only') : 'text')) : ['?'];
      rows.push({ pr, name, plat, phases: drawn.phases.length, headVsDrawn: headVsDrawn.join(' | '), mainVsDrawn: mainVsDrawn.join(' | '), headVsMain: headVsMain.join(' | ') });
    }
  }
}
for (const r of rows) console.log(`#${r.pr} ${r.name.padEnd(42)} ${r.plat.padEnd(8)} head~drawn: ${r.headVsDrawn.padEnd(34)} main~drawn: ${r.mainVsDrawn.padEnd(34)} head~main: ${r.headVsMain}`);
