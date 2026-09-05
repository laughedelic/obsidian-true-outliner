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

/**
 * Wait until the footer stops changing shape.
 *
 * Groups resolve one per source, asynchronously, and each fill mutates the DOM
 * and can add a control. Clicking while that is still happening races it: on CI
 * the filter toggle was replaced faster than four attempts could land on it.
 * Two identical samples in a row is the signal that the fills are done.
 */
async function settle(): Promise<void> {
  let previous = '';
  await browser.waitUntil(
    async () => {
      const now = await browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        if (!root) return null;
        return {
          shape: [
            root.querySelectorAll('.to-backlinks-group').length,
            root.querySelectorAll('.to-backlinks-row').length,
            root.querySelectorAll('.to-backlinks-more').length,
          ].join('/'),
          // A group still showing its placeholder has not resolved.
          resolving: root.querySelectorAll('.to-backlinks-resolving').length,
        };
      });
      if (!now || now.resolving > 0) {
        previous = '';
        return false;
      }
      const stable = now.shape === previous;
      previous = now.shape;
      return stable;
    },
    {
      timeout: h.waitBudget(20000),
      interval: 400,
      timeoutMsg: 'the footer never settled',
    },
  );
}

/**
 * A structural read that agrees with itself twice.
 *
 * `swap` empties the footer and appends its new children one at a time, and a
 * scroll or a click can start another render at any moment, so a single read
 * can catch a footer mid-rebuild — seeing one axis group where there are two.
 * Reading until two consecutive samples match costs a few hundred milliseconds
 * and removes a whole class of flake that has nothing to do with what these
 * cases assert.
 */
async function readStable<T>(read: () => Promise<T>): Promise<T> {
  let previous = '';
  for (let attempt = 0; attempt < 12; attempt++) {
    const value = await read();
    const serialised = JSON.stringify(value);
    if (serialised === previous) return value;
    previous = serialised;
    await browser.pause(200);
  }
  throw new Error('the footer never held one shape long enough to read');
}

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
  await settle();
  // The footer's own header, centred — `scrollTop = scrollHeight` puts the END
  // of the document on screen, which is the footer's last card rather than the
  // controls at its top.
  await browser.executeObsidian(() => {
    document
      .querySelector('.workspace-leaf.mod-active .to-backlinks-head')
      ?.scrollIntoView({ block: 'center' });
  });
  await settle();
}

/**
 * A real click at a POINT, rather than through an element handle.
 *
 * Two things bite here and a point avoids both.
 *
 * `element.click()` scrolls first, and scrolling the editor makes CodeMirror
 * rebuild its viewport — which replaces the footer widget and restarts its
 * group fills, so the handle the click was about to use is already gone. That
 * is a race no amount of retrying wins, because every retry scrolls again.
 *
 * And WebdriverIO's own `scrollIntoView` reaches for the WebDriver Actions API,
 * which Obsidian's Electron does not implement. On macOS that degrades to a
 * warning; on CI it retried the unimplemented command until the case timed out.
 *
 * `openFooter` has already brought the controls on screen, so nothing here
 * needs to scroll. A rect read and a pointer press at its centre survive a
 * rebuild, because a rebuilt header puts its controls back in the same place.
 */
