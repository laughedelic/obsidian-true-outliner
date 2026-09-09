/**
 * Clicking a guide folds the branch it belongs to.
 *
 * A guide has no element of its own — it is a gradient on one pseudo-element
 * per line (docs/research/09) — so the gesture is arithmetic against the line's
 * own geometry, and these tests press REAL COORDINATES rather than dispatching
 * at an element. A synthesised event on a node would pass whatever the
 * hit-testing does, which is the whole thing under test.
 */

import { expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-guide.md';

/*  0 | - root
    1 |   - first
    2 |     - under first
    3 |   - second
    4 |     - under second
    5 |   - third leaf
    6 |                                                                        */
const DOC = [
  '- root',
  '  - first',
  '    - under first',
  '  - second',
  '    - under second',
  '  - third leaf',
  '',
].join('\n');

describe('the guide gesture', () => {
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
    await h.setCursorSettled(0, 3);
  });

  it('folds every child under the guide, and reopens them on a second press', async () => {
    // The guide at column 0 on line 2 belongs to "- root", so its children are
    // "- first", "- second" and "- third leaf" — the two with children fold.
    await h.clickGuideColumn(2, 0, { depth: 2 });
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);

    await h.clickGuideColumn(2, 0, { depth: 2 });
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('folds the rest when only some are open', async () => {
    await h.setCursorSettled(1, 5);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 1, to: 2 }]);
    // "any open means fold them all" — one press reaches the reading this
    // gesture exists for, from any starting state.
    await h.clickGuideColumn(3, 0, { depth: 1 });
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
  });

  it('does not move the caret or change the document', async () => {
    const before = await h.getBuffer();
    await h.setCursorSettled(5, 6);
    await h.clickGuideColumn(2, 0, { depth: 2 });
    expect(await h.getCursor()).toEqual({ line: 5, ch: 6 });
    expect(await h.getBuffer()).toBe(before);
  });

  it('leaves a press on the node’s own text as a press on text', async () => {
    await h.clickLineText(2);
    expect(await h.foldedLineRanges()).toEqual([]);
    expect((await h.getCursor()).line).toBe(2);
  });

  it('leaves a press past the tolerance alone', async () => {
    // Halfway between two columns: near enough to be a near miss, far enough
    // that claiming it would start stealing presses from the level beside it.
    await h.clickGuideColumn(2, 0, { depth: 2, offsetFraction: 0.5 });
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('is not offered when guides are not drawn', async () => {
    await h.setGuideVisibility('off');
    try {
      await h.clickGuideColumn(2, 0, { depth: 2 });
      expect(await h.foldedLineRanges()).toEqual([]);
    } finally {
      await h.setGuideVisibility('all');
    }
  });
});
