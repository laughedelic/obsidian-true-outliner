/**
 * Spike S4's screenshot pass (docs/research/19, task 7.1): the outline's chrome
 * rendered on a surface that is not `.cm-line`, across the fixture corpus and
 * both bundled themes.
 *
 * The assertions here are deliberately about MECHANISM, not appearance — a
 * screenshot is what a human reads, and a test that claimed to judge it would
 * be claiming something it cannot do. What is asserted is that the footer's
 * rows are drawn by the shared contract: the same classes and the same custom
 * properties the editor's own lines carry, and no footer-local geometry.
 *
 * Screenshots land in `.obsidian-cache/footer-chrome/` for the real-vault pass
 * the ground rules make mandatory.
 */
import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as h from '../helpers.js';

const OUT = path.join(process.cwd(), '.obsidian-cache', 'footer-chrome');
/** Committed, and diffed on every run — see the baseline test at the bottom. */
const BASELINES = path.join(process.cwd(), 'e2e', 'baselines', 'footer');

/** Every corpus fixture points here, so this note's footer is the corpus. */
const HUB = 'Projects/Aurora Dashboard.md';
/** A second target, small enough that its whole footer fits one frame. */
const SMALL = 'People/Priya Nair.md';
/** Referenced only by the two marker-alignment fixtures, so its footer shows one
 * row per node kind and one reference carrying a real subtree. */
const KINDS = 'Backlinks/Reference target.md';
/** Nothing links here. The empty state is a rendering decision like any other,
 * so it belongs in the pass rather than being taken on trust. */
const DORMANT = 'Notes/Sourdough Log.md';

/**
 * The footer lives at `doc.length`, and CodeMirror virtualises: in a document
 * long enough for its end to fall outside the viewport, that region is a
 * `cm-gap` and the widget's DOM does not exist until the reader scrolls there.
 */
async function scrollToEnd(): Promise<void> {
  await browser.executeObsidian(() => {
    const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await browser.pause(500);
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

/** What every footer row is actually carrying, as the browser computed it. */
function rowChrome(): Promise<
  Array<{ classes: string; depth: string; gutter: string; guides: boolean; paddingLeft: string; markerLeft: string }>
> {
  return browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
      const icon = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
      const cs = getComputedStyle(el);
      return {
        classes: el.className,
        depth: el.style.getPropertyValue('--to-depth').trim(),
        gutter: el.style.getPropertyValue('--to-marker-gutter').trim(),
        guides: el.style.getPropertyValue('--to-guides').trim().length > 0,
        paddingLeft: cs.paddingLeft,
        markerLeft: icon ? getComputedStyle(icon).left : '<none>',
      };
    });
  });
}

async function shoot(name: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  // Two frames, because a footer is routinely taller than the viewport and the
  // pass is about the whole of it: one anchored at the footer's own top, one at
  // the document's end. An element screenshot is not the answer — the driver
  // clips it to the viewport anyway.
  await browser.executeObsidian(() => {
    document.querySelector('.workspace-leaf.mod-active .to-backlinks')?.scrollIntoView(true);
  });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(OUT, `${name}-top.png`));

  // The SEAM: the note's last lines and the footer's first, in one frame.
  // `scrollIntoView(true)` pins the footer's top edge to the top of the
  // viewport, which puts everything above it off-screen — so the frame that
  // shows the footer best is the one frame in which the gap between the note
  // and the footer cannot be judged at all. Backing off half a viewport puts
  // both sides of that boundary in view.
  await browser.executeObsidian(() => {
    const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (scroller) scroller.scrollTop -= scroller.clientHeight / 2;
  });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(OUT, `${name}-seam.png`));
  await scrollToEnd();
  await browser.saveScreenshot(path.join(OUT, `${name}-end.png`));
}

