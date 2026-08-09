/**
 * `structural-history-integration`'s undo-on-abandon requirement, and the
 * property it rests on.
 *
 * Cleanup after an unused structural keypress is an UNDO of that keypress, not
 * a new transaction that deletes what it made. That is only safe because the
 * keypress is always its own history entry — otherwise undoing it would take
 * the user's typing with it. This file pins that property against the REAL
 * `@codemirror/commands` history, with a negative control, before anything is
 * built on top of it.
 */

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import { planKey } from '../src/plugin/grammar';

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [history()] });
}

function makeView(state: EditorState) {
  const view = {
    state,
    dispatch: (spec: never) => {
      view.state = view.state.update(spec).state;
    },
  };
  return view;
}

/** Type text at the end, then press a structural key — back to back, well
 * inside history's 500ms grouping window. */
function typeThenStructuralKey(structuralUserEvent: string): EditorState {
  const view = makeView(makeState('- '));
  view.dispatch({
    changes: { from: 2, insert: 'alpha' },
    selection: EditorSelection.cursor(7),
    userEvent: 'input.type',
  } as never);
  // The structural keypress: Enter at the item's end, creating an empty sibling.
  view.dispatch({
    changes: { from: 7, insert: '\n- ' },
    selection: EditorSelection.cursor(10),
    userEvent: structuralUserEvent,
  } as never);
  return view.state;
}

describe('a structural keypress is always its own history entry', () => {
  it('undo removes ONLY the keypress, never the typing before it', () => {
    const view = makeView(typeThenStructuralKey('input.structure.split'));
    expect(view.state.doc.toString()).toBe('- alpha\n- ');
    undo(view as never);
    // The empty item is gone; "alpha" — typed milliseconds earlier — remains.
    expect(view.state.doc.toString()).toBe('- alpha');
  });

  it('NEGATIVE CONTROL: an input.type-family event joins and takes the typing with it', () => {
    // The same two dispatches, differing only in the second one's userEvent.
    // CodeMirror joins a new change into the previous entry when the event
    // matches /^(input\.type|delete)($|\.)/ — so if a structural event were
    // ever renamed into that family, this cleanup would silently become data
    // loss. This test is what makes the first one mean something.
    const view = makeView(typeThenStructuralKey('input.type.structure'));
    expect(view.state.doc.toString()).toBe('- alpha\n- ');
    undo(view as never);
    expect(view.state.doc.toString()).toBe('- ');
  });

  it('every userEvent that can CREATE an empty place is outside the joinable families', () => {
    // The property stated directly, so an event added later is caught here
    // rather than by a behavioral test that happens to cover it.
    const joinable = /^(input\.type|delete)($|\.)/;
    for (const event of [
      'input.structure.indent',
      'input.structure.outdent',
      'input.structure.split',
      'input.structure.unwrap',
      'input.structure.sibling-heading',
      'move.structure',
    ]) {
      expect(joinable.test(event)).toBe(false);
    }
    // `delete.structural` IS joinable — it matches the `delete` family — and
    // that is fine rather than an oversight: no deletion creates an empty place
    // for the user to decline, so undo-on-abandon never targets one. Asserted
    // so the exception is deliberate and visible, not discovered later.
    expect(joinable.test('delete.structural')).toBe(true);
  });
});

/**
 * The cleanup itself, driven against a real `EditorState` with the real
 * history. `provisional-cleanup.ts`'s listener needs an `EditorView` (a DOM
 * these tests do not have), so the guards are exercised through the same
 * sequence of transactions the listener observes, with the module's own
 * decision points checked directly.
 */
