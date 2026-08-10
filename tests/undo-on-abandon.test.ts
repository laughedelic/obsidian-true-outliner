/**
 * `structural-history-integration`'s place-removal requirement, and the
 * property it rests on.
 *
 * Abandoning an unused structural keypress removes the place it made by a new,
 * undoable edit — one the OPERATION states and the dispatch carries, never one
 * derived from the finished transaction. That is only safe because a structural
 * keypress is always its own history entry; otherwise the removal could be
 * folded in with the user's typing. This file pins that property against the
 * REAL `@codemirror/commands` history, with a negative control, before anything
 * is built on top of it.
 */

import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { history, undo, undoDepth } from '@codemirror/commands';
import { planKey, type GrammarKey } from '../src/plugin/grammar';
import { parse } from '../src/parse';
import { forestCoverOf, subtreeCoverOf, type LineRange } from '../src/escalate';
import { nodeAtLine } from '../src/plugin/locate';
import type { EditorChange } from '../src/plugin/dispatch';
import { recordablePlace } from '../src/plugin/provisional-cleanup';

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

  it('the keypress is byte-exactly reversible, which is what the abandon edit applies', () => {
    const src = 'thought\n\nnext\n';
    const view = pressEnterAtEnd(src, 'thought'.length);
    expect(view.state.doc.toString()).toBe('thought\n\n\n\nnext\n');
    const depthAfterPress = undoDepth(view.state);

    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
    expect(undoDepth(view.state)).toBe(depthAfterPress - 1);
    // The abandon does not USE undo — it applies the edit the plan states, so a
    // keypress that also did something else (removing a block selection) keeps
    // that part. What this pins is the weaker property that edit relies on: the
    // keypress is byte-exactly reversible in the first place.
  });

  it('an INDENTED position is reversible too, leaving no whitespace-only line', () => {
    // The position a list item's child scope opens carries that scope's own
    // indentation, so abandoning it has to remove a line that is not empty. The
    // reverse is line-granular, so it does — but a whitespace-only leftover is
    // exactly the kind of invisible debris "without a trace" is about, and
    // nothing else in the file would notice it.
    const src = '- item\n\n\tpara\n';
    const view = pressEnterAtEnd(src, '- item'.length);
    expect(view.state.doc.toString()).toBe('- item\n\n\t\n\n\tpara\n');

    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
    expect(view.state.doc.toString()).not.toMatch(/^[ \t]+$/m);
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

  it('cancelling an empty node reaches the same document a merge would', () => {
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

describe('the recorder keys on our own markers, never on a change’s shape', () => {
  it("Shift+Enter's continuation carries its own userEvent", () => {
    // Load-bearing for `provisional-cleanup.ts`. It previously carried the
    // generic `input`, and the recorder matched "an `input` event inserting a
    // line break" — a signature CodeMirror's OWN Enter also has. Stock Enter
    // runs inside outline mode whenever the grammar declines (a gap-line caret
    // left by a programmatic placement is exactly that), so its newline was
    // recorded as ours and would be undone on the next caret move.
    const outcome = planKey('- alpha beta\n', { line: 0, ch: 8 }, 'continue');
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    expect(outcome.plan.userEvent).toBe('input.structure.continue');
  });

  it('the continuation event is still non-joinable, so the cleanup stays safe', () => {
    // Renaming it into the input.type family would reintroduce the data loss
    // the first test in this file guards against.
    expect(/^(input\.type|delete)($|\.)/.test('input.structure.continue')).toBe(false);
  });

  it('Enter and Shift+Enter carry DIFFERENT events, so neither is mistaken for the other', () => {
    const enter = planKey('- alpha\n', { line: 0, ch: 7 }, 'split');
    const shiftEnter = planKey('- alpha\n', { line: 0, ch: 7 }, 'continue');
    if (!enter || !('plan' in enter)) throw new Error('expected a plan');
    if (!shiftEnter || !('plan' in shiftEnter)) throw new Error('expected a plan');
    expect(enter.plan.userEvent).not.toBe(shiftEnter.plan.userEvent);
  });
});

/**
 * The removal edit itself: which bytes go when a place is abandoned.
 *
 * Driven end to end — the planner produces a plan, a real `EditorState` applies
 * it, and the plan's OWN stated removal edit is then applied to the result. That
 * is the whole gesture minus the recogniser, which decides only WHETHER to fire
 * and is pinned separately below.
 *
 * Every expectation here is a measured document, not a derived one. The rule
 * being pinned is that abandoning removes exactly what the operation that made
 * the place did, and nothing the same keypress did before it.
 */
describe('the removal edit removes exactly the place', () => {
  /** The cover a real block selection of the nodes starting on `lines`
   * produces — `subtreeCoverOf`, which is what `select-extend` normalizes to. */
  function coverOf(src: string, lines: readonly number[]): LineRange {
    const doc = parse(src);
    const nodes = lines.map((line) => nodeAtLine(doc, line)!);
    if (nodes.length === 1) {
      const cover = subtreeCoverOf(doc, nodes[0]!);
      return { anchor: cover.start, head: cover.end };
    }
    const forest = forestCoverOf(doc, nodes[0]!, nodes.at(-1)!);
    return { anchor: forest.cover.start, head: forest.cover.end };
  }

  function toCM(doc: EditorState['doc'], changes: readonly EditorChange[]) {
    return changes.map((change) => ({
      from: doc.line(change.from.line + 1).from + change.from.ch,
      to: doc.line(change.to.line + 1).from + change.to.ch,
      insert: change.text,
    }));
  }

  /** Press the key, then apply the removal the resulting plan states. */
  function pressAndAbandon(
    src: string,
    where: { caret?: [number, number]; block?: readonly number[] },
    key: GrammarKey = 'split',
  ): { after: string; abandoned: string } {
    const range: { anchor: LineRange['anchor']; head?: LineRange['head'] } = where.block
      ? coverOf(src, where.block)
      : { anchor: { line: where.caret![0], ch: where.caret![1] } };
    const outcome = planKey(src, range.anchor, key, undefined, range.head);
    if (!outcome || !('plan' in outcome)) throw new Error(`expected a plan, got ${JSON.stringify(outcome)}`);

    const view = makeView(makeState(src));
    view.dispatch({
      changes: toCM(view.state.doc, outcome.plan.changes),
      selection: EditorSelection.cursor(outcome.plan.selection),
      userEvent: outcome.plan.userEvent,
    } as never);
    const after = view.state.doc.toString();

    const { abandon } = outcome.plan;
    if (!abandon) throw new Error('the plan states no removal edit');
    view.dispatch({ changes: toCM(view.state.doc, abandon) } as never);
    return { after, abandoned: view.state.doc.toString() };
  }

  describe('a place opened over a block selection keeps the removal standing', () => {
    it('a paragraph between two others', () => {
      const { after, abandoned } = pressAndAbandon('alpha\n\nbeta\n\ngamma\n', { block: [2] });
      expect(after).toBe('alpha\n\n\n\ngamma\n');
      // NOT `alpha\n\nbeta\n\ngamma\n` (the selection restored) and NOT
      // `alpha\n\n\ngamma\n` (a blank line of the position left behind): the
      // document the structural removal alone would have produced.
      expect(abandoned).toBe('alpha\n\ngamma\n');
    });

    it('a paragraph at the document’s end', () => {
      const { abandoned } = pressAndAbandon('alpha\n\nbeta\n', { block: [2] });
      expect(abandoned).toBe('alpha\n');
    });

    it('a paragraph between wide gaps keeps the gaps it did not open', () => {
      const { abandoned } = pressAndAbandon('alpha\n\n\nbeta\n\n\ngamma\n', { block: [3] });
      expect(abandoned).toBe('alpha\n\n\ngamma\n');
    });
  });

  describe('a place at the document’s end is removed in full', () => {
    it('the last node of a file that ends with a line break', () => {
      const { after, abandoned } = pressAndAbandon('alpha\n\nbeta\n', { caret: [2, 4] });
      expect(after).toBe('alpha\n\nbeta\n\n\n');
      expect(abandoned).toBe('alpha\n\nbeta\n');
    });

    it('the last node of a file that does NOT end with a line break', () => {
      // The shape where the derived rule removed nothing at all: there is no
      // following line break for the span to take.
      const { after, abandoned } = pressAndAbandon('alpha\n\nbeta', { caret: [2, 4] });
      expect(after).toBe('alpha\n\nbeta\n\n');
      expect(abandoned).toBe('alpha\n\nbeta');
    });

    it('a file with a single node', () => {
      const { abandoned } = pressAndAbandon('thought\n', { caret: [0, 7] });
      expect(abandoned).toBe('thought\n');
    });
  });

  it('an ordered run the keypress renumbered is renumbered back', () => {
    // The keypress inserts `2. ` and pushes b and c to 3. and 4. Deleting the
    // empty item alone leaves the list reading 1. 3. 4. — the renumbering is
    // part of what the operation did, so it is part of what abandoning undoes.
    const { after, abandoned } = pressAndAbandon('1. a\n2. b\n3. c\n', { caret: [0, 4] });
    expect(after).toBe('1. a\n2. \n3. b\n4. c\n');
    expect(abandoned).toBe('1. a\n2. b\n3. c\n');
  });

  describe('the shapes that were already correct stay byte-identical', () => {
    it('a block selection of two list items', () => {
      const { after, abandoned } = pressAndAbandon('- a\n- b\n- c\n- d\n', { block: [1, 2] });
      expect(after).toBe('- a\n- \n- d\n');
      expect(abandoned).toBe('- a\n- d\n');
    });

    it('a block-selected heading section', () => {
      const { abandoned } = pressAndAbandon('# H1\n\ntext\n\n# H2\n', { block: [0] });
      expect(abandoned).toBe('# H2\n');
    });

    it('Shift+Enter over a block selection', () => {
      const { abandoned } = pressAndAbandon('alpha\n\nbeta\n\ngamma\n', { block: [2] }, 'continue');
      expect(abandoned).toBe('alpha\n\ngamma\n');
    });

    it('Enter at the end of a list item with a paragraph child', () => {
      // The position carries the child scope's indentation, so the line it
      // removes is whitespace-only rather than empty.
      const { after, abandoned } = pressAndAbandon('- item\n\n\tpara\n', { caret: [0, 6] });
      expect(after).toBe('- item\n\n\t\n\n\tpara\n');
      expect(abandoned).toBe('- item\n\n\tpara\n');
    });

    it('Enter mid-document, and Enter at a list item’s end', () => {
      expect(pressAndAbandon('thought\n\nnext\n', { caret: [0, 7] }).abandoned).toBe('thought\n\nnext\n');
      expect(pressAndAbandon('- alpha\n', { caret: [0, 7] }).abandoned).toBe('- alpha\n');
    });

    it('Shift+Enter mid-document', () => {
      const { abandoned } = pressAndAbandon('thought\n\nnext\n', { caret: [0, 7] }, 'continue');
      expect(abandoned).toBe('thought\n\nnext\n');
    });
  });

  describe('leaving a list is not undone by abandoning its residue', () => {
    // The place here is not something the operation OPENED, it is what the
    // operation left behind by dissolving a node. Reversing it would restore
    // the `- ` the user pressed Enter to escape, so the removal drops the line
    // and keeps the departure.
    it('unwrap, as a file’s only line and mid-document', () => {
      expect(pressAndAbandon('- \n', { caret: [0, 2] }).abandoned).toBe('');
      expect(pressAndAbandon('- \n\nbeta\n', { caret: [0, 2] }).abandoned).toBe('\nbeta\n');
    });

    it('outdent at a document’s end, with and without a trailing line break', () => {
      expect(pressAndAbandon('alpha\n\n- \n', { caret: [2, 2] }).abandoned).toBe('alpha\n\n');
      expect(pressAndAbandon('alpha\n\n- ', { caret: [2, 2] }).abandoned).toBe('alpha\n');
    });

    it('an empty item under a paragraph, which outdents rather than unwraps', () => {
      const { after, abandoned } = pressAndAbandon('para\n\n- \n', { caret: [2, 2] });
      expect(after).toBe('para\n\n\n');
      expect(abandoned).toBe('para\n\n');
    });
  });
});

/**
 * The recogniser, which decides WHETHER a place was left — separately from the
 * removal edit, which says how to remove one.
 *
 * `structural-history-integration` requires the two to stay independent, so it
 * is pinned directly rather than inferred from end-to-end behaviour. The case
 * that makes it load-bearing cannot be reached through the removal edit at all:
 * an outdent states one either way, and only this test tells "dissolved a node
 * into a blank line" from "relocated an item that was already empty".
 */
describe('the recogniser is independent of the stated removal edit', () => {
  /** Press a key and return the state it produces, with its userEvent. */
  function press(src: string, cursor: [number, number], key: GrammarKey = 'split') {
    const outcome = planKey(src, { line: cursor[0], ch: cursor[1] }, key);
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');
    const view = makeView(makeState(src));
    const doc = view.state.doc;
    view.dispatch({
      changes: outcome.plan.changes.map((c) => ({
        from: doc.line(c.from.line + 1).from + c.from.ch,
        to: doc.line(c.to.line + 1).from + c.to.ch,
        insert: c.text,
      })),
      selection: EditorSelection.cursor(outcome.plan.selection),
      userEvent: outcome.plan.userEvent,
    } as never);
    return { state: view.state, plan: outcome.plan };
  }

  it('a gap position an Enter opened is recordable', () => {
    const { state, plan } = press('thought\n\nnext\n', [0, 7]);
    expect(recordablePlace(state, plan.userEvent)).toEqual({ line: 2 });
  });

  it('an empty item an Enter materialized is recordable', () => {
    const { state, plan } = press('- alpha\n', [0, 7]);
    expect(recordablePlace(state, plan.userEvent)).toEqual({ line: 1 });
  });

  it('a blank line an outdent DISSOLVED an item into is recordable', () => {
    const { state, plan } = press('para\n\n- \n', [2, 2]);
    expect(plan.userEvent).toBe('input.structure.outdent');
    expect(recordablePlace(state, plan.userEvent)).toEqual({ line: 2 });
  });

  it('an already-empty item an outdent only RELOCATED is not', () => {
    // The case the independence exists for. The plan states a removal edit —
    // it is the same operation as the one above — but the item is a node that
    // pre-existed the keypress, so nothing was created and applying that edit
    // would delete the user's own item when the caret moved away.
    const { state, plan } = press('- a\n  - \n', [1, 4], 'outdent');
    expect(state.doc.toString()).toBe('- a\n- \n');
    expect(plan.abandon).toBeDefined();
    expect(recordablePlace(state, plan.userEvent)).toBeNull();
  });

  it('a foreign dispatch on the same document shape is not', () => {
    // Same state, same caret, no marker of ours: the editor's own newline in a
    // note where the grammar declined must never be read as our place.
    const { state } = press('thought\n\nnext\n', [0, 7]);
    expect(recordablePlace(state, 'input')).toBeNull();
    expect(recordablePlace(state, undefined)).toBeNull();
  });
});

/**
 * The history shape the removal produces, against the real
 * `@codemirror/commands` history: two entries, walked back in order.
 */
describe('the removal is its own history entry', () => {
  it('one undo returns to the place, a second to the document before the keypress', () => {
    const src = '1. a\n2. b\n3. c\n';
    const outcome = planKey(src, { line: 0, ch: 4 }, 'split');
    if (!outcome || !('plan' in outcome)) throw new Error('expected a plan');

    const view = makeView(makeState(src));
    const doc = view.state.doc;
    view.dispatch({
      changes: outcome.plan.changes.map((c) => ({
        from: doc.line(c.from.line + 1).from + c.from.ch,
        to: doc.line(c.to.line + 1).from + c.to.ch,
        insert: c.text,
      })),
      selection: EditorSelection.cursor(outcome.plan.selection),
      userEvent: outcome.plan.userEvent,
    } as never);
    const withPlace = view.state.doc.toString();
    expect(withPlace).toBe('1. a\n2. \n3. b\n4. c\n');
    const depthAfterPress = undoDepth(view.state);

    // Abandon it, carrying the event the module dispatches.
    const after = view.state.doc;
    view.dispatch({
      changes: outcome.plan.abandon!.map((c) => ({
        from: after.line(c.from.line + 1).from + c.from.ch,
        to: after.line(c.to.line + 1).from + c.to.ch,
        insert: c.text,
      })),
      userEvent: 'input.structure.abandon',
    } as never);
    expect(view.state.doc.toString()).toBe(src);
    // A real edit, not a rewind: the removal ADDED an entry rather than
    // consuming the keypress's.
    expect(undoDepth(view.state)).toBe(depthAfterPress + 1);

    undo(view as never);
    expect(view.state.doc.toString()).toBe(withPlace);
    undo(view as never);
    expect(view.state.doc.toString()).toBe(src);
  });
});