async function clickIn(selector: string): Promise<void> {
  const centre = await browser.executeObsidian((_ctx, sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  if (!centre) throw new Error(`no visible element for ${selector}`);
  await h.clickAtPoint(centre.x, centre.y);
  await browser.pause(250);
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
    await settle();
  }
  // Waited on the row's LAST facet, not its first.
  //
  // `swap` empties the footer and appends the new children one at a time, so a
  // read can land on a partially attached footer. The whole filter row is a
  // single child of that root, so its last facet being present proves the
  // entire row is.
  await browser.waitUntil(
    async () =>
      await browser.executeObsidian(
        () =>
          document.querySelector(
            '.workspace-leaf.mod-active .to-backlinks-filters .to-backlinks-facet[data-axis="tag"]',
          ) !== null,
      ),
    {
      timeout: h.waitBudget(5000),
      timeoutMsg: 'the filter row never appeared',
    },
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
    // The cap stays at its DEFAULT here, unlike the other footer specs. Lifting
    // it renders every one of the hub's ~128 sources, and each is an async fill
    // that mutates the DOM — a footer that is still building when a case clicks
    // one of its controls. This spec needs a footer with both axes, not a large
    // one, and the capped footer has both.
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

  it('reveals a row carrying the search field and one facet per axis', async function () {
    await openFilters();
    const shape = await readStable(() =>
      browser.executeObsidian(() => {
        const row = document.querySelector('.workspace-leaf.mod-active .to-backlinks-filters');
        if (!row) return null;
        return {
          search: row.querySelector('.to-backlinks-search') !== null,
          facets: Array.from(
            row.querySelectorAll<HTMLElement>('.to-backlinks-facet'),
          ).map((f) => f.dataset.axis ?? ''),
        };
      }),
    );
    expect(shape).not.toBeNull();
    expect(shape!.search).toBe(true);
    // Kind first: its four values never change, so it is the one facet whose
    // position a reader can learn.
    expect(shape!.facets).toEqual(['kind', 'folder', 'tag']);
  });

  it('starts the row flush with the cards, not with the header', async function () {
    await openFilters();
    const edges = await readStable(() =>
      browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        const row = root?.querySelector('.to-backlinks-filters');
        const card = root?.querySelector('.to-backlinks-group');
        // The head's own TEXT, not its box: the gutter is padding, so the
        // element starts at the same edge and only its content is pushed in.
        const title = root?.querySelector('.to-backlinks-title');
        if (!row || !card || !title) return null;
        return {
          row: Math.round(row.getBoundingClientRect().left),
          card: Math.round(card.getBoundingClientRect().left),
          title: Math.round(title.getBoundingClientRect().left),
        };
      }),
    );
    expect(edges).not.toBeNull();
    // A RELATIONSHIP, not a pixel: the row shares the cards' left edge, and the
    // header's own text starts further in because its gutter holds the section
    // icon.
    expect(edges!.row).toBe(edges!.card);
    expect(edges!.title).toBeGreaterThan(edges!.row);
  });

  it('sheds the facet words on a narrow footer without the row wrapping', async function () {
    await openFilters();
    const measure = (): Promise<{
      words: number;
      height: number;
      wrapped: boolean;
      overflows: boolean;
    } | null> =>
      browser.executeObsidian(() => {
        const row = document.querySelector<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-filters',
        );
        if (!row) return null;
        const words = Array.from(
          row.querySelectorAll<HTMLElement>('.to-backlinks-facet-word'),
        ).filter((w) => w.offsetParent !== null).length;
        // A wrapped row is TALLER than its tallest child. Comparing the
        // children's top edges does not work: `align-items: center` gives a
        // shorter control a different top on the very same line.
        const kids = Array.from(row.children).map((c) => c.getBoundingClientRect());
        const tallest = Math.max(0, ...kids.map((r) => r.height));
        const height = row.getBoundingClientRect().height;
        return {
          words,
          height: Math.round(height),
          wrapped: height > tallest + 2,
          // And nothing is pushed off the end, which is the other way a row of
          // fixed controls beside a growing one can fail.
          overflows: row.scrollWidth > row.clientWidth + 1,
        };
      });

    const start = await readStable(measure);
    expect(start).not.toBeNull();
    // Whatever the width, the row is ONE row and nothing runs off its end.
    // That half holds everywhere.
    expect(start!.wrapped).toBe(false);
    expect(start!.overflows).toBe(false);

    if (start!.words === 0) {
      // Already narrower than the threshold — the mobile run, where the words
      // are meant to be absent. There is no way to force it wider than its
      // viewport, so this is the whole of the assertion here.
      return;
    }

    await h.resizeLeafForFooter(340);
    const narrow = await readStable(measure);
    expect(narrow).not.toBeNull();
    // The words go; the row neither grows nor wraps. A RELATIONSHIP — the
    // height is unchanged across the threshold — never a pixel width.
    expect(narrow!.words).toBe(0);
    expect(narrow!.wrapped).toBe(false);
    expect(narrow!.overflows).toBe(false);
    expect(narrow!.height).toBe(start!.height);

    await h.resizeLeafForFooter(null);
    const back = await readStable(measure);
    expect(back!.words).toBe(start!.words);
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
        stillFocused: (document.activeElement as HTMLElement | null)?.dataset?.focusKey ?? '',
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
    const options = await browser.executeObsidian(() => {
      const select = document.querySelector<HTMLSelectElement>(
        '.workspace-leaf.mod-active .to-backlinks-sort',
      );
      if (!select) return null;
      return { value: select.value, all: Array.from(select.options).map((o) => o.value) };
    });
    expect(options).not.toBeNull();
    expect(options!.value).toBe('recent');
    expect(options!.all.length).toBeGreaterThan(1);

    // Driven as a real control rather than through WebdriverIO's select
    // handling, which reaches `scrollIntoView` and the Actions API this
    // runtime does not implement. A pointer press and then the keyboard is
    // also the closer test: what was broken was the browser's own default on
    // pointerdown, so the thing worth asserting is that a press FOCUSES it and
    // that the keyboard then moves it.
    await clickIn(`${FOOTER} .to-backlinks-sort`);
    const focused = await browser.executeObsidian(
      () => (document.activeElement as HTMLElement | null)?.dataset?.focusKey ?? '',
    );
    expect(focused).toBe('sort');

    // The two halves are asserted separately because only one of them can be
    // driven portably. Focus is the half that REGRESSED — a prevented default
    // on pointerdown stops a select opening at all — and a real press proves
    // it. Moving the selection from the keyboard is not portable: on macOS
    // ArrowDown opens the closed control rather than changing its value, and on
    // other platforms it changes it. So the value is set the way the control
    // itself would, and the assertion is that the change reaches plugin data.
    await browser.executeObsidian((_ctx, next: string) => {
      const select = document.querySelector<HTMLSelectElement>(
        '.workspace-leaf.mod-active .to-backlinks-sort',
      );
      if (!select) return;
      select.value = next;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, options!.all[1]!);
    await browser.pause(900);

    const stored = (await h.readPluginData()) as unknown as Record<string, unknown> | null;
    expect(stored?.backlinksSort).toBe(options!.all[1]);

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

    const kinds = (): Promise<{ label: string; count: string; empty: boolean }[]> =>
      browser.executeObsidian(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '.workspace-leaf.mod-active .to-backlinks-facet-option',
          ),
        ).map((o) => ({
          label: o.querySelector('.to-backlinks-facet-label')?.textContent ?? '',
          count: o.querySelector('.to-backlinks-chip-count')?.textContent ?? '',
          empty: o.classList.contains('is-empty'),
        })),
      );

    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    const before = await readStable(kinds);
    expect(before.length).toBeGreaterThan(1);
    expect(before.every((k) => k.count === '0')).toBe(false);

    // Close the kind menu, narrow by a folder, reopen it.
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
    await clickIn(`${FOOTER} .to-backlinks-facet-option`);
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    const after = await readStable(kinds);

    expect(after.length).toBe(before.length);
    // Some count moved: the values answer "if I add this", not "how many exist".
    expect(after.map((k) => k.count)).not.toEqual(before.map((k) => k.count));
    for (const kind of after) {
      if (kind.count === '0') expect(kind.empty).toBe(true);
    }
  });

  it('offers a find box on the unbounded axes and not on the fixed one', async function () {
    await openFilters();
    const findable = async (axis: string): Promise<boolean> => {
      await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="${axis}"]`);
      return browser.executeObsidian(
        () =>
          document.querySelector(
            '.workspace-leaf.mod-active .to-backlinks-facet-menu .to-backlinks-facet-find',
          ) !== null,
      );
    };
    // Kind has four values, always — nothing to search (design D10).
    expect(await findable('kind')).toBe(false);
    expect(await findable('folder')).toBe(true);
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
  });

  it('clears every axis and the term from one control', async function () {
    await openFilters();
    await clearFilters();
    await openFilters();

    // Narrow two ways and type, which is the spec's own scenario.
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
    await clickIn(`${FOOTER} .to-backlinks-facet-option`);
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    await clickIn(`${FOOTER} .to-backlinks-facet-option`);
    await clickIn(`${FOOTER} .to-backlinks-search`);
    await browser.keys('a');
    await browser.pause(700);

    const before = await readStable(() =>
      browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        return {
          reset: root?.querySelector('.to-backlinks-reset') !== null,
          active: root?.querySelectorAll('.to-backlinks-facet.is-active').length ?? -1,
        };
      }),
    );
    expect(before.reset).toBe(true);
    expect(before.active).toBeGreaterThan(0);

    await clickIn(`${FOOTER} .to-backlinks-reset`);
    const cleared = await readStable(() =>
      browser.executeObsidian(() => {
        const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
        return {
          active: root?.querySelectorAll('.to-backlinks-facet.is-active').length ?? -1,
          search: root?.querySelector<HTMLInputElement>('.to-backlinks-search')?.value ?? 'x',
          reset: root?.querySelector('.to-backlinks-reset') !== null,
          dot: root?.querySelector('.to-backlinks-filter-toggle.is-active') !== null,
        };
      }),
    );
    expect(cleared.active).toBe(0);
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
