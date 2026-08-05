/**
 * node-selection-extension e2e (openspec/changes/node-selection-extension):
 * Shift+Arrow stepping one node per press along the cover sequence, driven
 * through real keyboard input rather than only through `select-extend.ts`'s
 * unit and property tests — the same practice
 * `64-progressive-select-all.e2e.ts` follows for the Mod-A ladder.
 *
 * This file also owns the keyboard-crossing coverage that used to live in
 * `61-selection-enforcement.e2e.ts`. After this change Shift+Arrow is a bound
 * command that dispatches exact covers, so it never reaches escalation at all;
 * an assertion left in that file would document a mechanism that no longer
 * runs. `selection-as-subtree-set`'s task 6.1 left it there deliberately for
 * this change to take.
 */

import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import * as h from '../helpers.js';

const NOTE = 'Scratch/node-selection-extension.md';
const SELECTED_CLASS = 'to-decor-node-selected';

/** classList of whatever element renders logical (0-based) line `lineNumber`
 * — the same technique `63-selection-visual-treatment.e2e.ts` uses. */
async function classListAtLine(lineNumber: number): Promise<string[]> {
  return browser.executeObsidian(
    ({ app, obsidian }, lineNumber) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const pos = cm.state.doc.line(lineNumber + 1).from;
      const { node } = cm.domAtPos(pos);
      const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const el = start?.closest('.cm-line, .cm-embed-block');
      return el ? Array.from(el.classList) : [];
    },
    lineNumber,
  );
}

async function outlineNote(content: string): Promise<void> {
  await h.createNote(NOTE, content);
  if (!(await h.isOutlineMode(NOTE))) {
    await h.toggleOutlineMode();
    await h.waitForNotice('Outline mode on');
    await h.dismissNotices();
  }
  await h.setBuffer(content);
}

/** Give the editor DOM focus. `dispatchSelectOnlyRanges` sets the selection
 * through the CM6 API without focusing, and a blurred editor never sees
 * `keydown` — on desktop the editor happened to be focused already, so the
 * multi-cursor tests below passed there and did nothing at all under mobile
 * emulation (measured: the ranges came back byte-identical). Block-selection
 * mode's own `onDocumentKeyDown` path does not cover this, and correctly so:
 * two CURSORS are not a cover, so the editor is not in the mode. */
async function focusEditor(): Promise<void> {
  await browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
    (view.editor as any).cm.focus();
  });
}

const down = (): Promise<void> => browser.keys([Key.Shift, Key.ArrowDown]);
const up = (): Promise<void> => browser.keys([Key.Shift, Key.ArrowUp]);

/** The selection as an inclusive line span plus orientation — the same
 * observable form the unit tests assert in, so a failure here and a failure
 * there read the same way. */
async function span(): Promise<string> {
  const sel = await h.getSelection();
  const backward =
    sel.head.line < sel.anchor.line ||
    (sel.head.line === sel.anchor.line && sel.head.ch < sel.anchor.ch);
  const lo = backward ? sel.head : sel.anchor;
  const hi = backward ? sel.anchor : sel.head;
  return `${lo.line}..${hi.line} ${backward ? 'back' : 'fwd'}`;
}

describe('node-selection-extension: one node per press', () => {
  it('E2 — a tight list item takes ONE node, not two', async () => {
    // The headline regression: today's behavior grabs two items here purely
    // because no blank line separates them.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe('0..0 fwd');
  });

  it('E1 — a loose paragraph takes its node and its owned gap', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    expect(await span()).toBe('0..1 fwd');
  });

  it('E3 — a parent takes its whole subtree in one press', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down();
    expect(await span()).toBe('0..2 fwd');
  });

  it('a heading extends by its whole section', async () => {
    await outlineNote('# Head\n\nBody one.\n\n# Next\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe('0..3 fwd');
  });

  it('a press that would not change the cover is skipped, not spent', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down();
    await down();
    // Reaches `- next` rather than spending two presses on covered children.
    // 0..4, not 0..3: the buffer's trailing newline is `- next`'s own gap
    // line, and a subtree cover always takes its owned gap in full.
    expect(await span()).toBe('0..4 fwd');
  });
});

