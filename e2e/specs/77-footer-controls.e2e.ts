/**
 * The header control row and the filter row it reveals.
 *
 * Several of these exist because manual use found the controls unusable in ways
 * no unit test could see: the footer keeps the editor's caret by preventing the
 * default on pointerdown, and that default is exactly what focuses an input and
 * opens a select. So the two form controls are driven here by real clicks and
 * real keystrokes rather than by dispatching change events.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const TARGET = 'Projects/Aurora Dashboard.md';
const FOOTER = '.workspace-leaf.mod-active .to-backlinks';

async function openFooter(): Promise<void> {
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
  await browser.pause(1400);
}

/**
 * A real click, retried past a repaint.
 *
 * The footer rebuilds its whole subtree on every render — deliberately, and by
 * a decision `backlinks-footer` argued — so an element handle can be detached
 * between finding it and clicking it. Re-finding is the fix; a synthetic
 * `el.click()` from inside the page would dodge the staleness and also dodge
 * the pointer sequence these cases exist to exercise.
 */
async function clickIn(selector: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const el = await browser.$(selector);
      await el.waitForClickable({ timeout: 4000 });
      await el.click();
      return;
    } catch (error) {
      if (!String(error).includes('stale')) throw error;
      await browser.pause(250);
    }
  }
  throw new Error(`could not click ${selector} without it being replaced`);
}

/** Reveal the filter row if it is not already open. */
async function openFilters(): Promise<void> {
  const open = await browser.executeObsidian(
    () =>
      document
        .querySelector('.workspace-leaf.mod-active .to-backlinks-filter-toggle')
        ?.getAttribute('aria-expanded') === 'true',
  );
  if (!open) {
    await clickIn(`${FOOTER} .to-backlinks-filter-toggle`);
  }
  // Waited for rather than paused past: the row is built by a render the click
  // schedules, and a fixed pause is a guess that fails on a slow machine.
  await browser.waitUntil(
    async () =>
      (await browser.executeObsidian(
        () =>
          document.querySelectorAll('.workspace-leaf.mod-active .to-backlinks-axis').length,
      )) > 0,
    { timeout: h.waitBudget(5000), timeoutMsg: 'the filter row never appeared' },
  );
}

/** Clear every selection, so a case starts from a known filter state. */
async function clearFilters(): Promise<void> {
  await browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    const reset = root?.querySelector<HTMLElement>('.to-backlinks-reset');
    reset?.click();
  });
  await browser.pause(600);
}

