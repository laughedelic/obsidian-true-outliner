/**
 * `minimal-change-dispatch` / `structural-history-integration`: with a
 * minimal change set, mapping the pre-op cursor forward through it with
 * assoc=1 is correct in both directions, at any undo/redo depth — except
 * one narrow, CM6-inherent case pinned separately below (design.md Risks).
 *
 * This replaces `tests/history-cursor.test.ts`'s "known limitation: repeated
 * undo/redo cycles" suite (deleted). That suite pinned a real gap: the old
 * whole-region dispatch's redo-cursor workaround could only patch the FIRST
 * redo, so a second undo landed on a mechanically mapped (wrong) position.
 *
 * Why assoc=1 specifically, and why it must be dispatched explicitly rather
 * than left to CM6's own default: `@codemirror/commands`' history redo
 * restores a position with `event.startSelection.map(event.changes.
 * invertedDesc, 1)` — hardcoded assoc=1 — regardless of what selection the
 * dispatched transaction stated (a doc-changing transaction's own selection
 * is never recorded into `selectionsAfter`; that only happens for a
 * SEPARATE, later selection-only transaction, which is exactly the
 * mechanism this change removes). CM6's own default live-mapping assoc is
 * -1, which disagrees with that hardcoded redo assoc whenever the cursor
 * sits exactly at a change boundary (e.g. Tab at a line's very start,
 * converting a paragraph into a list item — the marker is inserted AT the
 * cursor). Discovered by this file's own property test during
 * implementation: omitting `selection` entirely (relying on CM6's default)
 * failed on exactly that boundary case. Computing the SAME assoc=1 mapping
 * ourselves (`src/plugin/dispatch.ts`'s `mapCursorForward`) and dispatching
 * it explicitly, in the SAME transaction as the changes, makes a live
 * dispatch and its eventual redo mathematically identical.
 *
 * The one case this does NOT close (also found by this file's own property
 * test, and pinned explicitly in the second `describe` block below): a
 * cursor sitting at or inside a span outdent DELETES collapses to that
 * span's start when CM6 computes the live result, discarding the exact
 * pre-op position. A second undo (undo → redo → undo) can only reconstruct
 * from that already-collapsed value, and CM6's own hardcoded restore formula
 * for a branch-switched event lands one character off from where the cursor
 * actually started — independent of what `selection` we dispatch. Indent is
 * a pure insertion and never collapses anything, so it is unaffected at any
 * depth. See design.md Risks for the practical scope (Home vs. real content)
 * and `content-space-caret`'s role in closing the common path to it.
 *
 * Runs a REAL `EditorState` with the REAL `@codemirror/commands` history
 * extension, dispatching exactly as `src/plugin/keymap.ts` does — no
 * hand-authored change specs standing in for it.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { encode } from '../src/encode';
import { parse } from '../src/parse';
import { walkNodes } from '../src/model';
import { indent, outdent } from '../src/ops';
import { editsToChanges, mapCursorForward, type EditorChange } from '../src/plugin/dispatch';
import { nodeAtLine } from '../src/plugin/locate';
import { arbTree } from './generators';

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

function offsetOf(lines: readonly string[], line: number, ch: number): number {
  let acc = 0;
  for (let i = 0; i < line; i++) acc += (lines[i]?.length ?? 0) + 1;
  return acc + ch;
}

/**
 * Whether `cursorBefore` sits at or inside a span some change on its own
 * line net-deletes — the one case CM6's own history mechanism cannot
 * reconstruct exactly past the first undo/redo cycle (see this file's
 * top-of-file docstring and design.md Risks). Excluded from the general
 * correctness property below; pinned explicitly in its own describe block.
 */
function collapsesInto(
  changes: readonly EditorChange[],
  cursorBefore: { line: number; ch: number },
): boolean {
  return changes.some((c) => {
    if (c.from.line !== cursorBefore.line) return false;
    const netRemoved = c.to.ch - c.from.ch - c.text.length;
    return netRemoved > 0 && cursorBefore.ch >= c.from.ch && cursorBefore.ch <= c.to.ch;
  });
}

