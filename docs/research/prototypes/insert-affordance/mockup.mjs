// Writes docs/research/insert-affordance-mockup.html: the candidate surfaces for
// adding a node by pointer, drawn at the plugin's own geometry and live to the
// pointer, so a treatment can be tried rather than argued about.
//
// Generated rather than hand-written because every column on the page is
// arithmetic on the real tokens — 2rem per level, a 14px marker gutter, a 1px
// guide centred on `depth × unit`, a hit band reaching `unit/2 - 2` left and
// `unit/3` right (styles/10-editor.css, src/plugin/chrome-line.ts,
// `guideHit` in src/plugin/zoom-click.ts). The fixtures are two real vault notes,
// with each row's drawn guide columns transcribed from `computeLineGuides` as
// dumped by guide-ends.ts in this folder.
//
// Run: node docs/research/prototypes/insert-affordance/mockup.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const UNIT = 32, GUT = 14, ICON = 13.6, ROWH = 26;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// (depth, kind, text, drawn guide columns, columns ending on this row)
const BRANCHING = [
  [0, 'paragraph', 'Thursday triage. Three threads under one heading, deliberately uneven.', [], []],
  [0, 'blank', '', [], []],
  [0, 'heading', 'Aurora', [], []],
  [0, 'blank', '', [0], []],
  [1, 'list', 'work', [0], []],
  [2, 'list', 'Aurora', [0, 1], []],
  [3, 'list', 'ship the Aurora Dashboard triage view behind a flag', [0, 1, 2], []],
  [3, 'list', 'prototype review', [0, 1, 2], []],
  [4, 'list', 'severity sort must be stable — see Aurora Dashboard', [0, 1, 2, 3], [3]],
  [3, 'list', 'open questions', [0, 1, 2], []],
  [4, 'list', 'touch fallback', [0, 1, 2, 3], []],
  [5, 'list', 'ask Priya whether Aurora Dashboard hover works on tablets', [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]],
  [5, 'blank', '', [], []],
  [0, 'heading', 'Kitchen', [], []],
  [0, 'blank', '', [0], []],
  [1, 'paragraph', 'Nothing moved. The tile is still in the hallway.', [0], [0]],
  [1, 'blank', '', [], []],
];
const AURORA = BRANCHING.slice(2, 12);
const DEEP = [
  [0, 'paragraph', 'Deep on purpose, so the collapsed lineage has something to collapse:', [], []],
  [0, 'blank', '', [0], []],
  [1, 'list', 'one', [0], []],
  [2, 'list', 'two', [0, 1], []],
  [3, 'list', 'three', [0, 1, 2], []],
  [4, 'list', 'four mentions Reference target', [0, 1, 2, 3], []],
  [5, 'list', 'a child of a deep mention', [0, 1, 2, 3, 4], []],
  [6, 'list', 'a grandchild, which the depth bound hides behind a fold', [0, 1, 2, 3, 4, 5], []],
  [7, 'list', 'a great-grandchild, hidden with it', [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]],
  [7, 'blank', '', [], []],
];
const KINDS = [
  [0, 'paragraph', 'A reference whose children are all different kinds:', [], []],
  [0, 'blank', '', [0], []],
  [1, 'list', 'a bullet child', [0], []],
  [1, 'task', 'a task child', [0], [0]],
];

// The plugin's own glyphs (`buildMarkerIcon`), plus the marks Obsidian itself
// draws for list lines, which outline mode leaves alone.
const MARKS = {
  heading:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="2" height="12" fill="currentColor"></rect>' +
    '<rect x="11" y="2" width="2" height="12" fill="currentColor"></rect><rect x="3" y="7" width="10" height="2" fill="currentColor"></rect></svg>',
  paragraph:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><line x1="2" y1="4" x2="14" y2="4"></line>' +
    '<line x1="2" y1="8" x2="14" y2="8"></line><line x1="2" y1="12" x2="9" y2="12"></line></svg>',
  list: '<span class="dot"></span>',
  task: '<span class="box"></span>',
};