describe('node-selection-extension: a multiline node keeps character selection (D11)', () => {
  // A node can own several lines — a paragraph broken across source lines, a
  // code fence, a table. Inside one, extension is ordinary text selection and
  // has nothing to do with the outline. The first implementation took over on
  // the first press and made a multiline node's interior unreachable.
  const MULTILINE = 'Line one of a para\nline two of it\n\nNext node.\n';

  it('extends line-wise INSIDE the node, without block-selecting it', async () => {
    await outlineNote(MULTILINE);
    await h.setCursor(0, 5);
    await down();
    const sel = await h.getSelection();
    // Still a character range: the anchor kept its column, and the head moved
    // one line rather than snapping to a node boundary.
    expect(sel.anchor).toEqual({ line: 0, ch: 5 });
    expect(sel.head.line).toBe(1);
    expect(await classListAtLine(0)).not.toContain(SELECTED_CLASS);
  });

  it('takes over at the node boundary, one press later', async () => {
    await outlineNote(MULTILINE);
    await h.setCursor(0, 5);
    await down(); // within the node — native
    await down(); // would leave the node — the sequence takes over
    expect(await span()).toBe('0..2 fwd'); // the node's whole cover, gap included
    expect(await classListAtLine(0)).toContain(SELECTED_CLASS);
  });

  it('extends line-wise upward inside the node too', async () => {
    await outlineNote(MULTILINE);
    await h.setCursor(1, 5);
    await up();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 1, ch: 5 });
    expect(sel.head.line).toBe(0);
  });

  it('a soft-WRAPPED paragraph is one source line but many rows, and stays character-level', async () => {
    // The shape that exposed the first fix as incomplete. This paragraph is a
    // SINGLE source line; it only looks multiline because it wraps. Deciding
    // from source lines alone made it look like a single-line node and
    // block-select on the first press, while a paragraph genuinely broken
    // across two source lines behaved correctly in the same file.
    const long = 'Redesign of the alarm dashboard for industrial monitoring customers, ' +
      'with a Q3 goal to cut mean time-to-acknowledge by thirty percent across ' +
      'every severity tier and every customer deployment we currently support.';
    await outlineNote(`${long}\n\nNext node.\n`);
    await h.setCursor(0, 5);
    const rows = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const block = cm.lineBlockAt(0);
      return Math.round(block.height / cm.defaultLineHeight);
    });
    // Fail loudly rather than skipping: a silent return here would let this
    // scenario stay green without ever exercising soft wrapping, which is the
    // whole point of it.
    expect(rows).toBeGreaterThan(1);
    await down();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 5 });
    expect(sel.head.line).toBe(0); // moved a ROW, still the same source line
    expect(sel.head.ch).toBeGreaterThan(5);
    expect(await classListAtLine(0)).not.toContain(SELECTED_CLASS);
  });

  it('a MIXED multi-range selection plans each range on its own terms', async () => {
    // One cursor inside a multi-line node, one that would cross a boundary.
    // An all-or-nothing gate made the crossing range's answer win for both,
    // block-extending a cursor that had already answered "this is text".
    await outlineNote('Line one of a para\nline two of it\n\n- alpha\n- bravo\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 5 } },
      { anchor: { line: 3, ch: 4 }, head: { line: 3, ch: 4 } },
    ]);
    await focusEditor();
    await down();
    const ranges = await h.getSelectionRanges();
    expect(ranges).toHaveLength(2);
    // Text range: anchor untouched, head one line down, no snapping to a
    // boundary. The head's COLUMN is not asserted — vertical motion tracks the
    // visual x-coordinate, and in a proportional font the same x lands on a
    // different character index than the row above.
    expect(ranges[0]!.anchor).toEqual({ line: 0, ch: 5 });
    expect(ranges[0]!.head.line).toBe(1);
    // Outline range: took its node's whole cover.
    expect(ranges[1]!.anchor).toEqual({ line: 3, ch: 0 });
    expect(ranges[1]!.head.line).toBe(3);
  });

  it('a gapless multiline leaf steps the sequence, it does not shrink inside itself', async () => {
    // A final code fence owns no trailing gap, so its cover IS exactly its
    // content lines. Relying on the content-line bounds to exclude covers
    // therefore misread it as text motion, and the opposite press fell through
    // to stock extension — shrinking inside the fence instead of stepping.
    // No blank line after the fence, so it owns NO trailing gap and its cover
    // is exactly its content lines — while still having a node to step to.
    await outlineNote('Intro.\n\n```ts\nconst x = 1;\n```\nAfter.\n');
    await h.setCursor(4, 2); // the fence's LAST content line
    await up(); // within the fence — text motion
    await up(); // still within
    await up(); // leaves it: the fence's whole cover, lines 2..4
    expect(await span()).toBe('2..4 back');
    expect(await classListAtLine(2)).toContain(SELECTED_CLASS);

    // The cover is exactly the fence's content lines, since it owns no gap.
    // The opposite press must step the SEQUENCE, not be misread as text
    // motion and fall through to stock extension shrinking inside the fence.
    await down();
    const after = await span();
    expect(after).not.toBe('2..4 back');
    expect(after.startsWith('3..')).toBe(false); // did not collapse inward
  });

  it('at the sequence end the selection stays unchanged, rather than shrinking', async () => {
    // `null` from the walk means both "not ours" and "nowhere left to go", and
    // they need opposite answers. Falling through at the document edge let
    // stock extension move a backward cover's head inward.
    await outlineNote('Intro.\n\n```ts\nconst x = 1;\n```');
    await h.setCursor(4, 2);
    await up();
    await up();
    await up(); // the fence's whole cover, at the document's end
    const atEnd = await span();
    await down(); // exhausted: must change nothing
    expect(await span()).toBe(atEnd);
  });

  it('a document EDGE is a boundary, not intra-node row motion', async () => {
    // At an edge CodeMirror clamps the head to the line's own start or end
    // rather than moving a row. That lands inside the node, so it read as row
    // motion and fell through to stock extension — making the anchor node's
    // first cover unreachable in that direction, on SINGLE-row nodes where
    // D11 should never fire at all. Measured before the fix: `0,0..0,5` and
    // `2,5..2,10` character ranges where a cover was required.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 5); // the FIRST node
    await up();
    expect(await span()).toBe('0..1 back'); // its cover, not a character range

    await outlineNote('Alpha one.\n\nBravo two.'); // no trailing newline: gapless
    await h.setCursor(2, 5); // the FINAL node
    await down();
    expect(await span()).toBe('2..2 fwd');
  });

  it('a SINGLE-line node still covers on the first press', async () => {
    // The common case, and the one every drawn example uses — unchanged.
    await outlineNote('- alpha\n- bravo\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe('0..0 fwd');
  });
});

