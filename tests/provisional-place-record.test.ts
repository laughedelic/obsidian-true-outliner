/**
 * The record that says WHICH LINE holds an open place, as distinct from the
 * record that says a keypress created one.
 *
 * `provisional-cleanup.ts`'s listener needs an `EditorView` these tests do not
 * have, so they drive its decision function over the same sequence of
 * transactions the listener observes — a real `EditorState` with the real
 * history, and the plans the real grammar produces. The bookkeeping the listener
 * does around that decision is small enough to restate here (`carry`), and
 * restating it is what lets the negative controls drop one half of the rule.
 */

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { planKey, plannedCaret, type GrammarKey } from '../src/plugin/grammar';
import { placeLineAfter, recordablePlace } from '../src/plugin/provisional-cleanup';

/** Two spaces, so the figures below are the widths the documents show. */
const UNIT = '  ';

function stateOf(text: string, line: number, ch: number): EditorState {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line; i++) offset += (lines[i] ?? '').length + 1;
  return EditorState.create({
    doc: text,
    extensions: [history()],
    selection: EditorSelection.cursor(offset + ch),
  });
}

function caretOf(state: EditorState): { line: number; ch: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number - 1, ch: head - line.from };
}

/**
 * One structural keypress, dispatched the way `keymap.ts` dispatches it, with
 * the place line the record currently holds.
 */
function press(
  state: EditorState,
  key: GrammarKey,
  placeLine: number | null,
): { state: EditorState; event: string } | null {
  const at = caretOf(state);
  const outcome = planKey(
    state.doc.toString(),
    at,
    key,
    UNIT,
    undefined,
    placeLine ?? undefined,
  );
  if (!outcome || 'notice' in outcome) return null;
  const doc = state.doc;
  const next = state.update({
    changes: outcome.plan.changes.map((change) => ({
      from: doc.line(change.from.line + 1).from + change.from.ch,
      to: doc.line(change.to.line + 1).from + change.to.ch,
      insert: change.text,
    })),
    selection: EditorSelection.cursor(plannedCaret(outcome.plan)),
    userEvent: outcome.plan.userEvent,
  }).state;
  return { state: next, event: outcome.plan.userEvent };
}

/**
 * The listener's own bookkeeping around `placeLineAfter`: the place this view
 * had open, kept only where the caret was on it when the keypress began.
 *
 * `carryPlaces: false` is the negative control — the behaviour before this
 * change, where only a creating keypress could leave a record.
 */
function run(
  text: string,
  at: { line: number; ch: number },
  keys: readonly GrammarKey[],
  { carryPlaces = true } = {},
): { state: EditorState; place: number | null } {
  let state = stateOf(text, at.line, at.ch);
  let place: number | null = null;
  for (const key of keys) {
    const before = place !== null && caretOf(state).line === place ? place : null;
    const done = press(state, key, place);
    if (!done) throw new Error(`${key} declined`);
    state = done.state;
    place = placeLineAfter(state, done.event, carryPlaces ? before : null);
  }
  return { state, place };
}

