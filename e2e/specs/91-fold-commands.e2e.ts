/**
 * The fold commands: what they act on, what they leave alone, and where the
 * caret ends up.
 *
 * Folds are read as LINE ranges through the plugin's own probe (see
 * `foldedLineRanges`), and what is actually on screen is read from the rendered
 * lines — a folded range's lines are absent from the DOM, so the two together
 * say both what the state believes and what the reader sees.
 */

import { browser, expect } from '@wdio/globals';

import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-commands.md';

/*  0 | # Top
    1 |
    2 | Intro paragraph:
    3 |
    4 | - one
    5 |   - nested a
    6 |   - nested b
    7 | - two
    8 |   - under two
    9 |
   10 | ## Second
   11 |
   12 | Tail para.
   13 |                                                                        */
const DOC = [
  '# Top',
  '',
  'Intro paragraph:',
  '',
  '- one',
  '  - nested a',
  '  - nested b',
  '- two',
  '  - under two',
  '',
  '## Second',
  '',
  'Tail para.',
  '',
].join('\n');

async function freshNote(): Promise<void> {
  await h.createNote(NOTE, DOC);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
  // Rewriting the note does not reset its folds — they live in workspace state,
  // per file, which is exactly what `92-fold-persistence` asserts on purpose.
  await h.clearFolds();
}

