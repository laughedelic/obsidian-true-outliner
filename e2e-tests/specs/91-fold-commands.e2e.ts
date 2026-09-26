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
import { clearFolds, foldedLineRanges, renderedLineTexts, waitForRead } from '../folding.js';

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
  await clearFolds();
}

describe('fold commands', () => {
  beforeEach(async () => {
    await freshNote();
  });

  it('folds the node the caret is in', async () => {
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
  });

  it('escalates from a leaf to the branch above it', async () => {
    // The caret is in "  - nested a", which has no children of its own. The
    // gesture means "collapse this branch", so it acts on "- one" — and the
    // caret, which the fold is about to hide, comes back to the folded line.
    await h.setCursorSettled(5, 6);
    await h.runCommand('toggle-fold');
    expect(await foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    expect(await h.getCursor()).toEqual({ line: 4, ch: 5 });
    expect(await renderedLineTexts()).toEqual([
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
    expect(await foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    await h.runCommand('unfold-node');
    expect(await foldedLineRanges()).toEqual([]);
    await h.runCommand('unfold-node');
    expect(await foldedLineRanges()).toEqual([]);
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
    expect(await foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    // A computed position — a command, a breadcrumb, a backlink — can land
    // inside hidden text where an arrow key cannot. The fold opens rather than
    // leaving a caret in content nobody can see.
    await h.setCursor(6, 4);
    await browser.waitUntil(async () => (await foldedLineRanges()).length === 0, {
      timeout: 2000,
      timeoutMsg: 'the fold did not open for a caret inside it',
    });
    expect(await renderedLineTexts()).toContain('  - nested b');
  });

  it('folds every covered subtree under a block selection', async () => {
    // Lines 4–8: "- one" and "- two", both with children.
    await h.setSelection({ line: 4, ch: 0 }, { line: 8, ch: 3 });
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
  });

  it('folds all, including the paragraph Obsidian’s own fold-all cannot reach', async () => {
    await h.setCursorSettled(0, 2);
    await h.runCommand('fold-all');
    const folded = await foldedLineRanges();
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
    // Only the outermost fold is visible on screen; the rest are inside it:
    // the head line, carrying its count, and the trailing empty line. Whether
    // the head shows its `# ` is not asserted. Live Preview reveals the active
    // line's source only while the editor has focus, and under WebDriver the
    // OS window's focus is not ours to decide — on CI this read the rendered
    // heading every time, after two attempts to wait it out. The FOLD is what
    // is asserted here, and the focus is not part of it.
    await h.setCursorSettled(0, 2);
    await waitForRead(
      () => renderedLineTexts(),
      (seen) => seen.length === 2 && /^(# )?Top8…$/.test(seen[0] ?? '') && seen[1] === '',
      'the folded head line and the trailing line on screen',
    );
    await h.runCommand('unfold-all');
    expect(await foldedLineRanges()).toEqual([]);
  });

  it('offers unfold-all only for a fold inside the zoom', async () => {
    // The document-wide commands act on the scope's own foldable nodes, so
    // their availability has to be read from the same set. Counted over every
    // fold in the document instead, unfold-all was offered while zoomed with
    // the only fold outside the zoom — and then did nothing when run.
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([{ from: 4, to: 6 }]);
    await h.setCursorSettled(7, 3);
    await h.runCommand('zoom-in');
    try {
      expect(await h.commandAvailable('unfold-all')).toBe(false);
      expect(await h.commandAvailable('fold-less')).toBe(false);
      await h.setCursorSettled(7, 3);
      await h.runCommand('fold-node');
      expect(await h.commandAvailable('unfold-all')).toBe(true);
    } finally {
      await h.runCommand('zoom-clear');
    }
  });

  it('folds again on leaving a zoom what the zoom opened', async () => {
    // A reader who zoomed into a folded node comes back to it folded, as they
    // left it. Only what a scope OPENED: the inner zoom below finds "one"
    // already open and so has nothing to restore, and the outer one, on
    // clearing, restores both.
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(7, 3);
    await h.runCommand('fold-node');
    expect(await foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
    await h.setCursorSettled(0, 3);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    expect(await foldedLineRanges()).toEqual([]);
    await h.setCursorSettled(4, 3);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    await h.runCommand('zoom-out');
    await browser.pause(200);
    expect(await foldedLineRanges()).toEqual([]); // the inner scope opened nothing
    await h.setCursorSettled(0, 3);
    await h.runCommand('zoom-clear');
    await browser.pause(200);
    expect(await foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
  });

  it('opens a fold outside the zoom too, and folds it again on leaving', async () => {
    // Obsidian paints a fold's collapsed indicator on the visual block holding
    // the fold's start, and everything the zoom's tail hides is one block
    // ending on the scope's last visible line — so with "- two" folded, zooming
    // into "- one" wore a collapsed chevron on "nested b", and a press on it
    // unfolded something off-screen. Opened for the zoom, put back on leaving.
    await h.setCursorSettled(7, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(4, 3);
    await h.runCommand('zoom-in');
    await browser.pause(200);
    try {
      expect(await foldedLineRanges()).toEqual([]);
      const collapsedOnEdge = await browser.executeObsidian(({ app, obsidian }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cm = (app.workspace.getActiveViewOfType(obsidian.MarkdownView)!.editor as any).cm;
        const node = cm.domAtPos(cm.state.doc.line(7).from).node as Node; // "  - nested b", line 6
        const el = (node.nodeType === 1 ? (node as Element) : node.parentElement!).closest('.cm-line');
        return el?.querySelector('.cm-fold-indicator.is-collapsed') !== null;
      });
      expect(collapsedOnEdge).toBe(false);
    } finally {
      await h.runCommand('zoom-clear');
      await browser.pause(200);
    }
    expect(await foldedLineRanges()).toEqual([{ from: 7, to: 8 }]);
  });

  it('walks the outline’s depth one level at a time', async () => {
    await h.setCursorSettled(0, 2);
    await h.runCommand('fold-more');
    // The deepest unfolded level first: the two list parents at depth 2.
    expect(await foldedLineRanges()).toEqual([
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
    await h.runCommand('fold-more');
    // Depth 1 is the paragraph AND the second heading — a level, not a node.
    expect(await foldedLineRanges()).toEqual([
      { from: 2, to: 8 },
      { from: 4, to: 6 },
      { from: 7, to: 8 },
      { from: 10, to: 12 },
    ]);
    await h.runCommand('fold-less');
    expect(await foldedLineRanges()).toEqual([
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
    await clearFolds();

    await h.setCursorSettled(1, 3); // inside the frontmatter — no node at all
    expect(await h.commandAvailable('toggle-fold')).toBe(false); // no operand, correctly
    expect(await h.commandAvailable('fold-all')).toBe(true);
    expect(await h.commandAvailable('fold-more')).toBe(true);

    await h.runCommand('fold-all');
    expect((await foldedLineRanges()).length).toBeGreaterThan(0);
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
