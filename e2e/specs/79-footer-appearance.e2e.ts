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

/** Referenced from `Backlinks/Deep chain.md`, so its footer carries lineage. */
const TARGET = 'Projects/Aurora Dashboard.md';

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

/** The footer is a block widget at the end of the note, and CodeMirror renders
 * the viewport — so it exists in the DOM only while the view is scrolled to it.
 * A setting change or a caret move can scroll it back out, and on a phone-sized
 * viewport it takes more than one pass to reach the end of a long note. */
async function scrollToFooter(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const there = await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (s) s.scrollTop = s.scrollHeight;
      return !!document.querySelector('.workspace-leaf.mod-active .to-backlinks-row');
    });
    if (there) return;
    await browser.pause(400);
  }
  await browser.pause(400);
}

/** `shape()`, with the footer scrolled into existence first. */
async function footerShape(): Promise<Shape> {
  await scrollToFooter();
  const s = await shape();
  if (!s) throw new Error('no footer rendered');
  return s;
}

/**
 * A footer count read after the footer has stopped changing.
 *
 * The footer paints what it knows and fills in the rest as it resolves (its own
 * spec's "paints known information first"), and this note's footer is the whole
 * hub fixture — hundreds of rows. A count taken mid-fill is a real number for a
 * moment and a different real number a moment later, so a test comparing one to
 * another is measuring the fill, not the thing it means to. Two consecutive
 * agreeing reads is the settle condition.
 */
async function settledGuideRows(): Promise<number> {
  // Scrolled once, then polled WITHOUT scrolling again: the footer stays in the
  // DOM as long as the view does not move, and re-scrolling per poll is what
  // pushed this past mocha's per-test timeout on CI's mobile runner. Bounded by
  // a deadline rather than an iteration count, for the same reason.
  await scrollToFooter();
  let last = -1;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const now = (await shape())?.guideRows ?? -1;
    if (now > 0 && now === last) return now;
    last = now;
    await browser.pause(400);
  }
  return last;
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

    await h.openNote(TARGET);
    await h.setOutlineMode(true);
    await scrollToFooter();
    await browser.pause(800);
  });

  afterEach(async function () {
    await h.dismissNotices();
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
    await set('backlinksGuides', true);
    await set('guideVisibility', 'cursor');
    const before = await settledGuideRows();
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
    expect(await settledGuideRows()).toBe(before);

    await set('guideVisibility', 'all');
    await set('backlinksGuides', false);
  });

  it('takes the unit, the thickness and the intensity the editor takes', async function () {
    // Chrome vocabulary is declared at `body`, which both surfaces inherit, so
    // this is consistency by construction rather than by a second
    // implementation. Asserted against the RESOLVED values a row renders with,
    // in case some rule ever scopes one of them to the editor.
    await set('backlinksGuides', true);
    await scrollToFooter();

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
