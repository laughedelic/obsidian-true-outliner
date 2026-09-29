import { readFileSync, readdirSync } from 'node:fs';
// node frame-stats.mjs <root>: <root> holds frames/pr<N>/frames.<side>.<platform>.json and static.<side>.<platform>.json
const S = process.argv[2] ?? '.';
const all = [];
for (const pr of [264, 270, 274]) for (const f of readdirSync(`${S}/frames/pr${pr}`).filter((f) => /^frames\..*\.json$/.test(f))) {
  for (const fr of JSON.parse(readFileSync(`${S}/frames/pr${pr}/${f}`, 'utf8'))) all.push({ pr, ...fr });
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const group = (key) => { const m = new Map(); for (const f of all) { const k = key(f); (m.get(k) ?? m.set(k, []).get(k)).push(f); } return m; };
console.log('frames total', all.length);
for (const [k, fs] of group((f) => `${f.platform}`)) {
  console.log(k, 'n', fs.length, 'prepare median ms', med(fs.map((f) => f.prepareMs)), 'capture median ms', med(fs.map((f) => f.captureMs)), 'bytes median', med(fs.map((f) => f.bytes)), 'max', Math.max(...fs.map((f) => f.bytes)), 'total KB', Math.round(fs.reduce((a, f) => a + f.bytes, 0) / 1024));
  console.log('   clip median', med(fs.map((f) => f.clip.width)), 'x', med(fs.map((f) => f.clip.height)));
}
for (const [k, fs] of group((f) => `${f.platform}/${f.theme}`)) console.log(k, 'n', fs.length, 'bytes median', med(fs.map((f) => f.bytes)));
// caret source and agreement
let both = 0, maxd = 0, domN = 0, coordsN = 0, none = 0, focusless = 0;
for (const f of all) {
  if (!f.caret) { focusless++; continue; }
  if (f.caret.source === 'dom') domN++; else if (f.caret.source === 'coords') coordsN++; else none++;
  if (f.caret.dom && f.caret.coords) { both++; maxd = Math.max(maxd, Math.abs(f.caret.dom.left - f.caret.coords.left), Math.abs(f.caret.dom.top - f.caret.coords.top), Math.abs(f.caret.dom.bottom - f.caret.coords.bottom)); }
}
console.log('caret: dom', domN, 'coords-only', coordsN, 'none', none, 'no caret drawn (no focus / range / reading)', focusless, '| both readings', both, 'max abs diff px', maxd.toFixed(2));
console.log('modes', [...group((f) => f.mode)].map(([k, v]) => `${k}:${v.length}`).join(' '));
for (const pr of [264, 270, 274]) for (const plat of ['desktop', 'mobile']) for (const side of ['head','main']) {
  try { const r = JSON.parse(readFileSync(`${S}/frames/pr${pr}/static.${side}.${plat}.json`, 'utf8')); console.log(`static pr${pr} ${side} ${plat}: native ${r.native.distinct}/8 distinct, drawn ${r.drawn.distinct}/8 distinct; ms/frame median native ${med(r.native.ms)} drawn ${med(r.drawn.ms)}`); } catch {}
}
// per case: frames identical between head and main?
const key = (f) => `${f.pr}|${f.case}|${f.platform}|${f.step}|${f.theme}`;
const byKey = new Map(); for (const f of all) { const k = key(f); (byKey.get(k) ?? byKey.set(k, {}).get(k))[f.side] = f; }
const stepDiff = new Map();
for (const [k, v] of byKey) { if (!v.head || !v.main) continue; const [pr, c, plat, step, theme] = k.split('|'); if (theme !== 'light') continue; const kk = `${pr}|${c}|${plat}`; (stepDiff.get(kk) ?? stepDiff.set(kk, []).get(kk)).push(`${step}:${v.head.sha === v.main.sha ? '=' : '≠'}`); }
for (const [k, v] of [...stepDiff].sort()) console.log(k.padEnd(60), v.join(' '));
