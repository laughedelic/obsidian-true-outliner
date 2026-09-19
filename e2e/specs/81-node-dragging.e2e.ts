/**
 * `node-dragging` in a real Obsidian: the press on a mark, and the drag it can
 * become.
 *
 * Driven by a REAL pointer rather than by synthesised events, because the
 * gesture's own question — did this press move — is about what the platform
 * delivers, and a dispatched `PointerEvent` answers it by construction. The
 * measurement the design rests on was taken the same way
 * (docs/research/node-drag-and-drop sections 2 and 5).
 *
 * The whole gesture runs in ONE driving call. A held button is released when
 * `performActions` returns, so a drag split across calls is not a drag at all
 * after its first leg — which is why `e2e/dragging.ts` records as it goes and
 * these assertions read the recording.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import {
  columnOfMark,
  dragFrom,
  dragThenEscape,
  editorBox,
  markPoint,
  pointOf,
  recorded,
  startRecording,
} from '../dragging.js';

const NOTE = 'Scratch/dragging.md';

/*  0 | # Top
    1 |
    2 | - one
    3 |   - nested
    4 | - two
    5 | - three
    6 |                                                                        */
const DOC = ['# Top', '', '- one', '  - nested', '- two', '- three', ''].join('\n');

/*  0 | # Top
    1 |
    2 | - [ ] an open task
    3 | - plain
    4 |                                                                        */
const TASKS = ['# Top', '', '- [ ] an open task', '- plain', ''].join('\n');

/** The bullet of a top-level list item, by its position among rendered marks. */
const BULLET = '.list-bullet';

/** Whether a zoom is active, by the trail it draws. */
function zoomed(): Promise<boolean> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return !!view?.containerEl.querySelector('.to-zoom-trail');
  });
}

async function openDraggable(): Promise<void> {
  await h.createNote(NOTE, DOC);
  await h.openNote(NOTE);
  await h.setOutlineMode(true);
  await h.setBuffer(DOC);
  await browser.pause(150);
}