describe('backlinks footer: outline chrome outside .cm-line', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
  });

  after(async function () {
    await h.setTheme(true);
  });

  it('draws every row through the editor’s own class-and-property contract', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);
    await scrollToEnd();

    const rows = await rowChrome();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // The kind class is the editor's, not a footer-local one.
      expect(row.classes).toMatch(/to-decor-(block|atom)\b/);
      // Depth and gutter are published as the shared custom properties, which
      // is what makes the depth rule in styles.css able to serve both surfaces.
      expect(row.depth).not.toBe('');
      expect(row.gutter).not.toBe('');
      // Nothing sets a length in JS: the padding is what the shared rule
      // computed from the properties above.
      expect(row.paddingLeft).toMatch(/px$/);
    }
  });

  it('places a row’s marker on the same column its guide is drawn at', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);
    await scrollToEnd();

    const rows = await rowChrome();
    const deeper = rows.filter((r) => Number(r.depth) > 0);
    expect(deeper.length).toBeGreaterThan(0);

    // Not a pixel assertion — CI's font is not this machine's. The relationship
    // is what matters: a row deeper than the root reserves more padding than a
    // root row, by whole units, and its marker is shifted by the SAME amount
    // whatever its depth (the shift is depth-independent by construction).
    const shifts = new Set(rows.map((r) => r.markerLeft));
    expect(shifts.size).toBe(1);

    const roots = rows.filter((r) => Number(r.depth) === 0);
    if (roots.length > 0) {
      expect(parseFloat(deeper[0]!.paddingLeft)).toBeGreaterThan(parseFloat(roots[0]!.paddingLeft));
    }
  });

  it('gives a row with an ancestor row above it a guide, and a root row none', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);
    await scrollToEnd();

    const rows = await rowChrome();
    for (const row of rows) {
      expect(row.guides).toBe(Number(row.depth) > 0);
      expect(row.classes.includes('to-decor-guides')).toBe(Number(row.depth) > 0);
    }
  });

  /**
   * The footer inherits CodeMirror's `white-space: pre-wrap`, under which the
   * newlines in Obsidian's own rendered HTML are HARD BREAKS — which put every
   * list-derived row's text on the line below its own marker. Geometric, not a
   * style assertion: what matters is that the marker and the text share a line.
   */
  it('keeps a row’s marker and its text on one line', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);
    await scrollToEnd();

    const rows = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
        const icon = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
        const content = el.querySelector<HTMLElement>(':scope > .to-backlinks-content');
        if (!icon || !content) return null;
        const i = icon.getBoundingClientRect();
        const c = content.getBoundingClientRect();
        // Overlapping vertical extents means one line box, whatever the fonts.
        return { overlaps: c.top < i.bottom && i.top < c.bottom, depth: el.style.getPropertyValue('--to-depth') };
      });
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      if (!row) continue;
      expect(row.overlaps).toBe(true);
    }
  });

  /**
   * The guide overlay is a `z-index: -1` pseudo-element, and negative-z children
   * paint before the in-flow block backgrounds of their stacking context — so
   * the group card's opaque background hid every guide until the row became a
   * stacking context of its own. Nothing about the row's own computed style
   * reveals that the guides are visible, so the mechanism is what is asserted.
   */
  it('scopes the guide overlay to the row, not to the card behind it', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);
    await scrollToEnd();

    const isolated = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      const row = root?.querySelector<HTMLElement>('.to-backlinks-row.to-decor-guides');
      return row ? getComputedStyle(row).isolation : '<no guided row>';
    });
    expect(isolated).toBe('isolate');
  });

  it('renders the corpus in both bundled themes', async function () {
    for (const [label, target] of [['small', SMALL], ['kinds', KINDS], ['hub', HUB], ['dormant', DORMANT]] as const) {
      for (const dark of [true, false]) {
        await h.setTheme(dark);
        await h.openNote(target);
        await ensureOutlineMode(target);
        await scrollToEnd();
        await shoot(`${label}-${dark ? 'dark' : 'light'}`);
      }
    }
  });

  /**
   * The goal of the whole exercise, stated as a measurement: a marker sits on
   * the optical centre of the text beside it, on either surface.
   *
   * Measured against the text's own X-HEIGHT BAND, not against its line box.
   * The band is what the eye centres on and it is invariant to wrapping; a line
   * box is neither. An earlier version of this compared the footer's line-box
   * offset to the editor's and asserted they matched — which held on desktop and
   * failed by 12px on mobile, where the narrow viewport wrapped the editor line
   * being compared against and moved its box centre. That was the assertion
   * being fragile, not the rendering.
   *
   * The band is read with two transient struts in the element's own font: a
   * zero-height one gives the baseline, a `1ex`-tall one gives the x-height.
   * Inserted at the START so a wrapped line cannot put them on a different
   * visual row than the marker.
   */
  it('centres every marker on the optical middle of its own text', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);

    const probe = (): Promise<Array<{ where: string; off: number }>> =>
      browser.executeObsidian(() => {
        const out: Array<{ where: string; off: number }> = [];
        const leaf = document.querySelector('.workspace-leaf.mod-active');
        if (!leaf) return out;

        const measure = (host: HTMLElement, icon: HTMLElement, where: string): void => {
          const base = document.createElement('span');
          base.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
          const ex = document.createElement('span');
          ex.style.cssText = 'display:inline-block;width:0;height:1ex;vertical-align:baseline';
          host.insertBefore(base, host.firstChild);
          host.insertBefore(ex, host.firstChild);
          const baseline = base.getBoundingClientRect().top;
          const xh = ex.getBoundingClientRect().height;
          base.remove();
          ex.remove();
          if (xh <= 0) return;
          const r = icon.getBoundingClientRect();
          out.push({ where, off: r.top + r.height / 2 - (baseline - xh / 2) });
        };

        leaf.querySelectorAll<HTMLElement>('.cm-content > .cm-line').forEach((line, i) => {
          const icon = line.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
          if (icon) measure(line, icon, `editor:${i}`);
        });
        leaf.querySelectorAll<HTMLElement>('.to-backlinks-row').forEach((row, i) => {
          const icon = row.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
          // An atom's marker is centred on its BOX, not on a text run — that is
          // a different contract, asserted in the per-kind test below.
          if (icon && !icon.classList.contains('to-decor-marker-icon--widget')) {
            measure(row, icon, `footer:${i}`);
          }
        });
        return out;
      });

    const editor = (await probe()).filter((m) => m.where.startsWith('editor'));
    expect(editor.length).toBeGreaterThan(0);
    await scrollToEnd();
    const footer = (await probe()).filter((m) => m.where.startsWith('footer'));
    expect(footer.length).toBeGreaterThan(0);

    // Sub-pixel, not "close enough": the correction is expressed in `ex`, so it
    // is exact by construction at any text size — a drift here means something
    // stopped resolving against the font it sits in.
    for (const m of [...editor, ...footer]) {
      expect(Math.abs(m.off)).toBeLessThan(1);
    }
  });

  /**
   * The horizontal half of the same contract, and the one that is genuinely a
   * relationship between surfaces: a row reserves the same distance between its
   * marker's ink and its text as an editor line does. Never a pixel count — CI's
   * font is not a developer's.
   */
  it('holds the editor’s marker-to-text gap on a footer row', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);

    const gaps = (): Promise<{ editor: number | null; footer: number[] }> =>
      browser.executeObsidian(() => {
        const leaf = document.querySelector('.workspace-leaf.mod-active');
        const firstText = (n: Node): Text | null => {
          for (const c of Array.from(n.childNodes)) {
            if (c.nodeType === 3 && (c.textContent ?? '').trim()) return c as Text;
            const r = c.nodeType === 1 ? firstText(c) : null;
            if (r) return r;
          }
          return null;
        };
        const gap = (marker: Element | null, host: Element | null): number | null => {
          const tn = host ? firstText(host) : null;
          if (!marker || !tn) return null;
          const r = document.createRange();
          r.selectNodeContents(tn);
          return r.getBoundingClientRect().left - marker.getBoundingClientRect().right;
        };
        const line = leaf?.querySelector('.cm-content > .cm-line.to-decor-block') ?? null;
        return {
          editor: gap(line?.querySelector(':scope > .to-decor-marker-icon svg') ?? null, line),
          footer: Array.from(leaf?.querySelectorAll<HTMLElement>('.to-backlinks-row.is-reference') ?? [])
            .map((el) =>
              gap(
                el.querySelector(':scope > .to-decor-marker-icon svg'),
                el.querySelector(':scope > .to-backlinks-content'),
              ),
            )
            .filter((v): v is number => v !== null),
        };
      });

    const top = await gaps();
    expect(top.editor).not.toBeNull();
    await scrollToEnd();
    const bottom = await gaps();
    expect(bottom.footer.length).toBeGreaterThan(0);

    for (const g of bottom.footer) {
      // A row whose content starts with a non-text inline (a task checkbox)
      // measures that element's advance instead, which is not this contract.
      if (g > top.editor! + 5) continue;
      expect(Math.abs(g - top.editor!)).toBeLessThan(1);
    }
  });

  /**
   * The invariant the whole rendering model rests on, and the one assertion
   * that would have caught every defect a reader found by looking: a row is a
   * LINE, so nothing block-level may appear in one.
   *
   * The model strips a node's block syntax before the renderer ever sees it
   * (D18), so this holds by construction rather than by cleanup — which is
   * exactly why it is worth asserting: a stripping miss is silent otherwise.
   */
  it('never puts a block-level element in a row', async function () {
    for (const target of [KINDS, SMALL, HUB]) {
      await h.openNote(target);
      await ensureOutlineMode(target);
      await scrollToEnd();

      const offenders = await browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        if (!root) return [];
        const BLOCK = 'h1,h2,h3,h4,h5,h6,p,ul,ol,li,blockquote,table,pre,hr,div';
        return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).flatMap((row) =>
          Array.from(row.querySelectorAll(BLOCK)).map(
            (el) => `${el.tagName} in "${(row.textContent ?? '').trim().slice(0, 40)}"`,
          ),
        );
      });

      expect(offenders).toEqual([]);
    }
  });

  /**
   * Kind is said once, by the marker. A heading row that also took a heading's
   * size would say it twice, in the channel a reader reads first — which is how
   * the footer came to read as a scrapbook of other documents.
   */
  it('says a row’s kind once, in its marker', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const rows = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent ?? '').trim().slice(0, 40),
          fontSize: parseFloat(cs.fontSize),
          height: el.getBoundingClientRect().height,
          hasCheckbox: !!el.querySelector(':scope > .to-decor-marker-icon'),
          ordinal: el.querySelector('.to-backlinks-ordinal')?.textContent ?? null,
        };
      });
    });

    expect(rows.length).toBeGreaterThan(0);
    // Every row reads at one size: a heading's row is not bigger than a
    // paragraph's, because its heading-ness is in the marker.
    const sizes = new Set(rows.map((r) => r.fontSize));
    expect(sizes.size).toBe(1);

    // An ordered item's number is its marker, two digits included.
    const ordinals = rows.map((r) => r.ordinal).filter((o): o is string => o !== null);
    expect(ordinals).toContain('10.');
  });

  /**
   * One rhythm. A row whose content came back as a block used to be several
   * lines tall while its neighbours were one, which is what broke the outline
   * into a patchwork — assertable directly rather than left to the eye.
   */
  it('gives every single-line row the same height', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const heights = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row'))
        .map((el) => {
          const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
          const h = el.getBoundingClientRect().height;
          // Rows that genuinely wrap are not what this measures.
          return h < lineHeight * 1.8 ? h : null;
        })
        .filter((h): h is number => h !== null);
    });

    expect(heights.length).toBeGreaterThan(3);
    // Not a pixel count: the spread across every kind is what matters.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
  });

  /**
   * The per-kind matrix: for every kind the gallery holds, the row got the
   * treatment that kind's rule promises.
   *
   * Read off `data-kind`, which the row publishes for exactly this reason — the
   * chrome classes say how a row is laid out and the marker says its kind in
   * glyphs, and neither is answerable from a test.
   */
  it('gives every kind the treatment its own rule promises', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const rows = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
        const icon = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
        const ordinal = el.querySelector<HTMLElement>(':scope > .to-backlinks-ordinal');
        const content = el.querySelector<HTMLElement>(':scope > .to-backlinks-content');
        const marker = icon ?? ordinal;

        // The text's own optical middle, in the row's own font.
        const base = document.createElement('span');
        base.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        const ex = document.createElement('span');
        ex.style.cssText = 'display:inline-block;width:0;height:1ex;vertical-align:baseline';
        el.insertBefore(base, el.firstChild);
        el.insertBefore(ex, el.firstChild);
        const baseline = base.getBoundingClientRect().top;
        const xh = ex.getBoundingClientRect().height;
        base.remove();
        ex.remove();

        const m = marker?.getBoundingClientRect();
        const c = content?.getBoundingClientRect();
        const rowBox = el.getBoundingClientRect();
        return {
          kind: el.dataset.kind ?? '?',
          depth: Number(el.style.getPropertyValue('--to-depth') || 0),
          hasMarker: !!marker,
          isOrdinal: !!ordinal,
          hasCheckboxInText: !!content?.querySelector('input[type=checkbox]'),
          text: (content?.textContent ?? '').trim(),
          fontSize: parseFloat(getComputedStyle(el).fontSize),
          // Marker ink relative to the text's optical middle, and to the row's
          // own left edge — the column is `depth * unit` from there.
          // Only meaningful for an ICON marker, whose box is a fixed square the
          // `0.5ex` rule centres by hand. An ordinal is text on the row's own
          // baseline — already aligned by typography, and its box centre is not
          // its ink's.
          opticalOffset: icon && xh > 0
            ? icon.getBoundingClientRect().top + icon.getBoundingClientRect().height / 2 -
              (baseline - xh / 2)
            : null,
          // What alignment means for a text marker: it shares a line with the
          // text beside it.
          sharesLineWithText: m && c ? c.top < m.bottom && m.top < c.bottom : null,
          markerLeftInRow: m ? m.left - rowBox.left : null,
          // MEASURED, not read: `getPropertyValue` returns the custom
          // property's specified value (`1.5rem`), not a resolved length, so
          // parsing it yields 1.5 and every column comparison silently passes
          // against the wrong number.
          unit: (() => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;width:var(--to-decor-unit);height:0';
            el.appendChild(probe);
            const w = probe.getBoundingClientRect().width;
            probe.remove();
            return w;
          })(),
        };
      });
    });

    expect(rows.length).toBeGreaterThan(0);
    const kinds = new Set(rows.map((r) => r.kind));
    // The gallery exists to hold one of each; a kind quietly disappearing from
    // it would silently shrink this matrix.
    for (const kind of ['heading', 'paragraph', 'list-item', 'quote', 'callout', 'table', 'html']) {
      expect(kinds).toContain(kind);
    }

    for (const row of rows) {
      // Every row carries a marker, and it is aligned with its own text — by
      // the measure that means something for the marker's own kind.
      expect(row.hasMarker).toBe(true);
      if (row.opticalOffset !== null) expect(Math.abs(row.opticalOffset)).toBeLessThan(1);
      if (row.sharesLineWithText !== null) expect(row.sharesLineWithText).toBe(true);

      // …and sits on its depth's column. An ordinal is left-aligned there by
      // its own rule; an icon is centred on it.
      if (row.markerLeftInRow !== null && row.unit > 0) {
        const column = row.depth * row.unit;
        expect(Math.abs(row.markerLeftInRow - column)).toBeLessThan(row.unit);
      }

      // A task's checkbox is its marker, so none survives in the text.
      expect(row.hasCheckboxInText).toBe(false);
    }

    // Kind is said once: a heading row is not typographically a heading.
    expect(new Set(rows.map((r) => r.fontSize)).size).toBe(1);

    // A callout's type token never reaches the reader.
    for (const row of rows.filter((r) => r.kind === 'callout')) {
      expect(row.text).not.toMatch(/\[![a-z]+\]/i);
    }

    // A table row is its header plus the reference's own row, and nothing else.
    for (const row of rows.filter((r) => r.kind === 'table')) {
      expect(row.text).not.toContain('Desktop triage');
      expect(row.text).not.toContain('Tablet triage');
    }
  });

  /**
   * One rhythm: every row is a whole number of text lines tall, and every kind
   * agrees on what one line costs.
   *
   * Stated against the SHORTEST single-line row rather than against a
   * paragraph's, because the gallery's paragraphs are deliberately long enough
   * to wrap — there is no single-line paragraph to be the reference. The second
   * half is what a spread check alone would miss: a wrapped row carrying a
   * block's margins is still consistent with its neighbours and still wrong.
   */
  it('makes every row a whole number of text lines tall', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const rows = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
        const cs = getComputedStyle(el);
        // The row's own padding is spent once, not per line, so it comes off
        // before the height is compared against a multiple of a line.
        const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        return {
          kind: el.dataset.kind ?? '?',
          height: el.getBoundingClientRect().height - padding,
          lineHeight: parseFloat(cs.lineHeight),
        };
      });
    });

    expect(rows.length).toBeGreaterThan(3);
    const single = rows.filter((r) => r.height < r.lineHeight * 1.8);
    expect(single.length).toBeGreaterThan(3);

    const oneLine = Math.min(...single.map((r) => r.height));
    for (const row of single) {
      expect(Math.abs(row.height - oneLine)).toBeLessThan(2);
    }

    // A wrapped row is n lines and nothing more — no block margins riding along.
    for (const row of rows) {
      const lines = Math.round(row.height / oneLine);
      expect(Math.abs(row.height - lines * oneLine)).toBeLessThan(2);
    }
  });

  /**
   * The section's header sits on the outline's own depth-0 column: its link
   * icon is centred where every top-level marker in the note above is centred.
   *
   * Asserted because it is silently breakable. Obsidian sets
   * `contain: paint !important` on `.cm-content > [contenteditable="false"]`,
   * which the footer widget is — and paint containment clipped the icon to a
   * half-icon and swallowed the fold chevron whole, with nothing in the DOM or
   * the computed styles to say so. Only its rendered position tells.
   */
  it('puts the header’s icon on the same column as a top-level marker', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);

    const editorColumn = await browser.executeObsidian(() => {
      const icon = document.querySelector<HTMLElement>(
        '.workspace-leaf.mod-active .cm-content > .cm-line .to-decor-marker-icon',
      );
      const line = icon?.closest<HTMLElement>('.cm-line');
      if (!icon || !line || line.style.getPropertyValue('--to-depth').trim() !== '0') return null;
      const r = icon.getBoundingClientRect();
      return r.left + r.width / 2 - line.getBoundingClientRect().left;
    });
    expect(editorColumn).not.toBeNull();

    await scrollToEnd();
    const header = await browser.executeObsidian(() => {
      const footer = document.querySelector<HTMLElement>('.workspace-leaf.mod-active .to-backlinks');
      const icon = footer?.querySelector<HTMLElement>('.to-backlinks-icon');
      if (!footer || !icon) return null;
      const r = icon.getBoundingClientRect();
      return {
        centre: r.left + r.width / 2 - footer.getBoundingClientRect().left,
        // Nothing of it may be clipped away: paint containment showed up as a
        // full-width box with only half of it painted, so width alone is not
        // enough — the box must also start left of the footer's own edge.
        overhang: footer.getBoundingClientRect().left - r.left,
        contain: getComputedStyle(footer).contain,
      };
    });
    expect(header).not.toBeNull();

    expect(Math.abs(header!.centre - editorColumn!)).toBeLessThan(1);
    expect(header!.overhang).toBeGreaterThan(0);
    expect(header!.contain).not.toContain('paint');
  });

  /**
   * A committed structural baseline, diffed on every run.
   *
   * NOT a screenshot. A pixel baseline is guaranteed to differ between CI's
   * fonts and a developer's — the lesson this repo already recorded about
   * asserting glyph widths — so it would either be ignored or maintained per
   * platform. What a rendering change actually alters is WHICH ROWS EXIST and
   * what each carries, and that is platform-independent, reviewable in a diff,
   * and fails loudly.
   *
   * Run with `UPDATE_BASELINES=1` to rewrite them after an intended change.
   */
  it('matches the committed structural baseline for every fixture', async function () {
    for (const [name, target] of [['kinds', KINDS], ['small', SMALL]] as const) {
      await h.openNote(target);
      await ensureOutlineMode(target);
      await scrollToEnd();

      const snapshot = await browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        if (!root) return ['<no footer>'];
        const out: string[] = [];
        // Groups are snapshotted in NAME order, not the order they render in.
        //
        // The footer sorts them by modification time, which is a property of
        // the filesystem rather than of the rendering: a fresh checkout gives
        // every fixture the same timestamp, so CI ordered them differently from
        // a working copy and the baseline failed with identical content. Sort
        // order is a real contract, but it is not THIS test's — this one is
        // about what each row carries, and it should not go red for a reason it
        // cannot see.
        const groups = Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-group')).sort(
          (a, b) =>
            (a.querySelector('.to-backlinks-group-name')?.textContent ?? '').localeCompare(
              b.querySelector('.to-backlinks-group-name')?.textContent ?? '',
            ),
        );
        groups.forEach((group) => {
          out.push(`# ${group.querySelector('.to-backlinks-group-name')?.textContent ?? '?'}`);
          group.querySelectorAll<HTMLElement>('.to-backlinks-row').forEach((el) => {
            const roles = ['is-lineage', 'is-reference', 'is-property'].filter((c) =>
              el.classList.contains(c),
            );
            const ordinal = el.querySelector('.to-backlinks-ordinal')?.textContent ?? '';
            const text = (el.querySelector('.to-backlinks-content')?.textContent ?? '').trim();
            out.push(
              `${'  '.repeat(Number(el.style.getPropertyValue('--to-depth') || 0))}` +
                `[${el.dataset.kind}${roles.length ? ` ${roles.join(' ')}` : ''}]` +
                `${ordinal ? ` ${ordinal}` : ''} ${text}`,
            );
          });
        });
        return out;
      });

      const file = path.join(BASELINES, `${name}.txt`);
      const actual = `${snapshot.join('\n')}\n`;
      if (process.env.UPDATE_BASELINES) {
        fs.mkdirSync(BASELINES, { recursive: true });
        fs.writeFileSync(file, actual, 'utf8');
        continue;
      }
      expect(fs.existsSync(file)).toBe(true);
      expect(actual).toBe(fs.readFileSync(file, 'utf8'));
    }
  });

  /**
   * The footer's own controls carry no platform button chrome, in any state.
   *
   * They are real `button`s so a keyboard can reach them, which means putting
   * down Obsidian's own styling — and that is a specificity fight, not a
   * declaration. Obsidian styles buttons as `.markdown-source-view button`,
   * one class plus one element, so a bare `.to-backlinks-fold` loses. Measured
   * when it did: the resting button carried a solid background and an 8px
   * radius while its `:hover` was correctly transparent, because the hover
   * selector happened to have two classes and won.
   *
   * Both states are checked, because getting one right proves nothing about the
   * other — that is exactly how this shipped.
   */
  it('leaves no button chrome on the footer’s own controls', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const chrome = (): Promise<{ bg: string; radius: string; border: string } | null> =>
      browser.executeObsidian(() => {
        const el = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-fold',
        );
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.borderTopWidth };
      });

    const transparent = (v: string): boolean => v === 'transparent' || /,\s*0\)$/.test(v);

    const rest = await chrome();
    expect(rest).not.toBeNull();
    expect(transparent(rest!.bg)).toBe(true);
    expect(rest!.radius).toBe('0px');
    expect(rest!.border).toBe('0px');

    await (await $('.workspace-leaf.mod-active .to-backlinks-fold')).moveTo();
    await browser.pause(200);
    const hovered = await chrome();
    expect(transparent(hovered!.bg)).toBe(true);
    expect(hovered!.radius).toBe('0px');
  });
});
