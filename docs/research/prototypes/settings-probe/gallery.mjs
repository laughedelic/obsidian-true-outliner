/**
 * Folds the probe's output (`<out>/desktop`, `<out>/mobile`) into one
 * self-contained `gallery.html`: every layout as a row, its top level and each
 * page as columns, desktop above phone, with the measured height under each.
 *
 *   node docs/research/prototypes/settings-probe/gallery.mjs /tmp/settings-probe
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const out = path.resolve(process.argv[2] ?? '/tmp/settings-probe');
const platforms = ['desktop', 'mobile'].filter((p) => existsSync(path.join(out, p)));
if (platforms.length === 0) throw new Error(`nothing under ${out}`);

const img = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Layout ids in the order the probe ran them: current first, then the files. */
const ids = [];
for (const p of platforms) {
  for (const f of readdirSync(path.join(out, p))) {
    if (f.endsWith('.json')) {
      const id = f.replace(/\.json$/, '');
      if (!ids.includes(id)) ids.push(id);
    }
  }
}
ids.sort((a, b) => (a === 'current' ? -1 : b === 'current' ? 1 : a.localeCompare(b)));

const sections = ids.map((id) => {
  const per = platforms
    .map((p) => {
      const file = path.join(out, p, `${id}.json`);
      if (!existsSync(file)) return '';
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const cells = Object.entries(data.pages)
        .map(([prefix, m]) => {
          const shots = ['top', 'bottom']
            .map((s) => path.join(out, p, `${prefix}-${s}.png`))
            .filter(existsSync)
            .map((f) => `<img src="${img(f)}" alt="">`)
            .join('');
          const level = prefix === id ? 'top level' : m.title ?? prefix;
          const rows = m.rows.filter((r) => r.kind === 'row').length;
          const pages = m.rows.filter((r) => r.kind === 'page').length;
          return `<figure><figcaption><b>${esc(level)}</b> · ${m.viewports} screens · ${rows} rows${pages ? `, ${pages} page entries` : ''}</figcaption>${shots}</figure>`;
        })
        .join('');
      const search = Object.entries(data.search)
        .map(
          ([q, groups]) =>
            `<li><code>${esc(q)}</code>: ${groups.map((g) => `${g.page ? `<i>${esc(g.page)}</i> ` : ''}${g.results.length}`).join(' + ') || 'nothing'}</li>`,
        )
        .join('');
      return `<div class="platform"><h3>${p}</h3><div class="strip">${cells}</div><ul class="search">${search}</ul></div>`;
    })
    .join('');
  const title = platforms.map((p) => path.join(out, p, `${id}.json`)).filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')).title)[0] ?? id;
  return `<section id="${esc(id)}"><h2>${esc(title)}</h2>${per}</section>`;
});

const html = `<title>Settings tab layouts</title>
<style>
  :root { --bg: #f4f4f2; --panel: #ffffff; --ink: #1f1f1f; --muted: #626262; --line: #d6d6d2; --accent: #6d4fc2; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #1c1c1e; --panel: #2a2a2d; --ink: #ececec; --muted: #a3a3a3; --line: #3c3c40; --accent: #a58cf0; }
  }
  :root[data-theme="dark"] { --bg: #1c1c1e; --panel: #2a2a2d; --ink: #ececec; --muted: #a3a3a3; --line: #3c3c40; --accent: #a58cf0; }
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0; padding-block: 24px; padding-inline: 20px; color: var(--ink); background: var(--bg); }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p.lede { color: var(--muted); max-width: 64ch; margin: 0 0 16px; }
  nav { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-bottom: 8px; }
  nav a { color: var(--accent); text-decoration: none; }
  nav a:focus-visible, .strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  section { margin: 28px 0; padding-top: 16px; border-top: 1px solid var(--line); }
  h2 { margin: 0 0 4px; font-size: 17px; }
  h3 { margin: 12px 0 6px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  .strip { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: 0 0 auto; }
  figcaption { font-size: 12px; margin-bottom: 4px; color: var(--muted); font-variant-numeric: tabular-nums; }
  figcaption b { color: var(--ink); }
  figure img { display: block; height: 520px; max-width: none; border: 1px solid var(--line); margin-bottom: 4px; background: var(--panel); }
  .search { font-size: 12px; color: var(--muted); margin: 4px 0 0; padding-left: 18px; }
  .search li { margin: 0; }
  code { font-family: ui-monospace, monospace; font-size: 11.5px; }
</style>
<h1>Settings tab layouts</h1>
<p class="lede">Each layout as Obsidian 1.13.7 renders it: the top level, then every page, desktop above phone.
The figure under a picture is how many screens that level scrolls. The search lines say how many rows a query finds, per page.</p>
<nav>${ids.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join('')}</nav>
${sections.join('\n')}
`;
writeFileSync(path.join(out, 'gallery.html'), html);
console.log(`wrote ${path.join(out, 'gallery.html')} (${ids.length} layouts, ${platforms.join(' + ')})`);
