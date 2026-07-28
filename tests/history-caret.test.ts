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
import { moveUp } from '../src/ops';
import { applyEdits } from '../src/result';
import { editsToChanges } from '../src/plugin/dispatch';

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
 * old lines — the OTHER node.

 * The only channel that overrides history's own mapping is `selectionsAfter`,
 * written by a separate selection-only transaction, which is what the recorder
 * dispatches.
 */
describe('a moved node keeps its cursor across undo/redo', () => {
  const DOC = '- a\n- b\n';

  /** Move `- b` above `- a`, with the caret in `- b`, as keymap.ts dispatches. */
  function moveB(recorderEnabled: boolean) {
    const lines = DOC.split('\n');
    const doc = parse(DOC);
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === '- b')!;
    const result = moveUp(doc, node.id);
    if (!result.ok) throw new Error('move rejected');
    const changes = editsToChanges(lines, result.value.edits);
    const newLines = applyEdits(lines, result.value.edits);
    const opCursor = offsetOf(newLines, result.value.cursor.line, result.value.cursor.ch);

    let state = EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(offsetOf(lines, 1, 2)), // inside "- b"
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

  it('redo puts the caret back on the moved node', () => {
    const view = moveB(true);
    expect(lineAt(view.state)).toBe('- b');
    undo(view);
    expect(lineAt(view.state)).toBe('- b'); // undo restores the pre-op caret
    redo(view);
    expect(lineAt(view.state)).toBe('- b'); // …and redo the moved node, not '- a'
  });

  it('and keeps doing so on repeated redos', () => {
    const view = moveB(true);
    for (let i = 0; i < 3; i++) {
      undo(view);
      redo(view);
      expect(lineAt(view.state)).toBe('- b');
    }
  });

  /**
   * The negative control, and the regression itself: without the recorder the
   * caret lands on the node that swapped in. Pinning the exact wrong node
   * proves this scenario really does exercise history's mapping branch.
   */
  it('WITHOUT the recorder, redo lands on the node that swapped in', () => {
    const view = moveB(false);
    undo(view);
    redo(view);
    expect(lineAt(view.state)).toBe('- a');
  });
});
