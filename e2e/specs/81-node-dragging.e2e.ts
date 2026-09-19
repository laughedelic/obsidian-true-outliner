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
import { dragFrom, editorBox, markPoint, recorded, startRecording } from '../dragging.js';

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
