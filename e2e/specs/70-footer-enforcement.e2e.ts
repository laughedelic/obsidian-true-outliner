/**
 * Spike S1 (docs/research/19-backlinks-footer-spikes.md), kept as a standing
 * contract: does the footer's block widget at `doc.length` perturb the
 * enforcement layer?
 *
 * Originally measured against content-free apparatus, so that "the widget is
 * here" could not be confounded with "the content did something". That
 * apparatus is gone now the real footer exists, and these assertions moved onto
 * it — the invariants are permanent properties of the footer, not one-off
 * measurements, and they are worth more asserted against the real thing.
 *
 * The question is comparative, not absolute — "where does the caret land with a
 * widget present" is only meaningful against where it lands without one. So
 * every measurement here runs the SAME script twice against the SAME note, once
 * with the widget off and once on, and asserts the two observation records are
 * identical. A regression shows up as a diff between the two halves rather than
 * as a hardcoded expectation that would have to be re-derived whenever caret
 * policy legitimately changes.
 *
 * The differential framing is what makes the assertion survive the footer
 * gaining content: what is being compared is the editor's behaviour with the
 * footer present against the same behaviour without it, never the footer's own
 * appearance.
 *
 * A failure here is a real answer, not a broken test. It reopens the surface
 * decision (D1) rather than being worked around — see the change's design.md,
 * decision D-F.
 */

import { $, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';
import {
  FOOTER,
  clearFilters,
  clickIn,
  focusSearch,
  openFilters,
  openFooter,
  scrollToFooter,
  settle,
} from '../footer.js';

const NOTE = 'Backlinks/Deep chain.md';
/**
 * The four structural operations the case runs, in order. They undo one
 * another, so the document must come back exactly as they found it — and each
 * one must move it on the way, or it was refused.
 */
const OP_SEQUENCE = ['indent-node', 'outdent-node', 'move-node-up', 'move-node-down'] as const;
/** A note with enough backlinks to have every control, for the last case. */
const HUB = 'Projects/Aurora Dashboard.md';
const WIDGET_SELECTOR = '.to-backlinks';

async function setFooter(on: boolean): Promise<void> {
  await browser.executeObsidian(async ({ plugins }, enabled) => {
    await (plugins.trueOutliner as any).setBacklinksFooter(enabled);
  }, on);
}

async function ensureOutlineMode(notePath: string): Promise<void> {
  await h.setOutlineMode(true);
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
  /** The document the four operations start from, so their round trip can be
   * asserted absolutely and not only across the two halves. */
  bufferBeforeOps: string;
  /** The document after each of the four operations, so a refused one shows up
   * as a step that changed nothing. */
  buffersDuringOps: string[];
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
  // The operand is the last TOP-LEVEL node rather than the last node in the
  // document. Both end the document, which is where the widget sits and what
  // this case is about, but only a top-level node here has a previous sibling
  // — and `indent-node` without one is refused.
  //
  // A refusal is invisible from the harness. `executeCommandById` reports that
  // the command RAN, because the operation declines inside it and says so with
  // a Notice, so `runCommand` resolves either way. An operand that cannot be
  // indented therefore turned one of the four into a silent no-op, which is why
  // the assertions below require each operation to change the document rather
  // than only checking where the sequence ends up.
  const lastTopLevelLine = lines.reduce(
    (last, text, i) => (text.trim() && !/^\s/.test(text) ? i : last),
    0,
  );
  // Settled, not merely set: `setCursorSettled` exists because a later,
  // unannotated selection dispatch can move a caret that was only just placed,
  // and it wins under mobile emulation where the plain set does not. Every
  // assertion about where a caret ENDS UP is still made after the gesture, so
  // settling the start cannot hide a placement bug.
  await h.setCursorSettled(lastTopLevelLine, 1);
  const bufferBeforeOps = await h.getBuffer();
  // The buffer after EACH command, not only after the four. A round trip that
  // returns the document unchanged is necessary but not sufficient: with a
  // top-level operand, a refused `indent-node` leaves `outdent-node` refused
  // too (`at-top-level`), and the move pair then cancels on its own — four
  // operations, two of them refused, and a document that came back anyway.
  // Requiring every step to CHANGE the document is what makes each one
  // demonstrably apply.
  const buffersDuringOps: string[] = [];
  for (const command of OP_SEQUENCE) {
    await h.runCommand(command);
    buffersDuringOps.push(await h.getBuffer());
  }
  const bufferAfterOps = buffersDuringOps[buffersDuringOps.length - 1] ?? bufferBeforeOps;
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
    bufferBeforeOps,
    buffersDuringOps,
    bufferAfterOps,
    caretAfterOps,
    bufferAfterUndoAll,
    classifications,
    trace,
  };
}

