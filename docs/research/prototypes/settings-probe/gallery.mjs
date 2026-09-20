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

const html = `<!doctype html>
<meta charset="utf-8">
<title>Settings tab layouts</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; color: #222; background: #f6f6f6; }
  nav a { margin-right: 12px; }
  section { margin: 32px 0; }
  h2 { margin: 0 0 8px; }
  h3 { margin: 12px 0 4px; font-size: 13px; text-transform: uppercase; color: #666; }
  .strip { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
  figure { margin: 0; flex: 0 0 auto; }
  figcaption { font-size: 12px; margin-bottom: 4px; }
  figure img { display: block; height: 520px; border: 1px solid #ccc; margin-bottom: 4px; background: #fff; }
  .search { font-size: 12px; color: #555; margin: 4px 0 0; padding-left: 18px; }
  .search li { margin: 0; }
</style>
<h1>Settings tab layouts</h1>
<p>Each layout as Obsidian 1.13.7 renders it: the top level, then every page. The height under a
picture is how many screens that level scrolls. Search lines give how many rows a query finds,
per page.</p>
<nav>${ids.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join('')}</nav>
${sections.join('\n')}
`;
writeFileSync(path.join(out, 'gallery.html'), html);
console.log(`wrote ${path.join(out, 'gallery.html')} (${ids.length} layouts, ${platforms.join(' + ')})`);
