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

  it('draws our own affordance when Obsidian paints none', async () => {
    await h.setNativeFoldSettings(false);
    try {
      expect(await h.nativeChevronLines()).toEqual([]);
      // Every node we fold still has exactly one affordance, in the same
      // column, and a table — which we never fold — has none.
      const ours = await h.foldAffordanceLines();
      expect(ours).toEqual(await h.foldChromeLines());
      expect(ours).not.toContain(8);
      for (const line of ours) expect(await h.foldAffordanceCount(line)).toBe(1);
    } finally {
      await h.setNativeFoldSettings(true);
    }
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
