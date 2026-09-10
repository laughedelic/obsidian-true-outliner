/**
 * How a folded node looks: the marker's folded contrast, the hidden-descendant
 * count, who draws the affordance, and where it sits.
 *
 * Relationships, never pixels — CI's fonts differ from macOS, so what is
 * asserted is "the folded mark differs from the unfolded one in colour and in
 * nothing else — not its box, not its stroke", not any number.
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

  it('draws the folded marker at a different contrast, in the same box and stroke', async () => {
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

    expect(folded.color).not.toBe(open.color);
    // Contrast alone: a heading's glyph is filled rectangles no stroke width
    // reaches, so a heavier stroke told a paragraph from a heading rather than
    // a folded node from an open one.
    expect(folded.strokeWidth).toBe(open.strokeWidth);
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

    // And ONE control after the text, not two. Ours carries the ellipsis, the
    // count and the click, so Obsidian's own placeholder beside it would be a
    // second control for the same action — the busier half of what the reader
    // saw, and the half that did nothing when clicked.
    expect(await h.foldTailControlCount(2)).toBe(1);
  });

  it('unfolds when its own tail control is clicked', async () => {
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    expect(await h.foldedLineRanges()).toEqual([{ from: 2, to: 6 }]);

    // The control that replaced Obsidian's placeholder has to do what that
    // placeholder did.
    await h.clickFoldCount(2);
    expect(await h.foldedLineRanges()).toEqual([]);
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

  it('puts its own affordance where Obsidian puts its indicator, at every depth', async () => {
    // Both controls answer for the same node, and only one of them is ever on
    // screen, so a reader who turns Obsidian's fold settings off should see the
    // affordance stay exactly where it was.
    //
    // At every depth, which is the part that was wrong: placing the control
    // against the line's own box rather than in its flow ignored the line's
    // indentation, so it kept its distance from the window and lost it to the
    // marker — one whole level further away with every step deeper, and on a
    // folded paragraph, where ours is the control a reader is left with, it
    // read as the chevron wandering off on its own.
    const offsets = await h.foldControlOffsets();
    expect(offsets.map((o) => o.line)).toEqual(await h.foldChromeLines());
    for (const { line, dx, dy } of offsets) {
      // A tolerance, not a fitted number: the two glyphs are different sizes and
      // ours is placed against the text's own metrics, so they agree to within
      // less than the width of either. A level is 2rem, so nothing that drifts
      // by depth can pass this.
      expect({ line, dx: Math.abs(dx) < 3, dy: Math.abs(dy) < 3 }).toEqual({
        line,
        dx: true,
        dy: true,
      });
    }
  });

  it('centres the control between the parent’s guide and the marker, at any unit', async () => {
    // Half a unit left of the marker column, for every kind and whichever of
    // the two controls the line shows — so the affordance keeps its place when
    // the indentation width is changed, and a paragraph's sits where a
    // heading's and a list item's do. Anchored a fixed gutter off the marker
    // instead, the three disagreed by the width of a glyph and none of them
    // moved with the unit.
    //
    // At TWO units, because at the default one the fixed anchor and the
    // midpoint are a pixel apart and either would pass: what is asserted is
    // that the control follows the unit, which only a second unit can show.
    //
    // The midpoint has a floor — at a narrow unit it would land the glyph
    // inside a checkbox — so what a line is held to is the one offset every
    // placement reads: on it, never nearer the marker than the midpoint, and
    // AT the midpoint once the unit is wide enough for the floor not to bind.
    const centred = async (lines: number[], midpoint: boolean): Promise<void> => {
      for (const line of lines) {
        const { gap, unit, offset } = await h.foldControlGap(line);
        expect({
          line,
          unit,
          onOffset: Math.abs(gap - offset) < 2,
          notNearer: offset >= unit / 2 - 0.5,
          midpoint: !midpoint || Math.abs(offset - unit / 2) < 0.5,
        }).toEqual({ line, unit, onOffset: true, notNearer: true, midpoint: true });
      }
    };
    const WIDER = 'body { --to-decor-unit: 3rem; }';
    await centred([2, 4, 5], false);
    await h.applyStyleOverride('wider-unit', WIDER);
    try {
      await centred([2, 4, 5], true);
    } finally {
      await h.applyStyleOverride('wider-unit', null);
    }

    // Ours, where it is the control shown: a folded paragraph over two lines,
    // under a heading so a guide runs beside it to read the unit from.
    await h.createNote(NOTE, ['# Head', '', ...MULTILINE.split('\n')].join('\n'));
    await h.openNote(NOTE);
    await h.setOutlineMode(true);
    await h.clearFolds();
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 0);
    await centred([2], false);
    await h.applyStyleOverride('wider-unit', WIDER);
    try {
      await centred([2], true);
    } finally {
      await h.applyStyleOverride('wider-unit', null);
    }
  });

  it('gives the folded control the folded marker’s colour', async () => {
    // One visual language for the mark and the chevron beside it, whichever of
    // the two controls the line shows. Folded: the chevron takes the colour the
    // marker's folded treatment gives it, rather than Obsidian's own collapsed
    // colour — the accent, which beside a marker at text contrast read as a
    // control being highlighted while nothing pointed at it.
    await h.setCursorSettled(4, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 3);
    await h.runCommand('fold-node');
    await h.setCursorSettled(2, 4); // between the two, hovering neither
    await h.hoverLineText(2);
    const heading = await h.foldChromeColors(0);
    const bullet = await h.foldChromeColors(4);
    expect(heading.control).toBe(heading.marker);
    expect(bullet.control).toBe(bullet.marker);
  });

  it('changes the mark under the pointer, and not under a hovered line', async () => {
    // The mark is the zoom gesture's target, and the change of colour with the
    // cursor is what says so. Hovering the rest of its line reveals the fold
    // chevron and leaves the mark alone: a first version accented the mark on
    // line hover too, which read as the whole node highlighting the mark. Not
    // under mobile emulation, which has no hover to draw for.
    if (h.IS_MOBILE_RUN) return;
    await h.setCursorSettled(0, 3);
    const rest = (await h.foldChromeColors(2)).marker;
    await h.hoverLineText(2);
    expect((await h.foldChromeColors(2)).marker).toBe(rest);
    await h.hoverMarker(2);
    expect((await h.foldChromeColors(2)).marker).not.toBe(rest);
    await h.hoverLineText(0);

    // Folded too. The folded colour and the hover weigh the same, and the
    // folded one was declared later, so a folded mark did not answer the
    // pointer at all — on the one node a reader most reaches for the zoom.
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    await h.setCursorSettled(0, 3);
    await h.hoverLineText(0);
    const foldedRest = (await h.foldChromeColors(2)).marker;
    expect(foldedRest).not.toBe(rest);
    await h.hoverMarker(2);
    expect((await h.foldChromeColors(2)).marker).not.toBe(foldedRest);
    await h.hoverLineText(0);
  });

  it('keeps the caret’s colour on a folded node the caret is on', async () => {
    // Both the caret rule and the folded rule name the marker, and the folded
    // one, declared later, took the caret's node too — a folded node being
    // edited showed no sign of being the one in play.
    await h.setCursorSettled(0, 3);
    const caretColour = (await h.foldChromeColors(0)).marker;
    await h.setCursorSettled(2, 4);
    await h.runCommand('fold-node');
    expect((await h.foldChromeColors(2)).marker).toBe(caretColour);
    await h.setCursorSettled(0, 3);
    expect((await h.foldChromeColors(2)).marker).not.toBe(caretColour);
  });

  it('holds the control’s place whatever line the caret is on and whatever is folded', async () => {
    // Obsidian pads the chevron's wrapper by kind AND by state: a folded block
    // line can be tagged as a list line and take the list padding, the caret's
    // own line takes none, any other block line a third amount. Read once
    // from whichever chevron came first in the viewport, that dead space moved
    // every paragraph's control by the difference — onto the icon with a
    // folded paragraph in view, a level too far from it with the caret on
    // one — so the correction is measured per line.
    //
    // On the vault note the manual pass saw it on, because the tagging is
    // Obsidian's and a fixture built to the same shape did not provoke it:
    // three paragraphs with children, the first folded, and the caret on each
    // in turn. Lines are addressed by document number — the fold takes sixteen
    // of them out of the DOM.
    await h.openNote('Backlinks/Family tree.md');
    await h.setOutlineMode(true);
    await h.clearFolds();
    try {
      await h.setCursorSettled(0, 4);
      await h.runCommand('fold-node');
      expect((await h.foldedLineRanges()).map((r) => r.from)).toEqual([0]);
      const settled = (line: number): Promise<unknown> =>
        h.waitForRead(
          () => h.foldControlGap(line, { doc: true }),
          (read) => Math.abs(read.gap - read.offset) < 2,
          `line ${line}'s control on its offset`,
        );
      for (const caret of [17, 0, 28]) {
        await h.setCursorSettled(caret, 3);
        for (const line of [0, 17, 28]) await settled(line);
      }
    } finally {
      await h.clearFolds();
    }
  });

  it('leaves a folded paragraph’s mark to the zoom gesture', async () => {
    // Obsidian's chevron wrapper is stacked at z-index 1 and, on a folded block
    // line — which Obsidian tags as a list line and pads accordingly — reaches
    // right of its glyph, over the mark. Measured on this note: the element
    // under the folded paragraph's icon was the wrapper, so the pointer showed
    // the chevron's cursor there and a click unfolded instead of zooming. Two
    // controls, two gestures: the chevron unfolds, the mark zooms.
    await h.openNote('Backlinks/Family tree.md');
    await h.setOutlineMode(true);
    await h.clearFolds();
    try {
      await h.setCursorSettled(0, 4);
      await h.runCommand('fold-node');
      await h.setCursorSettled(17, 4);
      const under = await browser.executeObsidian(() => {
        const icon = document
          .querySelector<HTMLElement>('.workspace-leaf.mod-active .cm-content > .cm-line')
          ?.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
        if (!icon) throw new Error('no marker icon on the folded paragraph');
        const box = icon.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          onIcon: !!hit?.closest('.to-decor-marker-icon'),
          point: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        };
      });
      expect(under.onIcon).toBe(true);
      await h.clickAtPoint(under.point.x, under.point.y);
      await browser.pause(300);
      const zoomed = await browser.executeObsidian(
        () => document.querySelector('.workspace-leaf.mod-active .to-zoom-trail') !== null,
      );
      // Zoomed — which an unfold click never does. Whether the fold survives
      // is not asked: zooming into a folded node opens it, by the change's
      // own rule (`outline-zoom`), so a zoom that reads as an unfold as well is
      // the intended result and not the defect.
      expect(zoomed).toBe(true);
    } finally {
      await h.runCommand('zoom-clear');
      await h.clearFolds();
    }
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

    // And the count — on the node's LAST own line — still names the node. It
    // resolved the node through the chrome target, which answers for a first
    // line only, so on every multi-line node the one control after the text
    // did nothing when pressed, while every single-line node's worked.
    await h.setCursorSettled(0, 4);
    await h.clickFoldCount(1);
    expect(await h.foldedLineRanges()).toEqual([]);
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
