/**
 * `src/plugin/history-caret.ts` — making a structural operation's own cursor
 * survive redo.
 *
 * Redo does not re-run the operation; CodeMirror replays a recorded ChangeSet
 * and derives a cursor from it, with only the changes and the pre-edit
 * selection to work from. That is enough for indent/outdent, whose cursor is a
 * function of exactly those inputs (covered in
 * tests/minimal-change-history.test.ts). It is not enough for a MOVE, whose
 * cursor means "follow that node" — a splice carries no notion of which
 * content is which, so mapping lands the caret on whatever now occupies the
 * old coordinates. Recording preserves the input redo would otherwise lose.
 *
 * Driven against a REAL `EditorState` with the REAL `@codemirror/commands`
 * `history()`; the ViewPlugin around it is only a trigger and a dispatch, and
 * needs a DOM these tests do not have.
 */

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { parse } from '../src/parse';
import { walkNodes } from '../src/model';
import { indent, moveDown, moveUp } from '../src/ops';
import { applyEdits } from '../src/result';
import { editsToChanges } from '../src/plugin/dispatch';
import { planKey } from '../src/plugin/grammar';
import { isAddressable } from '../src/caret';
import { needsRecording } from '../src/plugin/record-decision';

function offsetOf(lines: readonly string[], line: number, ch: number): number {
  let acc = 0;
  for (let i = 0; i < line; i++) acc += (lines[i]?.length ?? 0) + 1;
  return acc + ch;
}

function posOf(lines: readonly string[], offset: number): { line: number; ch: number } {
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]!.length;
    if (offset <= acc + len) return { line: i, ch: offset - acc };
    acc += len + 1;
  }
  const last = lines.length - 1;
  return { line: last, ch: lines[last]?.length ?? 0 };
}

function makeView(state: EditorState) {
  const view = {
    state,
    dispatch: (trOrSpec: { state?: EditorState }) => {
      view.state = trOrSpec.state ?? view.state.update(trOrSpec as never).state;
    },
  };
  return view;
}

/** Where the caret currently is, in the current document's line space. */
function caretOf(state: EditorState): { line: number; ch: number } {
  return posOf(state.doc.toString().split('\n'), state.selection.main.head);
}

/**
 * The case history's own mapping provably cannot cover.
 *
 * Moving a node maps a caret that was inside it into whatever now occupies its
 * old lines — the OTHER node. The only channel that overrides history's own
 * mapping is `selectionsAfter`, written by a separate selection-only
 * transaction, which is what the recorder dispatches.
 *
 * A swap has two equally true descriptions — "this node moved down" and "that
 * node moved up" — and `dispatch.ts`'s line alignment picks one of them by a
 * tie-break, not by which node the user acted on. When it happens to pick the
 * user's node as the one that STAYS, the caret sits in text no change touches
 * and mapping gets the right answer by luck; when it picks the other way the
 * caret is inside a relocated run and mapping cannot follow. Move-down of the
 * first sibling is the second case, which is why the negative control below
 * uses it: it is the direction that genuinely exercises the mapping branch.
 * The recorder is what makes the answer the same either way — and, since the
 * decision to record is now derived per dispatch rather than per operation,
 * it is also what makes `needsRecording` answer differently for the two
 * directions without anyone having to enumerate them.
 */
