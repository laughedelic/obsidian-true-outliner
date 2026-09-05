/**
 * Driving the backlinks footer from a spec.
 *
 * Not in `helpers.ts`: everything here exists because of one property of this
 * particular widget — it repaints from scratch, asynchronously, one group at a
 * time — and the waits and click strategies below are all consequences of that.
 * Three specs need them (`70`, `77`, `78`), and the reasons are subtle enough
 * that three copies would drift.
 */

import { browser } from '@wdio/globals';
import * as h from './helpers.js';

/** The active leaf's footer. Every read here is scoped to it. */
export const FOOTER = '.workspace-leaf.mod-active .to-backlinks';

/**
 * Wait until the footer stops changing shape.
 *
 * Groups resolve one per source, asynchronously, and each fill mutates the DOM
 * and can add a control. Clicking while that is still happening races it: on CI
 * the filter toggle was replaced faster than four attempts could land on it.
 * Two identical samples in a row is the signal that the fills are done.
 *
 * `budgetMs` is for the one caller that provokes a bigger cascade than a normal
 * repaint: saving the footer's own target re-indexes it and repaints every
 * mounted footer, which on an emulated mobile viewport takes longer than a
 * paint the reader would ever wait through.
 */
export async function settle(budgetMs = 20000): Promise<void> {
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
      timeout: h.waitBudget(budgetMs),
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
 * and removes a whole class of flake that has nothing to do with what a case
 * asserts.
 */
export async function readStable<T>(read: () => Promise<T>): Promise<T> {
  // A deadline rather than a fixed attempt count, and one that scales with the
  // rest of the suite's waits. Twelve samples 200ms apart is two and a half
  // seconds of patience, which is enough on a developer machine and was not
  // enough on a CI runner filling a hub note's groups.
  const deadline = Date.now() + h.waitBudget(8000);
  let previous = '';
  do {
    const value = await read();
    const serialised = JSON.stringify(value);
    if (serialised === previous) return value;
    previous = serialised;
    await browser.pause(250);
  } while (Date.now() < deadline);
  throw new Error('the footer never held one shape long enough to read');
}

/** Open a note in outline mode and bring its footer's header on screen. */
export async function openFooter(notePath: string): Promise<void> {
  await h.openNote(notePath);
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await scrollToFooter();
  await settle();
}

/**
 * Put the footer's own header on screen, centred.
 *
 * The scroll REPEATS, and that is the whole of this function's difficulty.
 * CodeMirror estimates the height of content it has not rendered, so
 * `scrollTop = scrollHeight` lands wherever the estimate happens to say — from
 * the top of a hub note, measured at 2515 of an estimated 3359, with the real
 * end at 5203 once the intervening lines had rendered. One scroll therefore
 * stops short of a footer that is not merely off screen but not built at all,
 * and every wait after it waits on nothing.
 *
 * So: scroll, let the newly rendered content re-estimate, and scroll again
 * until the footer is actually in the DOM or the position stops moving.
 */
export async function scrollToFooter(budgetMs?: number): Promise<void> {
  let previous = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const now = await browser.executeObsidian(() => {
      const s = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (!s) return { top: -1, footer: false };
      s.scrollTop = s.scrollHeight;
      return {
        top: Math.round(s.scrollTop),
        footer: document.querySelector('.workspace-leaf.mod-active .to-backlinks') !== null,
      };
    });
    if (now.footer) break;
    if (now.top === previous) break;
    previous = now.top;
    await browser.pause(300);
  }
  await settle(budgetMs);
  // The end of the DOCUMENT is the footer's last card, not the controls at its
  // top, so one more move brings the header itself into view.
  await browser.executeObsidian(() => {
    document
      .querySelector('.workspace-leaf.mod-active .to-backlinks-head')
      ?.scrollIntoView({ block: 'center' });
  });
  await settle(budgetMs);
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
 * `openFooter` has already brought the header's controls on screen, so the
 * common case needs no scroll at all: a rect read and a pointer press at its
 * centre survive a rebuild, because a rebuilt header puts its controls back in
 * the same place.
 *
 * A control at the footer's far end — the tail rung under the last card — is
 * the exception, and it is scrolled to through the DOM rather than the driver.
 * The point is re-read after the scroll settles, so the rebuild it provokes has
 * already happened by the time the press lands.
 */
export async function clickIn(selector: string): Promise<void> {
  const centre = async (): Promise<{ x: number; y: number; visible: boolean } | null> =>
    browser.executeObsidian((_ctx, sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
      };
    }, selector);

  let point = await centre();
  if (point && !point.visible) {
    await browser.executeObsidian((_ctx, sel: string) => {
      document.querySelector(sel)?.scrollIntoView({ block: 'center' });
    }, selector);
    await settle();
    point = await centre();
  }
  if (!point) throw new Error(`no visible element for ${selector}`);
  await h.clickAtPoint(point.x, point.y);
  await browser.pause(250);
}