describe('node-selection-extension: crossing a boundary (moved from 61)', () => {
  it('two presses cover both nodes in full, including the owned gap', async () => {
    // The scenario `61-selection-enforcement.e2e.ts` used to assert through
    // escalation. Same observable outcome, different mechanism: extension now
    // dispatches the cover directly and the filter never corrects it.
    await outlineNote('First.\n\nSecond.\n');
    await h.setCursor(0, 3);
    await down();
    await down();
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
    // Line 3 is "Second."'s own trailing gap — included in the cover.
    expect(sel.head).toEqual({ line: 3, ch: 0 });
  });
});

describe('node-selection-extension: symmetry and cross-scope (E4, E4c, E5, E6)', () => {
  it('E4 — extending out of a scope does not pull in the parent', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(2, 8); // inside "child two", the LAST child
    await down();
    expect(await span()).toBe('2..2 fwd');
    await down();
    expect(await span()).toBe('2..4 fwd'); // `- parent` is NOT added
  });

  it('E4c — reversing after leaving a scope returns to the child', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(2, 8);
    await down();
    await down();
    await up();
    expect(await span()).toBe('2..2 fwd');
  });

  it('E5 — Shift+Up undoes Shift+Down', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(2, 3);
    await down();
    await down();
    expect(await span()).toBe('2..5 fwd'); // Charlie's own trailing gap included
    await up();
    expect(await span()).toBe('2..3 fwd');
  });

  it('E6 — reversing past the anchor grows the other way', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(2, 3);
    await down();
    await down();
    await up();
    await up();
    expect(await span()).toBe('0..3 back');
  });
});