describe('fold commands', () => {
  beforeEach(async () => {
    await freshNote();
  });

  it('folds the node the caret is in', async () => {
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
  });

  it('escalates from a leaf to the branch above it', async () => {
    // The caret is in "  - nested a", which has no children of its own. The
    // gesture means "collapse this branch", so it acts on "- one" — and the
    // caret, which the fold is about to hide, comes back to the folded line.
    await h.setCursorSettled(5, 6);
    await h.runCommand('toggle-fold');
    expect(await h.foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    expect(await h.getCursor()).toEqual({ line: 4, ch: 5 });
    expect(await h.renderedLineTexts()).toEqual([
      'Top',
      '',
      'Intro paragraph:',
      '',
      '- one2…',
      '- two',
      '  - under two',
      '',
      'Second',
      '',
      'Tail para.',
      '',
    ]);
  });

  it('leaves the caret alone when the fold hides nothing it is in', async () => {
    await h.setCursorSettled(12, 4);
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    expect(await h.getCursor()).toEqual({ line: 4, ch: 3 });
  });

  it('is idempotent, and toggles back', async () => {
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    await h.runCommand('unfold-node');
    expect(await h.foldedLineRanges()).toEqual([]);
    await h.runCommand('unfold-node');
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('changes neither the document nor the undo history', async () => {
    const before = await h.getBuffer();
    await h.setCursorSettled(4, 3);
    await h.runCommand('toggle-fold');
    await h.runCommand('toggle-fold');
    expect(await h.getBuffer()).toBe(before);
    // An undo now must reach past the folds to whatever came before them —
    // there is nothing of theirs in the history, because a fold makes no change.
    await h.setCursorSettled(12, 10);
    await browser.keys(['!']);
    expect(await h.getBuffer()).toBe(before.replace('Tail para.', 'Tail para.!'));
    await browser.keys([h.PRIMARY_MOD, 'z']);
    expect(await h.getBuffer()).toBe(before);
  });

  it('opens a fold when a position is placed inside what it hides', async () => {
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    // A computed position — a command, a breadcrumb, a backlink — can land
    // inside hidden text where an arrow key cannot. The fold opens rather than
    // leaving a caret in content nobody can see.
    await h.setCursor(6, 4);
    await browser.waitUntil(async () => (await h.foldedLineRanges()).length === 0, {
      timeout: 2000,
      timeoutMsg: 'the fold did not open for a caret inside it',
    });
    expect(await h.renderedLineTexts()).toContain('  - nested b');
  });

  it('folds every covered subtree under a block selection', async () => {
    // Lines 4–8: "- one" and "- two", both with children.
    await h.setSelection({ line: 4, ch: 0 }, { line: 8, ch: 3 });
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
  });

  it('folds all, including the paragraph Obsidian’s own fold-all cannot reach', async () => {
    await h.setCursorSettled(0, 2);
    await h.runCommand('fold-all');
    const folded = await h.foldedLineRanges();
    // Every node with children, the paragraph among them. Obsidian's own
    // fold-all reaches headings and list items only, so the `2 → 8` range is
    // the one that could not exist without this plugin.
    expect(folded).toEqual([
      { from: 0, to: 12 },
      { from: 2, to: 8 },
      { from: 4, to: 6 },
      { from: 7, to: 8 },
      { from: 10, to: 12 },
    ]);
    // Only the outermost fold is visible on screen; the rest are inside it.
    // `# Top…`, with its marker: the caret is on line 0 — the only line left —
    // and Live Preview shows the active line's raw source.
    //
    // Which line Live Preview treats as active is read from the selection at
    // RENDER time, and the render that reveals the line's source is a pass
    // later than the one that places the caret — so a settled caret is not yet
    // a settled screen, and a read between the two sees the heading rendered.
    // On CI, twice. The screen is what this asserts, so the screen is what is
    // waited for; a wrong result still fails, on the timeout, naming what it
    // last saw.
    await h.setCursorSettled(0, 2);
    const expected = ['# Top8…', ''];
    let seen: string[] = [];
    await browser.waitUntil(
      async () => {
        seen = await h.renderedLineTexts();
        return seen.length === expected.length && seen.every((t, i) => t === expected[i]);
      },
      {
        timeout: h.waitBudget(3000),
        interval: 100,
        timeoutMsg: `expected ${JSON.stringify(expected)} on screen, last saw ${JSON.stringify(seen)}`,
      },
    );
    await h.runCommand('unfold-all');
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('walks the outline’s depth one level at a time', async () => {
    await h.setCursorSettled(0, 2);
    await h.runCommand('fold-more');
    // The deepest unfolded level first: the two list parents at depth 2.
    expect(await h.foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
    await h.runCommand('fold-more');
    // Depth 1 is the paragraph AND the second heading — a level, not a node.
    expect(await h.foldedLineRanges()).toEqual([
      { from: 2, to: 8 },
      { from: 4, to: 6 },
      { from: 7, to: 8 },
      { from: 10, to: 12 },
    ]);
    await h.runCommand('fold-less');
    expect(await h.foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
  });

  it('declines outside outline mode and under a multi-range selection', async () => {
    await h.setCursorSettled(4, 3);
    expect(await h.commandAvailable('toggle-fold')).toBe(true);

    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 4, ch: 3 }, head: { line: 4, ch: 3 } },
      { anchor: { line: 7, ch: 3 }, head: { line: 7, ch: 3 } },
    ]);
    expect(await h.commandAvailable('toggle-fold')).toBe(false);

    await h.setCursorSettled(4, 3);
    await h.setOutlineMode(false);
    expect(await h.commandAvailable('toggle-fold')).toBe(false);
    await h.setOutlineMode(true);
  });

  it('offers unfold-all and fold-less only when something is folded', async () => {
    await h.setCursorSettled(4, 3);
    expect(await h.commandAvailable('unfold-all')).toBe(false);
    expect(await h.commandAvailable('fold-less')).toBe(false);
    await h.runCommand('fold-node');
    expect(await h.commandAvailable('unfold-all')).toBe(true);
    expect(await h.commandAvailable('fold-less')).toBe(true);
  });

  it('offers the document-wide commands wherever the caret is', async () => {
    // A command that folds the whole scope has nothing to do with the caret's
    // own node. Keying its availability on the per-node operand made it vanish
    // exactly where a reader is most likely to reach for it — in frontmatter,
    // or on a childless line — with a document full of foldable nodes on
    // screen.
    const withFrontmatter = 'Scratch/fold-commands-fm.md';
    await h.createNote(
      withFrontmatter,
      ['---', 'title: x', '---', '', '# Head', '', '- parent', '  - child', ''].join('\n'),
    );
    await h.openNote(withFrontmatter);
    await h.setOutlineMode(true);
    await h.clearFolds();

    await h.setCursorSettled(1, 3); // inside the frontmatter — no node at all
    expect(await h.commandAvailable('toggle-fold')).toBe(false); // no operand, correctly
    expect(await h.commandAvailable('fold-all')).toBe(true);
    expect(await h.commandAvailable('fold-more')).toBe(true);

    await h.runCommand('fold-all');
    expect((await h.foldedLineRanges()).length).toBeGreaterThan(0);
    // And once everything is folded there is no level left to fold.
    expect(await h.commandAvailable('fold-all')).toBe(false);
    expect(await h.commandAvailable('unfold-all')).toBe(true);
  });

  it('ships the three per-node gestures with their default hotkeys', async () => {
    expect(await h.commandHotkeys('fold-node')).toEqual([
      { modifiers: ['Mod', 'Alt'], key: 'ArrowUp' },
    ]);
    expect(await h.commandHotkeys('unfold-node')).toEqual([
      { modifiers: ['Mod', 'Alt'], key: 'ArrowDown' },
    ]);
    expect(await h.commandHotkeys('toggle-fold')).toEqual([
      { modifiers: ['Mod', 'Alt'], key: 'Period' },
    ]);
    // The document-wide ones ship unbound, deliberately.
    expect(await h.commandHotkeys('fold-all')).toEqual([]);
  });
});
