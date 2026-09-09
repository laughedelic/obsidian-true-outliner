/**
 * Enter against a folded node, and what a deletion does to one.
 *
 * The measured defect this answers (docs/research/28): Enter at the end of a
 * folded node's line unfolded it and inserted the new node INSIDE the revealed
 * subtree — the one place the reader had just hidden.
 */

import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-grammar.md';

/*  0 | - one
    1 |   - nested a
    2 |   - nested b
    3 | - two
    4 |                                                                       */
const DOC = ['- one', '  - nested a', '  - nested b', '- two', ''].join('\n');

describe('folding and the editing grammar', () => {
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
  });

  it('Enter at a folded node’s end makes a sibling after its subtree', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 5);
    await browser.keys(['Enter']);
    await browser.keys(['x']);

    // AFTER the hidden children, at the same level — not inside them.
    expect(await h.getBuffer()).toBe(
      ['- one', '  - nested a', '  - nested b', '- x', '- two', ''].join('\n'),
    );
    // And the node the reader folded is still folded.
    expect(await h.foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
    expect(await h.renderedLineTexts()).not.toContain('  - nested a');
  });

  it('Enter inside a folded node’s text opens it first', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    // Mid-word: this split redistributes the node's OWN text, so where its
    // children end up is something the reader has to see.
    await h.setCursorSettled(0, 4);
    await browser.keys(['Enter']);
    expect(await h.foldedLineRanges()).toEqual([]);
    expect(await h.getBuffer()).toBe(
      ['- on', '  - e', '  - nested a', '  - nested b', '- two', ''].join('\n'),
    );
  });

  it('deleting a folded node takes its hidden children with it', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    // A selection that CROSSES the node's boundary escalates to its whole
    // subtree through `node-edit-enforcement` — no rule of folding's own is
    // needed, and this test is here to keep that true rather than to add
    // anything. (A selection inside the node's own line is ordinary content
    // editing, folded or not.)
    await h.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 4 });
    await browser.keys(['Backspace']);
    expect(await h.getBuffer()).toBe(['- two', ''].join('\n'));
  });
});
