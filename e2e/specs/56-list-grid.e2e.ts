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
 *
 * Assert the RULE, never a position a glyph's width decides. Four assertions
 * here have already had to be rewritten for it: `1. ` measures 18.4px in the
 * bundled theme on macOS and 20.36px on CI's Linux font, so anything sized by
 * `min-width` against the 20px gutter lands differently on the two.
 *
 * The specific trap, all four times: an ORDERED item's own text column is not a
 * fixed offset from anything. Its marker is `min-width: gutter`, so where the
 * glyphs exceed the gutter the item's own first row moves right — by 0.36px on
 * CI and by nothing locally. Never assert that it equals another line's text
 * column, another item's, or its own continuation's. What holds on any font is
 * the grid: `textX - column === GUTTER` for a line whose marker fits, `>=` for
 * one whose marker may not, and relationships between things sized from the
 * icon rather than the font — this marker starts where that one does, these two
 * chevrons agree.
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
  /** Left/right of the marker run, for the kinds whose mark is its glyphs. */
  markerBox: { l: number; r: number } | null;
  /** Left/right of a block line's own marker icon, when one renders. */
  iconBox: { l: number; r: number } | null;
  /** Left/right of the fold chevron's PAINTED glyph, when one renders. */
  foldGlyph: { l: number; r: number } | null;
  /** Vertical centre of the fold chevron's painted glyph, relative to its line. */
  foldGlyphCy: number | null;
  /** Vertical centre of the line's own mark, relative to its line. */
  markerCy: number | null;
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
          // From the first INK, not from the node's start: a task line's
          // content span opens with the space Obsidian leaves after `]`, and
          // measuring from the box would report a text column no reader sees.
          const raw = node.textContent ?? '';
          range.setStart(node, raw.length - raw.trimStart().length);
          range.setEnd(node, raw.length);
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
        const r = checkbox.getBoundingClientRect();
        markerX = +(r.left - cb.left + r.width / 2).toFixed(2);
      }

      const lineTop = el.getBoundingClientRect().top;
      const cyOf = (sel: string) => {
        const e = el.querySelector(sel.startsWith(':scope') ? sel : `:scope ${sel}`);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.height === 0 ? null : +(r.top + r.height / 2 - lineTop).toFixed(2);
      };
      const boxOf = (sel: string) => {
        const e = el.querySelector(`:scope ${sel}`);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { l: +(r.left - cb.left).toFixed(2), r: +(r.right - cb.left).toFixed(2) };
      };
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
        markerBox: boxOf('.cm-formatting-list-ol') ?? boxOf('.task-list-item-checkbox'),
        iconBox: boxOf('.to-decor-marker-icon'),
        // The `<svg>`, not `.collapse-indicator`: the wrapper's width is hit
        // area and differs by kind (15px on a heading, 30.8px on a list item,
        // where `--list-bullet-end-padding` widens it), so comparing wrappers
        // across kinds compares padding rather than glyphs.
        foldGlyph: boxOf('.cm-fold-indicator .collapse-indicator svg'),
        foldGlyphCy: cyOf('.cm-fold-indicator .collapse-indicator svg'),
        markerCy:
          cyOf(':scope > .to-decor-marker-icon svg') ??
          cyOf('.list-bullet') ??
          cyOf('.task-list-item-checkbox'),
        nativeGuideWidth: indents.length
          ? getComputedStyle(indents[0]!, '::before').borderInlineEndWidth
          : null,
      });
    }
    return out;
  });
}

/**
 * The caret's own x, in the same frame `geometry()` reports columns in.
 *
 * `coordsAtPos` is the instrument here, and deliberately: Obsidian renders
 * `.cm-layer.cm-cursorLayer` empty and lets the browser draw the caret from the
 * DOM selection, and the two agree to the hundredth of a pixel. This suite's
 * header warns off `coordsAtPos` for a MARKER's box, which is a different
 * quantity — there it reports the end of the marker's text rather than of its
 * padded box, which is exactly the thing a caret is.
 */
