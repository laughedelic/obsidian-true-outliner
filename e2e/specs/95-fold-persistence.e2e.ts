/**
 * Fold state across a close and a reopen, and the setting that governs it.
 *
 * Nothing here is a store of ours: with the provider registered, Obsidian's own
 * per-file workspace state saves and restores these folds
 * (docs/research/fold-mechanics). These tests are what keep that true — the behaviour is
 * inherited, so nothing in this plugin would fail if it silently stopped.
 */

import { expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-persistence.md';

/*  0 | # Heading
    1 |
    2 | Paragraph with children:
    3 |
    4 | - one
    5 |   - nested
    6 |                                                                        */
const DOC = ['# Heading', '', 'Paragraph with children:', '', '- one', '  - nested', ''].join('\n');

describe('fold persistence', () => {
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
  });

  it('brings the same folds back when the note is reopened', async () => {
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 3);
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 5 }]);

    await h.closeActiveLeaf();
    await h.openNote(NOTE);
    // The paragraph is the case that could not persist before this change:
    // Obsidian's restore validates a saved fold against `foldable()`, and
    // nothing called a paragraph foldable.
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 5 }]);
    expect(await h.renderedLineTexts()).not.toContain('  - nested');
  });

  it('opens everything when "Remember folds" is off', async () => {
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 5 }]);

    await h.setPluginSetting('rememberFolds', false);
    try {
      await h.closeActiveLeaf();
      await h.openNote(NOTE);
      expect(await h.foldedLineRanges()).toEqual([]);
      expect(await h.renderedLineTexts()).toContain('  - nested');
    } finally {
      await h.setPluginSetting('rememberFolds', true);
    }
  });

  it('leaves the file byte-identical however much is folded', async () => {
    const before = await h.readVaultFile(NOTE);
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    await h.runCommand('unfold-all');
    await h.runCommand('fold-all');
    await h.saveActiveFile();
    // The clean-files invariant as a test rather than a promise: no marker, no
    // property, no block id is written because something was folded.
    expect(await h.readVaultFile(NOTE)).toBe(before);
  });
});