function dispatchOp(
  text: string,
  lines: readonly string[],
  changes: readonly EditorChange[],
  cursorBefore: { line: number; ch: number },
  userEvent: string,
): { preOffset: number; postOpCursor: number; view: ReturnType<typeof makeView> } {
  const preOffset = offsetOf(lines, cursorBefore.line, cursorBefore.ch);
  const mappedSelection = mapCursorForward(lines, changes, cursorBefore);

  const initial = EditorState.create({
    doc: text,
    selection: { anchor: preOffset },
    extensions: [history()],
  });
  const afterOp = initial.update({
    changes: changes.map((c) => ({
      from: initial.doc.line(c.from.line + 1).from + c.from.ch,
      to: initial.doc.line(c.to.line + 1).from + c.to.ch,
      insert: c.text,
    })),
    selection: { anchor: mappedSelection },
    userEvent,
    annotations: Transaction.addToHistory.of(true),
  }).state;
  return { preOffset, postOpCursor: afterOp.selection.main.head, view: makeView(afterOp) };
}

describe('indent/outdent cursor is correct at any undo/redo depth', () => {
  it('survives repeated undo/redo cycles, not just the first pair', () => {
    fc.assert(
      fc.property(
        arbTree(),
        fc.nat(),
        fc.boolean(),
        fc.nat(),
        fc.integer({ min: 2, max: 5 }),
        (tree, n, useIndent, chSeed, cycles) => {
          const text = encode(tree);
          const doc = parse(text);
          const all = [...walkNodes(doc)];
          if (all.length === 0) return true;
          const node = all[n % all.length]!;
          const lines = text.split('\n');
          const startLine = lines.findIndex((_, i) => nodeAtLine(doc, i) === node);
          if (startLine === -1) return true;
          const lineText = lines[startLine] ?? '';
          // Biased toward the line's very start (the assoc boundary case)
          // rather than uniformly random, since that's the case CM6's
          // default mapping gets wrong for insertions.
          const preCh = chSeed % 3 === 0 ? 0 : lineText.length === 0 ? 0 : chSeed % (lineText.length + 1);
          const cursorBefore = { line: startLine, ch: preCh };

          const result = useIndent ? indent(doc, node.id) : outdent(doc, node.id);
          if (!result.ok) return true;

          const changes = editsToChanges(lines, result.value.edits);
          if (changes.length === 0) return true; // nothing dispatched, nothing to test
          if (collapsesInto(changes, cursorBefore)) return true; // the pinned residual, not this property

          const { preOffset, postOpCursor, view } = dispatchOp(
            text,
            lines,
            changes,
            cursorBefore,
            useIndent ? 'input.structure.indent' : 'input.structure.outdent',
          );
          for (let i = 0; i < cycles; i++) {
            undo(view);
            if (view.state.selection.main.head !== preOffset) return false;
            redo(view);
            if (view.state.selection.main.head !== postOpCursor) return false;
          }
          return true;
        },
      ),
      { numRuns: 1000 },
    );
  });
});

/**
 * The CM6 behaviour `main.ts`'s palette path depends on for undo granularity.
 *
 * `Editor.transaction` dispatches with no `userEvent`, and CM6's
 * `HistoryState.addChanges` joins a new change into the previous event when
 * `!userEvent`, the two are adjacent, they fall inside `newGroupDelay`, and the
 * previous event has no `selectionsAfter`. Two palette commands run
 * back-to-back therefore merge into ONE undo step unless something populates
 * `selectionsAfter` between them — which is exactly what the separate
 * `editor.setCursor` after each command does.
 *
 * Pinned here because the dependency is invisible at the call site: combining
 * the change and the cursor into one `editor.transaction({changes, selection})`
 * reads as a strict improvement and silently costs an undo step. It did, and
 * only an e2e caught it; this makes the same mistake fail in milliseconds.
 */
describe('a selection-only transaction keeps adjacent changes in separate undo steps', () => {
  const DOC = 'First.\n\nSecond.\n';
  const INDENTED = 'First.\n\n- Second.\n';

  /** Indent then outdent, as two `userEvent`-less dispatches. */
  function indentThenOutdent(separateCursorTransaction: boolean): EditorState {
    let state = EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(8),
      extensions: [history()],
    });
    const step = (changes: { from: number; to: number; insert: string }, cursor: number) => {
      state = state.update(
        separateCursorTransaction ? { changes } : { changes, selection: EditorSelection.cursor(cursor) },
      ).state;
      if (separateCursorTransaction) {
        state = state.update({ selection: EditorSelection.cursor(cursor) }).state;
      }
    };
    step({ from: 8, to: 8, insert: '- ' }, 10);
    step({ from: 8, to: 10, insert: '' }, 8);
    return state;
  }

  it('with the separate cursor transaction, one undo reverts one command', () => {
    const view = makeView(indentThenOutdent(true));
    expect(view.state.doc.toString()).toBe(DOC);
    undo(view);
    expect(view.state.doc.toString()).toBe(INDENTED); // only the outdent came back
  });

  it('WITHOUT it, the two commands merge into a single undo step', () => {
    const view = makeView(indentThenOutdent(false));
    undo(view);
    // One press reverted BOTH — the regression this pins.
    expect(view.state.doc.toString()).toBe(DOC);
  });
});

