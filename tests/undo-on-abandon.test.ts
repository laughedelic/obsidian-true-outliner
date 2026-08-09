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
import { history, undo } from '@codemirror/commands';

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