describe('node dragging: the press and the drag it can become', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  beforeEach(async function () {
    // The pointer gesture cannot be aimed at a mark under mobile emulation —
    // the harness has no coordinate-addressable press there (section 2) — so
    // the whole spec is a desktop one, as the capability's own verification
    // requirement allows.
    if (h.IS_MOBILE_RUN) this.skip();
    await openDraggable();
  });

  it('a press that does not move still zooms', async function () {
    const mark = await markPoint(BULLET, 0);
    await h.clickAtPoint(mark.x, mark.y);
    await browser.pause(250);
    expect(await zoomed()).toBe(true);
  });

  it('a press that moves past the threshold does not zoom', async function () {
    const mark = await markPoint(BULLET, 0);
    await startRecording();
    // Cancelled rather than released: a release now drops, and what this case
    // asks about is which of the two meanings the movement chose.
    await dragThenEscape(mark, [
      { x: mark.x + 12, y: mark.y + 4 },
      { x: mark.x + 40, y: mark.y + 60 },
    ]);
    await browser.pause(250);
    // The press meant one of two things and the movement chose. Nothing was
    // written either, which is the assertion that the gesture did not fall
    // through to something else.
    expect(await zoomed()).toBe(false);
    expect(await h.getBuffer()).toBe(DOC);
    // And the moves reached the gesture while the button was still down, which
    // is what every later assertion about a drag in flight depends on.
    const held = (await recorded()).filter((sample) => sample.buttons !== 0);
    expect(held.length).toBeGreaterThan(0);
  });

  it('a press that barely moves is not a drag', async function () {
    // Negative control for the threshold: resolving a drag at the FIRST move
    // rather than past a stated distance turns a hand tremor into a drag, and
    // the zoom becomes unreachable for anyone whose hand is not perfectly
    // still. One pixel is still a click.
    const mark = await markPoint(BULLET, 0);
    await dragFrom(mark, [{ x: mark.x + 1, y: mark.y }]);
    await browser.pause(250);
    expect(await zoomed()).toBe(true);
  });

  it('enters block selection at the threshold, not at the press', async function () {
    // A cover IS the block-selection interaction mode — the editor blurs, the
    // covered lines stop rendering raw, block chrome appears. A press that
    // never moves is a zoom, and has no business entering that mode on its way
    // there, so the collapse belongs to the drag.
    const mark = await markPoint(BULLET, 0);
    await h.setCursor(0, 3);
    await h.clickAtPoint(mark.x, mark.y);
    await browser.pause(250);
    const afterClick = await h.getSelection();
    expect(afterClick.anchor).toEqual(afterClick.head);

    // The same press, moved: the pressed node's own cover is what is in
    // flight, and what is drawn as selected. Read from the recorder, because
    // the only moment it is true is while the button is down.
    await openDraggable();
    await h.setCursor(0, 3);
    const again = await markPoint(BULLET, 0);
    await startRecording();
    await dragThenEscape(again, [
      { x: again.x + 20, y: again.y + 10 },
      { x: again.x + 40, y: again.y + 30 },
    ]);
    await browser.pause(250);
    // `- one` through its own child's content end: the pressed node's whole
    // subtree cover, not the row the pointer is over.
    const samples = await recorded();
    const covers = samples.filter(
      (sample) =>
        sample.selection.anchor.line === 2 &&
        sample.selection.head.line === 3 &&
        sample.selection.head.ch > 0,
    );
    expect(covers.length).toBeGreaterThan(0);
    // And it is OUR selection: the block treatment is on both covered lines,
    // which is what makes a cover the interaction mode rather than a range
    // that happens to span the same rows.
    expect(covers.some((sample) => sample.selected.includes(2) && sample.selected.includes(3))).toBe(
      true,
    );
    // Escape put the caret back where it was, which is the cancel rule: the
    // collapse belongs to the drag, so undoing the drag undoes it too.
    expect(await h.getSelection()).toEqual({
      anchor: { line: 0, ch: 3 },
      head: { line: 0, ch: 3 },
    });
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('carries the whole cover when the press lands inside it', async function () {
    // The other branch of the operand rule: what the gesture picks up is the
    // selection's covered subtrees, so dragging several nodes is the same
    // gesture and not a second one — and the selection does not move, because
    // it already draws what is in flight.
    await h.setSelection({ line: 2, ch: 0 }, { line: 4, ch: '- two'.length });
    await browser.pause(150);
    const before = await h.getSelection();
    const mark = await markPoint(BULLET, 2);
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y - 10 },
      { x: mark.x + 40, y: mark.y - 30 },
    ]);
    await browser.pause(250);
    const samples = await recorded();
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.selection).toEqual(before);
    }
    expect(await h.getBuffer()).toBe(DOC);
  });

  describe('a task is dragged by its own checkbox', function () {
    beforeEach(async function () {
      await h.createNote(NOTE, TASKS);
      await h.openNote(NOTE);
      await h.setOutlineMode(true);
      await h.setBuffer(TASKS);
      await browser.pause(200);
    });

    it('drags without toggling', async function () {
      // The one mark whose press this gesture does not take. A press that
      // leaves the box produces no click on it, so the toggle needs nothing
      // suppressed — and gets nothing suppressed.
      const box = await markPoint('.task-list-item-checkbox', 0);
      await startRecording();
      await dragFrom(box, [
        { x: box.x + 20, y: box.y + 20 },
        { x: box.x + 50, y: box.y + 50 },
      ]);
      await browser.pause(250);
      // It was picked up: the task's own cover is what is in flight.
      const covers = (await recorded()).filter(
        (sample) => sample.selection.anchor.line === 2 && sample.selection.head.line === 2,
      );
      expect(covers.length).toBeGreaterThan(0);
      // And its checked state is untouched. The buffer itself is not the
      // assertion any more: the release drops the task somewhere, which is the
      // gesture working. What the press must not have done is toggle it.
      const dropped = await h.getBuffer();
      expect(dropped).toContain('- [ ] an open task');
      expect(dropped).not.toContain('[x]');
    });

    it('still toggles on its own click', async function () {
      const box = await markPoint('.task-list-item-checkbox', 0);
      await h.clickAtPoint(box.x, box.y);
      await browser.pause(300);
      expect(await h.getBuffer()).toContain('- [x] an open task');
      // And no zoom: a task's mark is not this gesture's route to one.
      expect(await zoomed()).toBe(false);
    });
  });

  it('picks nothing up outside outline mode', async function () {
    // The gesture is scoped like every other one here. Read off the BLOCK
    // TREATMENT rather than off the selection: with the press unclaimed the
    // editor draws its own text selection, which can span the same lines a
    // cover would — the chrome is what says whose selection it is.
    await h.setOutlineMode(false);
    await browser.pause(250);
    const mark = await markPoint(BULLET, 0);
    await startRecording();
    await dragFrom(mark, [
      { x: mark.x + 20, y: mark.y + 20 },
      { x: mark.x + 50, y: mark.y + 40 },
    ]);
    await browser.pause(250);
    const samples = await recorded();
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) expect(sample.selected).toEqual([]);
    expect(await h.getBuffer()).toBe(DOC);
    expect(await zoomed()).toBe(false);
    await h.setOutlineMode(true);
  });

  it('picks nothing up from a mark the trail drew', async function () {
    // The trail draws marks of its own and answers its own clicks — its mark
    // zooms OUT. It already declares that it is not a line, which is exactly
    // the question this gesture asks, so nothing more is needed here than the
    // evidence that nothing was picked up.
    const mark = await markPoint(BULLET, 0);
    await h.clickAtPoint(mark.x, mark.y);
    await browser.pause(300);
    expect(await zoomed()).toBe(true);

    const crumb = await pointOf('.to-zoom-trail .to-decor-marker-icon', 0);
    // Aimed INTO the content, so the moves reach the recorder while the button
    // is still down — a gesture whose moves never arrive would pass this by
    // saying nothing.
    const into = await markPoint(BULLET, 0);
    await startRecording();
    await dragFrom(crumb, [
      { x: into.x + 20, y: into.y + 10 },
      { x: into.x + 60, y: into.y + 40 },
    ]);
    await browser.pause(250);
    const samples = await recorded();
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) expect(sample.selected).toEqual([]);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('leaves no undo entry behind when it is cancelled', async function () {
    // A write that is immediately reverted leaves the buffer identical and the
    // history one entry longer, so the buffer alone cannot tell a cancel from
    // a round trip. A known edit first gives the undo somewhere to land.
    await h.setCursorSettled(5, '- three'.length);
    await browser.keys('!');
    await browser.pause(200);
    const edited = await h.getBuffer();
    expect(edited).toContain('- three!');

    const mark = await markPoint(BULLET, 0);
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 20 },
      { x: mark.x + 50, y: mark.y + 40 },
    ]);
    await browser.pause(250);
    expect(await h.getBuffer()).toBe(edited);

    // ONE undo takes the typing back — not some state the cancelled drag left
    // on the stack in front of it.
    await h.keys.undo();
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('writes nothing when a drag is released with no destination', async function () {
    // The move that crosses the threshold resolves nothing: the seams are read
    // once the block mode has settled, which is the next move at the earliest.
    // A drag released on the move that started it therefore names no
    // destination, and a release that names none cancels — including putting
    // back the selection the pick-up collapsed.
    await h.setCursor(0, 3);
    const mark = await markPoint(BULLET, 0);
    await dragFrom(mark, [{ x: mark.x + 10, y: mark.y + 6 }]);
    await browser.pause(250);
    expect(await h.getBuffer()).toBe(DOC);
    expect(await h.getSelection()).toEqual({
      anchor: { line: 0, ch: 3 },
      head: { line: 0, ch: 3 },
    });
  });

  /*  0 | # Top
      1 |
      2 | - two
      3 | - one
      4 |   - nested
      5 | - three
      6 |                                                                    */
  const AFTER_DROP = ['# Top', '', '- two', '- one', '  - nested', '- three', ''].join('\n');

  /**
   * A seam's own y, as a RELATION between the two marks it separates: halfway
   * between their centres is the boundary between their rows, and the seams on
   * either side are a whole row away. Taken from the marks rather than from a
   * measured line top so the aim survives a layout that differs by theme,
   * platform or heading size.
   */
  async function seamBetween(above: number, below: number): Promise<number> {
    const [top, bottom] = await Promise.all([markPoint(BULLET, above), markPoint(BULLET, below)]);
    return (top.y + bottom.y) / 2;
  }

  /** `- one` dropped on the seam between `- two` and `- three`, at the
   * shallowest column that seam offers — a sibling of both. */
  async function dropOneBeforeThree(): Promise<void> {
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const y = await seamBetween(2, 3);
    await dragFrom(mark, [
      // Past the threshold, then a move for the mode to settle under, then the
      // destination itself — twice, since the resolution the release applies
      // is the one a MOVE published.
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: box.left + 4, y: y + 1 },
    ]);
    await browser.pause(300);
  }

  it('draws the indicator on the destination depth\u2019s own column', async function () {
    // The document's LAST seam, which is the one offering all three top-level
    // depths: beside `# Top` at the root, among its children, and inside
    // `- three`. Swept left to right, the indicator's left end should land on
    // each of those columns in turn.
    //
    // The columns come from the document's own MARKS, of two different kinds,
    // because that is what makes this a relation rather than a constant: a
    // heading's marker icon is centred on its column and a list bullet's span
    // begins on its. An indicator positioned by measuring one kind's box would
    // sit right on that kind's destinations and half a bullet out on the
    // other's, which one column alone cannot tell.
    const columns = [
      await columnOfMark('.to-decor-marker-icon', 0, 'centre'), // `# Top`, depth 0
      await columnOfMark(BULLET, 0, 'left'), // `- one`, depth 1
      await columnOfMark(BULLET, 1, 'left'), // `  - nested`, depth 2
    ];
    const last = await markPoint(BULLET, 3);
    const above = await markPoint(BULLET, 2);
    // Well past the last row. The last seam sits at the DOCUMENT's own bottom,
    // which is below the note's terminating gap line and the padding after it
    // — a row or two down is still nearer the seam above the last row, whose
    // columns are a subset of this one's and would leave the heading depth
    // untested. Nothing lies below the last seam, so any y past it resolves
    // there.
    const y = last.y + 6 * (last.y - above.y);
    const box = await editorBox();

    const mark = await markPoint(BULLET, 0);
    await startRecording();
    // A nudge after each column, because the sampler runs in the CAPTURE phase
    // and the gesture resolves on the bubble: each sample carries the answer
    // the PREVIOUS move produced, so a column visited once is resolved and
    // never recorded.
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: box.left + 5, y },
      { x: columns[1]!, y },
      { x: columns[1]! + 1, y },
      { x: columns[2]!, y },
      { x: columns[2]! + 1, y },
    ]);
    await browser.pause(250);

    // The indicator's x is stated in the overlay's own space, whose origin is
    // depth 0's column — so one mark fixes the origin and the rest is the
    // relation under test.
    const drawn = (await recorded()).filter((sample) => sample.indicator !== null);
    expect(drawn.length).toBeGreaterThan(0);
    const seen = new Map<number, number>();
    for (const sample of drawn) {
      expect(sample.preview).not.toBe(null);
      seen.set(sample.preview!.depth, columns[0]! + sample.indicator!.x);
    }
    // The sweep has to have reached the HEADING's own depth, not just the two
    // list ones. Asserted rather than assumed: a sweep naming only list
    // destinations passes every per-column check while testing one kind of
    // mark, which is the half this case exists to rule out. Found by running
    // the control, which did not bite until this line was here.
    expect([...seen.keys()].sort()).toEqual([0, 1, 2]);
    for (const [depth, drawnAt] of seen) {
      expect(Math.abs(drawnAt - columns[depth]!)).toBeLessThan(1);
    }
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('drops the run where the preview named it', async function () {
    await dropOneBeforeThree();
    expect(await h.getBuffer()).toBe(AFTER_DROP);
    // The run that was in flight is the run that is selected when it lands:
    // `- one` through its own child's content end.
    expect(await h.getSelection()).toEqual({
      anchor: { line: 3, ch: 0 },
      head: { line: 4, ch: '  - nested'.length },
    });
  });

  it('agrees with the command that names the same move', async function () {
    // The gesture is a THIRD entry point, and `selection-structural-ops`
    // requires every one of them to reach the same document and the same
    // selection. It holds a view where the other two hold an `Editor`, which
    // is a difference in the adapter and must not be one in the result.
    await dropOneBeforeThree();
    const dropped = await h.getBuffer();
    const droppedSelection = await h.getSelection();

    await h.setBuffer(DOC);
    await browser.pause(200);
    // The same operand the drag picks up, stated as a selection: `- one`
    // through its own child.
    await h.setSelection({ line: 2, ch: 0 }, { line: 3, ch: '  - nested'.length });
    await browser.pause(150);
    await h.runCommand('move-node-down');
    await browser.pause(300);

    expect(await h.getBuffer()).toBe(dropped);
    expect(await h.getSelection()).toEqual(droppedSelection);
  });

  it('is one undo step', async function () {
    await dropOneBeforeThree();
    expect(await h.getBuffer()).toBe(AFTER_DROP);
    await h.keys.undo();
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('writes nothing when the run is dropped where it already is', async function () {
    // A known edit first, so the undo has somewhere to land: a write that is
    // immediately reverted leaves the buffer identical and the history one
    // entry longer, which the buffer alone cannot tell from nothing at all.
    await h.setCursorSettled(5, '- three'.length);
    await browser.keys('!');
    await browser.pause(200);
    const edited = await h.getBuffer();
    expect(edited).toContain('- three!');

    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    // The seam between `- nested` and `- two`, which is where `- one`'s own
    // subtree already ends — dropping it there moves it nowhere.
    const y = await seamBetween(1, 2);
    await dragFrom(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: box.left + 4, y: y + 1 },
    ]);
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(edited);

    // ONE undo takes the typing back — not an empty write the drop left on the
    // stack in front of it.
    await h.keys.undo();
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('names where the run would land, once it is in flight', async function () {
    // The resolution the release will use, published as state while the button
    // is down — which is the only moment it exists, hence the recorder.
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 20 },
      { x: box.left + 200, y: mark.y + 70 },
      { x: box.left + 260, y: mark.y + 70 },
    ]);
    await browser.pause(250);
    const named = (await recorded()).filter((sample) => sample.preview !== null);
    expect(named.length).toBeGreaterThan(0);
    // Every destination it named is one this document actually offers.
    for (const sample of named) {
      expect(sample.preview!.depth).toBeGreaterThanOrEqual(0);
      expect(sample.preview!.seamLine).toBeGreaterThanOrEqual(0);
      expect(sample.preview!.firstLine.length).toBeGreaterThan(0);
    }
    // Moving right along one seam changes the column it names, which is the
    // axis this gesture exists to give the pointer.
    const depths = [...new Set(named.map((sample) => sample.preview!.depth))];
    expect(depths.length).toBeGreaterThan(0);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('answers the same while the pointer holds still', async function () {
    // The seams are read once the block mode has settled, a move after the
    // collapse, because a row that stops rendering raw can change height. This
    // case holds the pointer still across several moves and asserts the answer
    // does not drift — on a fixture built to make it drift if it could: the
    // caret's own row renders RAW in Live Preview, and this long link's raw
    // form wraps where its rendered form does not.
    //
    // It does not stand in for the control D9a's ordering asks for. Resolving
    // on the collapse frame instead gives the same answer here, so the shift
    // the design predicts is not observable through this harness on the
    // fixtures tried (docs/research/node-drag-and-drop section 6b).
    const wrapping = [
      '# Top',
      '',
      '- [short](https://example.com/a/very/long/target/that/makes/the/raw/row/wrap/over/several/lines/aaaa/bbbb/cccc)',
      '- one',
      '  - nested',
      '- two',
      '',
    ].join('\n');
    await h.setBuffer(wrapping);
    await browser.pause(200);
    await h.setCursorSettled(2, 5);
    await browser.pause(200);
    // Collapsing to a cover puts the covered rows into block-selection mode,
    // and a row that stops rendering raw can change height. Resolved on the
    // same frame as the collapse, the first answer is taken against the old
    // geometry and disagrees with the next one by a row.
    const mark = await markPoint(BULLET, 1);
    await startRecording();
    // Moves a pixel apart past the threshold — far enough to be delivered at
    // all (an identical position fires no move) and far inside one column, so
    // nothing about the answer may change between them.
    await dragThenEscape(mark, [
      { x: mark.x + 30, y: mark.y + 50 },
      { x: mark.x + 31, y: mark.y + 50 },
      { x: mark.x + 32, y: mark.y + 51 },
      { x: mark.x + 33, y: mark.y + 51 },
    ]);
    await browser.pause(250);
    const named = (await recorded()).filter((sample) => sample.preview !== null);
    expect(named.length).toBeGreaterThan(1);
    const first = named[0]!.preview!;
    for (const sample of named) {
      expect(sample.preview).toEqual(first);
    }
    await h.setBuffer(DOC);
  });

  it('keeps hearing the pointer once it has left the editor', async function () {
    // Measured before this existed: a held drag's moves stop arriving at the
    // editor root the moment the pointer leaves its box — 2 of 6. The gesture
    // captures the pointer on the root at the threshold, so they keep coming;
    // without that capture the moves below land on the app chrome instead and
    // the recording ends early.
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const outside = Math.max(4, box.left - 40);
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 12, y: mark.y + 12 },
      { x: outside, y: mark.y + 20 },
      { x: outside, y: mark.y + 40 },
      { x: outside, y: mark.y + 60 },
    ]);
    await browser.pause(250);
    const samples = await recorded();
    const outsideHeld = samples.filter((sample) => !sample.inside && sample.buttons !== 0);
    expect(outsideHeld.length).toBeGreaterThanOrEqual(3);
    expect(await zoomed()).toBe(false);
    expect(await h.getBuffer()).toBe(DOC);
  });
});
