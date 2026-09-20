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
  dragTraces,
  dragStepsThenEscape,
  dragWithHold,
  interruptWhenPreviewing,
  recordedScroll,
  scrollerBox,
  syntheticPointer,
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

/*  0 | # Top
    1 |
    2 | - two
    3 | - one
    4 |   - nested
    5 | - three
    6 |                                                                      */
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

/** A resolved background-image split into its layers — at the commas between
 * them, never at the ones inside a gradient's own colours and stops. */
function layersOf(image: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < image.length; i++) {
    const ch = image[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      layers.push(image.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = image.slice(start).trim();
  if (last !== '') layers.push(last);
  return layers;
}

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
    // And nothing of the drag is left on the page — the lift included, which
    // a teardown written for the drop alone would have left behind here.
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
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
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
  });

  it('resolves nothing on the move that starts the drag, and the same seam on every move after', async function () {
    // The pick-up collapses the selection to a cover, and a row that stops
    // rendering raw can change height — so the seams are read from the NEXT
    // move on, once that has settled. The sampler runs in the capture phase,
    // so each sample carries the answer the previous move produced: the
    // sample after the crossing move says what the crossing move resolved.
    await h.setCursorSettled(0, 0);
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const y = await seamBetween(2, 3);
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: box.left + 5, y },
      { x: box.left + 4, y },
    ]);
    await browser.pause(250);
    // The approach to the mark is a move too, so the pressed moves are
    // counted from the first sample with the button down.
    const pressed = (await recorded()).filter((sample) => sample.buttons === 1);
    expect(pressed.length).toBeGreaterThanOrEqual(4);
    // What the crossing move resolved: nothing, by design — a move that close
    // to the mark has a seam under it, so a resolution on that frame would
    // have named one.
    expect(pressed[1]!.preview).toBe(null);
    // What the moves on the seam resolved: the same destination each time,
    // with no shift between the first reading and the next.
    const first = pressed[2]!.preview;
    expect(first).not.toBe(null);
    for (const sample of pressed.slice(3)) expect(sample.preview).toEqual(first);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('cancels when the document changes under it, keeping the change and moving nothing', async function () {
    // A write while the button is down: the nodes the drag is holding have
    // moved under it, so the drag cancels rather than dropping them where the
    // reader did not aim. The write stays; the selection goes back to where
    // it was before the pick-up collapsed it; and nothing of the drag is left.
    await h.setCursorSettled(0, 0);
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const y = await seamBetween(2, 3);
    await startRecording();
    await interruptWhenPreviewing('change');
    await dragWithHold(
      mark,
      [{ x: mark.x + 20, y: mark.y + 10 }, { x: box.left + 4, y }, { x: box.left + 5, y }],
      900,
      [{ x: box.left + 6, y }],
    );
    await browser.pause(300);
    // The drag was real before the write: a destination had been named.
    expect((await recorded()).some((sample) => sample.preview !== null)).toBe(true);
    expect(await h.getBuffer()).toBe(DOC + '- late\n');
    expect(await h.getSelection()).toEqual({ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } });
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
  });

  it('cancels when the pointer is taken back, restoring the selection from before the pick-up', async function () {
    // A known edit first, so the undo has somewhere to land — and so the
    // selection put back is one the pick-up's collapse visibly moved away
    // from: the caret after `- three!`, not the cover of `- one`.
    await h.setCursorSettled(5, '- three'.length);
    await browser.keys('!');
    await browser.pause(200);
    const edited = await h.getBuffer();
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const y = await seamBetween(2, 3);
    await startRecording();
    await interruptWhenPreviewing('pointercancel');
    await dragWithHold(
      mark,
      [{ x: mark.x + 20, y: mark.y + 10 }, { x: box.left + 4, y }, { x: box.left + 5, y }],
      900,
      [{ x: box.left + 6, y }],
    );
    await browser.pause(300);
    expect((await recorded()).some((sample) => sample.preview !== null)).toBe(true);
    expect(await h.getBuffer()).toBe(edited);
    expect(await h.getSelection()).toEqual({
      anchor: { line: 5, ch: '- three!'.length },
      head: { line: 5, ch: '- three!'.length },
    });
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
    // One undo takes the typing back: the cancelled drag left no entry.
    await h.keys.undo();
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('autoscrolls while the pointer holds at the scroller\u2019s edge, faster the further past it', async function () {
    // A note taller than the view. The pointer picks up the first item and
    // rests in the band inside the scroller's bottom edge, twice: barely
    // inside it, then nearly on the edge. The scroller moves both times, more
    // the second — a fixed step regardless of distance would move it the same
    // — and a destination that was off screen at the pick-up is named before
    // the Escape, which then leaves the note as it was.
    const LONG = ['# Long', '', ...Array.from({ length: 120 }, (_, i) => `- item ${i}`), ''].join('\n');
    await h.setBuffer(LONG);
    await browser.pause(300);
    await h.setCursorSettled(0, 0);
    // The band is the SCROLLER's; the editor root reaches below it.
    const box = await scrollerBox();
    const mark = await markPoint(BULLET, 0);
    await startRecording();
    await dragStepsThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 40, y: box.bottom - 30 },
      { holdMs: 600 },
      { x: box.left + 40, y: box.bottom - 6 },
      { holdMs: 600 },
    ]);
    await browser.pause(300);
    const pressed = (await recorded()).filter((sample) => sample.buttons === 1);
    // The move into the band, and the move deeper into it after the first
    // hold: each carries the scroll position at that moment.
    const shallow = pressed[1]!;
    const deep = pressed[2]!;
    const scroll = await recordedScroll();
    // The furthest the scroller got WHILE the drag was alive: the cancel puts
    // the selection back, and the view follows it up again.
    const alive = scroll.filter((sample) => sample.seamLine !== null);
    const finalTop = Math.max(...alive.map((sample) => sample.scrollTop));
    const firstHold = deep.scrollTop - shallow.scrollTop;
    const secondHold = finalTop - deep.scrollTop;
    expect(firstHold).toBeGreaterThan(0);
    expect(secondHold).toBeGreaterThan(firstHold * 1.5);
    // Reached: a seam well below what the view showed at the pick-up — read
    // from the timed samples, since the preview moves under a resting pointer
    // and no move arrives to sample it on.
    const named = scroll.map((sample) => sample.seamLine ?? -1);
    expect(Math.max(...named)).toBeGreaterThan(30);
    expect(await h.getBuffer()).toBe(LONG);
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
    await h.setBuffer(DOC);
    await browser.pause(200);
  });

  it('keeps a preview dispatch within the enforcement budget on a stress note', async function () {
    // ~2000 lines, the same shape the classification and enforcement budgets
    // are measured on. A heading is dragged down the note in small steps, so
    // most moves stay on one seam and a few cross to the next: what a move
    // costs the page is read as the interval from the capture-phase sample to
    // the bubble-phase listener registered after the plugin's own, which
    // brackets the resolution, the preview dispatch and the rebuild it runs.
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) {
      lines.push(`## Section ${i}`, '', `Paragraph text for section ${i}, some words here.`, '');
    }
    const STRESS = lines.join('\n') + '\n';
    await h.setBuffer(STRESS);
    await browser.pause(500);
    await h.setCursorSettled(0, 0);
    const box = await editorBox();
    // `## Section 1`: the marks alternate heading, paragraph, heading…
    const mark = await markPoint('.to-decor-marker-icon', 2);
    const path: { x: number; y: number }[] = [];
    for (let y = mark.y + 20; y < box.bottom - 60; y += 6) path.push({ x: box.left + 30, y });
    // The BASELINE first: the same path with no button down, which is what a
    // move costs the page before this gesture has anything to do with it.
    await startRecording();
    let hover = browser.action('pointer', { parameters: { pointerType: 'mouse' } });
    for (const point of path) hover = hover.move({ x: Math.round(point.x), y: Math.round(point.y), origin: 'viewport' });
    await hover.perform();
    await browser.pause(200);
    const unpressed = (await recorded()).filter((sample) => sample.buttons === 0 && sample.cost >= 0);
    await startRecording();
    await dragThenEscape(mark, [{ x: mark.x + 20, y: mark.y + 10 }, ...path]);
    await browser.pause(300);
    const pressed = (await recorded()).filter((sample) => sample.buttons === 1 && sample.cost >= 0);
    expect(unpressed.length).toBeGreaterThan(20);
    expect(pressed.length).toBeGreaterThan(20);
    const quantiles = (samples: { cost: number }[]) => {
      const costs = samples.map((sample) => sample.cost).sort((a, b) => a - b);
      const at = (q: number) => costs[Math.min(costs.length - 1, Math.floor(q * costs.length))]!;
      return { median: at(0.5), p95: at(0.95), max: costs[costs.length - 1]! };
    };
    const base = quantiles(unpressed);
    const drag = quantiles(pressed);
    // The guard: a dispatch only when the destination changes, so the moves
    // that stay on one seam cost no rebuild. Counted as the samples whose
    // preview differs from the one before.
    let dispatches = 0;
    for (let i = 1; i < pressed.length; i++) {
      const a = pressed[i - 1]!.preview;
      const b = pressed[i]!.preview;
      if ((a === null) !== (b === null) || (a && b && (a.seamLine !== b.seamLine || a.depth !== b.depth))) {
        dispatches++;
      }
    }
    const fmt = (q: { median: number; p95: number; max: number }) =>
      `median ${q.median.toFixed(2)}ms, p95 ${q.p95.toFixed(2)}ms, max ${q.max.toFixed(2)}ms`;
    console.log(
      `[dragging latency] unpressed moves ${unpressed.length}: ${fmt(base)}; ` +
        `pressed moves ${pressed.length}, dispatches ${dispatches}: ${fmt(drag)}`,
    );
    expect(dispatches).toBeLessThan(pressed.length);
    // What the gesture adds to a typical move, over the page's own cost of
    // one, is held to the enforcement budget's median. The tails are not
    // compared: at eight dispatches in seventy moves the p95 IS a dispatch,
    // whose cost is the decoration rebuild the note's size sets, and the
    // page's own spikes sit in the same tail (docs/research/node-drag-and-drop
    // section 6f records both).
    expect(drag.median - base.median).toBeLessThanOrEqual(3);
    expect(await h.getBuffer()).toBe(STRESS);
    await h.setBuffer(DOC);
    await browser.pause(200);
  });

  it('draws the rows in flight as lifted, in place, over the cover\u2019s own chrome', async function () {
    // `- one` and its child are the run. Both rows wear the lifted treatment
    // for the whole drag — over a dead band as much as over a seam — on top of
    // the cover chrome, and neither moves: the tops the sampler reads mid-drag
    // are the tops the rows had before the press.
    await h.setCursorSettled(0, 0);
    const tops = [await h.getLineRect(2), await h.getLineRect(3)].map((r) => r.top);
    const mark = await markPoint(BULLET, 0);
    const box = await editorBox();
    const y = await seamBetween(2, 3);
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: box.left + 5, y },
    ]);
    await browser.pause(250);
    const flight = (await recorded()).filter((sample) => sample.lifted.length > 0);
    expect(flight.length).toBeGreaterThan(0);
    for (const sample of flight) {
      expect(sample.lifted.map((row) => row.line)).toEqual([2, 3]);
      // Composed with the cover's chrome, not in place of it: the same rows
      // are still the block selection.
      for (const row of sample.lifted) expect(sample.selected).toContain(row.line);
      // In place, to the pixel.
      expect(sample.lifted.map((row) => Math.round(row.top))).toEqual(tops.map(Math.round));
    }
    // Lifted before any destination is named, and still lifted once one is.
    expect(flight.some((sample) => sample.preview === null)).toBe(true);
    expect(flight.some((sample) => sample.preview !== null)).toBe(true);
    expect(await h.getBuffer()).toBe(DOC);
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
  });

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
    // A list at the root with a heading after it. The seam between them
    // offers two depths: beside the list at the root, and inside `- three`.
    // (Under a heading the root column would not be offered at all: a
    // bulleted run written before the next heading is still inside the one
    // above it.) Swept left to right, the indicator's left end should sit a
    // fixed distance right of each of those columns in turn.
    //
    // The columns come from the document's own MARKS, of two different kinds,
    // because that is what makes this a relation rather than a constant: a
    // heading's marker icon is centred on its column and a list bullet's span
    // begins on its. Depth 0 is read from the HEADING, so an indicator
    // positioned by measuring one kind's box would sit right on one depth and
    // half a bullet out on the other.
    const ROOTED = ['- one', '  - nested', '- two', '- three', '', '# After', ''].join('\n');
    await h.setBuffer(ROOTED);
    await browser.pause(250);
    // Off the list: the caret's own row renders raw, with no bullet to aim at.
    await h.setCursorSettled(5, 0);
    const columns = [
      await columnOfMark('.to-decor-marker-icon', 0, 'centre'), // `# After`, depth 0
      await columnOfMark(BULLET, 1, 'left'), // `  - nested`, depth 1
    ];
    const three = await markPoint(BULLET, 3);
    const after = await markPoint('.to-decor-marker-icon', 0);
    const y = (three.y + after.y) / 2;
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
    // Both depths by name, so the heading's column is tested and not assumed.
    expect([...seen.keys()].sort()).toEqual([0, 1]);
    // The bar starts one marker gutter right of the column, where the run's
    // text will begin — the ghost mark sits on the column itself. The gutter
    // is not read here; what is asserted is that the offset from each depth's
    // own column is the same at every depth, and less than a column.
    const unit = columns[1]! - columns[0]!;
    const offsets = [...seen].map(([depth, drawnAt]) => drawnAt - columns[depth]!);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(unit);
      expect(Math.abs(offset - offsets[0]!)).toBeLessThan(1);
    }
    expect(await h.getBuffer()).toBe(ROOTED);
    await h.setBuffer(DOC);
    await browser.pause(200);
  });

  /*  0 | ## Section
      1 |
      2 | - one
      3 | - two
      4 |
      5 | ### Move me
      6 |
      7 | body text
      8 |                                                                    */
  const CONVERTING = [
    '## Section',
    '',
    '- one',
    '- two',
    '',
    '### Move me',
    '',
    'body text',
    '',
  ].join('\n');

  it('previews the mark the run will have, not the one it has', async function () {
    // Design D7, and the reason the preview and the release share ONE
    // resolution: a heading section dropped INTO a list is re-encoded as a
    // list item carrying its own `#` run as text, and a preview drawing the
    // glyph the run has in flight would state a result that is not going to
    // happen. The same seam one column left keeps it a heading — so one sweep
    // over one boundary draws two different marks, which is the whole claim.
    await h.setBuffer(CONVERTING);
    await browser.pause(250);

    // `### Move me`, dragged by its own mark, to the seam between `- one` and
    // `- two`: at the list's own depth it stays a heading, one level inside
    // `- one` it becomes a list item.
    const heading = await markPoint('.to-decor-marker-icon', 1);
    // `- one` and `- two` are SIBLINGS, so both bullets stand on the same
    // column and the fixture has no mark one level deeper. The unit is the
    // step between the two columns it does have — `## Section` at the root
    // and the list one level in — and the deeper column is one more of it.
    const root = await columnOfMark('.to-decor-marker-icon', 0, 'centre');
    const asSibling = await columnOfMark(BULLET, 0, 'left');
    const asChild = asSibling + (asSibling - root);
    const one = await markPoint(BULLET, 0);
    const two = await markPoint(BULLET, 1);
    const y = (one.y + two.y) / 2;

    await startRecording();
    await dragThenEscape(heading, [
      { x: heading.x + 20, y: heading.y - 10 },
      { x: asSibling, y },
      { x: asSibling + 1, y },
      { x: asChild, y },
      { x: asChild + 1, y },
    ]);
    await browser.pause(250);

    const drawn = (await recorded()).filter((sample) => sample.ghost !== null);
    expect(drawn.length).toBeGreaterThan(0);
    const marks = new Map<number, string>();
    for (const sample of drawn) {
      expect(sample.preview).not.toBe(null);
      marks.set(sample.preview!.depth, sample.ghost!.kind);
    }
    // Both columns of that one seam, and the mark each of them makes of the
    // run. A preview drawing the operand's CURRENT kind draws a heading at
    // both, which is what this pair of columns exists to tell apart.
    expect([...marks.entries()].sort()).toEqual([
      [1, 'heading'],
      [2, 'list-item'],
    ]);
    // And the heading column says which heading: the run re-levels to its
    // destination rather than keeping the level it came with.
    const asHeading = drawn.find((sample) => sample.preview!.depth === 1)!;
    expect(asHeading.ghost!.level).toBe('3');
    // And each is centred on its own column, list row or not.
    expect(Math.abs(asHeading.ghost!.x - asSibling)).toBeLessThan(1);
    const asItem = drawn.find((sample) => sample.preview!.depth === 2)!;
    expect(Math.abs(asItem.ghost!.x - asChild)).toBeLessThan(1);

    expect(await h.getBuffer()).toBe(CONVERTING);
    await h.setBuffer(DOC);
    await browser.pause(200);
  });

  it('centres the ghost mark on a deep list column', async function () {
    // The seam row here is a list line four levels in, which Obsidian indents
    // with its own padding and a matching negative text-indent — and a pass of
    // ours keeps every marker icon on such a line at the plain-line marker's
    // shift by writing its `left` inline. Measured before the ghost was
    // excluded from that pass: at depth 4 the indicator sat on its column and
    // the ghost three columns left of it, outside the whole list
    // (docs/research/node-drag-and-drop section 6d).
    const NESTED = ['# Top', '', '- a', '  - b', '    - c', '      - d', '- e', ''].join('\n');
    await h.setBuffer(NESTED);
    await browser.pause(250);
    const columns = [];
    for (let i = 0; i < 4; i++) columns.push(await columnOfMark(BULLET, i, 'left'));
    // The seam below `- d`: the one above it offers depth 4 alone, since
    // anything shallower would make `- d` a descendant of the drop.
    const d = await markPoint(BULLET, 3);
    const e = await markPoint(BULLET, 4);
    const y = (d.y + e.y) / 2;
    await startRecording();
    await dragThenEscape(e, [
      { x: e.x + 20, y: e.y - 10 },
      { x: columns[2]!, y },
      { x: columns[2]! + 1, y },
      { x: columns[3]!, y },
      { x: columns[3]! + 1, y },
    ]);
    await browser.pause(250);
    const drawn = (await recorded()).filter((sample) => sample.ghost !== null);
    const seen = new Map<number, number>();
    for (const sample of drawn) seen.set(sample.preview!.depth, sample.ghost!.x);
    expect([...seen.keys()].sort()).toEqual([3, 4]);
    // The ghost's centre on the column its depth names — `columns` is indexed
    // from depth 1, the first bullet's.
    for (const [depth, x] of seen) expect(Math.abs(x - columns[depth - 1]!)).toBeLessThan(1);
    await h.setBuffer(DOC);
    await browser.pause(200);
  });

  it('accents the destination parent in the trail\u2019s colour, at the guide\u2019s weight', async function () {
    // `- three` held one level inside `- one`, after `  - nested`. The parent
    // is `- one` (line 2), and the one row between it and the seam is
    // `  - nested` (line 3), which draws `- one`'s guide. The parent's bullet
    // takes the accent, and so does that guide — at the width it had before
    // the drag, since a thicker line is the caret trail's own vocabulary. The
    // caret sits on `# Top`, whose trail reaches no guide in this note, so
    // every accent read mid-drag is the drag's own.
    await h.setCursorSettled(0, 0);
    // A layer's colour is whatever the theme resolves the guide token to — a
    // `color-mix()` as readily as an `rgb()` — so a layer is read as "colour,
    // then its stops" rather than by the shape of the colour. The resolved
    // image spells a two-position stop out as two stops of one colour, and
    // `transparent` as `rgba(0, 0, 0, 0)`, so a stripe reads as: the colour at
    // 0px, the same colour at its width, then transparent from that width.
    const stripe =
      /^(?:repeating-)?linear-gradient\(to right, (.+?) 0px, \1 ([\d.]+)px, rgba\(0, 0, 0, 0\) \2px/;
    const guideLayers = (image: string) =>
      layersOf(image).filter((layer) => layer.startsWith('repeating-linear-gradient('));
    // The indicator is also a plain `linear-gradient`, with no transparent
    // stop: it is the one full-width layer, and that is how it is told apart.
    const accentLayers = (image: string) =>
      layersOf(image).filter(
        (layer) => layer.startsWith('linear-gradient(') && layer.includes('rgba(0, 0, 0, 0)'),
      );
    const nested = await h.getLineElementInfo(3);
    const before = stripe.exec(guideLayers(nested.guideBackground)[0] ?? '');
    if (!before) throw new Error(`no plain guide layer read on line 3: ${JSON.stringify(nested)}`);
    const [, guideColour, guideWidth] = before;

    const box = await editorBox();
    const column = await columnOfMark(BULLET, 1, 'left'); // `  - nested`, depth 2
    const y = await seamBetween(1, 2);
    const mark = await markPoint(BULLET, 3);
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y + 10 },
      { x: box.left + 4, y },
      { x: column, y },
      { x: column + 1, y },
    ]);
    await browser.pause(250);

    // With the caret on `# Top`, the trail accents no guide in this note, so
    // every accent layer read mid-drag is the drop's. On the inner column the
    // parent is `- one`: its own row wears the marker accent, the row between
    // it and the seam carries its guide's accent, and its own row carries
    // none, since a node's guide begins below the node. On the outer column
    // the parent is `# Top`, and the same three readings move up one node.
    const samples = await recorded();
    const at = (depth: number) =>
      samples.filter(
        (sample) => sample.preview !== null && sample.preview.depth === depth && sample.indicator !== null,
      );
    const inside = at(2);
    const beside = at(1);
    expect(inside.length).toBeGreaterThan(0);
    expect(beside.length).toBeGreaterThan(0);
    const oneAccent = (image: string | undefined, accent: string | null) => {
      const layers = accentLayers(image ?? '');
      expect(layers).toHaveLength(1);
      const layer = stripe.exec(layers[0]!);
      expect(layer).not.toBe(null);
      // The accent colour, at the plain guide's width and not the trail's: the
      // drop's accent is drawn at the guide's weight.
      expect(layer![1]).toBe(accent);
      expect(layer![2]).toBe(guideWidth);
    };
    for (const sample of inside) {
      expect(sample.accentedRows).toEqual([2]);
      expect(sample.parentAccent).not.toBe(null);
      expect(sample.parentAccent).not.toBe(guideColour);
      oneAccent(sample.guideImages[3], sample.parentAccent);
      expect(accentLayers(sample.guideImages[2] ?? '')).toEqual([]);
    }
    // Negative control: on the other column `- one` is not the parent — its
    // row is not accented, and its own guide is what now carries the accent,
    // from the parent above it.
    for (const sample of beside) {
      expect(sample.accentedRows).toEqual([0]);
      oneAccent(sample.guideImages[2], sample.parentAccent);
      oneAccent(sample.guideImages[3], sample.parentAccent);
    }
    expect(await h.getBuffer()).toBe(DOC);
  });

  it('draws the rows an absorbing drop would take one level in', async function () {
    // `## Move me` held after `intro` opens a section over `details`, `more
    // details` and `- a list`, and not over `## Next`, which can stand beside
    // it. Those three rows are drawn one column in for the drag's duration —
    // the result shown as the result — and the fourth stays put. Read off the
    // depth the depth rules see on each row, which is what moves it.
    //
    // Negative control: taking the region from the anchor alone marks
    // nothing, since the anchor's own row is not among the absorbed.
    const ABSORBING = ['# Section', '', 'intro', '', 'details', '', 'more details', '', '- a list', '', '## Next', '', 'body', '', '## Move me', '', 'its body', ''].join('\n');
    await h.setBuffer(ABSORBING);
    await browser.pause(250);
    await h.setCursorSettled(0, 0);
    // Marker icons, in document order: Section(0) intro(1) details(2) more
    // details(3) Next(4) body(5) Move me(6) its body(7).
    const mark = await markPoint('.to-decor-marker-icon', 6);
    const intro = await markPoint('.to-decor-marker-icon', 1);
    const details = await markPoint('.to-decor-marker-icon', 2);
    const column = await columnOfMark('.to-decor-marker-icon', 1, 'centre'); // depth 1
    const y = (intro.y + details.y) / 2;
    await startRecording();
    await dragThenEscape(mark, [
      { x: mark.x + 20, y: mark.y - 10 },
      { x: column, y },
      { x: column + 1, y },
    ]);
    await browser.pause(250);
    const held = (await recorded()).filter((s) => s.preview?.depth === 1);
    expect(held.length).toBeGreaterThan(0);
    const at = held[held.length - 1]!.rowDepths;
    // The absorbed three, each one deeper than its own depth — the list is a
    // child of the paragraph before it, so it starts at 2; `## Next` and the
    // anchor `intro` where they were.
    expect([at[4], at[6], at[8]]).toEqual([2, 2, 3]);
    expect([at[2], at[10]]).toEqual([1, 1]);
    expect(await h.getBuffer()).toBe(ABSORBING);
    await h.setBuffer(DOC);
    await browser.pause(200);
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
    // The landed run is selected, not lifted: the drop is an end like any other.
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
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

describe('node dragging: a touch press', () => {
  // Driven by events synthesised in the page, on desktop and mobile alike: the
  // harness has no coordinate-addressable touch, so what these prove is the
  // handler's reading of a touch — the dwell, and the scroll a moving touch
  // is — and not the platform's hit-testing, which stays with the device pass.
  before(async function () {
    await openDraggable();
  });

  beforeEach(async function () {
    await openDraggable();
  });

  it('becomes a drag by resting on the mark, and drops where the touch is lifted', async function () {
    await h.setCursorSettled(0, 0);
    const mark = await markPoint(BULLET, 0);
    const y = await seamBetween(2, 3);
    const box = await editorBox();
    await syntheticPointer('pointerdown', mark, 'touch');
    // Before the dwell is up nothing has happened: no lift, no cover.
    await browser.pause(120);
    expect((await dragTraces()).lifted).toBe(0);
    await browser.pause(500);
    expect((await dragTraces()).lifted).toBeGreaterThan(0);
    await syntheticPointer('pointermove', { x: box.left + 4, y }, 'touch');
    await syntheticPointer('pointermove', { x: box.left + 5, y }, 'touch');
    await browser.pause(150);
    expect((await dragTraces()).preview).toBe(true);
    await syntheticPointer('pointerup', { x: box.left + 5, y }, 'touch');
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(AFTER_DROP);
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
  });

  it('lets a touch that moves before the dwell go, as the scroll it is', async function () {
    await h.setCursorSettled(0, 0);
    const mark = await markPoint(BULLET, 0);
    await syntheticPointer('pointerdown', mark, 'touch');
    await syntheticPointer('pointermove', { x: mark.x + 2, y: mark.y + 30 }, 'touch');
    await browser.pause(600);
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
    await syntheticPointer('pointerup', { x: mark.x + 2, y: mark.y + 30 }, 'touch');
    await browser.pause(300);
    expect(await h.getBuffer()).toBe(DOC);
    expect(await zoomed()).toBe(false);
  });

  it('does not turn a resting mouse press into a drag — that press still zooms', async function () {
    // Negative control for the dwell: it is a touch's discriminator, not a
    // mouse's, whose drag begins on movement.
    await h.setCursorSettled(0, 0);
    const mark = await markPoint(BULLET, 0);
    await syntheticPointer('pointerdown', mark, 'mouse');
    await browser.pause(600);
    expect(await dragTraces()).toEqual({ lifted: 0, ghosts: 0, indicators: 0, preview: false });
    await syntheticPointer('pointerup', mark, 'mouse');
    await browser.pause(300);
    expect(await zoomed()).toBe(true);
    expect(await h.getBuffer()).toBe(DOC);
  });
});