describe('a moved node keeps its cursor across undo/redo', () => {
  const DOC = '- a\n- b\n';

  /** Move a node past its sibling, caret inside it, as keymap.ts dispatches. */
  function moveNode(recorderEnabled: boolean, target: '- a' | '- b' = '- b') {
    const lines = DOC.split('\n');
    const doc = parse(DOC);
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === target)!;
    const result = target === '- b' ? moveUp(doc, node.id) : moveDown(doc, node.id);
    if (!result.ok) throw new Error('move rejected');
    const changes = editsToChanges(lines, result.value.edits);
    const newLines = applyEdits(lines, result.value.edits);
    const opCursor = offsetOf(newLines, result.value.anchor.line, result.value.anchor.ch);

    let state = EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(offsetOf(lines, lines.indexOf(target), 2)),
      extensions: [history()],
    });
    state = state.update({
      changes: changes.map((c) => ({
        from: offsetOf(lines, c.from.line, c.from.ch),
        to: offsetOf(lines, c.to.line, c.to.ch),
        insert: c.text,
      })),
      selection: EditorSelection.cursor(opCursor),
      userEvent: 'move.structure',
      annotations: Transaction.addToHistory.of(true),
    }).state;
    // What SemanticCursorRecorder dispatches: re-assert the cursor already in
    // place, so history records it into the event's `selectionsAfter`.
    if (recorderEnabled) state = state.update({ selection: state.selection }).state;
    return makeView(state);
  }

  /** The text of the line the caret is on — the node it is "in". */
  const lineAt = (state: EditorState) =>
    state.doc.toString().split('\n')[caretOf(state).line];

  /**
   * Both directions of the guarantee, each paired with what happens WITHOUT
   * the recorder — because those differ, and stating only the guarantee would
   * hide that one of the two rows is satisfied by the alignment's tie-break
   * rather than by anything this file is testing. Deleting the recorder would
   * still fail the move-down row, and only that row.
   */
  it.each([
    { target: '- a', direction: 'down', withoutRecorder: '- b' },
    { target: '- b', direction: 'up', withoutRecorder: '- b' },
  ] as const)(
    'redo puts the caret back on $target, the node moved $direction',
    ({ target, withoutRecorder }) => {
      const view = moveNode(true, target);
      expect(lineAt(view.state)).toBe(target);
      undo(view);
      expect(lineAt(view.state)).toBe(target); // undo restores the pre-op caret
      redo(view);
      expect(lineAt(view.state)).toBe(target); // …and redo the moved node, not its sibling

      // The contrast, stated per direction: mapping alone recovers the caret
      // for move-up (the aligner anchored the moved node, so the caret sat in
      // text no change touched) and lands on the wrong node for move-down.
      const bare = moveNode(false, target);
      undo(bare);
      redo(bare);
      expect(lineAt(bare.state)).toBe(withoutRecorder);
    },
  );

  it('and keeps doing so on repeated redos', () => {
    const view = moveNode(true);
    for (let i = 0; i < 3; i++) {
      undo(view);
      redo(view);
      expect(lineAt(view.state)).toBe('- b');
    }
  });

  /**
   * The negative control, and the regression itself: without the recorder the
   * caret lands on the node that swapped in. Pinning the exact wrong node
   * proves this scenario really does exercise history's mapping branch — see
   * this block's docstring for why it has to be the move-DOWN direction, and
   * the parametrised test above for the move-up row it does NOT hold for.
   */
  it('WITHOUT the recorder, redo lands on the node that swapped in', () => {
    const view = moveNode(false, '- a');
    undo(view);
    redo(view);
    expect(lineAt(view.state)).toBe('- b');
  });
});

/**
 * The recording decision itself (`needsRecording`), tested directly.
 *
 * This replaces `hasSemanticCursor`'s string-level tests in
 * tests/classify.test.ts. Testing it directly matters for the reason that
 * file already recorded: the history tests below build the re-assertion
 * themselves, so they stay green whether or not the predicate selects the
 * right dispatches. Getting it wrong is silent in both directions — missing a
 * move reinstates a redo that lands on the wrong node, and recording an
 * ordinary indent subjects an operation that is currently exact at any depth
 * to the second-undo limitation.
 */
describe('needsRecording: which DISPATCHES have their cursor recorded', () => {
  const doc = '- a\n- b\n';

  /** A transaction dispatching `selection` alongside `changes`. */
  function dispatch(
    changes: { from: number; to?: number; insert: string },
    selection: number,
    userEvent: string | undefined,
    startSelection = 0,
  ): Transaction {
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(startSelection),
    });
    return state.update({
      changes,
      selection: EditorSelection.cursor(selection),
      ...(userEvent === undefined ? {} : { userEvent }),
    });
  }

  it('records a dispatch whose cursor is NOT what mapping would produce', () => {
    // Caret inside `- b` (offset 6), dispatched back to `- a`'s content — a
    // move's "follow that node", which mapping cannot reproduce.
    const tr = dispatch({ from: 0, to: 7, insert: '- b\n- a' }, 2, 'move.structure', 6);
    expect(needsRecording(tr)).toBe(true);
  });

  it('does NOT record a dispatch whose cursor IS the mapped position', () => {
    // An indent: pure insertion before the caret, cursor mapped forward.
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(6) });
    const changes = { from: 4, to: 4, insert: '  ' };
    const mapped = state.update({ changes }).changes.mapPos(6, 1);
    const tr = state.update({
      changes,
      selection: EditorSelection.cursor(mapped),
      userEvent: 'input.structure.indent',
    });
    expect(needsRecording(tr)).toBe(false);
  });

  it('DOES record an indent that falls back — the gap this change closes', () => {
    // Same operation, but the dispatched cursor is the op's own rather than
    // the mapped one. Keyed per operation this was invisible; keyed per
    // dispatch it is recorded.
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(6) });
    const changes = { from: 4, to: 4, insert: '  ' };
    const mapped = state.update({ changes }).changes.mapPos(6, 1);
    const tr = state.update({
      changes,
      selection: EditorSelection.cursor(mapped === 2 ? 4 : 2),
      userEvent: 'input.structure.indent',
    });
    expect(needsRecording(tr)).toBe(true);
  });

  // Named for what it actually checks. It reuses ONE synthetic reorder
  // transaction for every event string, so it establishes the plugin-own
  // userEvent gate — not that each real operation records. It cannot establish
  // that: a real split can dispatch exactly the mapped position and is then
  // correctly NOT recorded, which is the rule working rather than a gap.
  it('the plugin-own gate admits every old-set event for comparison', () => {
    for (const event of [
      'move.structure',
      'input.structure.split',
      'delete.structural',
      'delete.structural.merge',
      'input.paste.structural',
    ]) {
      const tr = dispatch({ from: 0, to: 7, insert: '- b\n- a' }, 2, event, 6);
      expect(needsRecording(tr), event).toBe(true);
    }
  });

  it('ignores foreign, history and ordinary editing dispatches entirely', () => {
    for (const event of ['undo', 'redo', 'input.type', 'select', undefined]) {
      const tr = dispatch({ from: 0, to: 7, insert: '- b\n- a' }, 2, event, 6);
      expect(needsRecording(tr), String(event)).toBe(false);
    }
  });

  it('ignores a selection-only transaction, however it is annotated', () => {
    const state = EditorState.create({ doc, selection: EditorSelection.cursor(0) });
    const tr = state.update({
      selection: EditorSelection.cursor(6),
      userEvent: 'move.structure',
    });
    expect(needsRecording(tr)).toBe(false);
  });

  it('matches dot-namespaced suffixes, as CM6 userEvent semantics require', () => {
    expect(needsRecording(dispatch({ from: 0, to: 7, insert: '- b\n- a' }, 2, 'move.structure.up', 6))).toBe(true);
    // …but not a different event that merely shares a prefix string.
    expect(needsRecording(dispatch({ from: 0, to: 7, insert: '- b\n- a' }, 2, 'move.structureXYZ', 6))).toBe(false);
  });
});

