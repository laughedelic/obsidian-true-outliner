/**
 * The surfaces that state and change the mode: the command from any view mode,
 * the status bar item, the ribbon icon, and the reading-view entry
 * (`per-tab-outline-mode`). The lifecycle itself is `10-outline-mode.e2e.ts`.
 *
 * Runs under mobile emulation too, where the status bar does not exist and the
 * ribbon carries the indication alone — asserted rather than assumed, since
 * `addStatusBarItem`'s desktop-only documentation is the only thing that says
 * so.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'People/Maya Lindqvist.md';
const OTHER = 'People/Priya Nair.md';

/** Does the active tab actually RENDER the outline? The indicators state a
 * mode; this is the mode as the document shows it. */
async function rendersOutline(): Promise<boolean> {
  return (await h.decoratedLineCount()) > 0;
}

describe('outline mode surfaces', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  beforeEach(async function () {
    await h.closeAllTabs();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  describe('the indicators', function () {
    it('state the ACTIVE tab’s mode and restate it on a tab switch', async function () {
      await h.openNote(NOTE);
      await h.openInNewTab(OTHER);
      await h.setOutlineMode(false);

      // The second tab is active and off.
      expect(await h.ribbonIsOn()).toBe(false);
      if (!h.IS_MOBILE_RUN) expect(await h.statusItemText()).toBe('Outline off');

      await h.activateTab(0);
      expect(await h.ribbonIsOn()).toBe(true);
      if (!h.IS_MOBILE_RUN) expect(await h.statusItemText()).toBe('Outline on');

      await h.activateTab(1);
      expect(await h.ribbonIsOn()).toBe(false);
      if (!h.IS_MOBILE_RUN) expect(await h.statusItemText()).toBe('Outline off');
    });

    it('ribbon icon toggles the active tab, and only it', async function () {
      await h.openNote(NOTE);
      await h.openInNewTab(OTHER);
      expect(await h.ribbonIsOn()).toBe(true);

      await h.clickIndicator('ribbon');
      await h.waitForNotice('Outline mode off');
      expect(await h.ribbonIsOn()).toBe(false);
      expect(await h.outlineModeOn()).toBe(false);

      await h.activateTab(0);
      expect(await h.outlineModeOn()).toBe(true);
      expect(await h.ribbonIsOn()).toBe(true);
    });

    it('status bar item exists and toggles on desktop, and does not exist on mobile', async function () {
      await h.openNote(NOTE);
      if (h.IS_MOBILE_RUN) {
        // The one platform assertion this spec makes: no status bar, so no item.
        expect(await h.statusItemText()).toBeNull();
        expect(await h.ribbonIsOn()).toBe(true);
        return;
      }

      expect(await h.statusItemText()).toBe('Outline on');
      await h.clickIndicator('status');
      await h.waitForNotice('Outline mode off');
      expect(await h.statusItemText()).toBe('Outline off');
      expect(await h.outlineModeOn()).toBe(false);
      expect(await h.ribbonIsOn()).toBe(false);
    });
  });

  describe('the command from any view mode', function () {
    it('is offered in reading view, where no editor exists to offer it', async function () {
      await h.openNote(NOTE);
      await h.setViewMode('preview');
      expect(await h.viewMode()).toBe('preview');
      expect(await h.commandAvailable('toggle-outline-mode')).toBe(true);
    });

    it('is offered in both editing modes', async function () {
      await h.openNote(NOTE);
      for (const source of [false, true]) {
        await h.setViewMode('source', source);
        expect(await h.commandAvailable('toggle-outline-mode')).toBe(true);
      }
    });
  });

  describe('toggling on from reading view', function () {
    it('enters the pane’s own editing mode, showing the outline', async function () {
      await h.openNote(NOTE);
      // Off first, so the toggle from reading view has a direction to take.
      await h.setOutlineMode(false);
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      expect(await h.viewMode()).toBe('source');
      expect(await h.outlineModeOn()).toBe(true);
      expect(await rendersOutline()).toBe(true);
    });

    it('returns to the SOURCE editor when that is where the pane was', async function () {
      await h.openNote(NOTE);
      await h.setViewMode('source', true); // the source editor, not Live Preview
      await h.setOutlineMode(false);
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      expect(await h.viewMode()).toBe('source');
      // The state's own `source` flag round-trips (docs/research/24), so the
      // pane comes back where it was rather than in whichever editing mode the
      // code would otherwise have picked.
      expect(await h.editorIsSourceMode()).toBe(true);
      expect(await h.outlineModeOn()).toBe(true);
    });

    it('overrides an OFF default', async function () {
      await h.setDefaultOutlineMode(false);
      await h.openNote(NOTE);
      expect(await h.outlineModeOn()).toBe(false);
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      expect(await h.viewMode()).toBe('source');
      expect(await h.outlineModeOn()).toBe(true);
      expect(await rendersOutline()).toBe(true);

      await h.setDefaultOutlineMode(true);
    });

    it('overrides a MANUAL off the tab was carrying', async function () {
      // The tab was turned off by hand and then flipped to reading view, which
      // keeps that state (the round-trip is not a reset). An explicit request
      // for the outline still wins.
      await h.openNote(NOTE);
      await h.setOutlineMode(false);
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      expect(await h.viewMode()).toBe('source');
      expect(await h.outlineModeOn()).toBe(true);
      expect(await rendersOutline()).toBe(true);
    });

    it('does nothing in the OFF direction — the pane stays in reading view', async function () {
      await h.openNote(NOTE);
      expect(await h.outlineModeOn()).toBe(true); // the toggle's direction is OFF
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await browser.pause(500);
      expect(await h.viewMode()).toBe('preview');
      expect(await h.outlineModeOn()).toBe(true);
      expect(await h.noticeTexts()).not.toContain('Outline mode off');
    });

    it('switches only the ACTIVE pane', async function () {
      await h.setDefaultOutlineMode(false);
      await h.openNote(NOTE);
      await h.setViewMode('preview');
      await h.openInNewTab(OTHER);
      await h.setViewMode('preview');

      await h.toggleOutlineMode();
      await h.waitForNotice('Outline mode on');
      expect(await h.viewMode()).toBe('source');

      // The first pane was not asked to leave reading view, and did not.
      await h.activateTab(0);
      expect(await h.viewMode()).toBe('preview');

      await h.setDefaultOutlineMode(true);
    });
  });
});
