/**
 * Clicking a guide folds the branch it belongs to.
 *
 * A guide has no element of its own — it is a gradient on one pseudo-element
 * per line (docs/research/09) — so the gesture is arithmetic against the line's
 * own geometry, and these tests press REAL COORDINATES rather than dispatching
 * at an element. A synthesised event on a node would pass whatever the
 * hit-testing does, which is the whole thing under test.
 */

import { browser, expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-guide.md';
const HEADED = 'Scratch/fold-guide-headed.md';

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

/*  0 | ## Section
    1 |
    2 | - work
    3 |   - thread
    4 |     - shipped
    5 |     - prototype review
    6 |       - severity sort
    7 |     - open questions
    8 |       - touch fallback
    9 |                                                                        */
const HEADED_DOC = [
  '## Section',
  '',
  '- work',
  '  - thread',
  '    - shipped',
  '    - prototype review',
  '      - severity sort',
  '    - open questions',
  '      - touch fallback',
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
    await h.clickGuideColumn(2, 0);
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);

    await h.clickGuideColumn(2, 0);
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('folds the rest when only some are open', async () => {
    await h.setCursorSettled(1, 5);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 1, to: 2 }]);
    // "any open means fold them all" — one press reaches the reading this
    // gesture exists for, from any starting state.
    await h.clickGuideColumn(3, 0);
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
  });

  it('does not move the caret or change the document', async () => {
    const before = await h.getBuffer();
    await h.setCursorSettled(5, 6);
    await h.clickGuideColumn(2, 0);
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
    await h.clickGuideColumn(2, 0, { offsetFraction: 0.5 });
    expect(await h.foldedLineRanges()).toEqual([]);
  });

  it('reads the columns where they are painted, not where the tree puts them', async () => {
    // Under a HEADING, and with the list's own root indented — the shape that
    // made this visible. The guide overlay is shifted back off the line by
    // however far the depth rules have already moved the line's box, so a
    // column measured from the line's own edge is a whole level out on any list
    // like this one. Measured that way, a press aimed at "thread"'s guide
    // resolved to "work"'s, and folding a single node's siblings took the
    // node's whole branch with them.
    await h.createNote(HEADED, HEADED_DOC);
    await h.openNote(HEADED);
    await h.setOutlineMode(true);
    await h.clearFolds();
    await h.setCursorSettled(0, 3);

    // Column 2 belongs to "- thread", whose children are "shipped",
    // "prototype review" and "open questions" — the last two have children.
    await h.clickGuideColumn(6, 2);
    expect(await h.foldedLineRanges()).toEqual([
      { from: 5, to: 6 },
      { from: 7, to: 8 },
    ]);
  });

  it('shows the pointer which guide a press would act on', async () => {
    // A guide has no element, so nothing hovered it: the gesture worked and
    // was invisible, and a press a few pixels off the band did nothing a
    // reader could tell from there being nothing to press. Resting on a
    // column names it on the line — the stylesheet draws a band and shows the
    // cursor — and leaving clears it.
    if (h.IS_MOBILE_RUN) return;
    const onGuide = await h.guideColumnPoint(2, 0);
    await browser
      .action('pointer', { parameters: { pointerType: 'mouse' } })
      .move({ x: Math.round(onGuide.x), y: Math.round(onGuide.y), origin: 'viewport' })
      .perform();
    await browser.pause(150);
    // The whole guide thickens — every line of "- root"'s subtree, which is
    // what a press would act on, through the width its own guide layer reads —
    // and only the pointer's own line takes the cursor.
    const lit = () =>
      browser.executeObsidian(() => {
        const lines = Array.from(
          document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .cm-content > .cm-line'),
        );
        return {
          thickened: lines.map((el, i) => (el.style.getPropertyValue('--to-guide-width-0') ? i : -1)).filter((i) => i >= 0),
          cursors: lines.map((el, i) => (getComputedStyle(el).cursor === 'pointer' ? i : -1)).filter((i) => i >= 0),
        };
      });
    expect(await lit()).toEqual({ thickened: [1, 2, 3, 4, 5], cursors: [2] });
    await h.hoverLineText(2);
    expect(await lit()).toEqual({ thickened: [], cursors: [] });
  });

  it('names the guide by the level the zoom draws it at', async () => {
    // Painted columns count from what the view roots at. Zoomed into "- work",
    // its own guide is column 0 and "thread"'s is column 1 — while the
    // document's ancestry chain still starts at the heading. Indexed by the
    // painted column directly, a press on "thread"'s guide resolved to
    // "work" and folded "thread" whole, and the hover band ran across lines
    // whose own bullets sit on that column.
    await h.createNote(HEADED, HEADED_DOC);
    await h.openNote(HEADED);
    await h.setOutlineMode(true);
    await h.clearFolds();
    await h.setCursorSettled(2, 3);
    await h.runCommand('zoom-in');
    try {
      await h.setCursorSettled(6, 3);
      // Column 1 in the zoom is "thread"'s guide; its children with children
      // are "prototype review" and "open questions".
      await h.clickGuideColumn(4, 1); // DOM line 4 is document line 6 in the zoom
      expect(await h.foldedLineRanges()).toEqual([
        { from: 5, to: 6 },
        { from: 7, to: 8 },
      ]);
    } finally {
      await h.runCommand('zoom-clear');
    }
  });

  it('takes a press left of the line box, on the outermost guide', async () => {
    // The outermost guide runs along the line box's own edge, so half of its
    // band is outside every line — and a press there landed on the content
    // container and on nothing. The line is found by coordinates when the
    // target is not one. The band is wider on the left than the right, too:
    // nothing else claims the run between a guide and the one before it.
    await h.clickGuideColumn(2, 0, { offsetFraction: -0.35 });
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
  });

  it('keeps the guide lit after the press that folds under it', async () => {
    // The fold replaces the very lines the band was on while the pointer has
    // not moved, which left the guide dark — and the cursor a caret — after
    // the first press, though a second press still worked.
    if (h.IS_MOBILE_RUN) return;
    const onGuide = await h.guideColumnPoint(2, 0);
    await h.clickAtPoint(onGuide.x, onGuide.y);
    await browser.pause(300);
    expect(await h.foldedLineRanges()).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
    const lit = await browser.executeObsidian(() => {
      const lines = Array.from(
        document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .cm-content > .cm-line'),
      );
      return {
        thickened: lines.map((el, i) => (el.style.getPropertyValue('--to-guide-width-0') ? i : -1)).filter((i) => i >= 0),
        cursors: lines.map((el, i) => (getComputedStyle(el).cursor === 'pointer' ? i : -1)).filter((i) => i >= 0),
      };
    });
    // Lines 2 and 4 are folded away; the guide runs down what is left of the
    // subtree, and the pointer's line — DOM line 2, "second" now — has the cursor.
    expect(lit).toEqual({ thickened: [1, 2, 3], cursors: [2] });
  });

  it('is not offered when guides are not drawn', async () => {
    // The point is measured while they still are, so what changes between the
    // measurement and the press is the guide alone.
    const point = await h.guideColumnPoint(2, 0);
    await h.setGuideVisibility('off');
    try {
      await h.clickAtPoint(point.x, point.y);
      await browser.pause(150);
      expect(await h.foldedLineRanges()).toEqual([]);
    } finally {
      await h.setGuideVisibility('all');
    }
  });
});