/**
 * The gap `caret-placement-policy` closes (`structural-history-integration`'s
 * former "Known limitation" second paragraph).
 *
 * Indent and outdent fall back to the operation's own cursor when the mapped
 * position would not be caret-addressable — reachable by invoking them with a
 * whole-block cover selected, whose head sits on the trailing gap line the
 * cover owns. Keyed on the OPERATION, that fallback went unrecorded, so redo
 * recomputed the mapped position and put the caret back on the gap line.
 * Keyed on the DISPATCH, it is recorded like any other chosen cursor.
 */
describe('an indent whose addressability fallback fires survives redo', () => {
  // A cover of `para` and its owned gap line: the head sits on line 1, which
  // is a gap and therefore not caret-addressable.
  const TEXT = 'first\n\npara\n\nlast\n';

  function indentWithCoverHead() {
    const lines = TEXT.split('\n');
    const doc = parse(TEXT);
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === 'para')!;
    // The head a block cover would leave behind: the gap line it owns.
    const coverHead = { line: 3, ch: 0 };

    const outcome = planKey(TEXT, coverHead, 'indent');
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    const op = indent(doc, node.id);
    if (!op.ok) throw new Error('indent rejected');
    const newLines = applyEdits(lines, op.value.edits);

    const preOffset = offsetOf(lines, coverHead.line, coverHead.ch);
    let state = EditorState.create({
      doc: TEXT,
      selection: EditorSelection.cursor(preOffset),
      extensions: [history()],
    });
    const tr = state.update({
      changes: outcome.plan.changes.map((c) => ({
        from: offsetOf(lines, c.from.line, c.from.ch),
        to: offsetOf(lines, c.to.line, c.to.ch),
        insert: c.text,
      })),
      selection: EditorSelection.cursor(outcome.plan.selection),
      userEvent: outcome.plan.userEvent,
      annotations: Transaction.addToHistory.of(true),
    });
    return { tr, dispatched: outcome.plan.selection, newLines, state: tr.state };
  }

  it('the dispatched caret is addressable, not the mapped gap position', () => {
    const { dispatched, newLines } = indentWithCoverHead();
    const pos = posOf(newLines, dispatched);
    expect(isAddressable(parse(newLines.join('\n')), pos)).toBe(true);
  });

  it('that dispatch IS recorded, where the per-operation rule left it unrecorded', () => {
    const { tr } = indentWithCoverHead();
    expect(tr.annotation(Transaction.userEvent)).toBe('input.structure.indent');
    expect(needsRecording(tr)).toBe(true);
  });

  it('so redo restores the fallback position rather than recomputing the mapped one', () => {
    const { dispatched, state } = indentWithCoverHead();
    // What the recorder dispatches for a transaction needing it.
    const recorded = state.update({ selection: state.selection }).state;
    const view = makeView(recorded);
    undo(view);
    redo(view);
    expect(view.state.selection.main.head).toBe(dispatched);
  });
});
