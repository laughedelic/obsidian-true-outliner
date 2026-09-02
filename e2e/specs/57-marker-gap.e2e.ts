/**
 * The marker gutter's DERIVATION: that the room between a depth's column and its
 * text is the widest qualifying mark's ink plus one stated gap, and not a number
 * that merely works.
 *
 * What this holds that the other decoration specs do not: they assert that every
 * kind lands on the gutter, whatever the gutter is. That passes at any value,
 * including one too small for a mark to fit — the failure there is not a clipped
 * mark but one kind's text a few pixels off the column its siblings share, which
 * reads as a rendering bug rather than as a constant set wrong.
 *
 * Ink, not boxes. A block marker's box is wider than any glyph drawn in it and a
 * bullet's box is zero-width with the dot painted by an `::after`, so a gutter
 * checked against boxes would be checked against reserved space.
 *
 * Assert the RELATIONSHIP, never a pixel a theme or a font decides. The only
 * constant here is the stated gap, imported rather than spelled; every other
 * quantity is this run's own measurement. In particular nothing names WHICH mark
 * is widest: a checkbox is `--checkbox-size`, which Obsidian resolves
 * differently per platform, and an ordered number's ink is whatever the reader's
 * font draws. Both were assumed once and both were wrong — the checkbox on
 * mobile, the ordered number on CI's Linux font.
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { MARKER_GAP_REM } from '../../src/plugin/chrome-tokens';

interface Mark {
  kind: 'block-icon' | 'bullet' | 'checkbox' | 'ordered';
  text: string;
  depth: number;
  column: number;
  /** Where the mark's ink starts and ends, relative to its own column. */
  inkLeft: number;
  inkRight: number;
  /** Where the row's own text starts, relative to its own column. */
  textX: number;
}

interface Reading {
  marks: Mark[];
  remPx: number;
  /** `--to-space-advance`, measured live by `MarginCompensation`. */
  spaceAdvance: number;
}

/**
 * Every mark the fixture renders, with its ink and its row's text column.
 *
 * Positions are taken from the elements' and text nodes' own client rects rather
 * than from `coordsAtPos`, which reports the end of a marker's TEXT rather than
 * of its box and so agrees with a wrong answer — the same instrument choice
 * 56-list-grid records at greater length.
 */