describe('an open place survives the key that carries it', () => {
  // The issue's own sequence (#142): Shift+Enter opens a continuation position
  // inside `- foo`, Tab indents the item with the position in it, and Shift+Tab
  // puts it back. The document has to come back to what the Shift+Enter alone
  // left, with the caret still on the position.
  const SRC = '- one\n- foo\n  bar\n';
  const OPENED = '- one\n- foo\n  \n  bar\n';
  const AT_FOO_END = { line: 1, ch: 5 };

  it('Shift+Enter alone opens it, and the record holds', () => {
    const { state, place } = run(SRC, AT_FOO_END, ['continue']);
    expect(state.doc.toString()).toBe(OPENED);
    expect(place).toBe(2);
    expect(caretOf(state)).toEqual({ line: 2, ch: 2 });
  });

  it('Tab carries it, and Shift+Tab puts the whole item back', () => {
    const { state, place } = run(SRC, AT_FOO_END, ['continue', 'indent']);
    expect(state.doc.toString()).toBe('- one\n  - foo\n    \n    bar\n');
    expect(place).toBe(2);
    expect(caretOf(state)).toEqual({ line: 2, ch: 4 });

    const back = run(SRC, AT_FOO_END, ['continue', 'indent', 'outdent']);
    expect(back.state.doc.toString()).toBe(OPENED);
    expect(back.place).toBe(2);
    expect(caretOf(back.state)).toEqual({ line: 2, ch: 2 });
  });

  it('NEGATIVE CONTROL: without the carry the second key mistreats the place', () => {
    // What the issue reported, and what this file exists to keep closed: the
    // Tab leaves no record, so the Shift+Tab reads an ordinary blank line —
    // the item's continuation returns to two columns while the place is left
    // at four, and the caret drops to the start of `foo`.
    const { state, place } = run(SRC, AT_FOO_END, ['continue', 'indent', 'outdent'], {
      carryPlaces: false,
    });
    expect(state.doc.toString()).toBe('- one\n- foo\n    \n  bar\n');
    expect(place).toBeNull();
    expect(caretOf(state)).toEqual({ line: 1, ch: 2 });
  });

  it('either order, and neither key leaves the place at a width the item has left', () => {
    // Shift+Tab first needs a level to give back, so the item starts indented.
    const nested = '- one\n  - foo\n    bar\n';
    const out = run(nested, { line: 1, ch: 7 }, ['continue', 'outdent', 'indent']);
    expect(out.state.doc.toString()).toBe(nested.replace('    bar', '    \n    bar'));
    expect(out.place).toBe(2);
    expect(caretOf(out.state)).toEqual({ line: 2, ch: 4 });
  });

  it('a run of carrying keys keeps one place, not a place per keypress', () => {
    const deep = run(SRC, AT_FOO_END, ['continue', 'indent', 'outdent', 'indent', 'outdent']);
    expect(deep.state.doc.toString()).toBe(OPENED);
    expect(deep.place).toBe(2);
  });
});

describe('what does NOT leave a place record', () => {
  const SRC = '- one\n- foo\n  bar\n';
  const AT_FOO_END = { line: 1, ch: 5 };

  it('a carrying key that did not start on the place', () => {
    // The place is open on line 2; the Tab is pressed from `- one`, whose own
    // operation cannot touch it. Nothing may mark a blank line as a place on
    // the strength of where a caret happens to land.
    const opened = run(SRC, AT_FOO_END, ['continue']);
    const moved = opened.state.update({
      selection: EditorSelection.cursor(0),
    }).state;
    const done = press(moved, 'indent', null);
    expect(done).toBeNull(); // nothing above `- one` to indent under
    expect(placeLineAfter(moved, 'input.structure.indent', null)).toBeNull();
  });

  it('a move, which leaves its caret on the node rather than on the place', () => {
    // Measured rather than assumed: `caret-placement-policy` sends a move's
    // caret to its subject's content start, so there is no place at the caret
    // for a record to be about. Recorded in docs/research/decoration-follow-ups.
    const src = '- one\n  - foo\n    bar\n  - two\n';
    const opened = run(src, { line: 1, ch: 7 }, ['continue']);
    expect(opened.place).toBe(2);
    const done = press(opened.state, 'move-down', opened.place);
    expect(done).not.toBeNull();
    expect(caretOf(done!.state)).toEqual({ line: 2, ch: 4 });
    expect(placeLineAfter(done!.state, done!.event, opened.place)).toBeNull();
  });

  it('typing, and a stock newline the grammar declined', () => {
    const opened = run(SRC, AT_FOO_END, ['continue']);
    const at = opened.state.selection.main.head;
    const typed = opened.state.update({
      changes: { from: at, insert: 'x' },
      selection: EditorSelection.cursor(at + 1),
      userEvent: 'input.type',
    }).state;
    expect(placeLineAfter(typed, 'input.type', opened.place)).toBeNull();

    // CodeMirror's own Enter, which runs in outline mode whenever the grammar
    // declines. Its shape is a line break at the caret — the same shape
    // Shift+Enter's continuation has — and only the event tells them apart.
    const stock = opened.state.update({
      changes: { from: at, insert: '\n' },
      selection: EditorSelection.cursor(at + 1),
      userEvent: 'input',
    }).state;
    expect(placeLineAfter(stock, 'input', opened.place)).toBeNull();
    expect(placeLineAfter(stock, undefined, opened.place)).toBeNull();
  });

  it('a carrying event whose caret did not land on a place', () => {
    // The other half of the guard: the event is a carrying one and the caret
    // started on the place, but the result has no place at the caret. Nothing
    // to hold.
    const plain = stateOf('- one\n  - foo\n', 1, 7);
    expect(placeLineAfter(plain, 'input.structure.indent', 1)).toBeNull();
  });
});

