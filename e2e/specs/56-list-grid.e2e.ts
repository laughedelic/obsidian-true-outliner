/**
 * lists-on-the-outline-grid: the geometry assertions.
 *
 * Everything here measures RENDERED positions rather than the custom properties
 * that produce them — this layer's history is of computations that were
 * internally consistent and rendered wrong. Text columns come from the text
 * nodes' own client rects rather than from `coordsAtPos`, which reports the end
 * of a marker's TEXT rather than of its box and therefore agrees with a wrong
 * answer (the 16px soft-wrap defect this change fixes was invisible to it).
 *
 * One short note per shape, rather than one long one: CM6 renders only the
 * viewport, so a fixture longer than the window silently drops its tail.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

interface LineGeometry {
  n: number;
  text: string;
  isList: boolean;
  depth: number;
  column: number;
  textX: number | null;
  wrapX: number | null;
  markerX: number | null;
  nativeGuideWidth: string | null;
}

function geometry(): Promise<LineGeometry[]> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const cb = content.getBoundingClientRect();
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const unitRaw = getComputedStyle(content).getPropertyValue('--to-decor-unit').trim();
    const unit = parseFloat(unitRaw) * (unitRaw.endsWith('rem') ? remPx : 1);
    const out: LineGeometry[] = [];
    for (const child of Array.from(content.children)) {
      const el = child as HTMLElement;
      let n = -1;
      try {
        n = cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
      } catch {
        continue;
      }
      const es = getComputedStyle(el);
      const depth = Number(es.getPropertyValue('--to-depth').trim() || '0');

      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const rowLefts = new Map<number, number>();
      let node: Node | null = walker.nextNode();
      while (node) {
        const chrome = node.parentElement?.closest(
          '.cm-formatting-list, .cm-hmd-list-indent, .task-list-label',
        );
        // Whitespace-only nodes are indentation, not content — a leading tab is
        // not always wrapped in `.cm-hmd-list-indent`, and counting it reports
        // the line start as the text column.
        if (!chrome && (node.textContent ?? '').trim() !== '') {
          range.selectNodeContents(node);
          for (const b of Array.from(range.getClientRects())) {
            if (b.width === 0) continue;
            const key = Math.round(b.top);
            const left = +(b.left - cb.left).toFixed(2);
            if (!rowLefts.has(key) || left < (rowLefts.get(key) as number)) {
              rowLefts.set(key, left);
            }
          }
        }
        node = walker.nextNode();
      }
      const rows = Array.from(rowLefts.entries())
        .sort((a, b) => a[0] - b[0])
        .map((e) => e[1]);

      const bullet = el.querySelector(':scope .list-bullet');
      const icon = el.querySelector(':scope .to-decor-marker-icon');
      const checkbox = el.querySelector(':scope .task-list-item-checkbox');
      let markerX: number | null = null;
      if (bullet) {
        const after = getComputedStyle(bullet, '::after');
        const br = bullet.getBoundingClientRect();
        markerX = +(
          br.left -
          cb.left +
          (parseFloat(after.left) || 0) +
          (parseFloat(after.width) || 0) / 2
        ).toFixed(2);
      } else if (icon) {
        const r = icon.getBoundingClientRect();
        markerX = +(r.left - cb.left + r.width / 2).toFixed(2);
      } else if (checkbox) {
        markerX = +(checkbox.getBoundingClientRect().left - cb.left).toFixed(2);
      }

      const indents = Array.from(el.querySelectorAll(':scope .cm-indent'));
      out.push({
        n,
        text: cm.state.doc.line(n + 1).text.trim().slice(0, 40),
        isList: el.classList.contains('to-decor-list'),
        depth,
        column: +(depth * unit).toFixed(2),
        textX: rows.length ? rows[0]! : null,
        wrapX: rows.length > 1 ? rows[1]! : null,
        markerX,
        nativeGuideWidth: indents.length
          ? getComputedStyle(indents[0]!, '::before').borderInlineEndWidth
          : null,
      });
    }
    return out;
  });
}

let seq = 0;
async function open(md: string, mode: 'on' | 'off' = 'on'): Promise<LineGeometry[]> {
  const note = `Scratch/list-grid-${++seq}.md`;
  await h.createNote(note, md);
  const on = await h.isOutlineMode(note);
  if ((mode === 'on') !== on) {
    await h.toggleOutlineMode();
    await browser.pause(200);
    await h.dismissNotices();
  }
  await browser.pause(300);
  return geometry();
}

const at = (rows: LineGeometry[], n: number): LineGeometry => {
  const row = rows.find((r) => r.n === n);
  if (!row) throw new Error(`line ${n} not rendered; have ${rows.map((r) => r.n).join(',')}`);
  return row;
};

const UNIT = 24; // 1.5rem at a 16px root
const GUTTER = 20; // 1.25rem

const TABS = ['# H', '', '- one', '\t- two', '\t\t- three', ''].join('\n');

describe('lists on the outline grid', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('steps every tab-indented list level by exactly one unit, marker included', async function () {
    const rows = await open(TABS);
    const [one, two, three] = [at(rows, 2), at(rows, 3), at(rows, 4)];
    expect(two.column - one.column).toBe(UNIT);
    expect(three.column - two.column).toBe(UNIT);
    // the RENDERED marker follows the computed column, not just the fact
    expect(one.markerX).toBeCloseTo(one.column, 1);
    expect(two.markerX).toBeCloseTo(two.column, 1);
    expect(three.markerX).toBeCloseTo(three.column, 1);
  });

  it('four-space indentation takes the same grid as tabs', async function () {
    const rows = await open(['# H', '', '- one', '    - two', ''].join('\n'));
    expect(at(rows, 3).column - at(rows, 2).column).toBe(UNIT);
    expect(at(rows, 3).markerX).toBeCloseTo(at(rows, 3).column, 1);
  });

  it('starts a heading, a paragraph and a list item at the same depth on one column', async function () {
    const rows = await open(['# H', '', '- an item', '', 'A paragraph.', ''].join('\n'));
    const item = at(rows, 2);
    const paragraph = at(rows, 4);
    expect(item.column).toBe(paragraph.column);
    expect(item.markerX).toBeCloseTo(paragraph.markerX!, 1);
    expect(item.textX! - item.column).toBeCloseTo(GUTTER, 1);
    expect(paragraph.textX! - paragraph.column).toBeCloseTo(GUTTER, 1);
  });

  it('lands a soft-wrapped list row on its own item’s text column, at two depths', async function () {
    const long = 'wrapped '.repeat(30).trim();
    const rows = await open(
      ['# H', '', `- ${long}`, `\t- ${long}`, ''].join('\n'),
    );
    for (const n of [2, 3]) {
      const row = at(rows, n);
      expect(row.wrapX).not.toBeNull();
      expect(row.wrapX).toBeCloseTo(row.textX!, 1);
      expect(row.textX! - row.column).toBeCloseTo(GUTTER, 1);
    }
  });

  it('corrects a wrapped row when outline mode is turned on for an open note', async function () {
    // The case a MEASURED hang got wrong: Obsidian caches it per line and its
    // observer does not watch the attribute a decoration changes, so the old
    // wrap column survived the toggle. A stated hang has nothing to cache.
    const long = 'wrapped '.repeat(30).trim();
    await open(['# H', '', '- parent', `\t- ${long}`, ''].join('\n'), 'off');
    await h.toggleOutlineMode();
    await browser.pause(400);
    await h.dismissNotices();
    const rows = await geometry();
    const row = at(rows, 3); // the nested, wrapping item
    expect(row.wrapX).toBeCloseTo(row.textX!, 1);
    expect(row.textX! - row.column).toBeCloseTo(GUTTER, 1);
  });

  it('starts a task checkbox on its column and its text at the gutter', async function () {
    const rows = await open(['# H', '', '- [ ] open', '\t- [x] done', ''].join('\n'));
    for (const n of [2, 3]) {
      const row = at(rows, n);
      expect(row.markerX).toBeCloseTo(row.column, 1);
      expect(row.textX! - row.column).toBeCloseTo(GUTTER, 1);
    }
  });

  it('pushes a wide ordered marker’s own text out rather than crossing the column', async function () {
    const rows = await open(['# H', '', '9. ninth', '10. tenth', ''].join('\n'));
    const ninth = at(rows, 2);
    const tenth = at(rows, 3);
    expect(tenth.column).toBe(ninth.column);
    expect(ninth.textX! - ninth.column).toBeCloseTo(GUTTER, 1);
    expect(tenth.textX!).toBeGreaterThan(ninth.textX!);
  });

  it('suppresses Obsidian’s own list guide wherever it draws one', async function () {
    const rows = await open(TABS);
    const withNative = rows.filter((r) => r.nativeGuideWidth !== null);
    expect(withNative.length).toBeGreaterThan(0);
    for (const row of withNative) expect(row.nativeGuideWidth).toBe('0px');
  });

  it('draws our own guide on list levels, one layer per ancestor', async function () {
    const rows = await open(TABS);
    const layers = async (n: number) =>
      ((await h.getLinePseudoComputedStyle(n, 'background-image')).match(/gradient\(/g) ?? [])
        .length;
    // "- one" has the heading above it; each level below adds one more.
    expect(await layers(at(rows, 3).n)).toBe((await layers(at(rows, 2).n)) + 1);
    expect(await layers(at(rows, 4).n)).toBe((await layers(at(rows, 3).n)) + 1);
  });

  it('paints a guide whose own centre is the column its marker sits on, in both themes', async function () {
    // The half-pixel this guards: a marker centred on `depth × unit` while the
    // guide painted its 1px as [column, column + 1], so every marker sat half a
    // pixel left of its own line — measurable, and visible at 2x. Both now
    // derive from one helper, so the check is that the PAINTED stripe's centre
    // and the marker's centre agree, not that either matches a formula.
    const md = ['# H', '', '- an item', '\t- nested', '', 'A paragraph.', ''].join('\n');
    for (const dark of [false, true]) {
      await h.setTheme(dark);
      const rows = await open(md);
      await browser.pause(150);

      // The nested item's line carries its parent's guide; the parent's marker
      // is the thing that guide should come out of.
      const parent = at(rows, 2);
      const nested = at(rows, 3);
      const positions = await h.getLinePseudoComputedStyle(nested.n, 'background-position');
      // One "<x> <y>" pair per layer; the parent's is the deepest x present.
      const xs = positions
        .split(',')
        .map((p) => parseFloat(p.trim().split(/\s+/)[0] ?? ''))
        .filter((x) => !Number.isNaN(x));
      expect(xs.length).toBeGreaterThan(0);
      const parentStripe = Math.max(...xs);
      // A 1px stripe starting at `parentStripe` has its centre half a pixel in.
      expect(parentStripe + 0.5).toBeCloseTo(parent.markerX!, 1);
    }
    await h.setTheme(false);
  });

  it('renders a note without outline mode with no contribution at all', async function () {
    const rows = await open(TABS, 'off');
    for (const row of rows) {
      expect(row.isList).toBe(false); // no decoration class
      expect(row.column).toBe(0); // no depth published
      expect(row.nativeGuideWidth === null || row.nativeGuideWidth !== '0px').toBe(true);
    }
    // Obsidian's own bullets are of course still there — what must be absent is
    // any marker of ours.
    const icons = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (view.editor as any).cm.contentDOM.querySelectorAll('.to-decor-marker-icon').length;
    });
    expect(icons).toBe(0);
  });

  it('leaves two-space indentation on Obsidian’s own columns (documented residual)', async function () {
    // Obsidian resolves a tab or exactly four spaces into an indent unit and
    // renders anything shorter at its literal width — with the plugin disabled
    // too. The tree depth is still right; only the rendered column is not, and
    // this pins that it is Obsidian's behaviour rather than ours regressing.
    const rows = await open(['# H', '', '- one', '  - two', ''].join('\n'));
    const two = at(rows, 3);
    expect(two.column).toBe(at(rows, 2).column + UNIT); // the FACT is correct
    expect(Math.abs(two.markerX! - two.column)).toBeGreaterThan(1); // the RENDER is not
  });
});
