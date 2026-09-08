/**
 * The three appearance settings, each a RENDERER-side decline.
 *
 * `buildRows` reports every guide depth and every lineage segment whatever these
 * are set to — pinned in `tests/footer-model.test.ts` — so what each of these
 * changes is what the renderer draws from that one model (design D7). These
 * assert the drawing; the unit tests assert the model did not move.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import { openFooter, readStable, scrollToFooter } from '../footer.js';

/**
 * The hub target's footer, on screen.
 *
 * Deliberately NOT `openFooter`: this spec pins the overall cap off, so this
 * one footer holds every reference in the hub fixture — hundreds — and its fill
 * outruns `settle`'s budget. The cases that use it assert a presence or an
 * absence, which a partly-filled footer answers correctly; only the two that
 * compare one measurement to another need a settled footer, and those use the
 * small target.
 */
async function showHubFooter(): Promise<void> {
  await h.openNote(TARGET);
  await h.setOutlineMode(true);
  await browser.executeObsidian(() => {
    const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
    if (s) s.scrollTop = s.scrollHeight;
  });
  await browser.pause(1500);
}

/** Referenced from `Backlinks/Deep chain.md`, so its footer carries lineage. */
const TARGET = 'Projects/Aurora Dashboard.md';

/**
 * A second target whose whole footer is a few dozen rows rather than the hub's
 * few hundred.
 *
 * The two cases that compare a measurement to another measurement use this one.
 * The footer paints what it knows and fills the rest in as it resolves, so on
 * the hub a count taken now and a count taken a moment later are both true and
 * different — measured on CI, 597 rows against 646. That is the fill, not the
 * thing those cases mean to assert. `readStable` and `settle` (both in
 * ../footer.ts) wait that out; a footer small enough to finish rendering means
 * there is much less of it to wait for, on a runner where the waiting is what
 * ran the case past mocha's own timeout.
 *
 * `Backlinks/Family tree.md` and `Backlinks/Kinds gallery.md` reference it, so
 * it still carries deep lineage — rows with ancestors above them, which is what
 * a guide needs to exist at all.
 */
const SMALL_TARGET = 'Backlinks/Reference target.md';

interface Shape {
  lineageRows: number;
  segIcons: number;
  separators: number;
  lineageMarkers: number;
  guideRows: number;
}

function shape(): Promise<Shape | null> {
  return browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    if (!root) return null;
    const lineage = Array.from(root.querySelectorAll('.to-backlinks-row.is-lineage'));
    return {
      lineageRows: lineage.length,
      segIcons: root.querySelectorAll('.to-backlinks-seg-icon').length,
      separators: root.querySelectorAll('.to-backlinks-seg-sep').length,
      // A lineage row's OWN marker, in the gutter — the middle rung of the
      // icons ladder keeps this and drops the per-segment ones.
      lineageMarkers: lineage.filter((r) => r.querySelector('.to-decor-marker-icon')).length,
      guideRows: root.querySelectorAll('.to-backlinks-row.to-decor-guides').length,
    };
  });
}

async function set(key: string, value: unknown): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, k: string, v: unknown) => {
      const tab = (app as any).setting.pluginTabs.find((t: any) => t.id === 'true-outliner');
      await tab.setControlValue(k, v);
    },
    key,
    value,
  );
  await browser.pause(700);
}

/** The first footer row's own resolved guide background — a per-ROW fact, so it
 * does not move with however many other rows have finished filling in. */
async function firstRowGuides(): Promise<string> {
  await scrollToFooter();
  return browser.execute(() => {
    const row = document.querySelector<HTMLElement>(
      '.workspace-leaf.mod-active .to-backlinks-row.to-decor-guides',
    );
    if (!row) throw new Error('no footer row drawing guides');
    return getComputedStyle(row, '::after').backgroundImage;
  });
}

