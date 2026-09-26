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
import {
  carriedPlace,
  carriedRecord,
  nextRecords,
  placeLineAfter,
  recordablePlace,
  type CreatedPlace,
} from '../src/plugin/provisional-cleanup';

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
    // The production rule, not a restatement of it.
    const before = carriedPlace(state, place);
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
    // A place is open further down; the Tab is pressed on a DIFFERENT node,
    // where it is expressible — so the keypress really happens and the guard is
    // what refuses it. Nothing may mark a blank line as a place on the strength
    // of where a caret happens to land.
    //
    // `startedOn` is computed the way the listener computes it: the place this
    // view had open, kept only when the caret was on it when the keypress began.
    // Here it was not, so the carry branch is closed whatever the Tab's own
    // caret lands on.
    const src = '- one\n- two\n- foo\n  bar\n';
    const opened = run(src, { line: 2, ch: 5 }, ['continue']);
    expect(opened.state.doc.toString()).toBe('- one\n- two\n- foo\n  \n  bar\n');
    expect(opened.place).toBe(3);

    // Move the caret onto `- two`, which HAS a previous sibling to indent under.
    const moved = opened.state.update({
      selection: EditorSelection.cursor(opened.state.doc.line(2).to),
    }).state;
    const startedOn = carriedPlace(moved, opened.place);
    expect(startedOn).toBeNull();

    const done = press(moved, 'indent', opened.place);
    expect(done).not.toBeNull();
    expect(done!.state.doc.toString()).toBe('- one\n  - two\n- foo\n  \n  bar\n');
    expect(placeLineAfter(done!.state, done!.event, startedOn)).toBeNull();
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
  it('a carrying key keeps the removal record the place had', () => {
    // `abandon-carried-place`: the removal record passes on across a carry,
    // restated for where the place now is. What a carry never does is START
    // one — `recordablePlace` still answers no for a Tab.
    const opened = session('- one\n- foo\n  bar\n', { line: 1, ch: 5 }, ['continue']);
    expect(opened.removal).toBeDefined();
    const tabbed = session('- one\n- foo\n  bar\n', { line: 1, ch: 5 }, ['continue', 'indent']);
    expect(recordablePlace(tabbed.state, 'input.structure.indent')).toBeNull();
    expect(tabbed.place).toBe(2);
    expect(tabbed.removal?.line).toBe(2);
    expect(abandoned(tabbed)).toBe('- one\n  - foo\n    bar\n');
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

/**
 * The listener's bookkeeping, with the removal record as well as the place
 * record: each key reads the record live on the place it began on
 * (`carriedRecord`, against its START state) and the next records come from
 * `nextRecords` — the production decisions, not a restatement of them.
 */
function session(
  text: string,
  at: { line: number; ch: number },
  keys: readonly GrammarKey[],
  { withholdReversal = false } = {},
): { state: EditorState; place: number | null; removal: CreatedPlace | undefined } {
  let state = stateOf(text, at.line, at.ch);
  let place: number | null = null;
  let removal: CreatedPlace | undefined;
  for (const key of keys) {
    const startedOn = carriedPlace(state, place);
    const carried = carriedRecord(removal, state, startedOn);
    const outcome = planKey(
      state.doc.toString(),
      caretOf(state),
      key,
      UNIT,
      undefined,
      place ?? undefined,
    );
    if (!outcome || 'notice' in outcome) throw new Error(`${key} declined`);
    const { plan } = outcome;
    const toSpec = (doc: EditorState['doc'], changes: typeof plan.changes) =>
      changes.map((change) => ({
        from: doc.line(change.from.line + 1).from + change.from.ch,
        to: doc.line(change.to.line + 1).from + change.to.ch,
        insert: change.text,
      }));
    const start = state;
    const tr = start.update({
      changes: toSpec(start.doc, plan.changes),
      selection: EditorSelection.cursor(plannedCaret(plan)),
      userEvent: plan.userEvent,
    });
    state = tr.state;
    const before = start.selection.main;
    const next = nextRecords(state, {
      event: plan.userEvent,
      startedOn,
      stated: plan.abandon && toSpec(state.doc, plan.abandon),
      startedAt: before.empty ? tr.changes.mapPos(before.head, -1) : undefined,
      ...(carried
        ? {
            carried: {
              record: carried,
              startedAt:
                carried.startedAt === undefined ? undefined : tr.changes.mapPos(carried.startedAt, -1),
            },
          }
        : {}),
      reversal:
        withholdReversal || !plan.carryReversal ? undefined : toSpec(state.doc, plan.carryReversal),
    });
    place = next.open;
    removal = next.removal;
  }
  return { state, place, removal };
}

function abandoned(done: { state: EditorState; removal: CreatedPlace | undefined }): string {
  if (!done.removal) throw new Error('no removal record');
  return done.removal.abandon.apply(done.state.doc).toString();
}

describe('a carry keeps the removal record, on its own conditions', () => {
  it('two Tabs keep it, and it removes the position alone', () => {
    const done = session('- one\n  - kid\n  - sib\n- foo\n', { line: 3, ch: 5 }, [
      'continue',
      'indent',
      'indent',
    ]);
    expect(done.state.doc.toString()).toBe('- one\n  - kid\n  - sib\n    - foo\n      \n');
    expect(abandoned(done)).toBe('- one\n  - kid\n  - sib\n    - foo\n');
  });

  it('a node the ladder dissolved under a paragraph is reverted by its opening kind', () => {
    const src = 'para\n  - a\n  - b\n';
    const done = session(src, { line: 1, ch: 5 }, ['split', 'split']);
    expect(done.removal?.opened).toBe('node');
    expect(abandoned(done)).toBe(src);
  });

  it('a dissolve whose reversal cannot be composed keeps its own line removal', () => {
    // The ladder's unwrap at the top level both carries the empty item and
    // CREATES a gap place. Without a composable reversal it falls back to the
    // creating record, which is what it had before carries were recorded.
    const src = '- foo\n';
    const done = session(src, { line: 0, ch: 5 }, ['split', 'split'], { withholdReversal: true });
    expect(done.state.doc.toString()).toBe('- foo\n\n');
    expect(done.removal?.opened).toBe('gap');
    expect(abandoned(done)).toBe(src);
  });

  it('a record whose depth does not match the start state is not carried', () => {
    const opened = session('- one\n- foo\n', { line: 1, ch: 5 }, ['continue']);
    const record = opened.removal!;
    expect(carriedRecord(record, opened.state, record.line)).toBe(record);
    expect(carriedRecord({ ...record, depth: record.depth + 1 }, opened.state, record.line)).toBeUndefined();
    expect(carriedRecord(record, opened.state, record.line + 1)).toBeUndefined();
  });

  it('an undo of the carry leaves no record', () => {
    const tabbed = session('- one\n- foo\n', { line: 1, ch: 5 }, ['continue', 'indent']);
    const view = {
      state: tabbed.state,
      dispatch: (spec: never) => {
        view.state = view.state.update(spec).state;
      },
    };
    const start = view.state;
    undo(view as never);
    const next = nextRecords(view.state, {
      event: undefined,
      startedOn: carriedPlace(start, tabbed.place),
      stated: undefined,
      startedAt: undefined,
      carried: { record: tabbed.removal!, startedAt: undefined },
      reversal: undefined,
    });
    expect(next.removal).toBeUndefined();
  });

  it('Shift+Enter on an empty item opens a second place with its own start', () => {
    const done = session('- foo\n', { line: 0, ch: 5 }, ['split', 'continue']);
    const doc = done.state.doc;
    // The start is the empty item's content, where the Shift+Enter was pressed —
    // not the end of `- foo`, where the Enter was.
    expect(done.removal?.startedAt).toBe(doc.line(2).from + 2);
    expect(abandoned(done)).toBe('- foo\n- \n');
  });

  it('Shift+Tab over an opened position takes the opening start', () => {
    const done = session('- a\n  - b\n- c\n', { line: 1, ch: 5 }, ['continue', 'outdent']);
    expect(done.state.doc.toString()).toBe('- a\n- b\n  \n- c\n');
    expect(done.removal?.startedAt).toBe(done.state.doc.line(2).to);
  });
});
