/**
 * Outline mode lifecycle — automates the "Outline mode" checklist of
 * openspec/changes/editor-core/verification.md.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'People/Maya Lindqvist.md';
const STRUCTURAL = ['indent-node', 'outdent-node', 'move-node-up', 'move-node-down'];

describe('outline mode', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('toggle by command shows a notice; file bytes and mtime untouched', async function () {
    await h.openNote(NOTE);
    const bytes = await h.readVaultFile(NOTE);
    const mtime = await h.statMtimeMs(NOTE);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    expect(await h.isOutlineMode(NOTE)).toBe(true);

    // Give any (buggy) write a moment to land before we look.
    await browser.pause(300);
    expect(await h.readVaultFile(NOTE)).toBe(bytes);
    expect(await h.statMtimeMs(NOTE)).toBe(mtime);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    expect(await h.isOutlineMode(NOTE)).toBe(false);
    expect(await h.readVaultFile(NOTE)).toBe(bytes);
  });

  it('mode survives an app restart with no trace in the note', async function () {
    await h.openNote(NOTE);
    const bytes = await h.readVaultFile(NOTE);
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');

    await browser.reloadObsidian(); // reboot, preserving sandbox state

    expect(await h.isOutlineMode(NOTE)).toBe(true);
    expect(await h.readVaultFile(NOTE)).toBe(bytes);

    await h.openNote(NOTE);
    await h.toggleOutlineMode(); // leave it off for later tests
    await h.waitForNotice('Outline mode off');
  });

  it('rename: mode follows the new path in data.json', async function () {
    await h.createNote('Scratch/rename-me.md', 'alpha\n');
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath('Scratch/rename-me.md');
      if (!file) throw new Error('scratch note missing');
      await app.fileManager.renameFile(file, 'Scratch/renamed.md');
    });

    await browser.waitUntil(
      async () => {
        const data = await h.readPluginData();
        return (
          data !== null &&
          data.outlinePaths.includes('Scratch/renamed.md') &&
          !data.outlinePaths.includes('Scratch/rename-me.md')
        );
      },
      { timeout: 4000, timeoutMsg: 'data.json did not follow the rename' },
    );
    expect(await h.isOutlineMode('Scratch/renamed.md')).toBe(true);
  });

  it('delete: path pruned from data.json', async function () {
    await h.createNote('Scratch/delete-me.md', 'alpha\n');
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');

    await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getAbstractFileByPath('Scratch/delete-me.md');
      if (!file) throw new Error('scratch note missing');
      await app.vault.delete(file);
    });

    await browser.waitUntil(
      async () => {
        const data = await h.readPluginData();
        return data !== null && !data.outlinePaths.includes('Scratch/delete-me.md');
      },
      { timeout: 4000, timeoutMsg: 'data.json did not prune the deleted path' },
    );
  });

  it('structural commands are gated to outline notes', async function () {
    await h.openNote(NOTE); // mode is off here
    for (const id of STRUCTURAL) {
      expect(await h.commandAvailable(id)).toBe(false);
    }

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    for (const id of STRUCTURAL) {
      expect(await h.commandAvailable(id)).toBe(true);
    }

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
  });
});
