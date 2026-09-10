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
import { openFooter, readStable } from '../footer.js';

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
 * thing those cases mean to assert. Those two read a ROW instead, and read it
 * here, where the whole footer is two source notes and `settle` converges in a
 * pass — on a contended runner the waiting is what ran them past mocha's own
 * per-test budget.
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

/**
 * `shape()` with the hub footer scrolled back into existence if a repaint has
 * pushed it out of the viewport.
 *
 * Every setting here repaints the footer, and this one is the whole hub
 * fixture: on a phone-sized viewport that rebuild can leave the widget outside
 * the rendered range, where `shape()` reads null. Not `scrollToFooter` from
 * ../footer.ts, which settles as well — that budget is what a few hundred
 * resolving rows exhaust.
 */
async function hubShape(): Promise<Shape> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = await shape();
    if (now) return now;
    await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await browser.pause(500);
  }
  throw new Error('no footer rendered');
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
    const s = await hubShape();
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
    const s = await hubShape();
    expect(s!.segIcons).toBe(0);
    expect(s!.lineageMarkers).toBeGreaterThan(0);
    // The rows themselves are untouched — this is a decline, not a filter.
    expect(s!.lineageRows).toBeGreaterThan(0);
  });

  it('drops the row’s own marker too, at the last rung', async function () {
    await set('backlinksSegmentIcons', 'none');
    const s = await hubShape();
    expect(s!.segIcons).toBe(0);
    expect(s!.lineageMarkers).toBe(0);
    expect(s!.lineageRows).toBeGreaterThan(0);
  });

  it('puts a chevron between ancestors when asked', async function () {
    await set('backlinksSegmentIcons', 'all');
    await set('backlinksSeparator', 'chevron');
    const s = await hubShape();
    expect(s!.separators).toBeGreaterThan(0);
    // Separators stand BETWEEN ancestors, so there is one fewer than there are
    // per-segment icons plus the gutter marker each row spends on its first.
    expect(s!.separators).toBe(s!.segIcons);
  });

  it('draws guides down the footer’s rows when asked', async function () {
    await set('backlinksSeparator', 'none');
    await set('backlinksGuides', true);
    const s = await hubShape();
    expect(s!.guideRows).toBeGreaterThan(0);

    await set('backlinksGuides', false);
    expect((await hubShape()).guideRows).toBe(0);
  });

  /**
   * The two cases that need a settled footer, sharing one.
   *
   * They read a ROW rather than the footer: one row's own resolved chrome and
   * its own guide background answer both claims, where a count over the whole
   * footer answers a different question — how much of it has resolved. On the
   * hub target that count was 597 one moment and 646 the next (measured on CI),
   * and waiting for it to hold still cost more than mocha's per-test budget on
   * a contended runner. Rows resolve with their group; the first one is there
   * as soon as the first group is.
   *
   * The small target is the second reason these are cheap: its whole footer is
   * two source notes, so `settle` converges in one pass instead of chasing a
   * few hundred rows.
   */
  describe('following the outline’s chrome, and not the caret', function () {
    before(async function () {
      await openFooter(SMALL_TARGET);
      await set('backlinksGuides', true);
    });

    after(async function () {
      await set('backlinksGuides', false);
      await set('outlineUnit', 'auto');
      await set('guideIntensity', 'subtle');
      await set('guideVisibility', 'all');
    });

    /** The first guide-drawing row: what it says, and the chrome it renders with. */
    const guideRow = (): Promise<{
      text: string;
      background: string;
      unit: number;
      guide: number;
      inset: number;
    }> =>
      browser.execute(() => {
        // The first row that actually PAINTS one. Every row carries the class,
        // including the depth-0 rows whose guide list is empty by construction
        // — there is no ancestor above them to draw — so picking by class alone
        // reads a row whose background is `none` and compares nothing.
        const row = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-leaf.mod-active .to-backlinks-row.to-decor-guides',
          ),
        ).find((el) => getComputedStyle(el, '::after').backgroundImage !== 'none');
        if (!row) throw new Error('no footer row drawing guides');
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
        return {
          // Carried so a comparison can tell it is reading the same row twice.
          text: (row.textContent ?? '').trim().slice(0, 40),
          background: getComputedStyle(row, '::after').backgroundImage,
          unit,
          guide,
          inset: group ? parseFloat(getComputedStyle(group).paddingLeft) || 0 : 0,
        };
      });

    it('draws none while the guide layer itself is off, and returns when it comes back', async function () {
      // Two conditions, not one. Turning the layer off is a statement about the
      // outline's chrome rather than about one surface, and a reader who turned
      // guides off does not expect them under the note either.
      //
      // Here rather than on the hub for the reason above: each of these
      // settings repaints every mounted footer, and doing that four times over
      // a few hundred rows ran past mocha's per-test budget on a contended
      // mobile runner. The claim is a presence and an absence, which the small
      // footer answers just as well.
      expect((await readStable(shape))!.guideRows).toBeGreaterThan(0);

      await set('guideVisibility', 'off');
      expect((await readStable(shape))!.guideRows).toBe(0);

      await set('guideVisibility', 'all');
      expect((await readStable(shape))!.guideRows).toBeGreaterThan(0);
    });

    it('keeps its own rows’ guides while the editor draws only the cursor’s levels', async function () {
      // The two caret- and document-scoped modes have no referent here: a
      // footer has no caret of its own, and every row's lineage begins at its
      // source note's own root. So a footer row draws one guide per ancestor
      // row above it whatever the editor is doing.
      await set('guideVisibility', 'ancestors');
      const before = await guideRow();

      // Plain `setCursor`: the caret-placement policy corrects a position at a
      // heading's very start, which `setCursorSettled` would report as a
      // failure to hold — irrelevant here, where only the MOVE matters.
      await h.setCursor(0, 0);
      await browser.pause(300);

      const after = await guideRow();
      expect(after.text).toBe(before.text); // the same row, not a neighbour
      expect(after.background).toBe(before.background);
    });

    it('takes the unit, the weight and the intensity the editor takes', async function () {
      // Chrome vocabulary is declared at `body`, which both surfaces inherit,
      // so this is consistency by construction rather than by a second
      // implementation. Asserted against the RESOLVED values a row renders
      // with, in case some rule ever scopes one of them to the editor. Weight
      // is not a setting — it is a declaration a snippet retunes — so it is
      // driven here the way a reader would drive it.
      const base = await guideRow();
      await set('outlineUnit', 'wide');
      await h.applyStyleOverride('footer-appearance-width', 'body { --to-guide-width: 3px; }');
      const geometry = await guideRow();
      // Relationships, not pixels: a wider step is wider on this surface too,
      // the group's own inset — stated from the unit rather than copied from a
      // row — moves with it, and the guide's own width follows the one
      // declaration a snippet retunes (it is not a setting).
      expect(geometry.unit).toBeGreaterThan(base.unit);
      expect(geometry.guide).toBeGreaterThan(base.guide);
      expect(geometry.inset).toBeGreaterThan(base.inset);
      await h.applyStyleOverride('footer-appearance-width', null);

      // Intensity ON ITS OWN, after the geometry has settled. It is the one
      // axis with no length to read, so it is asserted where it lands — the
      // colour this row's own guide paints — and changed alone, or a thicker
      // stripe would move the same background string and a rule that scoped
      // `--to-guide-color` to the editor would still pass.
      await set('guideIntensity', 'strong');
      const stronger = await guideRow();
      expect(stronger.background).not.toBe(geometry.background);
    });
  });
});
