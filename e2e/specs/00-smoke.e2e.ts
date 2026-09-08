/**
 * Pipeline smoke: Obsidian boots, plugin loads, buffer mirrors disk, and the
 * platform mode matches what this wdio config asked for — a guard against
 * e2e/wdio.mobile-emulation.conf.mts silently running in desktop mode.
 */

import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
  openNote,
  getBuffer,
  readVaultFile,
  clickClear,
  clickFailureMode,
  spendClickAttempt,
  CLICK_ATTEMPTS,
} from '../helpers.js';

/** The two errors, verbatim from the runs each mode was observed on. */
const STALE = 'stale element reference: stale element not found in the current frame';
const INTERCEPTED =
  'WebDriverError: element click intercepted: Element <svg class="to-backlinks-icon"> is not' +
  ' clickable at point (195, 412). Other element would receive the click:' +
  ' <div class="nav-files-container node-insert-event">';

const BLOCKER_ID = 'to-e2e-click-blocker';

describe('smoke', function () {
  it('boots with the plugin loaded', async function () {
    const loaded = await browser.executeObsidian(({ plugins }) =>
      Boolean(plugins.trueOutliner),
    );
    expect(loaded).toBe(true);
  });

  it('opens a vault note whose buffer matches disk', async function () {
    await openNote('Notes/Sourdough Log.md');
    const buffer = await getBuffer();
    const disk = await readVaultFile('Notes/Sourdough Log.md');
    expect(buffer).toBe(disk);
  });

  it('reports the platform mode this config requested', async function () {
    // Set by test:e2e:mobile; absent (desktop) under plain test:e2e.
    const expectMobile = process.env.OBSIDIAN_E2E_MOBILE === '1';
    const platform = await obsidianPage.getPlatform();
    expect(platform.isMobile).toBe(expectMobile);
    expect(platform.isDesktop).toBe(!expectMobile);
  });

  /**
   * `clickClear` retries an intercepted click, because the interception that
   * broke `75-footer-behaviour` on CI was app chrome that a moment's wait
   * removes. The flake does not reproduce on demand, so these cover what can be
   * pinned: the decision, its bookkeeping, and the wiring between the two.
   */
  it('classifies the failures CI reported, and nothing else', function () {
    expect(clickFailureMode(STALE)).toBe('stale');
    expect(clickFailureMode(INTERCEPTED)).toBe('intercepted');
    expect(clickFailureMode('no such element: Unable to locate element')).toBe(null);
    // The word alone is not the error: the phrase is what admits a retry.
    expect(clickFailureMode('AssertionError: the request was intercepted by the proxy')).toBe(null);
  });

  /**
   * The budgets are spent per mode, so a click that goes stale first arrives at
   * an interception with its interception budget untouched. A single running
   * attempt count gets this wrong in the direction that matters — it throws the
   * interception without the waited retry the mode is admitted for.
   */
  it("spends each failure mode's budget separately", function () {
    const spent = { stale: 0, intercepted: 0 };
    // Stale up to its bound, which is the last one refused.
    for (let i = 1; i < CLICK_ATTEMPTS.stale; i++) expect(spendClickAttempt(spent, STALE)).toBe(true);
    expect(spendClickAttempt(spent, STALE)).toBe(false);
    // Interception still has all of its own.
    for (let i = 1; i < CLICK_ATTEMPTS.intercepted; i++) {
      expect(spendClickAttempt(spent, INTERCEPTED)).toBe(true);
    }
    expect(spendClickAttempt(spent, INTERCEPTED)).toBe(false);
    // A real failure is never worth an attempt, spent budget or not.
    expect(spendClickAttempt({ stale: 0, intercepted: 0 }, 'no such element')).toBe(false);
  });

  /**
   * The target is covered for the WHOLE call, so every attempt is refused and
   * the loop runs to its bound — no race to lose, unlike an uncover-on-a-timer
   * test, which a slow enough runner passes having exercised nothing.
   *
   * A single blocked click is timed first, because the assertions that matter
   * are both relative to it. `clickClear` must take longer than one attempt,
   * which is what ties the loop to the budget above rather than leaving the two
   * verified only in isolation; and it must still fail as an interception, not
   * as a mocha timeout, which is the risk of retrying something this expensive
   * at all (`docs/research/29-e2e-click-retry-costs.md`). Mocha's own per-test
   * timeout is the other half of that second assertion.
   */
  it('retries a permanently intercepted click, then reports the interception', async function () {
    await openNote('Notes/Sourdough Log.md');
    const target = '.workspace-leaf.mod-active .cm-content';
    await browser.executeObsidian((_ctx, id) => {
      const blocker = document.createElement('div');
      blocker.id = id;
      blocker.setAttribute('style', 'position:fixed;inset:0;z-index:99999');
      document.body.append(blocker);
    }, BLOCKER_ID);

    let oneAttempt = 0;
    let elapsed = 0;
    let thrown: unknown;
    try {
      const started = Date.now();
      await (await $(target)).click().catch(() => undefined);
      oneAttempt = Date.now() - started;

      const retried = Date.now();
      try {
        await clickClear(target);
      } catch (error) {
        thrown = error;
      }
      elapsed = Date.now() - retried;
    } finally {
      await browser.executeObsidian((_ctx, id) => {
        document.getElementById(id)?.remove();
      }, BLOCKER_ID);
    }

    expect(String(thrown)).toContain('element click intercepted');
    // More than one attempt's worth of work, measured against this machine's own.
    expect(elapsed).toBeGreaterThan(oneAttempt * (CLICK_ATTEMPTS.intercepted - 0.5));
  });
});
