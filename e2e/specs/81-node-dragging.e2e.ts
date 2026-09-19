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
  dragFrom,
  dragThenEscape,
  editorBox,
  markPoint,
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
    await dragFrom(mark, [
      { x: mark.x + 12, y: mark.y + 4 },
      { x: mark.x + 40, y: mark.y + 60 },
    ]);
    await browser.pause(250);
    // The press meant one of two things and the movement chose. Nothing was
    // written either — the drop half is not built yet, so the buffer is the
    // assertion that the gesture did not fall through to something else.
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
    const covers = (await recorded()).filter(
      (sample) =>
        sample.selection.anchor.line === 2 &&
        sample.selection.head.line === 3 &&
        sample.selection.head.ch > 0,
    );
    expect(covers.length).toBeGreaterThan(0);
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
    await dragFrom(mark, [
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
