/**
 * What a change does to a fold: the carry, the reveal, and what undo does with
 * both.
 *
 * These are one rule seen from three sides (`fold-carry.ts`). A change that
 * touches a fold's interior opens it, unless the hidden block reappears
 * verbatim in the change's own insertions — which is what a move does and what
 * an edit does not.
 */

import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-edits.md';

/*  0 | - one
    1 |   - nested a
    2 |   - nested b
    3 | - two
    4 |   - under two
    5 | - three
    6 |                                                                        */
const DOC = ['- one', '  - nested a', '  - nested b', '- two', '  - under two', '- three', ''].join(
  '\n',
);

async function freshNote(): Promise<void> {
  await h.createNote(NOTE, DOC);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
  await h.clearFolds();
}

describe('folds through edits', () => {
  beforeEach(async () => {
    await freshNote();
  });

  it('a moved folded node stays folded, at its new position', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);

    await h.runCommand('move-node-down');
    expect(await h.getBuffer()).toBe(
      ['- two', '  - under two', '- one', '  - nested a', '  - nested b', '- three', ''].join('\n'),
    );
    // The fold followed the node: it now hides lines 3–4, which are the same
    // two children, in their new place.
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 4 }]);
    expect(await h.renderedLineTexts()).toEqual([
      '- two',
      '  - under two',
      '- one2…',
      '- three',
      '',
    ]);
  });

  it('an indented folded node stays folded', async () => {
    // Indent rewrites each line's leading whitespace, which loses the fold
    // exactly as a move does — measured, correcting an earlier note that had
    // recorded indent as the case CodeMirror handles unaided.
    await h.setCursorSettled(3, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 3, to: 4 }]);
    await h.runCommand('indent-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 3, to: 4 }]);
  });

  it('a node containing folds keeps them when it moves', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(3, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 4 },
    ]);
    // Move the SECOND one up, past the first: both folds have to survive, one
    // because it moved and one because it was moved past.
    await h.runCommand('move-node-up');
    expect(await h.foldedLineRanges()).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 4 },
    ]);
  });

  it('an edit inside a folded subtree opens it', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    // Reach in the way a sync or another editor would: a change to hidden text
    // that this editor never routed a keystroke to.
    await h.processFileExternally(
      NOTE,
      [
        '- one',
        '  - nested a EDITED',
        '  - nested b',
        '- two',
        '  - under two',
        '- three',
        '',
      ].join('\n'),
    );
    await browser.waitUntil(async () => (await h.foldedLineRanges()).length === 0, {
      timeout: 3000,
      timeoutMsg: 'an edit inside the fold left it closed',
    });
    expect(await h.renderedLineTexts()).toContain('  - nested a EDITED');
  });

  it('undo of an edit inside a folded subtree shows what it undid', async () => {
    // The case an editor typically gets wrong: edit inside a subtree, fold it,
    // undo — and the change happens where nobody can see it.
    await h.setCursorSettled(1, 12);
    await browser.keys(['!']);
    expect(await h.getBuffer()).toContain('  - nested a!');
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);

    await browser.keys([h.PRIMARY_MOD, 'z']);
    expect(await h.getBuffer()).toBe(DOC);
    await browser.waitUntil(async () => (await h.foldedLineRanges()).length === 0, {
      timeout: 3000,
      timeoutMsg: 'undo changed hidden text and left it hidden',
    });
    expect(await h.renderedLineTexts()).toContain('  - nested a');
  });

  it('undo of a move brings the fold back with it', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await h.runCommand('move-node-down');
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 4 }]);

    await browser.keys([h.PRIMARY_MOD, 'z']);
    expect(await h.getBuffer()).toBe(DOC);
    // Folds are not in the history — undoing re-inserts the same block
    // verbatim, and the same rule that carried the fold forward carries it
    // back. One undo, one step: the text and the fold arrive together.
    expect(await h.foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);

    await browser.keys([h.PRIMARY_MOD, h.SHIFT, 'z']);
    expect(await h.getBuffer()).toBe(
      ['- two', '  - under two', '- one', '  - nested a', '  - nested b', '- three', ''].join('\n'),
    );
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 4 }]);
  });

  it('typing on a folded node’s own line leaves it folded', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 5);
    await browser.keys(['!']);
    expect(await h.getBuffer()).toContain('- one!');
    // The fold begins after the node's own line, so an edit there is outside
    // what it hides — nothing about the hidden content changed.
    expect(await h.foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
  });
});