describe('node-selection-extension: the ancestor swallow (E7, design D8)', () => {
  // The two shapes measured as FIXPOINTS before this change: after extending
  // up out of a first child, Shift+Down produced a byte-identical selection
  // indefinitely, because the head fell into the parent's own trailing gap
  // and re-resolved to the parent. Both must now move.
  const SHAPES: [string, string][] = [
    ['heading section', '# P\n\nc1 text.\n\nc2 text.\n\n# Q\n'],
    ['loose list', '- P\n\n\t- c1\n\n\t- c2\n\n- Q\n'],
  ];

  for (const [label, md] of SHAPES) {
    it(`${label} — Shift+Down after the swallow GROWS instead of sticking`, async () => {
      await outlineNote(md);
      await h.setCursor(2, 3); // inside the first child
      await up(); // press one: normalize onto the child's own subtree
      const child = await span();
      await up(); // press two: the swallow — the parent's whole subtree
      const swallowed = await span();
      expect(swallowed).not.toBe(child);

      await down();
      const after = await span();
      // The fixpoint is gone...
      expect(after).not.toBe(swallowed);
      // ...and it grew rather than dropping to the parent's last child.
      const [, hiAfter] = after.split(' ')[0]!.split('..').map(Number);
      const [, hiSwallowed] = swallowed.split(' ')[0]!.split('..').map(Number);
      expect(hiAfter).toBeGreaterThan(hiSwallowed!);
    });
  }
});

describe('node-selection-extension: multi-cursor (design D4)', () => {
  it('a preamble range gets stock motion while another range steps the sequence', async () => {
    // A range outside any node's jurisdiction was never ours. It used to be
    // returned UNCHANGED whenever some other range advanced, silently
    // suppressing its ordinary extension.
    await outlineNote('---\ntitle: x\n---\n\nAlpha one.\n\nBravo two.\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 3 }, head: { line: 1, ch: 3 } }, // inside frontmatter
      { anchor: { line: 4, ch: 5 }, head: { line: 4, ch: 5 } }, // a real node
    ]);
    await focusEditor();
    await browser.pause(80);
    // Read the state the press actually starts from: caret placement moves a
    // preamble cursor out of the frontmatter before we ever see it.
    const before = await h.getSelectionRanges();
    expect(before).toHaveLength(2);

    await down();
    const after = await h.getSelectionRanges();
    expect(after).toHaveLength(2);
    // The out-of-jurisdiction range extended as ordinary text selection —
    // anchor held, head advanced — rather than being frozen in place.
    expect(after[0]!.anchor).toEqual(before[0]!.anchor);
    expect(after[0]!.head.line).toBeGreaterThan(before[0]!.head.line);
    // ...while the range that IS ours took its node's cover.
    expect(after[1]!.anchor).toEqual({ line: 4, ch: 0 });
  });

  it('a stock-owned range still moves when every outline range is exhausted', async () => {
    // `extendSelections` reports "nowhere to go" and "not in jurisdiction" the
    // same way, so a preamble cursor beside an exhausted outline range made the
    // whole result null — and consuming the key there froze the preamble
    // cursor instead of giving it its vertical motion.
    await outlineNote('---\ntitle: x\n---\n\nAlpha one.\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 3 }, head: { line: 1, ch: 3 } }, // preamble
      { anchor: { line: 4, ch: 5 }, head: { line: 4, ch: 5 } }, // the LAST node
    ]);
    await focusEditor();
    await down(); // the node takes its cover; the preamble cursor moves
    await browser.pause(80);
    const mid = await h.getSelectionRanges();
    await down(); // the node is now exhausted — but the preamble must still move
    await browser.pause(80);
    const after = await h.getSelectionRanges();
    expect(after[0]!.head.line).toBeGreaterThan(mid[0]!.head.line);
  });

  it('two cursors extend independently across repeated presses', async () => {
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 8 }, head: { line: 1, ch: 8 } },
      { anchor: { line: 3, ch: 3 }, head: { line: 3, ch: 3 } },
    ]);
    await focusEditor();
    await down();
    let ranges = await h.getSelectionRanges();
    expect(ranges).toHaveLength(2);
    await down();
    ranges = await h.getSelectionRanges();
    // Still two ranges: neither collapsed into a whole-document selection.
    expect(ranges).toHaveLength(2);
  });

  it('cursors at different depths do not drag each other along', async () => {
    await outlineNote('- P\n\t- a1\n\t- a2\n- Q\n\t- b1\n\t- b2\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 4 } },
      { anchor: { line: 3, ch: 2 }, head: { line: 3, ch: 2 } },
    ]);
    await focusEditor();
    await down();
    const ranges = await h.getSelectionRanges();
    expect(ranges).toHaveLength(2);
    // The nested caret takes its own line; the top-level one takes its subtree.
    expect(ranges[0]!.head.line).toBe(1);
    expect(ranges[1]!.head.line).toBe(6); // Q's subtree, plus b2's owned gap
  });
});

