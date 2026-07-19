/**
 * Pipeline smoke: Obsidian boots, plugin loads, buffer mirrors disk, and the
 * platform mode matches what this wdio config asked for — a guard against
 * e2e/wdio.mobile-emulation.conf.mts silently running in desktop mode.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { openNote, getBuffer, readVaultFile } from '../helpers.js';

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
});
