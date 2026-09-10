/**
 * How a folded node looks: the marker's folded weight, the hidden-descendant
 * count, and who draws the affordance.
 *
 * Relationships, never pixels — CI's fonts differ from macOS, so what is
 * asserted is "the folded mark differs from the unfolded one in stroke weight
 * and not in its box", not either number.
 */

import { expect } from '@wdio/globals';
import * as h from '../helpers.js';

const NOTE = 'Scratch/fold-chrome.md';

/*  0 | # Heading
    1 |
    2 | Paragraph with children:
    3 |
    4 | - bullet parent
    5 |   - child
    6 |     - grandchild
    7 |
    8 | | a | b |
    9 | | - | - |
   10 | | 1 | 2 |
   11 |                                                                        */
const DOC = [
  '# Heading',
  '',
  'Paragraph with children:',
  '',
  '- bullet parent',
  '  - child',
  '    - grandchild',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
].join('\n');

/*  0 | A paragraph that runs
    1 | over two source lines:
    2 |
    3 | - child one
    4 | - child two
    5 |                                                                       */
const MULTILINE = [
  'A paragraph that runs',
  'over two source lines:',
  '',
  '- child one',
  '- child two',
  '',
].join('\n');

describe('fold chrome', () => {
  beforeEach(async () => {
    await h.createNote(NOTE, DOC);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
  });

  it('marks a folded node’s line, and only that line', async () => {
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    expect(await h.foldedNodeLines()).toEqual([2]);
    await h.runCommand('unfold-node');
    expect(await h.foldedNodeLines()).toEqual([]);
  });

  it('draws the folded marker in a heavier weight, in the same box', async () => {
    // Park the caret off the line before measuring: with it there, Live Preview
    // renders the raw source beside the widget.
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 3);
    const folded = await h.markerGlyphStyle(2);

    await h.setCursorSettled(2, 4);
    await h.runCommand('unfold-node');
    await h.setCursorSettled(0, 3);
    const open = await h.markerGlyphStyle(2);

    expect(parseFloat(folded.strokeWidth)).toBeGreaterThan(parseFloat(open.strokeWidth));
    expect(folded.color).not.toBe(open.color);
    // The box is what the marker gutter is derived from, so it may not change.
    expect(folded.width).toBeCloseTo(open.width, 1);
    expect(folded.height).toBeCloseTo(open.height, 1);
  });

  it('shows how many descendants are hidden, as chrome rather than text', async () => {
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    // "- bullet parent" hides a child and a grandchild.
    expect(await h.foldCounts()).toEqual([{ line: 4, count: 2 }]);

    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    // The paragraph hides all three of them.
    expect(await h.foldCounts()).toEqual([{ line: 2, count: 3 }]);

    // Chrome: it is not in the document and it is not in what a copy yields.
    expect(await h.getBuffer()).toBe(DOC);
    expect(await h.foldCountIsEditable(2)).toBe(false);
  });

  it('gives a folded node an affordance that stays visible', async () => {
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    // Whoever draws it — Obsidian's own indicator in the default configuration
    // — a folded line has exactly one, and it does not wait for a hover.
    expect(await h.foldAffordanceLines()).toContain(2);
    expect(await h.foldAffordanceCount(2)).toBe(1);
    expect(await h.foldAffordanceVisible(2)).toBe(true);
  });

  it('draws its own affordance on every foldable line, hidden where Obsidian paints one', async () => {
    // Ours is rendered everywhere we fold — and nowhere else, which is the part
    // that matters: a line the EDITOR calls foldable but we do not (a raw HTML
    // block) gets nothing.
    expect(await h.foldToggleLines()).toEqual(await h.foldChromeLines());
    expect(await h.foldToggleLines()).not.toContain(8); // the table

    // While Obsidian's own indicator is on the line, ours is hidden, so a
    // reader sees exactly one control.
    for (const line of await h.foldChromeLines()) {
      expect(await h.foldAffordanceCount(line)).toBe(1);
    }

    // Take Obsidian's indicators away — the condition ours exists for — and it
    // is the control that remains, in the same column.
    const removed = await h.removeNativeChevrons();
    expect(removed).toBeGreaterThan(0);
    for (const line of await h.foldChromeLines()) {
      expect(await h.foldAffordanceCount(line)).toBe(1);
    }
    // Whether it is VISIBLE at rest is a hover state, and the pointer's resting
    // position is whatever an earlier test left it on — asserted for the folded
    // case above, where it must not depend on hover at all.
  });

  it('treats a multi-line node as one node, marker above and count below', async () => {
    // A fold begins at the end of a node's own TEXT, so a paragraph running
    // over two source lines starts its fold on the second — while its marker,
    // and everything that hangs off it, belongs on the first. Resolving the
    // chrome from the fold's start line and keying it by the node's first is
    // what makes those two the same node; keying by the fold's own line drops
    // every multi-line node from the treatment entirely.
    await h.createNote(NOTE, MULTILINE);
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();

    await h.setCursorSettled(0, 4);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 1, to: 4 }]);
    expect(await h.foldedNodeLines()).toEqual([0]); // the marker's line
    expect(await h.foldCounts()).toEqual([{ line: 1, count: 2 }]); // after its text
    expect(await h.foldToggleLines()).toEqual([0]);

    // ONE control, beside the marker. Obsidian paints its collapsed indicator on
    // the line a fold starts on — the node's LAST own line here — and leaves an
    // ordinary hover chevron beside the marker, so without this a folded
    // paragraph showed two chevrons on hover, neither of them where it belongs.
    expect(await h.foldAffordanceLines()).toEqual([0]);
    expect(await h.foldAffordanceCount(0)).toBe(1);
    expect(await h.foldAffordanceCount(1)).toBe(0);
    expect(await h.foldAffordanceVisible(0)).toBe(true);
  });

  it('keeps the count and the affordance when markers are hidden', async () => {
    await h.setMarkerVisibility('none');
    try {
      await h.setCursorSettled(2, 4);
      await h.runCommand('fold-node');
      expect(await h.foldCounts()).toEqual([{ line: 2, count: 3 }]);
      expect(await h.foldAffordanceLines()).toContain(2);
    } finally {
      await h.setMarkerVisibility('all');
    }
  });
});
