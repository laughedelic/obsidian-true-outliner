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
    if (!(await h.isOutlineMode(TARGET))) {
      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      await h.dismissNotices();
    }
    await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (s) s.scrollTop = s.scrollHeight;
    });
    await browser.pause(1500);
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
});
