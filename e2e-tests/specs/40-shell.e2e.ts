/**
 * Plugin shell behaviors — automates the "Shell" checklist of
 * openspec/changes/editor-core/verification.md (minus the mobile smoke,
 * which stays manual).
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

describe('plugin shell', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('clean unload: disabling the plugin removes its commands', async function () {
    expect(await h.commandRegistered('toggle-outline-mode')).toBe(true);

    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    expect(await h.commandRegistered('toggle-outline-mode')).toBe(false);

    await obsidianPage.enablePlugin(h.PLUGIN_ID);
    expect(await h.commandRegistered('toggle-outline-mode')).toBe(true);
  });

  it('coexistence warning fires once, not again after restart', async function () {
    // Enable the conflicting-id stub, then reload our plugin so onload sees it.
    await obsidianPage.enablePlugin('obsidian-outliner');
    // The warning logic reads community-plugins.json (public API); Obsidian
    // writes that file asynchronously after enablePluginAndSave.
    await browser.waitUntil(
      () =>
        browser.executeObsidian(async ({ app }) => {
          try {
            const raw = await app.vault.adapter.read(
              `${app.vault.configDir}/community-plugins.json`,
            );
            return (JSON.parse(raw) as string[]).includes('obsidian-outliner');
          } catch {
            return false;
          }
        }),
      { timeout: 8000, timeoutMsg: 'community-plugins.json never listed the stub' },
    );
    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    await obsidianPage.enablePlugin(h.PLUGIN_ID);

    await h.waitForNotice('obsidian-outliner');
    await h.dismissNotices();

    // Restart the app with state preserved: warning must not repeat.
    await browser.reloadObsidian();
    await browser.pause(2000); // give a (buggy) repeat warning time to appear
    const texts = await h.noticeTexts();
    expect(texts.filter((t) => t.includes('obsidian-outliner'))).toEqual([]);

    await obsidianPage.disablePlugin('obsidian-outliner');
  });
});