/**
 * Reveal the filter row if it is not already open.
 *
 * The press is retried rather than waited on longer. A group fill landing
 * between the rect read and the press replaces the toggle under the pointer, so
 * the click reaches the footer but not the button — a miss, not a slow open,
 * and no wait fixes it. Observed once on this path; three specs now share it.
 */
export async function openFilters(): Promise<void> {
  const isOpen = (): Promise<boolean> =>
    browser.executeObsidian(
      () =>
        document.querySelector('.workspace-leaf.mod-active .to-backlinks-filters') !== null &&
        document
          .querySelector('.workspace-leaf.mod-active .to-backlinks-filter-toggle')
          ?.getAttribute('aria-expanded') === 'true',
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await isOpen()) return;
    await clickIn(`${FOOTER} .to-backlinks-filter-toggle`);
    await settle();
    // The row is built complete and moved into place as a single child, so its
    // presence proves its whole subtree — which is what lets this wait work for
    // a note whose sources carry no tags and so gets no tag facet at all.
    try {
      await browser.waitUntil(isOpen, { timeout: h.waitBudget(4000), interval: 200 });
      return;
    } catch {
      // Fall through and press again.
    }
  }
  throw new Error('the filter row never appeared');
}

/** Clear every selection, so a case starts from a known filter state. */
export async function clearFilters(): Promise<void> {
  await browser.executeObsidian(() => {
    const root = document.querySelector('.workspace-leaf.mod-active .to-backlinks');
    const reset = root?.querySelector<HTMLElement>('.to-backlinks-reset');
    reset?.click();
  });
  await browser.pause(600);
}

/** The values one axis's popover is offering, with their cross-axis counts. */
export interface FacetOption {
  readonly label: string;
  readonly count: string;
  readonly empty: boolean;
  readonly selected: boolean;
}

/** Open an axis's popover and read what it offers. Leaves it open. */
export async function facetOptions(axis: string): Promise<FacetOption[]> {
  await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="${axis}"]`);
  // Opening a facet repaints the footer, which restarts every group fill. The
  // counts are settled long before those are, but the read is of the whole
  // option list and can land mid-swap, so it waits for the fills rather than
  // sampling through them.
  await settle();
  return readStable(() =>
    browser.executeObsidian(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.workspace-leaf.mod-active .to-backlinks-facet-option',
        ),
      ).map((o) => ({
        label: (o.querySelector('.to-backlinks-facet-label')?.textContent ?? '').trim(),
        count: o.querySelector('.to-backlinks-chip-count')?.textContent ?? '',
        empty: o.classList.contains('is-empty'),
        selected: o.getAttribute('aria-pressed') === 'true',
      })),
    ),
  );
}

/** Click one value in the currently open popover, by its visible label. */
export async function chooseFacetValue(label: string): Promise<void> {
  const centre = await browser.executeObsidian((_ctx, wanted: string) => {
    const option = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.workspace-leaf.mod-active .to-backlinks-facet-option',
      ),
    ).find(
      (o) => (o.querySelector('.to-backlinks-facet-label')?.textContent ?? '').trim() === wanted,
    );
    if (!option) return null;
    const rect = option.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, label);
  if (!centre) throw new Error(`no option labelled ${JSON.stringify(label)} in the open popover`);
  await h.clickAtPoint(centre.x, centre.y);
  await browser.pause(400);
}

/** The source notes the footer is currently showing, in order. */
export function groupNames(): Promise<string[]> {
  return browser.executeObsidian(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .to-backlinks-group-name'),
    ).map((n) => (n.textContent ?? '').trim()),
  );
}