function caretX(lineIndex: number, ch: number): Promise<number> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineIndex: number, ch: number) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error('no active markdown view');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      cm.focus();
      const line = cm.state.doc.line(lineIndex + 1);
      cm.dispatch({ selection: { anchor: line.from + ch } });
      const coords = cm.coordsAtPos(line.from + ch);
      if (!coords) throw new Error(`no coords for line ${lineIndex} ch ${ch}`);
      // Relative to the CONTENT box, the frame `geometry()` reports every
      // column in — a list line's own box is margin-shifted by its
      // supplemental depth, so a line-relative x would be a unit short of the
      // text column it has to be compared with.
      return +(coords.left - cm.contentDOM.getBoundingClientRect().left).toFixed(2);
    },
    lineIndex,
    ch,
  );
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

const setIndentGuides = async (show: boolean): Promise<void> => {
  await h.setIndentGuides(show);
  await browser.pause(300);
};

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

  it('centres a task checkbox on its own column, with its text at the gutter', async function () {
    // A checkbox is the same kind of node marker a bullet is, so it takes the
    // column the same way — centred, not merely started there. The text column
    // is a range rather than a pixel: it is the gutter, within the subpixel the
    // measured space advance is published at, and a control wider than the
    // gutter would legitimately push it further out — a platform's business,
    // not this layer's.
    const rows = await open(['# H', '', '- [ ] open', '\t- [x] done', ''].join('\n'));
    for (const n of [2, 3]) {
      const row = at(rows, n);
      expect(row.markerX).toBeCloseTo(row.column, 1);
      expect(row.textX! - row.column).toBeGreaterThan(GUTTER - 0.5);
      expect(row.textX! - row.column).toBeLessThan(GUTTER + 8);
    }
  });

  it('centres a checkbox on the same column as the bullets around it', async function () {
    // Reported from real use: in a MIXED list a checkbox sat nearer its text
    // than the bullets above and below it, because it STARTED on the column
    // while they centred on it. Same node marker, same treatment.
    const rows = await open(
      ['# H', '', '- a bullet', '- [ ] a task', '- another bullet', ''].join('\n'),
    );
    const [bullet, task, bullet2] = [at(rows, 2), at(rows, 3), at(rows, 4)];
    expect(task.column).toBe(bullet.column);
    expect(task.markerX).toBeCloseTo(bullet.markerX!, 1);
    expect(task.markerX).toBeCloseTo(bullet2.markerX!, 1);
    expect(task.markerX).toBeCloseTo(task.column, 1);
  });

  it('starts every ordered number on the left edge a block icon starts on', async function () {
    // A number's mark is its glyphs, so it cannot shrink its box onto the
    // column the way a bullet does. It is shifted by a FIXED half-icon instead
    // of half its own width: every number then shares one left edge — and that
    // edge is the one a block marker at the same depth starts on, which is the
    // comparison a reader makes when a numbered list sits beside a paragraph.
    const rows = await open(
      ['# H', '', '1. first', '9. ninth', '10. tenth', '100. hundredth', '', 'A paragraph.', ''].join('\n'),
    );
    const numbers = [2, 3, 4, 5].map((n) => at(rows, n));
    const paragraph = at(rows, 7);
    expect(paragraph.column).toBe(numbers[0]!.column);
    expect(paragraph.iconBox).not.toBeNull();

    // The RULE, asserted against the icon actually rendered rather than against
    // the constant it is sized from: same left edge, whatever the number's own
    // width, which is what makes the left edge shared at all.
    for (const row of numbers) {
      expect(row.markerBox!.l).toBeCloseTo(paragraph.iconBox!.l, 1);
    }

    // and none of them reaches into its own text
    for (const row of numbers) expect(row.markerBox!.r).toBeLessThanOrEqual(row.textX! + 0.5);
  });

  it('lands a list chevron the same distance from its marker as a block chevron', async function () {
    // The chevron renders with its right edge on the item's content origin,
    // which is now the marker's own centre rather than a point to its left, so
    // it overlapped every centred mark. `--list-bullet-end-padding` is not the
    // lever (it grows the box rightward and the inset compensates); the glyph
    // is moved directly.
    //
    // How FAR is the block rule's answer, minus its gutter term — a block's
    // chevron is anchored at the text origin, a list's at its content origin,
    // which the grid has already put on the column. Asserted as the two kinds
    // agreeing rather than as a distance, so neither can drift from the other.
    const rows = await open(
      ['# H', '', 'A paragraph.', '', '- a bullet', '\t- child', '- [ ] a task', '\t- child', ''].join('\n'),
    );
    const heading = at(rows, 0);
    expect(heading.foldGlyph).not.toBeNull();
    const blockOffset = heading.foldGlyph!.r - heading.column;

    const foldable = rows.filter((r) => r.isList && r.foldGlyph !== null && r.markerX !== null);
    expect(foldable.length).toBeGreaterThan(0);
    for (const row of foldable) {
      expect(row.foldGlyph!.r - row.column).toBeCloseTo(blockOffset, 1);
      // Still clear of the mark — a checkbox is the widest centred one, half of
      // it 8px — and of the parent level's guide one unit further left.
      expect(row.foldGlyph!.r).toBeLessThan(row.column - 8);
      expect(row.foldGlyph!.l).toBeGreaterThanOrEqual(row.column - UNIT);
    }
  });

  it('pushes a wide ordered marker’s own text out rather than crossing the column', async function () {
    const rows = await open(['# H', '', '9. ninth', '10. tenth', ''].join('\n'));
    const ninth = at(rows, 2);
    const tenth = at(rows, 3);
    expect(tenth.column).toBe(ninth.column);
    // `9. ` fits the gutter on the platforms measured, but its glyph width is
    // the font's business, so the contract is "at least the gutter" rather than
    // a pixel value — same reasoning as the checkbox above.
    expect(ninth.textX! - ninth.column).toBeGreaterThanOrEqual(GUTTER);
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

  it('paints every stripe whole, the root one included', async function () {
    // The half a stripe this guards, which the centre check above cannot see:
    // a stripe is centred on its column, so half of it falls left of that
    // column — and at depth 0 the column IS the overlay's own left edge, where
    // a background is clipped away. `background-position` reported the right
    // number all along (-0.5px); the paint was half a line. So the assertion is
    // that no layer starts left of what the box actually paints.
    const rows = await open(['# H', '', 'A paragraph.', ''].join('\n'));
    const line = at(rows, 2).n; // carries the heading's depth-0 guide
    const bleed = parseFloat(await h.getLinePseudoComputedStyle(line, 'border-left-width'));
    const xs = (await h.getLinePseudoComputedStyle(line, 'background-position'))
      .split(',')
      .map((p) => parseFloat(p.trim().split(/\s+/)[0] ?? ''))
      .filter((x) => !Number.isNaN(x));
    expect(xs.length).toBeGreaterThan(0);
    expect(bleed).toBeGreaterThan(0);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(-bleed);
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

  it('puts space-indented levels on the grid whatever the space count', async function () {
    // Obsidian resolves a tab or exactly four spaces into an indent unit and
    // renders the remainder at its literal width, so a two-space file walked
    // right by one space advance per level while our guides stayed a unit
    // apart — the bullets ended up ON the guides. Sizing the indent WRAPPER to
    // the item's own depth states the answer for whatever it contains.
    for (const indent of ['  ', '   ', '\t']) {
      const rows = await open(
        ['# H', '', '- one', `${indent}- two`, `${indent}${indent}- three`, ''].join('\n'),
      );
      for (const n of [2, 3, 4]) {
        const row = at(rows, n);
        expect(row.markerX).toBeCloseTo(row.column, 1);
        expect(row.textX! - row.column).toBeCloseTo(GUTTER, 1);
      }
      expect(at(rows, 3).column - at(rows, 2).column).toBe(UNIT);
      expect(at(rows, 4).column - at(rows, 3).column).toBe(UNIT);
    }
  });

  it('puts a task item’s text on the same column as a bullet item’s', async function () {
    // Obsidian leaves the space after `]` as the first character of the CONTENT
    // span, where the marker span's `min-width` cannot absorb it the way it
    // absorbs a bullet's; the task's text sat one space advance further out
    // than every other kind's. Asserted against the bullet beside it rather
    // than against a pixel, the advance being the font's business.
    const rows = await open(
      ['# H', '', '- a bullet', '- [ ] a task', '1. a number', ''].join('\n'),
    );
    const [bullet, task, number] = [at(rows, 2), at(rows, 3), at(rows, 4)];
    expect(task.column).toBe(bullet.column);
    expect(task.textX).toBeCloseTo(bullet.textX!, 1);
    // and the checkbox has not moved off its column to pay for it
    expect(task.markerX).toBeCloseTo(task.column, 1);

    // An ordered item is NOT held to equality here, and asserting it was this
    // spec's third font-encoded assertion: `1. ` measures 18.4px in the bundled
    // theme on macOS and 20.36px on CI's Linux font, so where the gutter is
    // 20px its own `min-width` legitimately pushes its text 0.36px out. Never
    // LEFT of the bullet's column is the part that holds on any font — the
    // wide-marker case has its own test below.
    expect(number.textX!).toBeGreaterThanOrEqual(bullet.textX! - 0.05);
  });

  it('puts a hard continuation line under its own item’s text, at every kind', async function () {
    // A continuation line carries `to-decor-list` like the item's first line
    // but has no marker, so the rule that states the leading whitespace has to
    // give it the WHOLE hang where a first line gets the hang less its gutter.
    // Without that term the continuation landed on the marker's column, 20px
    // left of the row above it; without the rule at all Obsidian sized the span
    // from the whitespace rather than from the marker it sits under, and it
    // landed 4.38px right under a bullet and 8.56px right under `1. `.
    const rows = await open(
      [
        '# H',
        '',
        '- alpha',
        '  a continuation of alpha',
        '\t- nested',
        '\t  a continuation of nested',
        '',
        '1. one',
        '   a continuation of one',
        '',
        '- [ ] a task',
        '  a continuation of the task',
        '',
      ].join('\n'),
    );
    //
    // The contract is the continuation's own column, not equality with the row
    // above: a marker wider than the gutter pushes its own first row out and
    // the continuation stays on the grid. `1. ` is 18.4px on macOS and 20.36px
    // on CI's Linux font, so equality holds locally and misses by 0.36px there
    // — this spec's fourth font-encoded assertion, and the one this file's own
    // header warns about.
    for (const [first, cont] of [
      [2, 3],
      [4, 5],
      [7, 8],
      [10, 11],
    ] as const) {
      const item = at(rows, first);
      const continuation = at(rows, cont);
      expect(continuation.textX! - continuation.column).toBeCloseTo(GUTTER, 1);
      // never left of it either, which is what a too-wide continuation would be
      expect(item.textX!).toBeGreaterThanOrEqual(continuation.textX! - 0.05);
    }
  });

  it('wraps a continuation line onto its own column, not the marker’s', async function () {
    const long = 'wrapped '.repeat(30).trim();
    const rows = await open(['# H', '', '- alpha', `  ${long}`, ''].join('\n'));
    const continuation = at(rows, 3);
    expect(continuation.wrapX).not.toBeNull();
    expect(continuation.wrapX).toBeCloseTo(continuation.textX!, 1);
    expect(continuation.textX! - continuation.column).toBeCloseTo(GUTTER, 1);
  });

  it('centres a fold chevron on the mark it belongs to, at every kind and heading level', async function () {
    // Obsidian centres the chevron on the line's CONTENT BOX while every marker
    // kind takes its own vertical anchor (design D6a), so the two disagreed by
    // an amount that varies with kind and font size — measured, +2.67px on an
    // H1, +1.67 on an H2, −0.80 on a paragraph, +1.78 on a bullet, +2.25 on a
    // checkbox. Reported from real use, most visibly on the bullet and the
    // checkbox. Corrected per line from a live measurement, so the assertion is
    // that they AGREE, at whatever font size the theme gives each row.
    const rows = await open(
      [
        '# H1',
        '',
        'body under h1',
        '',
        '### H3',
        '',
        'body under h3',
        '',
        'A parent paragraph.',
        '',
        '\tchild of the paragraph',
        '',
        '- a bullet',
        '\t- child',
        '',
        '- [ ] a task',
        '\t- [ ] child',
        '',
      ].join('\n'),
    );
    const foldable = rows.filter((r) => r.foldGlyphCy !== null && r.markerCy !== null);
    // one per kind in the fixture: H1, H3, paragraph, bullet, task
    expect(foldable.length).toBeGreaterThanOrEqual(5);
    for (const row of foldable) {
      expect(row.foldGlyphCy! - row.markerCy!).toBeCloseTo(0, 0);
    }
  });

  it('measures the chevron’s dead space from the kind that consumes it', async function () {
    // `--to-chevron-dead-right` feeds the BLOCK rule only, and the wrapper it is
    // measured from is not a property of the chevron but of the line: measured,
    // 15px on a heading or paragraph, 30.8px on a list item (widened by
    // `--list-bullet-end-padding`), 10px on a task line. Taking the first
    // chevron of any kind published whichever the viewport happened to start
    // with, and a list item's value moved every heading's chevron ~15px right,
    // onto its own marker — an intermittent glitch a scroll or a fold could
    // trigger and reopening the note would clear. So: a heading's chevron lands
    // in the same place whatever kind of foldable line precedes it.
    const heading = ['# Heading', '', 'Body under it.', ''];
    const places: number[] = [];
    for (const before of [[], ['- a bullet', '\t- child', ''], ['- [ ] a task', '\t- [ ] child', '']]) {
      const rows = await open([...before, ...heading].join('\n'));
      const row = rows.find((r) => r.text.startsWith('# Heading'));
      expect(row?.foldGlyph).not.toBeNull();
      places.push(row!.foldGlyph!.r - row!.column);
    }
    expect(places[1]).toBeCloseTo(places[0]!, 1);
    expect(places[2]).toBeCloseTo(places[0]!, 1);
  });

  it('publishes the space advance it actually measured, not its fallback', async function () {
    // The CSS fallback (`0.26em`) reproduces the bundled font to within 0.03px,
    // so a rendered-position assertion cannot tell a live measurement from no
    // measurement at all — it passes either way on this font. What is worth
    // pinning is that the measurement RAN and agrees with the space it is
    // compensating; the fallback exists for the first paint, not as the answer.
    await open(['# H', '', '- [ ] a task', ''].join('\n'));
    const measured = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      const published = getComputedStyle(cm.dom).getPropertyValue('--to-space-advance').trim();
      const span = cm.contentDOM.querySelector(
        '.HyperMD-task-line span[class*="cm-list-"]:not(.cm-formatting)',
      );
      const node = span?.firstChild;
      let actual = 0;
      if (node?.nodeValue?.startsWith(' ')) {
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, 1);
        actual = range.getBoundingClientRect().width;
      }
      return { published, actual };
    });
    expect(measured.actual).toBeGreaterThan(0);
    // a real px value, not the em fallback showing through
    expect(measured.published).toMatch(/^[\d.]+px$/);
    expect(parseFloat(measured.published)).toBeCloseTo(measured.actual, 1);
  });

  it('publishes it from a plain list too, with no task line anywhere', async function () {
    // Three rules read this now — the task label, the bullet's own width and the
    // ordered digits' box — so a note with no task line in it needs the value
    // just as much. Before the second source existed this document published
    // nothing and laid its whole list grid out from the fallback.
    await open(['# H', '', '- one', '1. two', ''].join('\n'));
    const published = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cm = (view.editor as any).cm;
      return getComputedStyle(cm.dom).getPropertyValue('--to-space-advance').trim();
    });
    expect(published).toMatch(/^[\d.]+px$/);
  });

  /*
   * The caret on an EMPTY item (list-new-item-caret).
   *
   * Only an empty item can show this: with content, CM6 resolves the position
   * to the start of the following content span and lands on the text column
   * whatever the marker's own run measures. So every case here reads the caret
   * on a line that is nothing but its marker, and compares it to a column taken
   * from a SIBLING that does have text — a relationship, not a pixel.
   */
  it('puts an empty bullet item’s caret on its own text column, at two depths', async function () {
    const rows = await open(['# H', '', '- alpha', '- ', '\t- beta', '\t- ', ''].join('\n'));
    const top = at(rows, 3);
    const nested = at(rows, 5);
    expect(top.textX).toBeNull(); // nothing but the marker on either line
    expect(nested.textX).toBeNull();
    // The column its own first character will take, from the sibling above it.
    expect(await caretX(3, 2)).toBeCloseTo(at(rows, 2).textX!, 1);
    expect(await caretX(5, 3)).toBeCloseTo(at(rows, 4).textX!, 1);
  });

  it('puts an empty ordered item’s caret on the same column as a bullet’s', async function () {
    const rows = await open(['# H', '', '- alpha', '- ', '2. ', ''].join('\n'));
    expect(await caretX(4, 3)).toBeCloseTo(await caretX(3, 2), 1);
    expect(await caretX(4, 3)).toBeCloseTo(at(rows, 2).textX!, 1);
  });

  it('follows a wide ordered marker’s own text out past the gutter', async function () {
    // `10. ` exceeds the gutter, so its item's text column is the marker's own
    // right edge rather than the gutter — and the caret goes there with it.
    const rows = await open(['# H', '', '10. tenth', '10. ', ''].join('\n'));
    const withText = at(rows, 2);
    expect(withText.textX! - withText.column).toBeGreaterThan(GUTTER);
    expect(await caretX(3, 4)).toBeCloseTo(withText.textX!, 1);
  });

  it('does not move the caret when the first character is typed', async function () {
    // The defect as reported: the caret sat against the marker and jumped right
    // on the first keystroke. Same position, before and after.
    await open(['# H', '', '- alpha', '- ', ''].join('\n'));
    const before = await caretX(3, 2);
    await browser.keys(['x']);
    await browser.pause(200);
    const after = await caretX(3, 2);
    expect(after).toBeCloseTo(before, 1);
  });

  it('leaves an item WITH content where it already was', async function () {
    const rows = await open(['# H', '', '- alpha', '1. two', ''].join('\n'));
    expect(await caretX(2, 2)).toBeCloseTo(at(rows, 2).textX!, 1);
    expect(await caretX(3, 3)).toBeCloseTo(at(rows, 3).textX!, 1);
  });

  it('leaves a marker with more than one trailing space on its own column', async function () {
    // The compensation is sized "gutter, less one space", so it is gated on the
    // marker actually having one (`ONE_SPACE_MARKER_CLASS`). Ungated it was
    // added on top of whatever whitespace the line carried: `-  foo` moved 20 →
    // 24.18 and `3.\tfoo` 24 → 41.2, off the column their one-space siblings
    // sit on. Assert the RELATIONSHIP — a two-space bullet starts where a
    // one-space bullet's text starts, whatever the font makes of a space.
    const rows = await open(
      ['# H', '', '- one', '-  two', '-\tthree', '', '1. one', '2.  two', ''].join('\n'),
    );
    expect(at(rows, 3).textX).toBeCloseTo(at(rows, 2).textX!, 1);
    // A tab is quantised to its own stop, so it lands where it always did rather
    // than on the gutter — the point is that this rule does not move it.
    expect(at(rows, 4).textX! - at(rows, 4).column).toBeGreaterThanOrEqual(GUTTER);
    // An ordered marker whose whitespace already carries it past the gutter
    // keeps pushing its own text out, uncompensated.
    expect(at(rows, 7).textX! - at(rows, 7).column).toBeGreaterThanOrEqual(GUTTER);
  });

  it('renders the same grid with Obsidian’s indentation guides off', async function () {
    // With that setting off Obsidian emits no `.cm-indent` at all and nothing
    // is quantised, so even a FOUR-space level rendered short of its column.
    // The wrapper this layer sizes is emitted either way.
    const md = ['# H', '', '- one', '    - two', '  - two-space', ''].join('\n');
    const on = await open(md);
    await setIndentGuides(false);
    try {
      const off = await geometry();
      for (const n of [2, 3, 4]) {
        expect(at(off, n).markerX).toBeCloseTo(at(on, n).markerX!, 1);
        expect(at(off, n).markerX).toBeCloseTo(at(off, n).column, 1);
      }
    } finally {
      await setIndentGuides(true);
    }
  });
});
