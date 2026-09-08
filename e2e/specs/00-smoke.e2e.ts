/**
 * Pipeline smoke: Obsidian boots, plugin loads, buffer mirrors disk, the
 * platform mode matches what this wdio config asked for — a guard against
 * e2e/wdio.mobile-emulation.conf.mts silently running in desktop mode — and a
 * click on the phone viewport reaches the editor rather than the drawer over it.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { IS_MOBILE_RUN, openNote, getBuffer, readVaultFile, clickClear } from '../helpers.js';

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
   * The drawer fix, made deterministic. The state that produced the CI failure
   * is intermittent, so this puts the workspace into it deliberately —
   * `leftSplit.expand()` opens the drawer under emulation, as
   * `docs/research/24-outline-mode-surfaces.md` measured — and then asserts the
   * click lands anyway. Without the collapse, `clickClear` throws the
   * interception here — an intercepted click is not retried.
   *
   * Mobile only: on the desktop viewport the left split is a sidebar beside the
   * editor, not a drawer over it, so there is nothing in the way to clear.
   */
  it('collapses the phone drawer that would otherwise take the click', async function () {
    if (!IS_MOBILE_RUN) this.skip();
    await openNote('Notes/Sourdough Log.md');
    await browser.executeObsidian(({ app }) => app.workspace.leftSplit.expand());
    await browser.pause(400);

    // The premise, asserted rather than assumed: the drawer is over the point
    // `clickClear` is about to aim at.
    const covering = await browser.executeObsidian(() => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return hit?.closest('.workspace-drawer.mod-left') !== null;
    });
    expect(covering).toBe(true);

    // A text line, not `.cm-content`: this note's content centre is the
    // backlinks footer widget, and clicking a widget lands without focusing the
    // editor — which would make the assertion below measure the wrong thing.
    await clickClear('.workspace-leaf.mod-active .cm-line');

    const collapsed = await browser.executeObsidian(
      ({ app }) => app.workspace.leftSplit.collapsed,
    );
    expect(collapsed).toBe(true);

    // The click reached the editor, not merely "did not throw". Waited for
    // rather than read once: CM6 sets the class from its own focus handler, a
    // tick or two after the pointer event.
    await browser.waitUntil(
      async () =>
        browser.executeObsidian(
          () =>
            document.activeElement?.closest('.workspace-leaf.mod-active .cm-content') !== null &&
            document.activeElement?.closest('.workspace-drawer') === null,
        ),
      { timeout: 4000, timeoutMsg: 'the click did not land in the editor' },
    );
  });
});
