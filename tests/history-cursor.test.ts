/**
 * Redo-cursor integration with CodeMirror's undo history
 * (`structural-history-integration`).
 *
 * These tests run a REAL `EditorState` with the REAL `@codemirror/commands`
 * history extension — no Obsidian, no WebDriver. That matters: this bug was
 * reported three times (docs/research/04 Q18/Q19/Q20, root-caused in Q21) and survived two rounds
 * of e2e guessing, because the question is entirely about CM6 history
 * semantics and nothing else. A plain unit test with the real history
 * extension settles it in milliseconds and can't be masked by harness timing.
 *
 * The mechanism (design.md): `HistoryState.pop()` computes the cursor redo
 * restores as
 *
 *   event.selectionsAfter[0] || event.startSelection.map(event.changes.invertedDesc, 1)
 *
 * A document-changing transaction is recorded via `addChanges`, never
 * `addSelection`, so its own resulting selection is NOT recorded and
 * `selectionsAfter` stays empty — leaving the mapping branch, which for a
 * position inside a whole-region replacement collapses to the END of the
 * inserted block. `reassertCursor` (src/plugin/history-cursor.ts) is what
 * puts our real cursor into `selectionsAfter[0]`.
 *
 * NOTE (design.md Risks): every scenario here must go op -> undo -> redo with
 * NOTHING in between. Any intervening selection transaction populates
 * `selectionsAfter[0]` on its own and the bug disappears — which is exactly
 * why it kept escaping. `masking` below asserts that property directly, so a
 * future edit that accidentally introduces a cursor touch can't quietly turn
 * these into vacuous passes.
 *
 * ## Version sensitivity — why THIS test is the real guard
 *
 * The wrong-cursor behavior entered upstream in `@codemirror/commands`
 * **6.10.2** ("Move the selection to a less surprising place when undoing,
 * moving the selection, redoing, then undoing again") — a fix for a different
 * scenario that added the `startSelection.map(...)` fallback and regressed
 * ours. Bisected against the real package:
 *
 *     <= 6.10.1  redo restores the op's cursor      (no bug)
 *     >= 6.10.2  redo restores end-of-region        (the bug)
 *
 * The e2e harness's Obsidian bundles a CM6 older than 6.10.2, so the e2e
 * scenarios (64-structural-history-cursor.e2e.ts) CANNOT currently fail for
 * this bug's reason — verified by running them against an unpatched build.
 * That makes this file the only executable guard, which is why the negative
 * control below is not optional.
 *
 * The fix itself is version-independent: `selectionsAfter[0]` is preferred by
 * BOTH the old and new `pop()`, so re-asserting the cursor is correct on
 * either (confirmed against 6.10.1 and 6.10.4).
 *
 * If the negative-control tests below start FAILING, that is meaningful news,
 * not a broken test: it means the installed `@codemirror/commands` no longer
 * has the 6.10.2 behavior. Check the version before "fixing" them —
 * package.json deliberately requires >= 6.10.2 so they stay meaningful.
 */

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { CURSOR_REASSERT_USER_EVENT } from '../src/classify';
import { needsCursorRecording } from '../src/plugin/history-cursor';

/** A structural op as our two dispatch sites produce it: a whole-region line
 * replacement carrying an explicit, semantically-chosen cursor. */
interface StructuralOp {
  readonly doc: string;
  /** Where the cursor was before the op (what history maps forward). */
  readonly preCursor: number;
  readonly change: { from: number; to: number; insert: string };
  /** The cursor the op itself places — what redo must restore. */
  readonly opCursor: number;
}

/** Minimal `{state, dispatch}` — all `undo`/`redo` need from a view. */
function makeView(state: EditorState) {
  const view = {
    state,
    dispatch: (trOrSpec: { state?: EditorState }) => {
      view.state = trOrSpec.state ?? view.state.update(trOrSpec as never).state;
    },
  };
  return view;
}

function applyOp(op: StructuralOp): EditorState {
  const initial = EditorState.create({
    doc: op.doc,
    extensions: [history()],
    selection: EditorSelection.cursor(op.preCursor),
  });
  return initial.update({
    changes: op.change,
    selection: EditorSelection.cursor(op.opCursor),
    userEvent: 'input.structure.indent',
    annotations: Transaction.addToHistory.of(true),
  }).state;
}

/** The fix: re-assert the current cursor as a selection-only transaction, so
 * history records it in the preceding event's `selectionsAfter`. */
function reassert(state: EditorState): EditorState {
  return state.update({
    selection: state.selection,
    userEvent: CURSOR_REASSERT_USER_EVENT,
  }).state;
}

/** Run op -> [recording] -> undo -> redo with nothing in between; return the
 * cursor redo lands on, plus how many undo presses the op costs. */
function undoRedo(state: EditorState): { redoCursor: number; undoCursor: number } {
  const view = makeView(state);
  undo(view);
  const undoCursor = view.state.selection.main.head;
  redo(view);
  return { redoCursor: view.state.selection.main.head, undoCursor };
}

// --- the three shapes from design.md's table -------------------------------