function read(): Promise<Reading> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    if (!view) throw new Error('no active markdown view');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cm = (view.editor as any).cm;
    const content: HTMLElement = cm.contentDOM;
    const cb = content.getBoundingClientRect();
    const cs = getComputedStyle(content);
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const unitRaw = cs.getPropertyValue('--to-decor-unit').trim();
    const unit = parseFloat(unitRaw) * (unitRaw.endsWith('rem') ? remPx : 1);

    /** Union of the rects a set of nodes actually paints. */
    const span = (rects: DOMRect[]): { l: number; r: number } | null => {
      const wide = rects.filter((r) => r.width > 0);
      if (!wide.length) return null;
      return {
        l: +(Math.min(...wide.map((r) => r.left)) - cb.left).toFixed(2),
        r: +(Math.max(...wide.map((r) => r.right)) - cb.left).toFixed(2),
      };
    };

    /** An SVG's painted children — the `<svg>` box itself is larger than them. */
    const svgInk = (host: Element): { l: number; r: number } | null => {
      const svg = host.querySelector('svg');
      if (!svg) return null;
      return span(Array.from(svg.children).map((c) => c.getBoundingClientRect()));
    };

    /** Glyph ink inside an element, trailing whitespace excluded. */
    const glyphInk = (host: Element): { l: number; r: number } | null => {
      const range = document.createRange();
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      let node: Node | null = walker.nextNode();
      while (node) {
        const raw = node.textContent ?? '';
        if (raw.trim() !== '') {
          range.setStart(node, raw.length - raw.trimStart().length);
          range.setEnd(node, raw.trimEnd().length);
          rects.push(...Array.from(range.getClientRects()));
        }
        node = walker.nextNode();
      }
      return span(rects);
    };

    const marks: Mark[] = [];
    for (const child of Array.from(content.children)) {
      const el = child as HTMLElement;
      let n = -1;
      try {
        n = cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1;
      } catch {
        continue;
      }
      const depth = Number(getComputedStyle(el).getPropertyValue('--to-depth').trim() || '0');

      // The row's own text: first ink, chrome spans excluded. From the first
      // INK rather than the node's start — a task line's content span opens
      // with the space Obsidian leaves after `]`, and measuring from the box
      // would report a text column no reader sees.
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let textX: number | null = null;
      let node: Node | null = walker.nextNode();
      while (node) {
        const chrome = node.parentElement?.closest(
          '.cm-formatting-list, .cm-hmd-list-indent, .task-list-label, .to-decor-marker-icon',
        );
        const raw = node.textContent ?? '';
        if (!chrome && raw.trim() !== '') {
          range.setStart(node, raw.length - raw.trimStart().length);
          range.setEnd(node, raw.length);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width === 0) continue;
            const left = +(r.left - cb.left).toFixed(2);
            if (textX === null || left < textX) textX = left;
          }
        }
        node = walker.nextNode();
      }
      if (textX === null) continue;

      const checkbox = el.querySelector(':scope .task-list-item-checkbox');
      const ordered = el.querySelector(':scope .to-decor-ol-digits');
      const bullet = el.querySelector(':scope .list-bullet');
      const icon = el.querySelector(':scope > .to-decor-marker-icon');

      let kind: Mark['kind'];
      let ink: { l: number; r: number } | null;
      if (checkbox) {
        kind = 'checkbox';
        const r = checkbox.getBoundingClientRect();
        // An `<input>` paints its own border box, so the box IS the ink.
        ink = { l: +(r.left - cb.left).toFixed(2), r: +(r.right - cb.left).toFixed(2) };
      } else if (ordered) {
        kind = 'ordered';
        ink = glyphInk(ordered);
      } else if (bullet) {
        kind = 'bullet';
        // Zero-width box; the dot is an absolutely positioned `::after`.
        const after = getComputedStyle(bullet, '::after');
        const l = bullet.getBoundingClientRect().left - cb.left + (parseFloat(after.left) || 0);
        const w = parseFloat(after.width) || 0;
        ink = { l: +l.toFixed(2), r: +(l + w).toFixed(2) };
      } else if (icon) {
        kind = 'block-icon';
        ink = svgInk(icon);
      } else {
        continue;
      }
      if (!ink) continue;

      const column = +(depth * unit).toFixed(2);
      marks.push({
        kind,
        text: cm.state.doc.line(n + 1).text.trim().slice(0, 30),
        depth,
        column,
        inkLeft: +(ink.l - column).toFixed(2),
        inkRight: +(ink.r - column).toFixed(2),
        textX: +(textX - column).toFixed(2),
      });
    }

    return {
      marks,
      remPx,
      spaceAdvance: parseFloat(cs.getPropertyValue('--to-space-advance').trim() || '0'),
    };
  });
}

let seq = 0;
async function open(md: string): Promise<Reading> {
  const note = `Scratch/marker-gap-${++seq}.md`;
  await h.createNote(note, md);
  if (!(await h.isOutlineMode(note))) {
    await h.toggleOutlineMode();
    await browser.pause(200);
    await h.dismissNotices();
  }
  await browser.pause(400);
  return read();
}

const of = (r: Reading, kind: Mark['kind']): Mark => {
  const m = r.marks.find((x) => x.kind === kind);
  if (!m) throw new Error(`no ${kind} rendered; have ${r.marks.map((x) => x.kind).join(',')}`);
  return m;
};

/**
 * The marks that are SIBLINGS of the task item, which the four-mark fixture puts
 * one level under its heading.
 *
 * Selecting by kind alone is not enough: the fixture's heading draws a block
 * marker too, and it is the first one in the document — so "the block marker"
 * would resolve to a mark a level up from the three it is being compared with.
 */
const siblings = (r: Reading): Mark[] => {
  const depth = of(r, 'checkbox').depth;
  return r.marks.filter((m) => m.depth === depth);
};

/**
 * All four qualifying marks, siblings at one depth.
 *
 * The paragraph comes LAST deliberately: a list following a paragraph is that
 * paragraph's child (docs/research/17), so a leading paragraph would put the
 * three list items one level deeper than the mark they are being compared with.
 */
const FOUR_MARKS = [
  '# H',
  '',
  '- a bulleted item',
  '',
  '- [ ] a task item',
  '',
  '1. an ordered item',
  '',
  'A paragraph.',
  '',
].join('\n');