describe('node-selection-extension: D4\'s merge edge and D6\'s restored input', () => {
  it('two cursors one node apart merge only on OVERLAP, then extend as a block', async () => {
    // Design D4's known edge, and one press is not enough to reach it:
    // CodeMirror permits ranges to TOUCH without merging. The document is long
    // enough that the merge does NOT coincide with the document end, so the
    // press after the merge has somewhere to go and the block behavior is
    // observable rather than inferred.
    const span = (r: { anchor: { line: number }; head: { line: number } }): string =>
      `${Math.min(r.anchor.line, r.head.line)}..${Math.max(r.anchor.line, r.head.line)}`;
    await outlineNote('- a\n- b\n- c\n- d\n- e\n- f\n- g\n- h\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 3 } },
    ]);
    await focusEditor();

    await down();
    expect((await h.getSelectionRanges()).map(span)).toEqual(['0..0', '2..2']);

    // TOUCHING — `0..1` ends where `2..3` begins — and still two ranges.
    await down();
    expect((await h.getSelectionRanges()).map(span)).toEqual(['0..1', '2..3']);

    // OVERLAPPING, so CodeMirror merges them into exactly one range.
    await down();
    expect((await h.getSelectionRanges()).map(span)).toEqual(['0..4']);

    // And the merged range then extends as a single block, by one node.
    await down();
    expect((await h.getSelectionRanges()).map(span)).toEqual(['0..5']);
  });

  it('a selection restored by undo is normalized before stepping (design D6)', async () => {
    // History dispatches with `filter: false`, so escalation provably never
    // sees what undo restores: it is the pre-operation selection MAPPED
    // FORWARD, which need not be a cover at all. The press must still produce
    // one rather than stepping from an edge that is mid-node.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(1, 3);
    await down(); // block-select `- bravo`
    await browser.pause(50);
    await browser.keys(Key.Tab); // a structural op over the block selection
    await browser.pause(100);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'z']);
    await browser.pause(100);

    await down();
    await browser.pause(50);
    const sel = await h.getSelection();
    // Whatever undo restored, the press lands on a whole-node boundary.
    expect(sel.anchor.ch).toBe(0);
  });
});

describe('node-selection-extension: scope of the binding', () => {
  it('off-mode Shift+Arrow is byte-for-byte native', async () => {
    const md = '- alpha\n- bravo\n- charlie\n';
    await h.createNote(NOTE, md);
    if (await h.isOutlineMode(NOTE)) {
      await h.toggleOutlineMode();
      await h.dismissNotices();
    }
    await h.setBuffer(md);
    await h.setCursor(0, 3);
    await down();
    // Native line-wise extension: the head moves one line, keeping its column.
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 3 });
    expect(sel.head.line).toBe(1);
  });

  it('a nested table-cell editor falls through to native', async () => {
    // #35's failure mode: a private outline-mode check looks equivalent to
    // `outlinePathOf` and is not, so outline rules get applied to a document
    // that is only the cell's raw text.
    await outlineNote('| a | b |\n| - | - |\n| - word | y |\n\nAfter.\n');
    await h.clickTableCell();
    await h.resetMotionCounts();
    await down();
    const counts = await h.getMotionCounts();
    const shiftDown = counts['Shift-Down'];
    // The binding may be invoked, but it must never CONSUME the key here.
    expect(shiftDown?.consumed ?? 0).toBe(0);
  });
});

