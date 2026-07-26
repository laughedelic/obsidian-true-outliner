/**
 * content-space-caret e2e (openspec/changes/content-space-caret): caret
 * placement and motion in outline mode, driven through real keyboard/mouse
 * input against real Obsidian — matching this project's practice of
 * exercising keymap-adjacent behavior end-to-end rather than only via the
 * pure `src/caret.ts` unit/property tests. Scenario numbering follows the
 * change's own examples.md (sections A-G); each `it` names the example it
 * covers.
 *
 * The very first test also closes tasks.md 0.5: it's the empirical check
 * that binding Home in the plugin's own Prec.highest keymap actually wins
 * the key exactly once, rather than double-firing alongside Obsidian's own
 * (unannotated, `programmatic`-classified) Home dispatch — the same stats-
 * counter technique docs/research/04's Q19/Q21 already used.
 */

import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import * as h from '../helpers.js';

const NOTE = 'Scratch/content-space-caret.md';

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
}

describe('content-space-caret', function () {
  before(async function () {
    await obsidianPage.resetVault();
    await h.resetPluginState();
  });

  afterEach(async function () {
    await h.dismissNotices();
  });

  it('0.5: a single Home press lands at content start and the position holds (no native double-fire corrupting it)', async function () {
    // Measured (see docs/research/04): a real-keyboard-driven selection
    // change in this Obsidian version is always followed ~10ms later by an
    // unrelated `programmatic` transaction (confirmed independently of this
    // change, via a DECLINED key that falls through to 100% stock CM6) —
    // it never touches the caret. So the meaningful check for "our binding
    // truly won the key, not a double-fire that landed native Home inside
    // the marker afterward" is the FINAL, SETTLED position, not a raw
    // transaction count.
    await outlineNote('- bravo\n');
    await h.setCursor(0, 5); // "- br|avo"
    await h.keys.home();
    expect(await h.getCursor()).toEqual({ line: 0, ch: 2 }); // "- |bravo" — never column 0
    await browser.pause(80); // let any trailing background transaction settle
    expect(await h.getCursor()).toEqual({ line: 0, ch: 2 }); // still there, undisturbed
  });

  describe('A. Vertical motion', function () {
    it('A1 - down across a gap: one press, one node, column preserved', async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.setCursor(0, 7); // "Alpha o|ne."
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 7 }); // "Bravo t|wo."
    });

    it('A2 - down over a short node, three presses: goal column approximately survives', async function () {
      // Measured (see docs/research/04): the goal column is tracked as a
      // PIXEL offset, not a character count (this handler intercepts the
      // key itself rather than delegating to `@codemirror/commands`'
      // cursorLineDown, so it has to re-derive column intent itself — see
      // keymap.ts's `verticalGoalColumn`). Re-deriving a character column
      // from that same pixel offset on a DIFFERENT line, after bouncing off
      // a shorter node, can land off by a character under a non-monospace
      // font, where "Alpha o" and "Charlie" don't render at quite the same
      // per-character width — examples.md A2 already carries this exact
      // reservation ("carried reservation... not from a felt problem").
      // The direct, no-bounce cases (A1/A3/A4/A5) land pixel-exact.
      await outlineNote('Alpha one.\n\nHi\n\nCharlie three.\n');
      await h.setCursor(0, 7);
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 2 }); // clamped to "Hi"'s own end
      await h.keys.down();
      const cursor = await h.getCursor();
      expect(cursor.line).toBe(4);
      expect(cursor.ch).toBeGreaterThanOrEqual(6);
      expect(cursor.ch).toBeLessThanOrEqual(8); // column ~restored, +/-1 under a proportional font
    });

    it('A6 - down through a soft-wrapped (no real newline) long paragraph progresses row by row, then crosses to the next node', async function () {
      // Real-vault finding (docs/research/04 Q24): an earlier fix that
      // resolved vertical motion's target line by walking raw document
      // line NUMBERS broke this entirely — a wrapped paragraph is ONE raw
      // line, so that approach jumped straight over every wrapped row to
      // the next raw line on the very first press. This is the regression
      // guard for that: repeated presses must progress THROUGH the wrap,
      // not skip it.
      const longLine = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ') + '.';
      await outlineNote(`Before.\n\n${longLine}\n\nAfter.\n`);
      await h.setCursor(2, 5);
      const seen = new Set<string>();
      let reachedAfter = false;
      // A generous bound, not tied to any specific viewport width — a
      // narrower render column (mobile emulation) wraps the same text into
      // more rows, needing more presses to traverse; this only cares that
      // it eventually terminates, not how many presses that takes.
      for (let i = 0; i < 30 && !reachedAfter; i++) {
        await h.keys.down();
        const cursor = await h.getCursor();
        if (cursor.line === 4) {
          reachedAfter = true;
        } else {
          expect(cursor.line).toBe(2); // still the SAME node, never skipped to "After." early
          seen.add(`${cursor.ch}`);
        }
      }
      expect(reachedAfter).toBe(true);
      expect(seen.size).toBeGreaterThan(1); // progressed through more than one distinct row
    });

    it('A3 - up across a gap', async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.setCursor(2, 7); // "Bravo t|wo."
      await h.keys.up();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 7 }); // "Alpha o|ne."
    });

    it('A4 - down at the last node lands on content end, a further press does nothing', async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.setCursor(2, 3);
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 'Bravo two.'.length });
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 'Bravo two.'.length });
    });

    it('A5 - down onto a marker line clamps, it does not skip (unchanged)', async function () {
      // The goal column (1) must genuinely fall inside "- item"'s own
      // marker span (columns 0-2) once CM6 translates it onto this line —
      // a source column long enough that CM6 itself clamps to the SHORT
      // line's end wouldn't exercise this path at all (that end position
      // is already >= the marker boundary, so it needs no correction).
      await outlineNote('ab\n- item\n');
      await h.setCursor(0, 1); // "a|b"
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // "- |item"
    });
  });

  describe('B. Horizontal motion', function () {
    it("B1 - left at a list item's content start escapes backwards", async function () {
      await outlineNote('- alpha\n- bravo\n');
      await h.setCursor(1, 2); // "- |bravo"
      await h.keys.left();
      expect(await h.getCursor()).toEqual({ line: 0, ch: '- alpha'.length });
    });

    it("B2 - right at a list item's end skips the next item's marker (unchanged)", async function () {
      await outlineNote('- alpha\n- bravo\n');
      await h.setCursor(0, '- alpha'.length);
      await h.keys.right();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
    });

    it('B3 - left at a paragraph start crosses the gap above', async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.setCursor(2, 0);
      await h.keys.left();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 'Alpha one.'.length });
    });

    it('B4 - right at a paragraph end crosses the gap below', async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.setCursor(0, 'Alpha one.'.length);
      await h.keys.right();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 0 });
    });

    it("B5 - left at the document's first node is a silent no-op", async function () {
      await outlineNote('- alpha\n- bravo\n');
      await h.setCursor(0, 2);
      await h.keys.left();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
    });

    it('B6 - right crossing into a checkbox list item lands on its content start and holds there (checkbox syntax is content, matching C8; see docs/research/04 Q25 for the widget-mount interference this guards against)', async function () {
      await outlineNote('- alpha\n- [ ] beta gamma\n');
      await h.setCursor(0, '- alpha'.length);
      await h.keys.right();
      await browser.pause(80); // let the one-shot checkbox-widget-mount interference (if any) resolve
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
    });
  });

  // ---------------------------------------------------------------------------
  // Keymap liveness. Everything else in this file asserts an OUTCOME — where
  // the caret ended up — and an outcome is not evidence that our keymap ran.
  // The transaction filter corrects native motion after the fact, so native
  // Home plus filter clamping produces caret positions indistinguishable from
  // our handler doing the work. Three successive rewrites of the Home/End
  // logic passed every outcome test in this file while, on the reporter's own
  // Obsidian build, Home was never routed to our keymap at all
  // (docs/research/04 Q27). These tests assert the mechanism instead.
  // ---------------------------------------------------------------------------
  describe('keymap liveness (mechanism, not outcome)', function () {
    it('every bound motion key is actually ROUTED to this plugin\'s keymap and consumed', async function () {
      await outlineNote('- alpha bravo\n- charlie delta\n');
      await h.setCursor(0, 5);
      await h.resetMotionCounts();

      // One press each, from a position where our handler should consume it.
      await h.keys.home();
      await h.keys.end();
      await h.setCursor(0, 5);
      await h.keys.right();
      await h.keys.left();
      await h.keys.down();
      await h.keys.up();

      const counts = await h.getMotionCounts();
      for (const key of ['Home', 'End', 'Left', 'Right', 'Down', 'Up']) {
        // `invoked` proves CM6 routed the key here at all — the thing that was
        // silently false for Home; a key missing from the record entirely is
        // that failure. `consumed` proves we actually handled it: without this
        // second assertion a key that started DECLINING would still pass, since
        // native motion plus the filter can produce a correct-looking caret —
        // which is precisely the blind spot these tests exist to close.
        expect(counts[key]?.invoked ?? 0).toBeGreaterThan(0);
        expect(counts[key]?.consumed ?? 0).toBeGreaterThan(0);
      }
    });

    it('Home and End are consumed by us, not merely followed by a correct-looking caret', async function () {
      await outlineNote('- alpha bravo\n');
      await h.setCursor(0, 8);
      await h.resetMotionCounts();
      await h.keys.home();

      const counts = await h.getMotionCounts();
      expect(counts['Home']?.invoked ?? 0).toBe(1);
      expect(counts['Home']?.consumed ?? 0).toBe(1); // we handled it; native did not
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
    });
  });

  // Review findings (PR #31), both real defects the outcome-oriented suite missed.
  describe('E. Guards the motion handlers depend on', function () {
    /** Two carets, built through CM6 directly — Obsidian's Editor API exposes
     * only a single range. `EditorSelection` is reached off the live selection's
     * own constructor rather than imported, since this runs in the app. */
    const makeTwoCarets = (): Promise<number> =>
      browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view!.editor as any).cm;
        const ES = cm.state.selection.constructor;
        const a = cm.state.doc.line(1).from + 4;
        const b = cm.state.doc.line(2).from + 4;
        cm.dispatch({ selection: ES.create([ES.cursor(a), ES.cursor(b)], 1) });
        return cm.state.selection.ranges.length;
      });

    const rangeCount = (): Promise<number> =>
      browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return (view!.editor as any).cm.state.selection.ranges.length;
      });

    it('a bound motion key DECLINES under multi-cursor instead of collapsing the selection to one caret', async function () {
      // The handlers plan from `selection.main` while dispatchCursor replaces
      // the WHOLE selection, so without a guard one keypress silently discarded
      // every other cursor — lost editing state with no undo entry to show for
      // it, since a selection change is not a document change.
      await outlineNote('- alpha bravo\n- charlie delta\n');
      expect(await makeTwoCarets()).toBe(2);

      await h.keys.home();
      expect(await rangeCount()).toBe(2); // both survive; the key fell through to native

      await h.keys.down();
      expect(await rangeCount()).toBe(2);
    });

    it('motion handlers do NOT fire inside a nested table-cell editor', async function () {
      // `registerEditorExtension` installs this keymap in the per-cell editor
      // too, and `editorInfoField` resolves to the same outer note there, so
      // without a DOM-ancestry guard the handlers moved the caret by outline
      // rules through a document that is only the cell's raw text. Measured
      // before the guard: Home, Right and ArrowDown all invoked AND consumed
      // with focus inside `.cm-embed-block` (docs/research/04 Q27).
      await outlineNote('# S\n\n| a | b |\n| --- | --- |\n| word | 2 |\n');
      await h.clickTableCell();
      await h.resetMotionCounts();

      await h.keys.home();
      await h.keys.right();
      await h.keys.down();

      const counts = await h.getMotionCounts();
      for (const key of ['Home', 'Right', 'Down']) {
        expect(counts[key]?.consumed ?? 0).toBe(0); // native handles the cell
      }
    });

    it('the transaction FILTER also declines on a nested cell, so its keystrokes are never classified', async function () {
      // The keymap guard alone is not enough. `editorInfoField` resolves to the
      // same outline-mode host file inside a cell, so the filter treated the
      // cell's own tiny document as an outline — and a cell whose text starts
      // with `- ` parses as a list item, so stock motion inside it was clamped
      // off a "marker" that is really the user's text. Both halves did it
      // (`selection-only` escalation and the `programmatic` marker clamp), so
      // the whole filter now declines on a nested state.
      //
      // Asserted through the filter's OWN stats rather than the nested caret:
      // the gate sits before `stats.record`, so "never classified" is exactly
      // the claim, and it holds however the cell's text happens to parse. A
      // cell reading `word` could never have shown the bug at all.
      //
      // `selection-only` specifically, because that is the class the cell's own
      // motion produces (userEvent `select`) — measured at 1 before the fix and
      // 0 after. The residual `programmatic` count is the OUTER editor's own
      // sync and focus work while a cell is open, which is legitimate and not
      // what this guards.
      await outlineNote('# S\n\n| a | b |\n| --- | --- |\n| word | 2 |\n');
      await h.clickTableCell();

      // Make the cell's text parse as a list item, then move within it.
      await h.keys.home();
      await h.keys.type('- ');
      await browser.pause(120);
      await h.resetStats();

      await h.keys.home();
      await h.keys.end();
      await h.keys.left();
      await browser.pause(150);

      expect((await h.getStats()).counts['selection-only'] ?? 0).toBe(0);
    });

    it('within-line horizontal motion follows the VISUAL direction, so ArrowRight moves left through RTL text', async function () {
      // `planHorizontal` reasons in logical offsets, and logical order is not
      // visual order: in an RTL run, visual right is a DECREASING offset. The
      // adapter now asks CM6 for ordinary within-line steps, flipping `forward`
      // by `textDirectionAt` exactly as CM6's own cursorCharLeft/Right do —
      // measured: the flip lives in the command, not in `moveByChar`, which
      // returns logical offsets even where the direction is RTL.
      //
      // Asserted as the SIGN of the offset change, which is what actually
      // differs between logical and visual motion. An earlier version of this
      // test only checked that Left and Right disagreed, and passed with the
      // delegation disabled — it could not fail, so it tested nothing.
      await outlineNote('- \u05e9\u05dc\u05d5\u05dd \u05e2\u05d5\u05dc\u05dd\n- hello world\n');

      await h.setCursor(0, 6); // inside the RTL run, past the "- " marker
      await h.keys.right();
      expect((await h.getCursor()).ch).toBeLessThan(6); // visual right = earlier in the string
      await h.setCursor(0, 6);
      await h.keys.left();
      expect((await h.getCursor()).ch).toBeGreaterThan(6);

      // The same handler on an LTR line still moves the ordinary way.
      await h.setCursor(1, 5);
      await h.keys.right();
      expect((await h.getCursor()).ch).toBe(6);
      await h.setCursor(1, 5);
      await h.keys.left();
      expect((await h.getCursor()).ch).toBe(4);
    });

    it('a horizontal move between vertical presses RESETS the goal column', async function () {
      // The memory was keyed on head alone, and a head can return to where the
      // last vertical press left it: move down from a long line onto a short
      // one, then Left and Right. A head-only check called the next Down a
      // continuation and restored the old column, when the horizontal move
      // should have started a fresh chain from where the caret actually is.
      const long = 'alpha bravo charlie delta echo';
      await outlineNote(`${long}\n\nhi\n\n${long}\n`);
      await h.setCursor(0, 25); // deep into the long first line
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 2 }); // clamped to "hi"'s end

      // Interrupt the chain, returning the head to exactly where it was.
      await h.keys.left();
      await h.keys.right();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 2 });

      // A fresh chain: column 2, not the remembered 25.
      await h.keys.down();
      expect(await h.getCursor()).toEqual({ line: 4, ch: 2 });
    });

    it('Home/End collapsing an escalated selection never leave the caret on its trailing gap', async function () {
      // An escalated boundary-crossing cover ENDS on the last node's trailing gap
      // by design (escalate-include-owned-gap), so a collapse to the head lands
      // there. Home/End used to decline on a non-empty selection and let native
      // motion collapse, on the assumption that the filter would resolve the
      // result — it does not: a native collapse carries no `userEvent`, so it
      // classifies `programmatic` and gets marker resolution only, never the gap
      // half. Measured before the fix: the caret sat on line 3, a blank line.
      //
      // Built with Shift+ArrowDown rather than a drag. A drag reaches the same
      // shape but only on desktop — under Chrome's mobile emulation a drag's move
      // phase misbehaves, which is why the drag tests in
      // 63-selection-visual-treatment skip on mobile. Keyboard extension
      // escalates identically (measured: anchor 0:0, head 3:0), so this covers
      // both runs and cannot pick up drag flake.
      await outlineNote('First paragraph.\n\nSecond paragraph.\n');
      await h.setCursor(0, 6);
      await browser.keys([Key.Shift, Key.ArrowDown]);
      await browser.keys([Key.Shift, Key.ArrowDown]);

      const escalated = await h.getSelection();
      expect(escalated.head).toEqual({ line: 3, ch: 0 }); // the trailing gap

      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 0 }); // resolved onto content

      await h.setCursor(0, 6);
      await browser.keys([Key.Shift, Key.ArrowDown]);
      await browser.keys([Key.Shift, Key.ArrowDown]);
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 2, ch: 'Second paragraph.'.length });
    });

    it('Home on a PROGRAMMATIC gap-line caret moves it onto content instead of consuming the key', async function () {
      // A programmatic placement is deliberately left on a gap (D2 scopes gap
      // resolution to real user gestures). Home used to read that gap as an
      // empty node line, compute a target equal to the current position, and
      // consume the key while doing nothing — a dead keypress on a caret that
      // was already somewhere it should not stay.
      await outlineNote('First.\n\nSecond.\n');
      await h.setSelection({ line: 1, ch: 0 }, { line: 1, ch: 0 });
      expect(await h.getCursor()).toEqual({ line: 1, ch: 0 }); // still on the gap, by design

      // Resolves off the gap to the owning node, then applies the ordinary
      // one-rung rule from there — so Home ends at that line's content start.
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
    });

    it('End on a PROGRAMMATIC gap-line caret likewise lands on the owning node\'s content end', async function () {
      await outlineNote('First.\n\nSecond.\n');
      await h.setSelection({ line: 1, ch: 0 }, { line: 1, ch: 0 });
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 'First.'.length });
    });
  });

  describe('C. Home and End', function () {
    it('C1 - Home reaches content start in one press (unchanged)', async function () {
      await outlineNote('- bravo\n');
      await h.setCursor(0, 4);
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
    });

    it('C2 - Home twice does nothing on the second press, never reaching the marker (one rung: idempotent by construction)', async function () {
      await outlineNote('- bravo\n');
      await h.setCursor(0, 4);
      await h.keys.home();
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 });
    });

    it('C3 - End on a single-line node (unchanged)', async function () {
      await outlineNote('- bravo\n');
      await h.setCursor(0, 4);
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 0, ch: '- bravo'.length });
    });

    it("C4 - Home in a multiline node takes the caret's OWN line start and stays there (one rung — it does not climb to the node)", async function () {
      await outlineNote('- first line of the item\n  second line of the item\n- next item\n');
      await h.setCursor(1, '  second'.length);
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // this line's own content start
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // stays — no escalation to line 0
    });

    it('C7 - Home on a SOFT-WRAPPED line goes to that raw line\'s start, not the visual row\'s start (one rung is deliberately not wrap-aware)', async function () {
      // The escalating ladder's first rung used to be the current VISUAL ROW
      // (`moveToLineBoundary(..., includeWrap: true)`). One rung drops that
      // entirely: the target comes from the parsed line, so a caret deep in a
      // wrapped line jumps all the way out to the line's own content start in
      // a single press. See docs/research/04 Q26 for why the geometry went.
      const longCont = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
      await outlineNote('- first\n- next\n');
      await h.setCursor(0, 'first'.length + 2);
      await h.keys.shiftEnter();
      await h.keys.type(longCont);
      const midWrap = await h.getCursor();
      expect(midWrap.line).toBe(1);
      expect(midWrap.ch).toBeGreaterThan(40); // deep into a line that wraps several times

      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // the RAW line's start, in one press
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 }); // stays
    });

    it('C9 - the user-reported shape: a hard-break multiline node whose last line ALSO soft-wraps — Home lands on that raw line\'s start in ONE press and stays (docs/research/04 Q26)', async function () {
      // This is the scenario that retired escalation altogether. Under the
      // ladder it read as "Home gets stuck mid-paragraph": the presses meant
      // different things depending on where the previous one had left the
      // caret and where the renderer happened to wrap. One rung makes every
      // press mean the same thing, and never crosses a hard line break.
      const second =
        'second line is much longer and gets soft-wrapped to the third line and keeps going well past the width so it wraps';
      await outlineNote(`paragraph text\n${second}\n\nNext.\n`);

      await h.setCursor(1, second.length - 6); // last visual row of line 1
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 0 }); // straight out to the raw line's start
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 0 }); // stays — never climbs to line 0

      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 1, ch: second.length }); // that line's end
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 1, ch: second.length }); // stays
    });

    it('C10 - an UNINDENTED list continuation is TWO nodes, which is why "Home won\'t reach the block start" was reported: that line\'s own start already IS its block start', async function () {
      // `- item` + a continuation that is NOT indented parses as two separate
      // single-line nodes (measured against src/parse), where an INDENTED one
      // would be a single two-line node.
      //
      // Under the one-rung rule that parse difference no longer changes what
      // Home does — it takes the caret's own line either way and never crosses a
      // hard break, exactly as C9 asserts. The distinction is kept as a test
      // because it explains a report ("Home won't reach the block start"): with
      // two nodes the caret's own line start already IS its block start, so
      // there was never anything above to reach. An earlier revision of this
      // comment claimed indenting made Home cross, which was true of the
      // two-rung ladder and is not true of what ships.
      await outlineNote('- paragraph text\nsecond line here\n');
      await h.setCursor(1, 8);
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 0 });
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 1, ch: 0 }); // its own block start already
    });

    it("C8 - a checkbox list item (`- [ ] text`) is treated as an ordinary list item — checkbox syntax is content, not a second layer of chrome — and the dispatched position survives Obsidian's checkbox-widget mount", async function () {
      // Measured (docs/research/04 Q25): a checkbox renders as an
      // interactive widget in Live Preview, and its mount dispatches a
      // selection change of Obsidian's OWN — no userEvent, no annotations,
      // traced to app.js — that moves the caret back to column 0, onto the
      // marker. It classifies `programmatic`, so the transaction filter
      // used to wave it through; `resolveForeignCursors` in
      // transaction-filter.ts now clamps it back off the marker. The pause
      // below is what makes this test meaningful: it asserts the SETTLED
      // position, after Obsidian's own late dispatch has landed.
      await outlineNote('- [ ] alpha beta\n');
      await h.setCursor(0, 10);
      await h.keys.home();
      await browser.pause(80); // let the one-shot widget-mount interference (if any) resolve
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 }); // "- " is chrome; "[ ] alpha beta" is content
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 2 }); // single-line collapse: further presses do nothing
    });

    it("C5 - End in a multiline node takes the caret's OWN line end and stays there (one rung)", async function () {
      await outlineNote('- first line of the item\n  second line of the item\n- next item\n');
      const firstLine = '- first line of the item';
      await h.setCursor(0, firstLine.indexOf('line of'));
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 0, ch: firstLine.length }); // this line's end
      await h.keys.end();
      expect(await h.getCursor()).toEqual({ line: 0, ch: firstLine.length }); // stays — no escalation to line 1
    });

    it('C6 - Home reaches content start in one step, second press does nothing', async function () {
      await outlineNote('Alpha one.\n');
      await h.setCursor(0, 7);
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
    });
  });

  describe('D. Mouse', function () {
    it("D1 - click on a gap line lands at the node above's content end", async function () {
      await outlineNote('Alpha one.\n\nBravo two.\n');
      await h.clickAt(1, 0);
      expect(await h.getCursor()).toEqual({ line: 0, ch: 'Alpha one.'.length });
    });

    it('D2 - click on a marker lands on content start (unchanged)', async function () {
      await outlineNote('- alpha\n- bravo\n');
      await h.clickAt(1, 0);
      expect(await h.getCursor()).toEqual({ line: 1, ch: 2 });
    });
  });

  describe('F. Headings', function () {
    it("F1 - a heading's # prefix stays addressable", async function () {
      await outlineNote('## Some heading\n');
      await h.setCursor(0, 8);
      await h.keys.home();
      expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
    });

    it('F2 - motion across a heading\'s gap behaves like any other node pair', async function () {
      // Asserts the GAP SKIP, which is what this scenario is about, and
      // deliberately not the exact landing column. Vertical motion preserves the
      // caret's horizontal PIXEL position (as native CM6 does), so crossing from
      // an h1 into body text — a large font into a small one — lands at whatever
      // character column sits under that x. That column is a font metric, not a
      // behavior: measured as ch 5 on macOS/1.12.7, 6 on macOS/1.13.3, and 7 on
      // linux/1.12.7 (CI, both desktop and mobile emulation), all from the same
      // code. An earlier revision asserted `ch: 5` and so encoded one machine's
      // font rendering as the contract; it passed locally and failed CI.
      await outlineNote('# Heading\n\nBody text.\n');
      await h.setCursor(0, 5);
      await h.keys.down();
      const cursor = await h.getCursor();
      expect(cursor.line).toBe(2); // the gap at line 1 is skipped, never landed on
      expect(cursor.ch).toBeGreaterThan(0); // roughly column-preserving, not reset to the line start
      expect(cursor.ch).toBeLessThanOrEqual('Body text.'.length);
    });
  });

  describe('G. Frontmatter and the preamble', function () {
    it("D10 - Left at the first node's content start, WITH a preamble above, is NOT a silent no-op (enters the preamble, unlike B5's no-preamble case)", async function () {
      await outlineNote('---\ntitle: Note\n---\n\nAlpha one.\n');
      const bodyLine = 4; // "Alpha one." — the first real node
      await h.setCursor(bodyLine, 0);
      await h.keys.left();
      const cursor = await h.getCursor();
      // The preamble is out of this change's jurisdiction (D10): motion
      // there is stock, so ArrowLeft here must not be clamped into a
      // document-boundary no-op the way B5 is when there's no preamble.
      expect(cursor.line).toBeLessThan(bodyLine);
    });
  });

  describe('Off-mode reference', function () {
    it('every bound motion key is untouched native behavior outside outline mode', async function () {
      const offNote = 'Scratch/content-space-caret-off.md';
      const md = '- alpha\n- bravo\n';
      await h.createNote(offNote, md);
      expect(await h.isOutlineMode(offNote)).toBe(false);

      await h.setCursor(1, 2); // "- |bravo"
      await h.keys.left();
      // Stock CM6: ArrowLeft from column 2 moves to column 1 (still inside
      // the marker) — never escalated to the previous item's end.
      expect(await h.getCursor()).toEqual({ line: 1, ch: 1 });

      await h.setCursor(0, 0);
      await h.keys.home();
      // Stock Home at column 0 of the first line: no-op (already there).
      expect(await h.getCursor()).toEqual({ line: 0, ch: 0 });
    });
  });
});