describe('the marker gutter is derived from the marks it holds', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('starts all four qualifying marks’ text on one column', async function () {
    const r = await open(FOUR_MARKS);
    const four = siblings(r);

    // Fixture guard: all four qualifying kinds, and nothing else at this depth.
    expect(new Set(four.map((m) => m.kind))).toEqual(
      new Set(['block-icon', 'bullet', 'checkbox', 'ordered']),
    );
    expect(four.length).toBe(4);

    // The gutter's whole job. Stated as one relationship rather than four
    // pixel values, because what the derivation can get wrong is a kind
    // LEAVING this column, not the column's own position.
    for (const m of four) expect(m.textX).toBeCloseTo(four[0]!.textX, 1);
  });

  it('leaves the widest layer-sized mark exactly the stated gap from its text', async function () {
    const r = await open(FOUR_MARKS);

    // Found by measurement, not named: which of them is widest is the theme's
    // business, and it changes. Naming the checkbox here would have asserted one
    // platform's answer — measured, its `--checkbox-size` is 16px on desktop and
    // 18.4px on mobile — and would have passed while the other platform's task
    // row sat off the shared column.
    const sized = siblings(r).filter((m) => m.kind !== 'ordered');
    expect(sized.length).toBe(3);
    const widest = sized.reduce((a, b) => (b.inkRight > a.inkRight ? b : a));

    // The derivation itself: the gutter is that mark's ink plus the stated gap
    // and nothing more. No pixel value of its own — the ink is this run's
    // measurement and the gap is the constant — so it holds on any theme, and
    // fails if the gutter stops being derived from what it has to hold.
    expect(widest.textX - widest.inkRight).toBeCloseTo(MARKER_GAP_REM * r.remPx, 1);

    // ...and nothing narrower is closer to its text than that.
    for (const m of sized) {
      expect(m.textX - m.inkRight).toBeGreaterThanOrEqual(MARKER_GAP_REM * r.remPx - 0.1);
    }
  });

  /**
   * An ordered number is drawn by the reader's FONT, so its ink is not a term in
   * the derivation and its clearance is not the stated gap — measured, `1. ` is
   * about 2px wider on CI's Linux font than on macOS. What it is owed is the
   * floor its own box mechanism sets, which is what keeps it on the shared
   * column; the test above covers that for every kind.
   */
  it('gives a font-drawn mark the floor rather than the stated gap', async function () {
    const r = await open(FOUR_MARKS);
    const ordered = of(r, 'ordered');
    expect(ordered.textX - ordered.inkRight).toBeGreaterThanOrEqual(r.spaceAdvance);
    // Still on the column: the derivation's actual promise for this kind.
    expect(ordered.textX).toBeCloseTo(of(r, 'checkbox').textX, 1);
  });

  it('keeps every mark clear of its own text by at least one space’s advance', async function () {
    const r = await open(FOUR_MARKS);
    expect(r.spaceAdvance).toBeGreaterThan(0);

    // The floor the MECHANISM sets, not one this spec chose: each of these
    // kinds is sized as "the gutter, less one space", with the marker's own
    // trailing space completing the run. A gap under a space's advance drives
    // that sizing negative and the mark overflows into its own text's column.
    // Font-safe by construction — both sides are this run's own measurements.
    for (const m of r.marks) {
      expect(m.textX - m.inkRight).toBeGreaterThanOrEqual(r.spaceAdvance);
    }
  });

  it('pushes only its own text right when an ordered number is too wide', async function () {
    const r = await open(
      ['# H', '', '1. single digit', '2. still single', '10. two digits', ''].join('\n'),
    );
    const ordered = r.marks.filter((m) => m.kind === 'ordered');
    expect(ordered.length).toBe(3);
    const [one, , ten] = ordered as [Mark, Mark, Mark];

    // One left edge for every number in the list, whatever its width — the
    // shared edge is what reads as a column where per-number centring reads as
    // ragged. Both are shifted by a fixed half-icon, so this holds on any font.
    expect(ten.inkLeft).toBeCloseTo(one.inkLeft, 1);

    // The excluded case, behaving as excluded: the wide number spends its own
    // text's space rather than the gutter's, so only its own row moves.
    expect(ten.textX).toBeGreaterThan(one.textX);

    // And it leans into that space without crossing into it.
    for (const m of ordered) expect(m.textX).toBeGreaterThan(m.inkRight);
  });
});
