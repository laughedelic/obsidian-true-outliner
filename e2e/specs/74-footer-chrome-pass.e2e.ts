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
  await browser.saveScreenshot(path.join(OUT, `${name}.png`));
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
    for (const [label, target] of [['small', SMALL], ['hub', HUB]] as const) {
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
   * The goal of the whole exercise, stated as a measurement: a footer row must
   * sit the way an editor line sits.
   *
   * Compares a footer reference row against a `.cm-line` in the same session —
   * a relationship, never a pixel count, because CI's font is not this
   * machine's. Two numbers carry it: the horizontal gap between the marker's
   * ink and the text beside it, and the vertical offset between their centres.
   *
   * Both have been wrong for reasons that looked like nothing: 3.6px of extra
   * gap from a newline in Obsidian's own HTML collapsing to a space, and 1px of
   * vertical drift from the footer rendering at UI size while the marker's box
   * is sized in `rem` against the editor's text size.
   */
  it('sits a row the way the editor sits a line', async function () {
    await h.openNote(SMALL);
    await ensureOutlineMode(SMALL);

    const measure = (): Promise<{ editor: [number, number] | null; footer: Array<[number, number]> }> =>
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
        const pair = (marker: Element | null, host: Element | null): [number, number] | null => {
          const tn = host ? firstText(host) : null;
          if (!marker || !tn) return null;
          const m = marker.getBoundingClientRect();
          const r = document.createRange();
          r.selectNodeContents(tn);
          const t = r.getBoundingClientRect();
          return [t.left - m.right, m.top + m.height / 2 - (t.top + t.height / 2)];
        };
        const line = leaf?.querySelector('.cm-content > .cm-line.to-decor-block') ?? null;
        return {
          editor: pair(line?.querySelector(':scope > .to-decor-marker-icon svg') ?? null, line),
          footer: Array.from(leaf?.querySelectorAll<HTMLElement>('.to-backlinks-row.is-reference') ?? [])
            .map((el) =>
              pair(
                el.querySelector(':scope > .to-decor-marker-icon svg'),
                el.querySelector(':scope > .to-backlinks-content'),
              ),
            )
            .filter((v): v is [number, number] => v !== null),
        };
      });

    // The editor line has to be measured while it is on screen, and the footer
    // only exists once scrolled to (CM6 virtualises).
    const top = await measure();
    expect(top.editor).not.toBeNull();
    await scrollToEnd();
    const bottom = await measure();
    expect(bottom.footer.length).toBeGreaterThan(0);

    const [editorGap, editorDy] = top.editor!;
    for (const [gap, dy] of bottom.footer) {
      // A row whose content starts with a non-text inline (a task checkbox)
      // measures that element's advance instead, which is not this contract.
      if (gap > editorGap + 5) continue;
      expect(Math.abs(gap - editorGap)).toBeLessThan(1);
      expect(Math.abs(dy - editorDy)).toBeLessThan(1);
    }
  });
});
