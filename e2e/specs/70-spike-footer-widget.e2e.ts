/**
 * Spike S1 (docs/research/17-backlinks-footer-spikes.md): does a block widget
 * at `doc.length` perturb the enforcement layer?
 *
 * The question is comparative, not absolute — "where does the caret land with a
 * widget present" is only meaningful against where it lands without one. So
 * every measurement here runs the SAME script twice against the SAME note, once
 * with the widget off and once on, and asserts the two observation records are
 * identical. A regression shows up as a diff between the two halves rather than
 * as a hardcoded expectation that would have to be re-derived whenever caret
 * policy legitimately changes.
 *
 * That framing is also why the widget is content-free (see
 * src/plugin/spike-footer-widget.ts): the variable under test is its presence.
 *
 * A failure here is a real answer, not a broken test. It reopens the surface
 * decision (D1) rather than being worked around — see the change's design.md,
 * decision D-F.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Backlinks/Deep chain.md';
const WIDGET_SELECTOR = '.to-spike-footer';

async function setWidget(on: boolean): Promise<void> {
  await browser.executeObsidian(
    async ({ plugins }, enabled) => {
      await (plugins.trueOutliner as any).setDebugFooterWidget(enabled);
    },
    on,
  );
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  if (!(await h.isOutlineMode(notePath))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

function widgetCount(): Promise<number> {
  return browser.executeObsidian(
    ({ app }, selector) =>
      (app.workspace as any).containerEl.querySelectorAll(selector).length as number,
    WIDGET_SELECTOR,
  );
}

/** Every observation S1 makes, as one comparable record. */
interface Observations {
  docLines: number;
  caretLineEnd: { line: number; ch: number };
  caretDocEnd: { line: number; ch: number };
  caretArrowDownFromLast: { line: number; ch: number };
  caretAfterClickBelowLast: { line: number; ch: number };
  selectAllLadder: string[];
  bufferAfterOps: string;
  caretAfterOps: { line: number; ch: number };
  bufferAfterUndoAll: string;
  classifications: Record<string, number>;
  /** cls+userEvent of every transaction the filter saw, in order — diagnostic
   * detail so a classification-count delta can be explained rather than
   * merely observed. */
  trace: string[];
}

async function measure(): Promise<Observations> {
  await h.openNote(NOTE);
  await ensureOutlineMode(NOTE);
  const original = await h.getBuffer();
  const lines = original.split('\n');
  // The document's own last line and its last line WITH CONTENT are different when
  // the file ends with a newline, which every well-formed note does. Caret and
  // selection questions want the former (that is where the widget sits);
  // structural operations want the latter (an empty trailing line is a gap, not
  // a node, and `content-space-caret` will not put a caret in column 1 of it).
  const lastLine = lines.length - 1;
  const lastContentLine = lines.reduce((last, text, i) => (text.trim() ? i : last), 0);

  await h.resetStats();

  // --- caret ------------------------------------------------------------
  await h.setCursor(1, 0);
  await h.keys.end();
  const caretLineEnd = await h.getCursor();

  // The document's very last addressable position, placed programmatically so it
  // goes through the transaction filter's `programmatic` path — the one
  // `content-space-caret` uses to resolve placements it did not itself originate,
  // and the path most likely to notice a widget sitting at exactly that offset.
  await h.setCursor(lastLine, (lines[lastLine] ?? '').length);
  const caretDocEnd = await h.getCursor();

  await h.setCursor(lastContentLine, 0);
  await h.keys.down();
  const caretArrowDownFromLast = await h.getCursor();

  // Click well below the last line: with the widget present this lands inside
  // the widget's box, which is exactly the case worth measuring.
  const lastRect = await h.getLineRect(lastContentLine);
  await browser
    .action('pointer')
    .move({ x: Math.round(lastRect.left + 20), y: Math.round(lastRect.top + lastRect.height + 40) })
    .down()
    .up()
    .perform();
  const caretAfterClickBelowLast = await h.getCursor();

  // --- selection --------------------------------------------------------
  await h.setCursor(lastContentLine, 0);
  const selectAllLadder: string[] = [];
  for (let step = 0; step < 4; step++) {
    await h.pressSelectAll();
    const sel = await h.getSelection();
    selectAllLadder.push(`${sel.anchor.line}:${sel.anchor.ch}-${sel.head.line}:${sel.head.ch}`);
  }

  // --- structural operations on the last node ---------------------------
  await h.setCursor(lastContentLine, 1);
  await h.runCommand('indent-node');
  await h.runCommand('outdent-node');
  await h.runCommand('move-node-up');
  await h.runCommand('move-node-down');
  const bufferAfterOps = await h.getBuffer();
  const caretAfterOps = await h.getCursor();

  // Undo every operation above; the buffer must return to where it started.
  for (let i = 0; i < 8; i++) await h.keys.undo();
  const bufferAfterUndoAll = await h.getBuffer();

  const stats = await h.getStats();
  const classifications: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats.counts ?? {})) classifications[k] = v as number;
  const trace = (stats.recent ?? []).map((r) => `${r.cls}/${r.userEvent ?? '-'}`);

  // Leave the note as found so the second half measures the same document.
  await h.setBuffer(original);
  await h.saveActiveFile();

  return {
    docLines: lines.length,
    caretLineEnd,
    caretDocEnd,
    caretArrowDownFromLast,
    caretAfterClickBelowLast,
    selectAllLadder,
    bufferAfterOps,
    caretAfterOps,
    bufferAfterUndoAll,
    classifications,
    trace,
  };
}