/**
 * Did each of the four operations change the document? A refused operation is
 * indistinguishable from one that applied — the command reports that it ran —
 * so the only evidence that it did anything is the document moving.
 *
 * Named per operation rather than positional: a failure has to say which
 * command declined, not leave the next reader to map an index back onto the
 * order they ran in.
 */
function changesPerOp(o: Observations): { command: string; changed: boolean }[] {
  const steps = [o.bufferBeforeOps, ...o.buffersDuringOps];
  return OP_SEQUENCE.map((command, i) => ({ command, changed: steps[i + 1] !== steps[i] }));
}

/** Every operation applied — what `changesPerOp` must report. */
const ALL_APPLIED = OP_SEQUENCE.map((command) => ({ command, changed: true }));

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
    await setFooter(false);
  });

  it('mounts exactly one widget in outline mode, and none off-mode', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);

    await setFooter(false);
    expect(await widgetCount()).toBe(0);

    await setFooter(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    expect(await widgetCount()).toBe(1);

    // Off-mode is the plugin's hard boundary everywhere else; the spike must not
    // be the one layer that ignores it.
    await h.setOutlineMode(false);
    expect(await widgetCount()).toBe(0);

    await h.setOutlineMode(true);
    await setFooter(false);
  });

  it('does not change caret placement, selection escalation, or structural ops', async function () {
    await setFooter(false);
    const without = await measure();

    await setFooter(true);
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
    expect(withWidget.buffersDuringOps).toEqual(without.buffersDuringOps);
    // Absolutely, in BOTH halves, and not only across them. The differential
    // comparison above cannot see an operation refused in both — it compares two
    // identical wrong answers and passes — which is the blind spot that let a
    // refused `indent-node` sit in this sequence unnoticed.
    //
    // Every step must have changed the document, which is the part a round trip
    // alone does not give: refusals can cancel each other and still return the
    // document unchanged.
    expect(changesPerOp(without)).toEqual(ALL_APPLIED);
    expect(changesPerOp(withWidget)).toEqual(ALL_APPLIED);
    expect(without.bufferAfterOps).toEqual(without.bufferBeforeOps);
    expect(withWidget.bufferAfterOps).toEqual(withWidget.bufferBeforeOps);
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

  /**
   * Reading the footer is not editing the note.
   *
   * The footer is a block widget inside a contenteditable, so a click in it is
   * a click in the editor as far as the browser is concerned: it puts a DOM
   * selection at the nearest editable position — the document's end — and
   * CodeMirror syncs from that. `ignoreEvent` does not prevent it, because that
   * governs whether CM6 HANDLES an event, not whether the browser sets a
   * selection before CM6 sees one.
   */
  it('does not move the caret when the footer is clicked', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await setFooter(true);

    await browser.executeObsidian(() => {
      const scroller = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);

    // The editor must be UNFOCUSED. That is what "the first interaction" means,
    // and it is the whole repro: with focus already in the editor the browser
    // has a selection to keep and nothing moves, so a test that clicks a
    // focused editor passes whether or not the fix is there. Measured both
    // ways before this was written.
    await browser.executeObsidian(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await browser.pause(200);
    const before = await h.getCursor();

    // A REAL click, driven by the browser rather than dispatched into it —
    // synthetic MouseEvents do not move the DOM selection, so a dispatched
    // click also passes either way.
    // `.to-backlinks-icon`, not `.to-backlinks-title`: the header carries TWO
    // title spans now (a short one for a narrow footer), and only one is ever
    // visible — the icon is unconditional and always in the same place.
    const icon = await $('.workspace-leaf.mod-active .to-backlinks .to-backlinks-icon');
    await icon.click();
    await browser.pause(300);

    // Without the fix this reports the document's very end, and the editor
    // takes focus with it.
    expect(await h.getCursor()).toEqual(before);
    const focused = await browser.executeObsidian(
      () =>
        document
          .querySelector('.workspace-leaf.mod-active .cm-editor')
          ?.classList.contains('cm-focused') ?? false,
    );
    expect(focused).toBe(false);
  });

  /**
   * Reading the footer is not editing the note, under every control.
   *
   * The mount case above asks whether the widget's PRESENCE perturbs anything.
   * This asks the same question of its use — because the controls are the parts
   * that take keystrokes and focus, and a keystroke that misses the search field
   * lands in the document. That is not hypothetical: the footer prevents the
   * default on pointerdown to keep the editor's caret, and the first cut of that
   * guard stopped the search field focusing at all, which is precisely the state
   * in which typing a filter term would have typed it into the note.
   *
   * So a real edit is made first and undone last: if any control had pushed a
   * transaction into history, the single undo would revert that instead and the
   * buffer would not come back.
   */
  it('changes nothing in the document under filtering, search, sort, caps or load more', async function () {
    await setFooter(true);
    // A small cap before the footer is ever built. The hub has ~128 sources and
    // this case cares about the CONTROLS, not the volume — 78 is where the cap
    // is the subject. Twenty-five still leaves every facet populated and a tail
    // rung to press.
    await browser.executeObsidian(async ({ plugins }) => {
      await (plugins.trueOutliner as any).setBacklinksOverallCap('25');
    });
    await openFooter(HUB);

    const original = await h.getBuffer();
    // A BODY line, found by content: `setCursor(1, …)` would land in the
    // frontmatter, where an edit is not the ordinary case this asserts about.
    const line = original.split('\n').findIndex((text) => text.startsWith('Redesign of'));
    expect(line).toBeGreaterThan(0);
    await h.setCursor(line, 5);
    await h.keys.type('x');
    const edited = await h.getBuffer();
    expect(edited).not.toBe(original);
    await h.saveActiveFile();

    const before = {
      buffer: edited,
      disk: await h.readVaultFile(HUB),
      length: edited.length,
      caret: await h.getCursor(),
      selection: await h.getSelection(),
    };

    // Back to the footer before touching it. Typing scrolled the editor to the
    // caret, which on a narrow viewport leaves the footer outside CodeMirror's
    // rendered range entirely — the control is not off screen, it does not
    // exist. `scrollToFooter` is what handles that, and why it scrolls more
    // than once. Caret and selection are read from editor STATE, so scrolling
    // cannot affect what they compare.
    await scrollToFooter();

    // Every control, in one pass.
    await openFilters();
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="folder"]`);
    await clickIn(`${FOOTER} .to-backlinks-facet-option`);
    await clickIn(`${FOOTER} .to-backlinks-facet[data-axis="kind"]`);
    await clickIn(`${FOOTER} .to-backlinks-facet-option`);
    await focusSearch();
    await browser.keys('a');
    await browser.pause(600);
    // `.to-backlinks-sort` is a BUTTON now, not a `<select>` — it opens a
    // popover on `click`, and has no `.value`/`change` to drive. Setting the
    // sort here is not testing the CONTROL (77 does that); it is one of the
    // "every setting" changes this case checks causes no document mutation,
    // so the plugin's own setter is the direct way to make it happen.
    await browser.executeObsidian(async ({ plugins }) => {
      const plugin = plugins.trueOutliner as any;
      await plugin.setBacklinksSort('name');
      await plugin.setBacklinksOverallCap('50');
      await plugin.setBacklinksGroupHeight('compact');
    });
    await settle();
    await clearFilters();
    await settle();
    const loadMore = await browser.executeObsidian(
      () => document.querySelector('.workspace-leaf.mod-active .to-backlinks-load-more') !== null,
    );
    if (loadMore) {
      await clickIn(`${FOOTER} .to-backlinks-load-more`);
      await settle();
    }

    await h.saveActiveFile();
    const after = {
      buffer: await h.getBuffer(),
      disk: await h.readVaultFile(HUB),
      length: (await h.getBuffer()).length,
      caret: await h.getCursor(),
      selection: await h.getSelection(),
    };

    expect(after.buffer).toBe(before.buffer);
    expect(after.disk).toBe(before.disk);
    expect(after.length).toBe(before.length);
    expect(after.caret).toEqual(before.caret);
    expect(after.selection).toEqual(before.selection);

    // The undo stack is where a silent write would still show. One undo, and
    // the note is back — which it would not be if a control had put an entry of
    // its own on top of the edit.
    await h.setCursor(before.caret.line, before.caret.ch);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(original);
    await h.saveActiveFile();

    await browser.executeObsidian(async ({ plugins }) => {
      const plugin = plugins.trueOutliner as any;
      await plugin.setBacklinksOverallCap('50');
      await plugin.setBacklinksGroupHeight('standard');
      await plugin.setBacklinksSort('recent');
    });
    await setFooter(false);
  });

  it('leaves the document byte-identical after mounting and unmounting', async function () {
    await h.openNote(NOTE);
    await ensureOutlineMode(NOTE);
    await setFooter(false);
    const before = await h.getBuffer();

    await setFooter(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    await setFooter(false);

    expect(await h.getBuffer()).toBe(before);
    // A single undo must revert a real prior edit, not an entry the widget's
    // mount/unmount interposed — the same proof 53-decoration-contracts uses.
    await h.setCursor(0, 0);
    await h.keys.type('x');
    const edited = await h.getBuffer();
    await setFooter(true);
    await h.waitForContentChildCount(WIDGET_SELECTOR, 1);
    await setFooter(false);
    await h.keys.undo();
    expect(await h.getBuffer()).toBe(before);
    expect(edited).not.toBe(before);
  });
});