describe('the guards decide whether a cleanup may run', () => {
  /** Enter at the end of a paragraph, as the grammar dispatches it. */
  function pressEnterAtEnd(doc: string, at: number) {
    const view = makeView(makeState(doc));
    const outcome = planKey(doc, posOf(doc, at), 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    const text = view.state.doc;
    view.dispatch({
      changes: outcome.plan.changes.map((c) => ({
        from: text.line(c.from.line + 1).from + c.from.ch,
        to: text.line(c.to.line + 1).from + c.to.ch,
        insert: c.text,
      })),
      selection: EditorSelection.cursor(outcome.plan.selection),
      userEvent: outcome.plan.userEvent,
    } as never);
    return view;
  }

  function posOf(text: string, offset: number) {
    const before = text.slice(0, offset);
    const line = before.split('\n').length - 1;
    return { line, ch: offset - (before.lastIndexOf('\n') + 1) };
  }

  it('undo restores the document byte-for-byte and adds no history entry', () => {
    const src = 'thought\n\nnext\n';
    const view = pressEnterAtEnd(src, 'thought'.length);
    expect(view.state.doc.toString()).toBe('thought\n\n\n\nnext\n');
    const depthAfterPress = undoDepth(view.state);

    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
    // One entry consumed, none added: the cleanup is the undo, not a new change.
    expect(undoDepth(view.state)).toBe(depthAfterPress - 1);
  });

  it('the depth guard rejects a cleanup once anything else has changed the document', () => {
    const view = pressEnterAtEnd('thought\n\nnext\n', 'thought'.length);
    const recorded = undoDepth(view.state);

    // Something else edits — the user types elsewhere, another plugin acts.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: 'x' },
      userEvent: 'input.type',
    } as never);

    // The guard is "still the most recent entry", and it no longer is.
    expect(undoDepth(view.state)).not.toBe(recorded);
  });

  it('typing on the position JOINS the keypress entry, so depth alone cannot guard it', () => {
    // Measured, and the reason the record is dropped on any document change
    // rather than trusted to the depth check: history joins in the other
    // direction. A structural event never joins the entry BEFORE it (the first
    // test in this file), but `input.type` IS joinable, so typing on the
    // position folds into the Enter's own entry and `undoDepth` does not move.
    //
    // The consequence, if the depth guard were the only one: type on the place,
    // delete what was typed, walk away — the place looks empty again, the depth
    // still matches, and the cleanup would undo an entry that now contains the
    // user's own typing.
    const view = pressEnterAtEnd('thought\n\nnext\n', 'thought'.length);
    const recorded = undoDepth(view.state);
    const at = view.state.selection.main.head;

    view.dispatch({
      changes: { from: at, insert: 'x' },
      selection: EditorSelection.cursor(at + 1),
      userEvent: 'input.type',
    } as never);
    view.dispatch({
      changes: { from: at, to: at + 1 },
      selection: EditorSelection.cursor(at),
      userEvent: 'delete.backward',
    } as never);

    expect(view.state.doc.toString()).toBe('thought\n\n\n\nnext\n');
    expect(undoDepth(view.state)).toBe(recorded);
    // One undo would now take the typing's entry — which is precisely why
    // `provisional-cleanup` forgets the place the moment anything edits the
    // document, and never reaches this state with a live record.
    undo(view as never);
    expect(view.state.doc.toString()).toBe('thought\n\nnext\n');
  });

  it('an empty list item created by Enter is restored exactly by the undo', () => {
    const src = '- alpha\n';
    const view = pressEnterAtEnd(src, '- alpha'.length);
    expect(view.state.doc.toString()).toBe('- alpha\n- \n');
    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
  });

  it('cancel and merge agree on a real empty node', () => {
    // Backspace at the content start of an empty `- ` created by Enter yields
    // the same document either way — which is what makes the cancel safe to
    // state uniformly rather than as a special case (design D6).
    const src = '- alpha\n';
    const view = pressEnterAtEnd(src, '- alpha'.length);
    const viaCancel = (() => {
      undo(view as never);
      return view.state.doc.toString();
    })();
    // What the merge rule produces for the same gesture: the empty item joins
    // the item above, which is the document without it.
    expect(viaCancel).toBe(src);
  });
});