describe('node-selection-extension: block-selection mode (design D9)', () => {
  it('a cover-to-cover press causes no focus transition', async () => {
    // COUNTS the focus/blur events during the press rather than comparing the
    // settled state before and after. The flicker is a full round trip that
    // ENDS where it started, so a before/after comparison passes even when the
    // editor left the mode and came back — verified: an earlier version of
    // this test passed against the pre-change build. The claim is that no
    // transition happens at all, so the transitions are what must be measured.
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(0, 6);
    await down(); // now a cover — block-selection mode blurs the editor
    await browser.pause(100);

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const dom = (view.editor as any).cm.contentDOM as HTMLElement;
      const w = window as any;
      w.__toFocusEvents = 0;
      w.__toCount = () => w.__toFocusEvents;
      w.__toOnFocus = () => (w.__toFocusEvents += 1);
      dom.addEventListener('focus', w.__toOnFocus);
      dom.addEventListener('blur', w.__toOnFocus);
    });

    await down(); // cover -> cover: the same mode, so nothing should happen
    await browser.pause(100);

    const transitions = await browser.execute(() => (window as any).__toFocusEvents ?? -1);
    expect(transitions).toBe(0);
  });

  it('typing over a keyboard-built block selection still lands', async () => {
    // The failure mode D9 risks: a focus policy wrong in the blurred
    // direction silently eats keystrokes.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(50);
    await browser.keys('X');
    await browser.pause(50);
    const text = await h.getBuffer();
    expect(text).not.toContain('Alpha one.');
    expect(text).toContain('X');
  });

  it('Backspace over a keyboard-built block selection still deletes it', async () => {
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(50);
    await browser.keys(Key.Backspace);
    await browser.pause(50);
    expect(await h.getBuffer()).not.toContain('Alpha one.');
  });

  it('undo still reaches the editor while block-selection mode has it blurred', async () => {
    // Undo is handled ABOVE CodeMirror's keymap, so `runScopeHandlers` does not
    // claim it and it lands in the unmatched-key path. If that path declines to
    // focus, the keystroke never reaches the editor at all and the edit cannot
    // be undone — which is what a too-narrow "produces input" test caused.
    const original = 'Alpha one.\n\nBravo two.\n';
    await outlineNote(original);
    await h.setCursor(0, 6);
    await down(); // block-selects Alpha, blurring the editor
    await browser.pause(100);
    await browser.keys(Key.Backspace);
    await browser.pause(150);
    expect(await h.getBuffer()).not.toBe(original);
    await h.keys.undo();
    await browser.pause(200);
    expect(await h.getBuffer()).toBe(original);
  });

  it('a command that LEAVES the mode restores focus before the next keystroke', async () => {
    // The exit edge applied eagerly. Waiting for the deferred policy left a
    // window in which the editor was blurred with a non-cover selection — and
    // this path only replays keys while the selection IS a cover, so anything
    // pressed in that window was dropped. Delete-then-undo is the case that
    // caught it, since undo is not claimed by the editor's own keymap.
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 0 } },
      { anchor: { line: 4, ch: 0 }, head: { line: 5, ch: 0 } },
    ]);
    await browser.pause(120); // let the mode settle and blur the editor
    await browser.keys(Key.Backspace);
    // No pause: undo must survive arriving immediately after the delete.
    await h.keys.undo();
    await browser.pause(200);
    expect(await h.getBuffer()).toBe('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
  });

  it('a bound structural key still runs over a block selection', async () => {
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(1, 3);
    await down(); // block-selects `- bravo`
    await browser.pause(50);
    await browser.keys(Key.Tab);
    await browser.pause(50);
    // Indented under `- alpha`, i.e. the grammar handler ran despite the
    // editor being blurred by block-selection mode.
    expect(await h.getBuffer()).toContain('\t- bravo');
  });

  it('a cover-to-cover Mod-A press causes no focus transition either', async () => {
    // docs/research/13's flash entry records an earlier attempt at this same
    // reorder that "had ZERO measurable effect" on the Mod-A path, and
    // attributes the Shift+Arrow flash to a two-transaction escalation that
    // does not exist (see that entry's correction). Mod-A dispatches exact
    // rungs, so it never split a transaction either — both paths only ever
    // flashed through the focus round trip, and both are covered by the one
    // policy. Measured here rather than assumed, since the entry predicts
    // otherwise.
    await outlineNote('- P\n\t- c1\n\t- c2\n- Q\n');
    await h.setCursor(1, 4);
    await h.pressSelectAll(); // rung 1: own content — not a cover
    await h.pressSelectAll(); // rung 2: c1's subtree — now a cover
    await browser.pause(100);

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const dom = (view.editor as any).cm.contentDOM as HTMLElement;
      const w = window as any;
      w.__toModAEvents = 0;
      w.__toOnModA = () => (w.__toModAEvents += 1);
      dom.addEventListener('focus', w.__toOnModA);
      dom.addEventListener('blur', w.__toOnModA);
    });

    await h.pressSelectAll(); // cover -> cover
    await browser.pause(100);
    const transitions = await browser.execute(() => (window as any).__toModAEvents ?? -1);
    expect(transitions).toBe(0);
  });

  it('a MULTI-RANGE block selection shows no selection background at all', async () => {
    // Real-vault pass 5.2. The browser's DOM Selection holds only ONE range,
    // so CM6 draws the others itself as `.cm-selectionBackground` rects — and
    // those carry an unconditional base background in CM6's own theme, with no
    // `.cm-focused` requirement, so blurring does not hide them. They showed
    // through under every covered range but the last, reading as a stray
    // character-level highlight. Asserts the resolved colors, not the absence
    // of the elements: the elements still exist and should.
    await outlineNote('- a\n- b\n- c\n- d\n- e\n');
    await h.dispatchSelectOnlyRanges([
      { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } },
      { anchor: { line: 2, ch: 3 }, head: { line: 2, ch: 3 } },
      { anchor: { line: 4, ch: 3 }, head: { line: 4, ch: 3 } },
    ]);
    await focusEditor();
    await down();
    await browser.pause(150);
    const painted = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const root = (view.editor as any).cm.dom as HTMLElement;
      const rects = Array.from(root.querySelectorAll('.cm-selectionBackground'));
      const line = root.querySelector('.cm-line');
      return {
        drawn: rects.map((el) => getComputedStyle(el).backgroundColor),
        native: line ? getComputedStyle(line, '::selection').backgroundColor : 'none',
      };
    });
    expect(painted.drawn.length).toBeGreaterThan(1); // CM6 really is drawing them
    for (const color of painted.drawn) expect(color).toBe('rgba(0, 0, 0, 0)');
    expect(painted.native).toBe('rgba(0, 0, 0, 0)');
  });

  it('entering block mode never renders a frame without the chrome class', async () => {
    // Real-vault pass 5.3c. `EditorView.updateAttrs` recomputes the editor's
    // whole class string on a focus change and writes the attribute wholesale,
    // so a class added imperatively with `classList` was clobbered by the very
    // blur block-selection mode causes, then restored by the next update —
    // one frame of no chrome plus native highlight. Declaring it through the
    // `editorAttributes` facet removes the window entirely.
    await outlineNote('Alpha one.\n\nBravo two.\n\nCharlie three.\n');
    await h.setCursor(0, 6);
    await focusEditor();
    await browser.pause(100);
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const w = window as any;
      w.__classLog = [];
      new MutationObserver(() => {
        w.__classLog.push(cm.dom.classList.contains('to-decor-block-selecting'));
      }).observe(cm.dom, { attributes: true, attributeFilter: ['class'] });
    });
    await down();
    await browser.pause(300);
    const log = await browser.execute(() => (window as any).__classLog ?? []);
    // Once the class goes on it must never come back off while the selection
    // stays a cover. Every observed class mutation after the first must still
    // carry it.
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((on: boolean) => on)).toBe(true);
  });

  it('block chrome renders for extension-produced covers', async () => {
    // `escalated-selection-decoration` reads covers, not their provenance, so
    // a keyboard-built cover must decorate exactly like a drag-built one.
    await outlineNote('- parent\n\t- child one\n\t- child two\n- next\n');
    await h.setCursor(0, 4);
    await down(); // the whole `- parent` subtree
    await browser.pause(50);
    for (const line of [0, 1, 2]) {
      expect(await classListAtLine(line)).toContain(SELECTED_CLASS);
    }
    expect(await classListAtLine(3)).not.toContain(SELECTED_CLASS);
  });

  it('copying a block selection does not disturb the mode', async () => {
    // Cmd/Ctrl+C is unbound, so it used to fall through to the unmatched-key
    // refocus — putting a caret at the selection edge and returning Live
    // Preview to raw markdown while the chrome was still showing. Measured:
    // the DOM selection survives the blur intact, so focusing buys copy
    // nothing.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(100);
    await browser.keys([process.platform === 'darwin' ? Key.Command : Key.Ctrl, 'c']);
    await browser.pause(150);
    const after = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      const sel = window.getSelection();
      return {
        hasFocus: cm.hasFocus,
        blockClass: (cm.dom as HTMLElement).classList.contains('to-decor-block-selecting'),
        domText: sel ? sel.toString() : '',
      };
    });
    expect(after.hasFocus).toBe(false); // still in the mode
    expect(after.blockClass).toBe(true);
    expect(after.domText).toContain('Alpha one.'); // and the copy still has its text
  });

  it('turning outline mode OFF over a block selection is a mode exit', async () => {
    // Losing outline mode is an exit like any other. Bailing out of the policy
    // instead left the transition state stale and skipped the exit edge, so the
    // editor stayed blurred — and the document key path then correctly declines,
    // being off-mode, so nothing brought focus back either.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(120);
    await h.toggleOutlineMode();
    await h.dismissNotices();
    await browser.pause(250);
    const after = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      return {
        hasFocus: cm.hasFocus,
        blockClass: (cm.dom as HTMLElement).classList.contains('to-decor-block-selecting'),
      };
    });
    expect(after.blockClass).toBe(false);
    expect(after.hasFocus).toBe(true);
    await h.toggleOutlineMode(); // leave the fixture note as the suite found it
    await h.dismissNotices();
  });

  it('Escape leaves the mode cleanly and regains focus', async () => {
    // The exit edge working: Escape collapses the cover, which is a real
    // selection change, so the policy restores focus rather than stranding it.
    await outlineNote('Alpha one.\n\nBravo two.\n');
    await h.setCursor(0, 6);
    await down();
    await browser.pause(100);
    await browser.keys(Key.Escape);
    await browser.pause(200);
    const after = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView)!;
      const cm = (view.editor as any).cm;
      return {
        hasFocus: cm.hasFocus,
        blockClass: (cm.dom as HTMLElement).classList.contains('to-decor-block-selecting'),
        collapsed: cm.state.selection.main.empty,
      };
    });
    expect(after.collapsed).toBe(true);
    expect(after.blockClass).toBe(false);
    expect(after.hasFocus).toBe(true);
  });

  it('a mouse drag still settles into block selection', async function () {
    if (h.IS_MOBILE_RUN) this.skip(); // real-mouse-drag test, see IS_MOBILE_RUN
    await outlineNote('First.\n\nSecond.\n');
    await h.mouseDragSelect({ line: 0, ch: 3 }, { line: 2, ch: 3 });
    const sel = await h.getSelection();
    expect(sel.anchor).toEqual({ line: 0, ch: 0 });
  });
});

describe('node-selection-extension: composition with the Mod-A ladder (design D10)', () => {
  it('Mod-A once then Shift+Down equals Shift+Down from a bare caret', async () => {
    // The ladder's first rung is a node's own content, which is NOT a cover;
    // reaching the cover is the press's step (D6), so both routes agree.
    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await h.pressSelectAll();
    await down();
    const viaLadder = await span();

    await outlineNote('- alpha\n- bravo\n- charlie\n');
    await h.setCursor(0, 3);
    await down();
    expect(await span()).toBe(viaLadder);
  });

  it('Shift+Arrow sideways then Mod-A climbs to the enclosing run', async () => {
    await outlineNote('- P\n\t- c1\n\t- c2\n- Q\n');
    await h.setCursor(1, 4);
    await down();
    await down(); // [c1, c2] — the sibling run under P
    expect(await span()).toBe('1..2 fwd');
    await h.pressSelectAll();
    expect(await span()).toBe('0..2 fwd'); // P's whole subtree
  });
});