const SIMPLE_MERGE: StructuralOp = {
  // "paragraph A" / blank / "paragraph B"; Backspace at B's content start
  // merges B into A. The user's own literal reproduction (Q19).
  doc: 'paragraph A\n\nparagraph B\n',
  preCursor: 13, // content start of "paragraph B"
  change: { from: 0, to: 25, insert: 'paragraph Aparagraph B\n' },
  opCursor: 11, // the join point
};

const MERGE_WITH_CHILDREN: StructuralOp = {
  // Merging a node that has children re-parents them, so the rewritten
  // region spans the whole subtree — Q20's "past the end of the subtree".
  doc: '- parent\n- target\n\t- child one\n\t- child two\n- next sibling\n',
  preCursor: 11, // content start of "- target"
  change: { from: 0, to: 44, insert: '- parenttarget\n\t- child one\n\t- child two\n' },
  opCursor: 8, // the join point
};

const INDENT_WITH_CHILD: StructuralOp = {
  // Not a merge at all: Tab via the keyboard grammar (src/plugin/keymap.ts),
  // same dispatch shape. Confirmed broken by the user in a real vault.
  doc: '- alpha\n- beta\n\t- beta child\n- gamma\n',
  preCursor: 10, // content start of "- beta"
  change: { from: 0, to: 28, insert: '- alpha\n\t- beta\n\t\t- beta child\n' },
  opCursor: 11, // content start of the now-indented "beta"
};

const SHAPES: readonly (readonly [string, StructuralOp])[] = [
  ['simple paragraph merge', SIMPLE_MERGE],
  ['merge with re-parented children', MERGE_WITH_CHILDREN],
  ['indent of a node with a child', INDENT_WITH_CHILD],
];

describe('redo restores a structural op’s own cursor', () => {
  for (const [name, op] of SHAPES) {
    it(`${name}: redo lands on the op’s cursor`, () => {
      const { redoCursor } = undoRedo(reassert(applyOp(op)));
      expect(redoCursor).toBe(op.opCursor);
    });
  }

  /**
   * The negative control (tasks 1.2). Without the re-assertion, redo must
   * land at the END of the rewritten region — not merely "somewhere else".
   * Pinning the exact wrong value is what proves these tests can fail for
   * the right reason: if CM6 ever changes this, or if the scenario stops
   * exercising the mapping branch at all, this breaks loudly instead of
   * letting the positive tests pass vacuously.
   */
  for (const [name, op] of SHAPES) {
    it(`${name}: WITHOUT the re-assertion, redo lands at the end of the rewritten region`, () => {
      const { redoCursor } = undoRedo(applyOp(op));
      const endOfRewrittenRegion = op.change.from + op.change.insert.length;
      expect(redoCursor).toBe(endOfRewrittenRegion);
      expect(redoCursor).not.toBe(op.opCursor);
    });
  }
});

describe('structural history recording', () => {
  /**
   * Q11's invariant: one structural op is exactly one undo step. The
   * re-assertion appends to the existing event's `selectionsAfter` rather
   * than pushing a second event — asserted by showing the FIRST undo already
   * restores the original document, and that a second undo has nothing left
   * to revert (it must not partially restore some intermediate state).
   */
  for (const [name, op] of SHAPES) {
    it(`${name}: one op is still exactly one undo step`, () => {
      const view = makeView(reassert(applyOp(op)));
      undo(view);
      expect(view.state.doc.toString()).toBe(op.doc);
      const afterFirstUndo = view.state.doc.toString();
      undo(view); // nothing further of ours to revert
      expect(view.state.doc.toString()).toBe(afterFirstUndo);
    });
  }

  it('undo still restores the pre-op cursor and document', () => {
    for (const [, op] of SHAPES) {
      const { undoCursor } = undoRedo(reassert(applyOp(op)));
      expect(undoCursor).toBe(op.preCursor);
    }
  });

  it('the re-assertion is a visual no-op', () => {
    const before = applyOp(SIMPLE_MERGE);
    const after = reassert(before);
    expect(after.doc.toString()).toBe(before.doc.toString());
    expect(after.selection.main.head).toBe(before.selection.main.head);
    expect(after.selection.main.empty).toBe(true);
  });

  it('is idempotent — re-asserting twice changes nothing', () => {
    const once = reassert(applyOp(SIMPLE_MERGE));
    const twice = reassert(once);
    expect(undoRedo(twice).redoCursor).toBe(SIMPLE_MERGE.opCursor);
  });
});

/**
 * The KNOWN LIMITATION, pinned so it is executable rather than just prose in
 * a spec (docs/research/04 Q21).
 *
 * The recording mechanism can only fix the FIRST redo. Walking the history:
 *
 *   op       done=[E1]  E1.startSelection=pre  selectionsAfter=[opCursor]  <- we set this
 *   undo 1   restores pre    ✓   undone=[E2]  E2.startSelection=opCursor, selectionsAfter=[]
 *   redo 1   restores opCursor ✓ done=[E3]    E3.startSelection = E2.selectionsAfter[0]
 *                                                                 ?? map(...)  -> mapped
 *   undo 2   restores E3.startSelection = the MAPPED position      ✗
 *
 * `E2` lives on the UNDONE branch, and `addSelection` only ever writes to the
 * DONE branch — so no selection transaction we can dispatch reaches it. This
 * is a structural limit, not a bug in the recorder.
 *
 * These tests assert the CURRENT (limited) behavior deliberately. When the
 * minimal-ChangeSet change lands, they should start failing and be replaced
 * by "the cursor is correct at every depth" — that failure is the signal the
 * limitation is gone, which is exactly what we want it to be.
 */