describe('known residual: outdent cursor drift when the cursor sits inside the removed marker', () => {
  it('the first undo/redo cycle is exact; the second undo lands one character off', () => {
    // '- alpha' / '\t- beta': cursor at the absolute start of '\t- beta'
    // (e.g. via Home — the one gesture `clampCursorToContent` doesn't yet
    // reach; `content-space-caret` closes that path, see design.md Risks).
    const text = '- alpha\n\t- beta\n';
    const lines = text.split('\n');
    const doc = parse(text);
    const node = [...walkNodes(doc)].find((n) => n.lines[0] === '\t- beta')!;
    const cursorBefore = { line: 1, ch: 0 };
    const result = outdent(doc, node.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changes = editsToChanges(lines, result.value.edits);
    expect(collapsesInto(changes, cursorBefore)).toBe(true); // confirms this pins the intended case

    const { preOffset, postOpCursor, view } = dispatchOp(
      text,
      lines,
      changes,
      cursorBefore,
      'input.structure.outdent',
    );
    undo(view);
    expect(view.state.selection.main.head).toBe(preOffset); // first undo: exact
    redo(view);
    expect(view.state.selection.main.head).toBe(postOpCursor); // first redo: exact
    undo(view);
    // Second undo: NOT the pre-op position — one character later (content
    // start, after the marker, instead of the line's absolute start).
    expect(view.state.selection.main.head).toBe(preOffset + 1);
    expect(view.state.selection.main.head).not.toBe(preOffset);
  });
});

/**
 * The equality `caret-placement-policy`'s recording decision rests on.
 *
 * `record-decision.ts` asks "is the dispatched selection what redo would
 * recompute?" by comparing against CM6's own `map(changes, 1)`. That is only
 * the right question if `mapCursorForward` — which the grammar and the palette
 * use to COMPUTE the dispatched selection — is the same function. This file's
 * own docstring asserts that in prose; here it is executable.
 *
 * If the two ever diverge the failure is conservative — an ordinary indent
 * starts being recorded, costing it the second-undo precision it has today,
 * rather than producing a wrong caret — but it would be silent, and this is
 * what makes it loud.
 */
describe('mapCursorForward agrees with CM6’s own forward mapping at assoc 1', () => {
  it('over generated trees and both mapping-derived operations', () => {
    fc.assert(
      fc.property(arbTree(), fc.nat(), fc.boolean(), fc.nat(), (tree, n, useIndent, chSeed) => {
        const text = encode(tree);
        const doc = parse(text);
        const all = [...walkNodes(doc)];
        if (all.length === 0) return true;
        const node = all[n % all.length]!;
        const lines = text.split('\n');
        const startLine = lines.findIndex((_, i) => nodeAtLine(doc, i) === node);
        if (startLine === -1) return true;
        const lineText = lines[startLine] ?? '';
        // Same start-of-line bias as the property above: the assoc boundary is
        // where the two mappings could differ at all.
        const preCh = chSeed % 3 === 0 ? 0 : lineText.length === 0 ? 0 : chSeed % (lineText.length + 1);
        const cursorBefore = { line: startLine, ch: preCh };

        const result = useIndent ? indent(doc, node.id) : outdent(doc, node.id);
        if (!result.ok) return true;
        const changes = editsToChanges(lines, result.value.edits);
        if (changes.length === 0) return true;

        const ours = mapCursorForward(lines, changes, cursorBefore);

        const state = EditorState.create({ doc: text });
        const tr = state.update({
          changes: changes.map((c) => ({
            from: state.doc.line(c.from.line + 1).from + c.from.ch,
            to: state.doc.line(c.to.line + 1).from + c.to.ch,
            insert: c.text,
          })),
        });
        const preOffset = offsetOf(lines, cursorBefore.line, cursorBefore.ch);
        const theirs = tr.changes.mapPos(preOffset, 1);

        return ours === theirs;
      }),
      { numRuns: 1000 },
    );
  });
});
