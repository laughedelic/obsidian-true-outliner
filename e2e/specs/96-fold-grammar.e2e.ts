/**
 * Enter against a folded node, and what a deletion does to one.
 *
 * The measured defect this answers (docs/research/fold-mechanics): Enter at the end of a
 * folded node's line unfolded it and inserted the new node INSIDE the revealed
 * subtree — the one place the reader had just hidden.
 */

import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';
import { clearFolds, foldedLineRanges, renderedLineTexts } from '../folding.js';

const NOTE = 'Scratch/fold-grammar.md';

/*  0 | - one
    1 |   - nested a
    2 |   - nested b
    3 | - two
    4 |                                                                       */
const DOC = ['- one', '  - nested a', '  - nested b', '- two', ''].join('\n');

/*  0 | # Section
    1 |
    2 | A paragraph that runs
    3 | over two source lines:
    4 |
    5 | - child one
    6 | - child two
    7 |
    8 | ## Next
    9 |                                                                       */
const MIXED = [
  '# Section',
  '',
  'A paragraph that runs',
  'over two source lines:',
  '',
  '- child one',
  '- child two',
  '',
  '## Next',
  '',
].join('\n');

describe('folding and the editing grammar', () => {
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await clearFolds();
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
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
    expect(await renderedLineTexts()).not.toContain('  - nested a');
  });

  it('Enter inside a folded node’s text opens it first', async () => {
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    // Mid-word: this split redistributes the node's OWN text, so where its
    // children end up is something the reader has to see.
    await h.setCursorSettled(0, 4);
    await browser.keys(['Enter']);
    expect(await foldedLineRanges()).toEqual([]);
    expect(await h.getBuffer()).toBe(
      ['- on', '  - e', '  - nested a', '  - nested b', '- two', ''].join('\n'),
    );
  });

  it('Enter mid-way through a folded multi-line node splits it exactly as an unfolded one', async () => {
    // The end of a SOURCE line is not the end of the node's text. Reading it as
    // one put the new node after the hidden subtree and left the paragraph's
    // second line stranded below its own children.
    //
    // The assertion is the EQUIVALENCE, not a spelling of the result: what the
    // spec promises here is that the fold opens and the ordinary rules apply,
    // so the two paths have to agree byte for byte whatever those rules are.
    const splitAt = async (fold: boolean): Promise<string> => {
      await h.createNote(NOTE, MIXED);
      await h.openNote(NOTE);
      await h.setOutlineMode(true);
      await clearFolds();
      if (fold) {
        await h.setCursorSettled(2, 4);
        await h.runCommand('fold-node');
      }
      await h.setCursorSettled(2, 21); // end of the FIRST of its two own lines
      await browser.keys(['Enter']);
      return h.getBuffer();
    };

    const folded = await splitAt(true);
    expect(await foldedLineRanges()).toEqual([]);
    expect(folded).toBe(await splitAt(false));
  });

  it('Enter at a folded HEADING’s end opens it rather than inventing a sibling', async () => {
    // A heading has no sibling shape to put a new node in: a paragraph written
    // after its section re-parses as that section's child. So the promise the
    // other kinds keep cannot be kept here, and the honest answer is the
    // ordinary split with the subtree visible.
    await h.createNote(NOTE, MIXED);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await clearFolds();

    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 8 }]);
    await h.setCursorSettled(0, 9); // the heading's own end
    await browser.keys(['Enter']);
    await browser.keys(['X']);

    expect(await foldedLineRanges()).toEqual([]);
    // Directly under the heading, where an unfolded one puts it — not after the
    // whole section, and not past the next heading.
    expect(await h.getBuffer()).toContain('# Section\n\nX\n');
  });

  it('steps the caret over a folded node, and leaves it folded', async () => {
    // Our own Up and Down walk raw lines from the one beside the caret, since
    // `moveVertically`'s landing is not trusted — and the raw line beside a
    // folded head is the first line the fold hides. Landing there did not
    // merely reveal the fold: CodeMirror's own fold state drops any fold the
    // selection head lands inside, so every Down from a folded node opened it
    // in the same transaction. A folded node is one node to step over.
    await h.setCursorSettled(0, 3); // "- one", whose children are folded below
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
    await browser.keys(['ArrowDown']);
    await browser.pause(200);
    expect((await h.getCursor()).line).toBe(3); // "- two", the far side
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
    await browser.keys(['ArrowUp']);
    await browser.pause(200);
    expect((await h.getCursor()).line).toBe(0);
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
  });

  it('extends a selection over a folded node as one node, and leaves it folded', async () => {
    // Shift+Down from a folded head selects the node whole, with the head at
    // the fold's end — a visible position, after the placeholder. The reveal
    // rule counted that end as hidden and opened the fold under every such
    // selection.
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await browser.keys(['Shift', 'ArrowDown']);
    await browser.pause(200);
    const sel = await browser.executeObsidian(({ app, obsidian }) => {
      const editor = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!.editor;
      return { from: editor.getCursor('from').line, to: editor.getCursor('to').line };
    });
    expect(sel).toEqual({ from: 0, to: 2 });
    expect(await foldedLineRanges()).toEqual([{ from: 0, to: 2 }]);
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