describe('spike S1: end-of-document block widget vs. the enforcement layer', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
    await h.pinPositionIndicatorsOff();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  after(async function () {
    await setWidget(false);
  });

  it('mounts exactly one widget in outline mode, and none off-mode', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);

    await setWidget(false);
    expect(await widgetCount()).toBe(0);

    await setWidget(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    expect(await widgetCount()).toBe(1);

    // Off-mode is the plugin's hard boundary everywhere else; the spike must not
    // be the one layer that ignores it.
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode off');
    await h.dismissNotices();
    expect(await widgetCount()).toBe(0);

    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
    await setWidget(false);
  });

  it('does not change caret placement, selection escalation, or structural ops', async function () {
    await setWidget(false);
    const without = await measure();

    await setWidget(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    const withWidget = await measure();

    // Reported field-by-field rather than as one object compare, so a failure
    // names which invariant the widget broke instead of dumping two blobs.
    expect(withWidget.caretLineEnd).toEqual(without.caretLineEnd);
    expect(withWidget.caretDocEnd).toEqual(without.caretDocEnd);
    expect(withWidget.caretArrowDownFromLast).toEqual(without.caretArrowDownFromLast);
    expect(withWidget.caretAfterClickBelowLast).toEqual(without.caretAfterClickBelowLast);
    expect(withWidget.selectAllLadder).toEqual(without.selectAllLadder);
    expect(withWidget.bufferAfterOps).toEqual(without.bufferAfterOps);
    expect(withWidget.caretAfterOps).toEqual(without.caretAfterOps);
    expect(withWidget.bufferAfterUndoAll).toEqual(without.bufferAfterUndoAll);
    // Classification counts are DIAGNOSTIC, not a contract. The widget's presence
    // costs a few extra `programmatic` transactions — the caret-resolution pass
    // running one more correction when a placement lands adjacent to the block
    // widget, and arriving at the same position (every caret assertion above is
    // equality). "The filter does the same amount of work" is not a behavioural
    // guarantee and asserting it would break on any legitimate policy change.
    //
    // What IS asserted: no transaction moves into a class that would mean the
    // widget changed what an edit *is*. A boundary-crossing or within-node edit
    // appearing, or a composition or plugin-own count shifting, would each be a
    // real behavioural difference rather than extra bookkeeping.
    console.log('[S1] classifications without widget:', JSON.stringify(without.classifications));
    console.log('[S1] classifications with widget:   ', JSON.stringify(withWidget.classifications));
    for (const cls of ['boundary-crossing-edit', 'within-node-edit', 'composition', 'plugin-own']) {
      expect(withWidget.classifications[cls] ?? 0).toBe(without.classifications[cls] ?? 0);
    }
    expect(Object.keys(withWidget.classifications).sort()).toEqual(
      Object.keys(without.classifications).sort(),
    );
  });

  it('leaves the document byte-identical after mounting and unmounting', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await setWidget(false);
    const before = await h.getBuffer();

    await setWidget(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    await setWidget(false);

    expect(await h.getBuffer()).toBe(before);
    // A single undo must revert a real prior edit, not an entry the widget's
    // mount/unmount interposed — the same proof 53-decoration-contracts uses.
    await h.setCursor(0, 0);
    await h.keys.type('x');
    const edited = await h.getBuffer();
    await setWidget(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    await setWidget(false);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(before);
    expect(edited).not.toBe(before);
  });
});
