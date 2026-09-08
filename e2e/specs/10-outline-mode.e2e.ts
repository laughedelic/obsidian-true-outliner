/**
 * Outline mode's lifecycle: a per-tab state initialized from one global
 * default (`per-tab-outline-mode`).
 *
 * What this spec is FOR is the boundaries — where a tab's own state comes from,
 * where it resets, where it does not, and what reaches disk. The surfaces that
 * state and change it are `11-outline-mode-surfaces.e2e.ts`.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'People/Maya Lindqvist.md';
const OTHER = 'People/Priya Nair.md';
const STRUCTURAL = ['indent-node', 'outdent-node', 'move-node-up', 'move-node-down'];

/** Read the default straight off disk, so a claim about persistence is about
 * the file and not about the value still in memory. */
async function storedDefault(): Promise<boolean | undefined> {
  return (await h.readPluginData())?.outlineByDefault;
}

describe('outline mode', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  beforeEach(async function () {
    // Every test builds the tabs it measures; see `closeAllTabs`.
    await h.closeAllTabs();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('opens every note outlined on a fresh install', async function () {
    // The SHIPPED default, from a plugin that has stored nothing — not the
    // value `resetPluginState` writes. That distinction is the test: with the
    // harness's own write in place this passes whichever default the plugin
    // ships, which is no claim about a fresh install at all.
    await h.clearPluginData();
    expect((await h.readPluginData())?.outlineByDefault).toBeUndefined();

    await h.closeAllTabs();
    await h.openNote(NOTE);
    expect(await h.outlineModeOn()).toBe(true);
    await h.openInNewTab(OTHER);
    expect(await h.outlineModeOn()).toBe(true);

    await h.resetPluginState(); // back to the state the rest of the suite wants
  });

  it('toggle shows a notice; file bytes and mtime untouched', async function () {
    await h.openNote(NOTE);
    const bytes = await h.readVaultFile(NOTE);
    const mtime = await h.statMtimeMs(NOTE);

    await h.setOutlineMode(false);
    expect(await h.outlineModeOn()).toBe(false);

    // Give any (buggy) write a moment to land before we look.
    await browser.pause(300);
    expect(await h.readVaultFile(NOTE)).toBe(bytes);
    expect(await h.statMtimeMs(NOTE)).toBe(mtime);

    await h.setOutlineMode(true);
    expect(await h.outlineModeOn()).toBe(true);
    expect(await h.readVaultFile(NOTE)).toBe(bytes);
    expect(await h.statMtimeMs(NOTE)).toBe(mtime);
  });

  it('the toggle acts on the active tab only', async function () {
    await h.openNote(NOTE);
    await h.openInNewTab(OTHER);
    await h.setOutlineMode(false);

    // The first tab, untouched by a toggle aimed at the second.
    await h.activateTab(0);
    expect(await h.outlineModeOn()).toBe(true);
    await h.activateTab(1);
    expect(await h.outlineModeOn()).toBe(false);

    // And a tab opened afterwards still follows the default, not the neighbour.
    await h.openInNewTab(NOTE);
    expect(await h.outlineModeOn()).toBe(true);
  });

  it('two tabs on ONE file hold their own states', async function () {
    // The per-view shape the zoom scope already has, and the reason the mode
    // cannot live on the plugin keyed by anything a file has one of.
    await h.openNote(NOTE);
    await h.openInNewTab(NOTE);
    await h.setOutlineMode(false);
    await h.activateTab(0);
    expect(await h.outlineModeOn()).toBe(true);
    await h.activateTab(1);
    expect(await h.outlineModeOn()).toBe(false);
  });

  it('a tab’s manual state resets when the tab changes notes', async function () {
    // Obsidian rebuilds a leaf's editor state on a file switch
    // (docs/research/24), which is the whole reset mechanism: the field's
    // `create` runs again and reads the default.
    await h.openNote(NOTE);
    await h.setOutlineMode(false);
    await h.openNote(OTHER);
    expect(await h.outlineModeOn()).toBe(true);
    await h.openNote(NOTE);
    expect(await h.outlineModeOn()).toBe(true);
  });

  it('a tab’s manual state SURVIVES a reading round-trip', async function () {
    // The same measurement, the other way: a view-mode switch keeps the leaf's
    // editor state, so the tab comes back as the user left it. Flipping to
    // reading view to check something is not a request to undo a manual off.
    await h.openNote(NOTE);
    await h.setOutlineMode(false);
    await h.setViewMode('preview');
    expect(await h.viewMode()).toBe('preview');
    await h.setViewMode('source');
    expect(await h.viewMode()).toBe('source');
    expect(await h.outlineModeOn()).toBe(false);
    await h.setOutlineMode(true); // leave the tab at the default
  });

  it('the default persists across a restart; a tab’s manual state does not', async function () {
    await h.setDefaultOutlineMode(false);
    expect(await storedDefault()).toBe(false);
    // Opened AFTER the default changed, so the tab starts off and the toggle
    // that follows is a real manual state standing against the default —
    // opening first would leave a tab that is on by inheritance, which proves
    // nothing about what a manual state survives.
    await h.openNote(NOTE);
    expect(await h.outlineModeOn()).toBe(false);
    await h.setOutlineMode(true);

    await browser.reloadObsidian(); // reboot, preserving sandbox state

    expect(await storedDefault()).toBe(false);
    await h.openNote(NOTE);
    // The tab that was manually on comes back stock: the setting is what was
    // stored, and nothing per-tab or per-path ever was.
    expect(await h.outlineModeOn()).toBe(false);
    expect(await h.readVaultFile(NOTE)).not.toContain('outline');

    await h.setDefaultOutlineMode(true);
  });

  it('changing the setting leaves open tabs alone', async function () {
    await h.openNote(NOTE);
    await h.openInNewTab(OTHER);
    await h.setOutlineMode(false);

    await h.setDefaultOutlineMode(false);
    // Both keep what they had — one outlined, one not — because the default is
    // read when an editor state is built and never swept over existing ones.
    await h.activateTab(0);
    expect(await h.outlineModeOn()).toBe(true);
    await h.activateTab(1);
    expect(await h.outlineModeOn()).toBe(false);

    // And the next tab follows the new default.
    await h.openInNewTab(NOTE);
    expect(await h.outlineModeOn()).toBe(false);

    await h.setDefaultOutlineMode(true);
  });

  it('rename and delete change nothing, and the store keeps no per-path state', async function () {
    await h.createNote('Scratch/rename-me.md', 'alpha\n');
    expect(await h.outlineModeOn()).toBe(true);

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath('Scratch/rename-me.md');
      if (!file) throw new Error('scratch note missing');
      await app.fileManager.renameFile(file, 'Scratch/renamed.md');
    });
    await browser.pause(500);
    expect(await h.outlineModeOn()).toBe(true);

    await h.createNote('Scratch/delete-me.md', 'alpha\n');
    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath('Scratch/delete-me.md');
      if (!file) throw new Error('scratch note missing');
      await app.vault.delete(file);
    });
    await browser.pause(500);

    // Nothing to follow and nothing to prune, because nothing is keyed by path.
    const data = await h.readPluginData();
    expect(data).not.toBeNull();
    expect(Object.keys(data!)).not.toContain('outlinePaths');
    expect(JSON.stringify(data)).not.toContain('Scratch/');
  });

  it('drops a previous version’s per-path store on the next save', async function () {
    // The upgrade path, end to end: `data.json` written by a build that had the
    // per-note registry loses that key the first time anything is saved. No
    // migration code — the allow-list in `normalizePluginData` is the mechanism.
    await browser.executeObsidian(async ({ plugins }) => {
      const plugin = plugins.trueOutliner as never as {
        saveData(d: unknown): Promise<void>;
      };
      await plugin.saveData({
        outlinePaths: ['People/Maya Lindqvist.md', 'Scratch/gone.md'],
        outlineByDefault: true,
        debugCrossCheck: false,
        coexistenceWarned: false,
      });
    });
    expect(JSON.stringify(await h.readPluginData())).toContain('outlinePaths');

    await obsidianPage.disablePlugin(h.PLUGIN_ID);
    await obsidianPage.enablePlugin(h.PLUGIN_ID);
    // Any save at all; the setting round-trip is the smallest one available.
    await h.setDefaultOutlineMode(false);
    await h.setDefaultOutlineMode(true);

    const data = await h.readPluginData();
    expect(Object.keys(data!)).not.toContain('outlinePaths');
    expect(data!.outlineByDefault).toBe(true);
  });

  it('structural commands are gated per tab', async function () {
    await h.openNote(NOTE);
    await h.openInNewTab(NOTE); // the SAME note, so only the tab can explain it
    await h.setOutlineMode(false);
    for (const id of STRUCTURAL) {
      expect(await h.commandAvailable(id)).toBe(false);
    }

    await h.activateTab(0);
    for (const id of STRUCTURAL) {
      expect(await h.commandAvailable(id)).toBe(true);
    }
  });
});