describe('the footer’s controls', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    // Not a volume spec.
    await h.pinBacklinksCapOff();
    await browser.executeObsidian(({ plugins }) => {
      (plugins.trueOutliner as never as { backlinks: { rebuild(): void } }).backlinks.rebuild();
    });
    await openFooter();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('keeps the header to one row until the filter affordance is used', async function () {
    const shape = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      return {
        head: root?.querySelector('.to-backlinks-head') !== null,
        toggle: root?.querySelector('.to-backlinks-filter-toggle') !== null,
        sort: root?.querySelector('.to-backlinks-sort') !== null,
        filters: root?.querySelector('.to-backlinks-filters') !== null,
      };
    });
    expect(shape.head).toBe(true);
    expect(shape.toggle).toBe(true);
    expect(shape.sort).toBe(true);
    expect(shape.filters).toBe(false);
  });

  it('reveals a second row carrying both axes, each named', async function () {
    await openFilters();
    const axes = await browser.executeObsidian(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-axis',
        ),
      ).map((g) => ({
        axis: g.dataset.axis ?? '',
        label: g.querySelector('.to-backlinks-axis-label')?.textContent ?? '',
        controls: g.querySelectorAll('button').length,
      })),
    );
    expect(axes.map((a) => a.axis)).toEqual(['folder', 'kind']);
    for (const a of axes) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.controls).toBeGreaterThan(0);
    }
  });

  it('separates the two axes by more than their corner radius', async function () {
    await openFilters();
    const gaps = await browser.executeObsidian(() => {
      const groups = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-axis',
        ),
      );
      const within = Array.from(
        groups[0]?.querySelectorAll<HTMLElement>('button') ?? [],
      ).map((b) => b.getBoundingClientRect());
      if (groups.length < 2 || within.length < 2) return null;
      const a = groups[0]!.getBoundingClientRect();
      const b = groups[1]!.getBoundingClientRect();
      return {
        sameRow: Math.abs(a.top - b.top) < 2,
        betweenGroups: Math.round(b.left - a.right),
        rowGap: Math.round(b.top - a.bottom),
        withinGroup: Math.round(within[1]!.left - within[0]!.right),
      };
    });
    expect(gaps).not.toBeNull();
    // A relationship, not a pixel count. Two groups read as two when the space
    // between them beats the space inside one — or when they are on separate
    // rows outright, which the hub fixture's folder list produces and which is
    // more separation rather than less.
    if (gaps!.sameRow) {
      expect(gaps!.betweenGroups).toBeGreaterThan(gaps!.withinGroup);
    } else {
      expect(gaps!.rowGap).toBeGreaterThan(0);
    }
  });

  it('lets the caret land in the search field, and filters as it is typed', async function () {
    await openFilters();
    await clearFilters();
    await openFilters();

    // A term taken from a group actually on screen, so the case does not turn
    // on a fixture's note names.
    const term = await browser.executeObsidian(() => {
      const name = document.querySelector<HTMLElement>(
        '.workspace-leaf.mod-active .to-backlinks-group-name',
      );
      return (name?.textContent ?? '').trim().slice(0, 5);
    });
    expect(term.length).toBeGreaterThan(2);

    await clickIn(`${FOOTER} .to-backlinks-search`);
    await browser.pause(300);
    const focused = await browser.executeObsidian(
      () => (document.activeElement as HTMLElement | null)?.dataset?.focusKey ?? '',
    );
    // The bug this pins: the footer prevents the default on pointerdown to keep
    // the editor's caret, and that default is what focuses an input.
    expect(focused).toBe('search');

    await browser.keys(term);
    await browser.pause(900);
    const after = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      const input = root?.querySelector<HTMLInputElement>('.to-backlinks-search');
      return {
        value: input?.value ?? '',
        stillFocused:
          (document.activeElement as HTMLElement | null)?.dataset?.focusKey ?? '',
        groups: root?.querySelectorAll('.to-backlinks-group').length ?? -1,
        names: Array.from(
          root?.querySelectorAll<HTMLElement>('.to-backlinks-group-name') ?? [],
        ).map((n) => n.textContent ?? ''),
      };
    });
    // EVERY character, not just the first. Each keystroke re-renders the footer
    // and replaces the input, so without focus following the control the rest of
    // the word went nowhere.
    expect(after.value).toBe(term);
    expect(after.stillFocused).toBe('search');
    expect(after.groups).toBeGreaterThan(0);
    for (const name of after.names) expect(name).toContain(term);
  });

  it('opens the sort control and reorders by it', async function () {
    await openFilters();
    const before = await browser.executeObsidian(
      () =>
        document.querySelector<HTMLSelectElement>(
          '.workspace-leaf.mod-active .to-backlinks-sort',
        )?.value ?? '',
    );
    expect(before).toBe('recent');

    // Driven as a real control: `selectByAttribute` goes through the element's
    // own interaction path, which a `preventDefault` on pointerdown breaks.
    const select = await browser.$(`${FOOTER} .to-backlinks-sort`);
    await select.selectByAttribute('value', 'name');
    await browser.pause(900);

    const stored = (await h.readPluginData()) as unknown as Record<string, unknown> | null;
    expect(stored?.backlinksSort).toBe('name');
    // And it carries its own mark, which the first cut left out entirely.
    const hasIcon = await browser.executeObsidian(
      () =>
        document.querySelector('.workspace-leaf.mod-active .to-backlinks-sort-icon svg') !== null,
    );
    expect(hasIcon).toBe(true);

    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksSort('recent');
    });
    await browser.pause(500);
  });

  it('re-counts one axis against the other’s selection', async function () {
    await openFilters();
    await clearFilters();
    await openFilters();
    const read = (): Promise<{ label: string; count: string; empty: boolean }[]> =>
      browser.executeObsidian(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-leaf.mod-active [data-axis="kind"] button',
          ),
        ).map((b) => ({
          label: b.querySelector('.to-backlinks-chip-label')?.textContent ?? '',
          count: b.querySelector('.to-backlinks-chip-count')?.textContent ?? '',
          empty: b.classList.contains('is-empty'),
        })),
      );

    const before = await read();
    expect(before.length).toBeGreaterThan(1);
    expect(before.every((k) => k.count === '0')).toBe(false);

    // Pick the narrowest folder, so at least one kind should fall away.
    await clickIn(`${FOOTER} [data-axis="folder"] button`);
    await browser.pause(800);
    const after = await read();
    expect(after.length).toBe(before.length);
    // Some count moved: the chips answer "if I add this", not "how many exist".
    expect(after.map((k) => k.count)).not.toEqual(before.map((k) => k.count));
    // Anything that fell to zero says so, rather than showing a stale number.
    for (const kind of after) {
      if (kind.count === '0') expect(kind.empty).toBe(true);
    }
  });

  it('clears every axis and the term from one control', async function () {
    await openFilters();
    // Make all three active, which is the spec's own scenario.
    await clickIn(`${FOOTER} [data-axis="folder"] button`);
    await browser.pause(500);
    await clickIn(`${FOOTER} [data-axis="kind"] button`);
    await browser.pause(500);
    await clickIn(`${FOOTER} .to-backlinks-search`);
    await browser.keys('a');
    await browser.pause(600);

    const resetVisible = await browser.executeObsidian(
      () =>
        document.querySelector('.workspace-leaf.mod-active .to-backlinks-reset') !== null,
    );
    expect(resetVisible).toBe(true);

    await clickIn(`${FOOTER} .to-backlinks-reset`);
    await browser.pause(800);

    const cleared = await browser.executeObsidian(() => {
      const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
      return {
        selected: root?.querySelectorAll('.is-selected').length ?? -1,
        search: root?.querySelector<HTMLInputElement>('.to-backlinks-search')?.value ?? 'x',
        reset: root?.querySelector('.to-backlinks-reset') !== null,
        dot: root?.querySelector('.to-backlinks-filter-toggle.is-active') !== null,
      };
    });
    expect(cleared.selected).toBe(0);
    expect(cleared.search).toBe('');
    // Offered only while something is active.
    expect(cleared.reset).toBe(false);
    expect(cleared.dot).toBe(false);
  });

  it('gives the section’s icon the editor’s own marker size', async function () {
    const sizes = await browser.executeObsidian(() => {
      const leaf = document.querySelector('.workspace-leaf.mod-active');
      const head = leaf?.querySelector<HTMLElement>('.to-backlinks-icon');
      const editorMark = leaf?.querySelector<HTMLElement>(
        '.cm-content > .cm-line .to-decor-marker-icon',
      );
      if (!head || !editorMark) return null;
      return {
        head: head.getBoundingClientRect().width,
        editor: editorMark.getBoundingClientRect().width,
      };
    });
    expect(sizes).not.toBeNull();
    // A RELATIONSHIP, not a pixel count — CI's fonts are not macOS's. The head
    // icon is the section's mark on the depth-0 column, so it is the size of a
    // top-level marker rather than of a footer row's smaller mark.
    expect(Math.abs(sizes!.head - sizes!.editor)).toBeLessThan(1.5);
  });
});