describe('the place record and the removal record keep their own conditions', () => {
  it('a carrying key leaves a place record and no removal record', () => {
    // `recordablePlace` answers "was a place CREATED here", and a Tab creates
    // none. That is what keeps an outdent which merely relocated an
    // already-empty item from having that item removed out from under the user,
    // and this change does not widen it.
    const opened = run('- one\n- foo\n  bar\n', { line: 1, ch: 5 }, ['continue']);
    const done = press(opened.state, 'indent', opened.place);
    expect(done).not.toBeNull();
    expect(recordablePlace(done!.state, done!.event)).toBeNull();
    expect(placeLineAfter(done!.state, done!.event, opened.place)).toBe(2);
  });

  it('an outdent that only relocated an already-empty item still creates nothing', () => {
    // The shape `NODE_PLACE_EVENTS` excludes `outdent` for, asserted here
    // because the carry rule runs past `recordablePlace` and must not reach it.
    const state = stateOf('- one\n  - \n', 1, 4);
    const done = press(state, 'outdent', null);
    expect(done).not.toBeNull();
    expect(done!.state.doc.toString()).toBe('- one\n- \n');
    expect(recordablePlace(done!.state, done!.event)).toBeNull();
    // And with no place open beforehand there is nothing to carry either.
    expect(placeLineAfter(done!.state, done!.event, null)).toBeNull();
  });
});

describe('history movement does not move a place', () => {
  it('an undo that changes the document is a document change like any other', () => {
    // The place record is invalidated by document changes, which is what covers
    // undo and redo — the listener drops it on `docChanged` before anything
    // here is consulted. Pinned as a property of the history rather than of
    // this module: an undo of a structural keypress always changes the
    // document.
    const src = '- one\n- foo\n  bar\n';
    const opened = run(src, { line: 1, ch: 5 }, ['continue']);
    const view = {
      state: opened.state,
      dispatch: (spec: never) => {
        view.state = view.state.update(spec).state;
      },
    };
    const before = view.state.doc.toString();
    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
    expect(view.state.doc.toString()).not.toBe(before);
    redo(view as never);
    expect(view.state.doc.toString()).toBe(before);
  });

  it('a carrying key leaves the undo depth free to move without touching the place', () => {
    // Why the place record carries no depth guard: the depth after a carrying
    // key is not the depth the creating key recorded, and the place is
    // nonetheless still open on the line the key moved it to.
    const opened = run('- one\n- foo\n  bar\n', { line: 1, ch: 5 }, ['continue']);
    const depthAtCreation = undoDepth(opened.state);
    const done = press(opened.state, 'indent', opened.place);
    expect(done).not.toBeNull();
    expect(undoDepth(done!.state)).not.toBe(depthAtCreation);
    expect(placeLineAfter(done!.state, done!.event, opened.place)).toBe(2);
  });
});
