/**
 * Pipeline smoke: Obsidian boots, plugin loads, buffer mirrors disk, and the
 * platform mode matches what this wdio config asked for — a guard against
 * e2e/wdio.mobile-emulation.conf.mts silently running in desktop mode.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
  openNote,
  getBuffer,
  readVaultFile,
  clickClear,
  clickAttemptBudget,
} from '../helpers.js';

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
   * removes. The flake does not reproduce on demand, so these two cover what
   * can be pinned: that the decision admits the error CI actually reported, and
   * that a click which stays blocked still fails as itself.
   */
  it('budgets attempts by failure mode, from the errors CI reported', function () {
    // Verbatim from the runs each mode was observed on.
    expect(
      clickAttemptBudget(
        'stale element reference: stale element not found in the current frame',
      ),
    ).toBe(4);
    expect(
      clickAttemptBudget(
        'WebDriverError: element click intercepted: Element <svg class="to-backlinks-icon">' +
          ' is not clickable at point (195, 412). Other element would receive the click:' +
          ' <div class="nav-files-container node-insert-event">',
      ),
    ).toBe(2);
    // A real failure, retried none.
    expect(clickAttemptBudget('no such element: Unable to locate element')).toBe(0);
  });

  /**
   * The target is covered for the WHOLE call, so every attempt is refused and
   * the loop runs to its bound — no race to lose, unlike an uncover-on-a-timer
   * test, which a slow enough runner passes having exercised nothing.
   *
   * The assertion is that the error survives the retries. Exhausting the bound
   * is not free (`docs/research/24-e2e-click-retry-costs.md`), and a bound set
   * too high spends the mocha budget instead, replacing an error that names the
   * covering element with a timeout that names nothing. Mocha's own per-test
   * timeout is the other half of the assertion: this test failing that way is
   * the regression.
   */
  it('reports a permanently intercepted click as an interception', async function () {
    await openNote('Notes/Sourdough Log.md');
    await browser.executeObsidian((_ctx, id) => {
      const blocker = document.createElement('div');
      blocker.id = id;
      blocker.setAttribute('style', 'position:fixed;inset:0;z-index:99999');
      document.body.append(blocker);
    }, BLOCKER_ID);

    let thrown: unknown;
    try {
      await clickClear('.workspace-leaf.mod-active .cm-content');
    } catch (error) {
      thrown = error;
    } finally {
      await browser.executeObsidian((_ctx, id) => {
        document.getElementById(id)?.remove();
      }, BLOCKER_ID);
    }

    expect(String(thrown)).toContain('intercepted');
  });
});