/** Contiguous runs of each drawn guide column: [column, firstRow, lastRow]. */
function segments(fx) {
  const segs = [], open = new Map();
  fx.forEach(([, , , cols], i) => {
    for (const c of cols) if (!open.has(c)) open.set(c, i);
    for (const c of [...open.keys()]) {
      if (!cols.includes(c)) {
        segs.push([c, open.get(c), i - 1]);
        open.delete(c);
      }
    }
  });
  for (const [c, s] of open) segs.push([c, s, fx.length - 1]);
  return segs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function guides(fx, treat) {
  return segments(fx)
    .map(([c, first, last]) => {
      const top = first * ROWH, height = (last - first + 1) * ROWH;
      const left = c * UNIT - (UNIT / 2 - 2);
      const width = UNIT / 2 - 2 + UNIT / 3;
      const foot =
        treat === 'T1' || treat === 'T2'
          ? `<button type="button" class="ctl end" style="top: ${height - 9}px;" aria-label="Add a last child here">+</button>`
          : '';
      return (
        `<div class="gz" style="left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px;">` +
        `<i class="g" style="left: ${UNIT / 2 - 2 - 0.5}px;"></i>${foot}</div>`
      );
    })
    .join('\n      ');
}

function rows(fx, treat) {
  return fx
    .map(([d, kind, text]) => {
      if (kind === 'blank') return '<div class="r blank"></div>';
      const mk = `<span class="mk ${kind}" style="left: ${d * UNIT - ICON / 2}px;">${MARKS[kind]}</span>`;
      let extra = '';
      if (treat === 'T3')
        extra += `<button type="button" class="ctl gslot" style="left: ${d * UNIT - UNIT / 2 - 6}px;" aria-label="Add a child of this node">+</button>`;
      if (treat === 'T4')
        extra += '<button type="button" class="ctl tslot" aria-label="Add a child of this node">+</button>';
      return (
        `<div class="r${kind === 'heading' ? ' h' : ''}" style="padding-left: ${d * UNIT + GUT}px;">` +
        `${mk}<span class="tx">${esc(text)}</span>${extra}</div>`
      );
    })
    .join('\n      ');
}

/**
 * One hover zone per candidate depth at a closing row. A guide at column `c`
 * belongs to a node at depth `c`, so the node a control there would make lands
 * at depth `c + 1` — one unit right of the guide, on its own marker column.
 */
function depthZones(fx, row, cols, mode) {
  const top = (row + 1) * ROWH - 10;
  return cols
    .map((c) => {
      const left = (c + 1) * UNIT - UNIT / 2;
      const body =
        mode === 'T5'
          ? `<button type="button" class="ctl" style="left: ${UNIT / 2 - 9}px; top: -17px;" aria-label="Add a node at level ${c + 1}">+</button>`
          : `<div class="ghost" style="left: ${UNIT / 2}px;"><span class="mk list" style="left: ${-ICON / 2}px;">` +
            `<span class="dot"></span></span><span class="cur"></span></div>`;
      return `<div class="dz" style="left: ${left}px; top: ${top}px; width: ${UNIT}px;">${body}</div>`;
    })
    .join('\n      ');
}

function editor(fx, treat = '', zones = '', caption = '') {
  const cap = caption ? `<div class="cap">${caption}</div>` : '';
  return (
    `${cap}<div class="ed"><div class="tree" style="height: ${fx.length * ROWH}px;" data-t="${treat}">\n      ` +
    `${guides(fx, treat)}\n      ${rows(fx, treat)}\n      ${zones}\n    </div></div>`
  );
}

const PANELS = [
  ['T1', 'Every foot, always', 'no',
   'A control at every guide end, drawn unconditionally. The strawman: 22 per 100 lines, and the vault’s deepest closing line carries seven at once.',
   'Reads as a toolbar bolted to the text. Kept as the control, not a candidate.',
   () => editor(AURORA, 'T1')],
  ['T2', 'Guide hover, one foot', '',
   'The pointer picks the subtree by resting on its guide; the control appears at that guide’s foot alone. One control on screen, its depth unambiguous.',
   'Reuses guideHoverField and the existing hit band. Reaches parents only — a leaf owns no guide.',
   () => editor(AURORA, 'T2')],
  ['T3', 'Row hover, chevron slot', 'warn',
   'Hovering any line offers a control half a level left of its own marker, meaning “give this node a child”. Reaches every node, leaf included.',
   'That slot already holds the fold chevron on every parent, so the two collide exactly where both are wanted.',
   () => editor(AURORA, 'T3')],
  ['T4', 'Row hover, after the text', '',
   'The same intent, parked past the end of the line’s own text — no column to collide with, and it reads left to right as “this node, then a child”.',
   'Competes with clicking the trailing area to place the caret, and with the folded-node placeholder that already draws there.',
   () => editor(AURORA, 'T4')],
  ['T5', 'Foot hover, a depth ruler', '',
   'Hovering the foot band reveals one control per candidate depth, at the candidate columns. The crowding becomes the feature: horizontal position is the depth choice.',
   'Answers the ambiguity head on — 41.3% of the vault’s feet stand for more than one possible depth. Costs a second gesture.',
   () => editor(AURORA, '', depthZones(AURORA, 9, [0, 1, 2, 3, 4], 'T5'))],
  ['T6', 'Foot hover, a ghost node', '',
   'The same zones, but each shows a faint node row at that depth with a caret in it rather than a glyph. Says what will happen instead of offering a button.',
   'The plugin already renders exactly this: a provisional position is a node that is not there yet. No new iconography at all.',
   () => editor(AURORA, '', depthZones(AURORA, 9, [0, 1, 2, 3, 4], 'T6'))],
];

const CLEARANCE = [[1, 91, '58.7%'], [2, 35, '22.6%'], [3, 16, '10.3%'], [4, 8, '5.2%'], [5, 3, '1.9%'], [6, 1, '0.6%'], [7, 1, '0.6%']];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adding a node by pointer — candidate surfaces</title>
<!--
  GENERATED by docs/research/prototypes/insert-affordance/mockup.mjs — edit that
  and re-run, never this file.

  Companion to docs/research/node-insertion-affordances.md. Six candidate
  surfaces for adding a node with the pointer, each live: hover the guides, the
  rows, and the band under a subtree's last line.

  Geometry is the plugin's own — 2rem per level, a 14px marker gutter, a 1px
  guide centred on \`depth × unit\`, a hit band reaching \`unit/2 - 2\` left of a
  guide and \`unit/3\` right of it. Glyphs are \`buildMarkerIcon\`'s, plus the
  native marks outline mode leaves alone. Fixtures are two real vault notes,
  their per-row guide columns transcribed from \`computeLineGuides\`.
-->
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f6f3; --panel: #fffffe; --line: #e3e2dd; --text: #1f2023;
    --muted: #55575d; --faint: #a4a6ac; --glyph: #8d9097; --guide: #c9cace;
    --guide-hi: #9a9ca3; --accent: #574fc0; --accent-bg: #f2f1fd;
    --warn: #9a5312; --bad: #8a2f2f; --good: #4c6b4c;
  }
  [data-theme="dark"] {
    --bg: #1b1b1d; --panel: #232326; --line: #37373d; --text: #dcddde;
    --muted: #a3a4aa; --faint: #6b6d74; --glyph: #7e8087; --guide: #45464c;
    --guide-hi: #71737a; --accent: #a79ffb; --accent-bg: #2a2740;
    --warn: #d99a5b; --bad: #e08585; --good: #8fb98f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.75rem clamp(1rem, 4vw, 3.5rem) 5rem;
    background: var(--bg); color: var(--text);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  h1 { font-family: Newsreader, Georgia, serif; font-size: 1.85rem; margin: 0; letter-spacing: -0.01em; font-weight: 600; }
  h2 { font-family: Newsreader, Georgia, serif; font-size: 1.3rem; margin: 3rem 0 .35rem; font-weight: 600; }
  h3 { font-family: Newsreader, Georgia, serif; font-size: 1.1rem; margin: .35rem 0 .2rem; font-weight: 600; }
  p.lede { color: var(--muted); max-width: 74ch; margin: .5rem 0 0; }
  p.pd { font-size: .86rem; color: var(--muted); margin: 0 0 .8rem; min-height: 4.6em; }
  p.pv { font-size: .8rem; color: var(--muted); margin: .7rem 0 0; }
  .fig { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--text); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  button.theme {
    margin-left: auto; border: 1px solid var(--line); background: var(--panel);
    color: var(--text); border-radius: 6px; padding: .35rem .7rem; cursor: pointer;
    font: inherit; font-size: .85rem;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 1.4rem; margin-top: 1rem; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 1.8rem; margin-top: 1rem; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1.1rem; }
  .tag { display: inline-block; font-size: .66rem; font-weight: 700; letter-spacing: .07em;
         text-transform: uppercase; color: var(--accent); }
  .tag.warn { color: var(--warn); } .tag.no { color: var(--bad); }
  .cap { font-size: .75rem; color: var(--muted); margin-bottom: .4rem; }
  table.fx { border-collapse: collapse; font-size: .85rem; }
  table.fx th { text-align: left; padding: 0 .9rem .4rem 0; font-size: .68rem; text-transform: uppercase;
                letter-spacing: .06em; color: var(--muted); font-weight: 600; }
  table.fx td { padding: .35rem .9rem .35rem 0; border-top: 1px solid var(--line); }
  table.fx td.n { text-align: right; font-variant-numeric: tabular-nums; }
  .chip { display: inline-block; width: 9px; height: 9px; border-radius: 2px; background: var(--warn); margin-right: 3px; }
  .none { color: var(--good); font-weight: 600; font-size: .8rem; }

  /* ---- the mock editor, at the plugin's own geometry ---- */
  .ed { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .85rem 1rem; }
  .tree { position: relative; }
  .r { position: relative; height: ${ROWH}px; line-height: ${ROWH}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .r.h { font-family: Newsreader, Georgia, serif; font-size: 1.2rem; font-weight: 600; }
  .tx { color: var(--text); }
  .mk { position: absolute; top: 6.2px; width: ${ICON}px; height: ${ICON}px; color: var(--faint);
        display: inline-grid; place-items: center; }
  .mk svg { width: ${ICON}px; height: ${ICON}px; display: block; fill: none; stroke: currentColor;
            stroke-width: 1.6; stroke-linecap: round; }
  .mk .dot { width: 4.5px; height: 4.5px; border-radius: 50%; background: var(--glyph); }
  .mk .box { width: 11px; height: 11px; border-radius: 3px; border: 1.5px solid var(--glyph); background: var(--glyph); }
  .r.h .mk { top: 8.5px; }
  .gz { position: absolute; }
  .g { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--guide); }
  .gz:hover .g { width: 3px; background: var(--guide-hi); }
  .ctl { position: absolute; width: 18px; height: 18px; padding: 0; border-radius: 5px;
         border: 1px solid var(--line); background: var(--panel); color: var(--muted);
         font: 600 13px/1 system-ui, sans-serif; cursor: pointer; opacity: 0;
         display: grid; place-items: center; transition: opacity .09s ease; }
  .ctl:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); opacity: 1; }
  .ctl.end { left: 5px; }
  .gz:hover .ctl.end { opacity: 1; }
  .tree[data-t="T1"] .ctl.end { opacity: 1; }
  .r:hover .ctl.gslot, .r:hover .ctl.tslot { opacity: 1; }
  .ctl.tslot { position: static; margin-left: 8px; vertical-align: -4px; display: inline-grid; }
  .dz { position: absolute; height: 34px; }
  .dz:hover .ctl, .dz:hover .ghost { opacity: 1; }
  .ghost { position: absolute; top: 10px; height: ${ROWH}px; line-height: ${ROWH}px; opacity: 0; white-space: nowrap; }
  .ghost .mk { top: 6.2px; color: var(--faint); }
  .ghost .cur { display: inline-block; margin-left: ${GUT}px; width: 1.5px; height: 17px; background: var(--accent); vertical-align: -3px; }
</style>
</head>
<body>
<header>
  <h1>Adding a node by pointer — candidate surfaces</h1>
  <button class="theme" type="button" id="theme">dark</button>
</header>
<p class="lede">Companion to <code>node-insertion-affordances.md</code>. Everything here is live: hover the
  guides, the rows, and the band under a subtree's last line. Figures are from
  <code>prototypes/insert-affordance/guide-ends.ts</code> over the test vault plus two generated corpora.</p>

<h2>Anatomy of a foot</h2>
<p class="lede">A guide runs from the line after its owner's own lines to the last content line of its subtree —
  exactly where a new last child goes. Every parent ends exactly one guide; <span class="fig">0</span> of
  <span class="fig">17,332</span> feet land on a blank line, and a foot always sits at least one full level left
  of its host line's own text, so the gutter slot it needs is always free.</p>
<div class="two">
  <div>${editor(BRANCHING, 'T2', '', 'test-vault/Backlinks/Branching arms.md')}</div>
  <div class="panel">
    <span class="tag">What sits below a foot</span>
    <table class="fx" style="width: 100%; margin-top: .6rem;"><tbody>
      <tr><td>a blank line</td><td class="n fig">68.4%</td></tr>
      <tr><td>a shallower node's text</td><td class="n fig">27.1%</td></tr>
      <tr><td>the end of the note</td><td class="n fig">4.5%</td></tr>
    </tbody></table>
    <p class="pv">So the line <em>below</em> a foot cannot host the control: in every one of those 27.1% the next
      line's own marker sits at or left of the foot's column. The foot's own line always can.</p>
  </div>
</div>

<h2>Six surfaces</h2>
<p class="lede">The same subtree in each panel. T1–T2 hang the control off a guide and so reach parents only;
  T3–T4 hang it off a node and reach every node; T5–T6 treat a foot as a place with several possible depths
  rather than one.</p>
<div class="grid">
${PANELS.map(([key, name, tone, desc, verdict, render]) => `  <div class="panel">
    <span class="tag${tone ? ' ' + tone : ''}">${key}</span>
    <h3>${name}</h3>
    <p class="pd">${desc}</p>
    ${render()}
    <p class="pv">${verdict}</p>
  </div>`).join('\n')}
</div>

<h2>Seven feet on one line</h2>
<p class="lede">The worst line in the test vault: <code>Backlinks/Family tree.md</code> closes seven guides at
  once, at columns 0 through 6. They land on one line at distinct columns, one level apart — a horizontal run
  left of the text, not a vertical stack. <span class="fig">38.5%</span> of the vault's guide-end lines close two
  or more.</p>
<div class="two">
  <div><span class="tag no">T1 — all seven, always</span>${editor(DEEP, 'T1')}</div>
  <div><span class="tag">T5 — the same seven, on hover, as a ruler</span>
    ${editor(DEEP, '', depthZones(DEEP, 8, [0, 1, 2, 3, 4, 5, 6], 'T5'))}
    <p class="pv">Hover the band under the last line: the columns are the seven depths a new node could take
      here, from a sibling of the deepest item out to a child of the paragraph above the list.</p></div>
</div>

<h2>What a guide cannot reach</h2>
<p class="lede">A guide exists only under a node that already has children, and the count is exact across all
  three corpora: one foot per parent. In the test vault that is <span class="fig">155</span> parents against
  <span class="fig">212</span> leaves — <span class="fig">57.8%</span> of nodes own no guide, no foot, and so no
  place for a guide-hung control to appear.</p>
<div class="two">
  <div><span class="tag">Reachable by a foot (T2, T5, T6)</span>${editor(KINDS, 'T2')}
    <p class="pv">Only the paragraph has a foot. Neither list item can be given a first child from any guide,
      because neither has one to draw.</p></div>
  <div><span class="tag">Reachable by a node-hung control (T3, T4)</span>${editor(KINDS, 'T4')}
    <p class="pv">Every node answers, leaf included — the whole argument for a second surface rather than a
      better guide.</p></div>
</div>

<h2>What the keyboard route costs today</h2>
<p class="lede">Enter at the end of a subtree's last line opens a sibling of <em>that</em> line, at <em>its</em>
  depth; every level between is then an outdent. The distance is the foot's clearance — its host line's depth
  minus the guide's own column — which is also the number of depths a control at that foot could mean.</p>
<div class="two">
  <div class="panel">
    <span class="tag">Outdents after Enter, per foot — test vault</span>
    <table class="fx" style="width: 100%; margin-top: .6rem;">
      <thead><tr><th>clearance</th><th>outdents</th><th style="text-align: right;">feet</th><th style="text-align: right;">share</th></tr></thead>
      <tbody>
${CLEARANCE.map(([k, n, pc]) => `        <tr><td>${k}</td><td>${k === 1 ? '<span class="none">none</span>' : '<span class="chip"></span>'.repeat(k - 1)}</td><td class="n fig">${n}</td><td class="n" style="color: var(--muted);">${pc}</td></tr>`).join('\n')}
      </tbody>
    </table>
    <p class="pv"><span class="fig">41.3%</span> of the vault's feet need at least one outdent after Enter; the
      deepest needs six. On the generated tree corpus it is <span class="fig">41.8%</span> of 16,013 feet.</p>
  </div>
  <div><span class="tag">The five depths available at one foot</span>
    ${editor(AURORA, '', depthZones(AURORA, 9, [0, 1, 2, 3, 4], 'T6'))}
    <p class="pv">Hover each column under the last line. The ghost shows the node that column would make: the
      leftmost a second child of the <code>Aurora</code> heading, the rightmost a sibling of
      <code>ask Priya…</code>. Reaching the leftmost from the keyboard today is Enter and four outdents.</p></div>
</div>

<script>
  const btn = document.getElementById('theme');
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    btn.textContent = dark ? 'dark' : 'light';
  });
</script>
</body>
</html>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'insert-affordance-mockup.html');
writeFileSync(out, html);
console.log('wrote', out);