describe('known limitation: repeated undo/redo cycles', () => {
  function cycle(op: StructuralOp): number[] {
    const view = makeView(reassert(applyOp(op)));
    const seen: number[] = [];
    undo(view);
    seen.push(view.state.selection.main.head); // undo 1
    redo(view);
    seen.push(view.state.selection.main.head); // redo 1
    undo(view);
    seen.push(view.state.selection.main.head); // undo 2
    return seen;
  }

  it('the first undo/redo pair is correct', () => {
    const [undo1, redo1] = cycle(SIMPLE_MERGE);
    expect(undo1).toBe(SIMPLE_MERGE.preCursor);
    expect(redo1).toBe(SIMPLE_MERGE.opCursor);
  });

  // The second undo restores the op cursor mapped BACK through the inverse
  // change — which, being inside the replaced range, collapses to the end of
  // the rewritten region in the pre-op document (`change.to`). For the merge
  // fixture that happens to be the whole document; for indent it is not, so
  // assert the region end rather than the document end.
  for (const [name, op] of [
    ['merge', SIMPLE_MERGE],
    ['indent (a grammar op, not an enforcement rewrite)', INDENT_WITH_CHILD],
  ] as const) {
    it(`${name}: the SECOND undo lands on a mapped position (known gap)`, () => {
      const [, , undo2] = cycle(op);
      expect(undo2).not.toBe(op.preCursor);
      expect(undo2).toBe(op.change.to); // end of the rewritten region
    });
  }
});

/**
 * The trigger condition (D2). This is the part most likely to silently stop
 * matching: a future structural dispatch that picks a `userEvent` outside the
 * plugin-own set gets no recording and quietly regresses to the old bug.
 */
describe('recording trigger', () => {
  const tr = (userEvent: string | undefined, docChanged = true) => [{ docChanged, userEvent }];

  it('fires for every structural dispatch site', () => {
    // grammar (src/plugin/keymap.ts)
    expect(needsCursorRecording(tr('input.structure.indent'))).toBe(true);
    expect(needsCursorRecording(tr('input.structure.outdent'))).toBe(true);
    expect(needsCursorRecording(tr('input.structure.split'))).toBe(true);
    expect(needsCursorRecording(tr('move.structure'))).toBe(true);
    // enforcement rewrites (src/plugin/transaction-filter.ts)
    expect(needsCursorRecording(tr('delete.structural'))).toBe(true);
    expect(needsCursorRecording(tr('input.paste.structural'))).toBe(true);
  });

  it('does not fire for ordinary editing or foreign transactions', () => {
    expect(needsCursorRecording(tr('input.type'))).toBe(false);
    expect(needsCursorRecording(tr('delete.backward'))).toBe(false);
    expect(needsCursorRecording(tr('undo'))).toBe(false);
    expect(needsCursorRecording(tr('redo'))).toBe(false);
    expect(needsCursorRecording(tr(undefined))).toBe(false);
    // Shift+Enter's continuation deliberately reuses generic `input` — its
    // mechanical mapping is already correct (a single-line insertion maps to
    // the end of the inserted text, which IS where the cursor belongs).
    expect(needsCursorRecording(tr('input'))).toBe(false);
  });

  it('cannot re-trigger on its own re-assertion (no dispatch loop)', () => {
    // The re-assertion is selection-only, so the docChanged half rules it out
    // even though its userEvent is deliberately in the plugin-own set.
    expect(needsCursorRecording(tr(CURSOR_REASSERT_USER_EVENT, false))).toBe(false);
  });

  it('ignores selection-only transactions generally', () => {
    expect(needsCursorRecording(tr('input.structure.indent', false))).toBe(false);
  });
});

/**
 * Guards the masking property itself (design.md Risks). This is not a
 * behavior requirement — it documents WHY every earlier automated repro
 * passed, and keeps that knowledge executable: any stray selection
 * transaction between the op and the undo fixes the cursor on its own, so a
 * scenario that touches the cursor in between tests nothing at all.
 */
describe('masking (why this escaped three manual reports)', () => {
  it('any intervening selection transaction hides the bug', () => {
    const state = applyOp(SIMPLE_MERGE); // no re-assertion
    const nudged = state.update({
      selection: EditorSelection.cursor(5),
      userEvent: 'select',
    }).state;
    const back = nudged.update({
      selection: EditorSelection.cursor(SIMPLE_MERGE.opCursor),
      userEvent: 'select',
    }).state;
    // Correct redo despite no re-assertion — purely because a selection
    // transaction happened to land in between.
    expect(undoRedo(back).redoCursor).toBe(SIMPLE_MERGE.opCursor);
  });
});