describe('the footer’s appearance settings', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // Not a volume spec: see `pinBacklinksCapOff`.
    await h.pinBacklinksCapOff();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });

    await showHubFooter();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  // The last two cases measure the small target instead; the hub comes back
  // once, here, so the file stays order-independent without paying for a
  // reopen inside a case that is not about it.
  after(async function () {
    await showHubFooter();
  });

  it('defaults to every ancestor named, nothing between them, and no guides', async function () {
    const s = await shape();
    expect(s).not.toBeNull();
    // The fixture has to actually produce lineage, or every case below passes
    // by finding nothing to look at.
    expect(s!.lineageRows).toBeGreaterThan(0);
    expect(s!.segIcons).toBeGreaterThan(0);
    expect(s!.lineageMarkers).toBeGreaterThan(0);
    expect(s!.separators).toBe(0);
    expect(s!.guideRows).toBe(0);
  });

  it('drops the per-segment icons but keeps the row’s own marker', async function () {
    await set('backlinksSegmentIcons', 'own');
    const s = await shape();
    expect(s!.segIcons).toBe(0);
    expect(s!.lineageMarkers).toBeGreaterThan(0);
    // The rows themselves are untouched — this is a decline, not a filter.
    expect(s!.lineageRows).toBeGreaterThan(0);
  });

  it('drops the row’s own marker too, at the last rung', async function () {
    await set('backlinksSegmentIcons', 'none');
    const s = await shape();
    expect(s!.segIcons).toBe(0);
    expect(s!.lineageMarkers).toBe(0);
    expect(s!.lineageRows).toBeGreaterThan(0);
  });

  it('puts a chevron between ancestors when asked', async function () {
    await set('backlinksSegmentIcons', 'all');
    await set('backlinksSeparator', 'chevron');
    const s = await shape();
    expect(s!.separators).toBeGreaterThan(0);
    // Separators stand BETWEEN ancestors, so there is one fewer than there are
    // per-segment icons plus the gutter marker each row spends on its first.
    expect(s!.separators).toBe(s!.segIcons);
  });

  it('draws guides down the footer’s rows when asked', async function () {
    await set('backlinksSeparator', 'none');
    await set('backlinksGuides', true);
    const s = await shape();
    expect(s!.guideRows).toBeGreaterThan(0);

    await set('backlinksGuides', false);
    expect((await shape())!.guideRows).toBe(0);
  });

  it('draws none while the guide layer itself is off, and returns when it comes back', async function () {
    // Two conditions, not one. Turning the layer off is a statement about the
    // outline's chrome rather than about one surface, and a reader who turned
    // guides off does not expect them under the note either.
    await set('backlinksGuides', true);
    expect((await shape())!.guideRows).toBeGreaterThan(0);

    await set('guideVisibility', 'off');
    expect((await shape())!.guideRows).toBe(0);

    await set('guideVisibility', 'all');
    expect((await shape())!.guideRows).toBeGreaterThan(0);
    await set('backlinksGuides', false);
  });

  it('keeps its own rows’ guides while the editor draws only the cursor’s levels', async function () {
    // The two caret- and document-scoped modes have no referent here: a footer
    // has no caret of its own, and every row's lineage begins at its source
    // note's own root. So a footer row draws one guide per ancestor row above
    // it whatever the editor is doing, and does not repaint as the caret moves.
    await openFooter(SMALL_TARGET);
    await set('backlinksGuides', true);
    await set('guideVisibility', 'cursor');
    const before = (await readStable(shape))!.guideRows;
    const beforeFirst = await firstRowGuides();
    expect(before).toBeGreaterThan(0);

    // Plain `setCursor`: the caret-placement policy corrects a position at a
    // heading's very start, which `setCursorSettled` would report as a failure
    // to hold — irrelevant here, where only the MOVE matters. The move scrolls
    // the caret into view and the footer out of it, and CodeMirror renders the
    // viewport, so it has to be scrolled back before there is anything to
    // measure.
    await h.setCursor(0, 0);
    await browser.pause(300);
    // The row's own drawing first — the claim itself, and independent of how
    // much of the rest of the footer has resolved — then the settled count.
    expect(await firstRowGuides()).toBe(beforeFirst);
    expect((await readStable(shape))!.guideRows).toBe(before);

    await set('guideVisibility', 'all');
    await set('backlinksGuides', false);
  });

  it('takes the unit, the thickness and the intensity the editor takes', async function () {
    // Chrome vocabulary is declared at `body`, which both surfaces inherit, so
    // this is consistency by construction rather than by a second
    // implementation. Asserted against the RESOLVED values a row renders with,
    // in case some rule ever scopes one of them to the editor.
    await openFooter(SMALL_TARGET);
    await set('backlinksGuides', true);

    /** A footer row's own resolved chrome, once there is a row to read it from. */
    const rowChrome = async (): Promise<{ unit: number; guide: number; inset: number }> => {
      await scrollToFooter();
      return browser.execute(() => {
        const row = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-row',
        );
        if (!row) throw new Error('no footer row');
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
        row.appendChild(probe);
        const width = (expr: string): number => {
          probe.style.width = expr;
          return +probe.getBoundingClientRect().width.toFixed(2);
        };
        const unit = width('var(--to-decor-unit)');
        const guide = width('var(--to-guide-width)');
        probe.remove();
        const group = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-group',
        );
        const inset = group ? parseFloat(getComputedStyle(group).paddingLeft) || 0 : 0;
        return { unit, guide, inset };
      });
    };

    const base = await rowChrome();
    await set('outlineUnit', 'wide');
    await set('guideThickness', 'medium');
    const after = await rowChrome();
    // Relationships, not pixels: a wider step is wider on this surface too, and
    // the group's own inset — stated from the unit rather than copied from a
    // row — moves with it.
    expect(after.unit).toBeGreaterThan(base.unit);
    expect(after.guide).toBeGreaterThan(base.guide);
    expect(after.inset).toBeGreaterThan(base.inset);

    await set('outlineUnit', 'auto');
    await set('guideThickness', 'hairline');
    await set('backlinksGuides', false);
  });
});
