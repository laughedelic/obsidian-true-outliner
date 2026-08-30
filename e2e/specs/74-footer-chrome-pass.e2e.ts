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
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as h from '../helpers.js';

const OUT = path.join(process.cwd(), '.obsidian-cache', 'footer-chrome');

/** Every corpus fixture points here, so this note's footer is the corpus. */
const HUB = 'Projects/Aurora Dashboard.md';
/** A second target, small enough that its whole footer fits one frame. */
const SMALL = 'People/Priya Nair.md';
/** Referenced only by the two marker-alignment fixtures, so its footer shows one
 * row per node kind and one reference carrying a real subtree. */
const KINDS = 'Backlinks/Reference target.md';

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
    for (const [label, target] of [['small', SMALL], ['kinds', KINDS], ['hub', HUB]] as const) {
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
   * The three shapes the reading-mode renderer answers in, each needing its own
   * marker mechanism. All three were wrong until `Backlinks/Kinds gallery.md`
   * put one reference of every kind on a single screen.
   */
  it('draws each kind’s marker by the mechanism that kind needs', async function () {
    await h.openNote(KINDS);
    await ensureOutlineMode(KINDS);
    await scrollToEnd();

    const rows = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      if (!root) return [];
      return Array.from(root.querySelectorAll<HTMLElement>('.to-backlinks-row')).map((el) => {
        const icon = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
        const ol = el.querySelector<HTMLElement>(':scope > .to-backlinks-ol-marker');
        const content = el.querySelector<HTMLElement>(':scope > .to-backlinks-content');
        const r = el.getBoundingClientRect();
        const i = icon?.getBoundingClientRect();
        const c = content?.getBoundingClientRect();
        return {
          atom: el.classList.contains('to-decor-atom'),
          heading: /to-backlinks-h[1-6]/.test(el.className),
          widgetMarker: icon?.classList.contains('to-decor-marker-icon--widget') ?? false,
          ordered: ol ? { text: (ol.textContent ?? '').trim(), right: ol.getBoundingClientRect().right } : null,
          contentLeft: c?.left ?? 0,
          // How far the marker's centre sits from the row's, as a fraction of
          // the row's height — 0 means centred on the box.
          centredness: i && r.height > 0 ? Math.abs(i.top + i.height / 2 - (r.top + r.height / 2)) / r.height : null,
        };
      });
    });

    expect(rows.length).toBeGreaterThan(0);

    // An atom is a real block from the renderer, with no text run to sit
    // beside: its marker is positioned against the row's box and centred on it.
    const atoms = rows.filter((r) => r.atom);
    expect(atoms.length).toBeGreaterThan(0);
    for (const atom of atoms) {
      expect(atom.widgetMarker).toBe(true);
      expect(atom.centredness).toBeLessThan(0.1);
    }

    // A heading takes its size on the ROW, so the marker beside it is centred
    // against the text it actually sits next to.
    expect(rows.some((r) => r.heading)).toBe(true);

    // An ordered item keeps its own number, right-anchored before the text —
    // including a two-digit one, which has to grow leftward rather than run
    // underneath its own text.
    const ordered = rows.map((r) => r.ordered).filter((o): o is NonNullable<typeof o> => o !== null);
    expect(ordered.length).toBeGreaterThan(0);
    expect(ordered.some((o) => o.text.length > 2)).toBe(true);
    for (const o of ordered) {
      const row = rows.find((r) => r.ordered === o)!;
      expect(o.right).toBeLessThanOrEqual(row.contentLeft);
    }
  });
});
