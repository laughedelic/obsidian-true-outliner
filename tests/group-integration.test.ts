import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { history, redo, undo } from '@codemirror/commands';
import { parse } from '../src/parse';
import { encode } from '../src/encode';
import { walkNodes, type OutlineDoc } from '../src/model';
import { coveredSubtreeRoots, escalateRange, forestCoverOf } from '../src/escalate';
import { rangesEqual, type LineRange } from '../src/line-pos';
import { groupRootsByParent } from '../src/operand';
import { indentGroups, moveGroupsUp, outdentGroups, type OpOutput } from '../src/ops';
import type { OpResult } from '../src/result';
import { needsRecording } from '../src/plugin/record-decision';
import { arbLabeledDoc, labelOf } from './group-oracle';

const OPS = {
  indent: (d: OutlineDoc, g: readonly (readonly number[])[]) => indentGroups(d, g),
  outdent: (d: OutlineDoc, g: readonly (readonly number[])[]) => outdentGroups(d, g),
  moveUp: moveGroupsUp,
} as const;

const arbOp = fc.constantFrom<keyof typeof OPS>('indent', 'outdent', 'moveUp');

/** The minimal `EditorView` shape `@codemirror/commands`' history needs — the
 * same stand-in `history-caret.test.ts` uses, since the suite has no DOM. */
function makeView(state: EditorState) {
  const view = {
    state,
    dispatch: (trOrSpec: { state?: EditorState }) => {
      view.state = trOrSpec.state ?? view.state.update(trOrSpec as never).state;
    },
  };
  return view;
}

/** The span a result states, as a forward selection range. */
function spanRange(result: OpOutput): LineRange {
  return { anchor: result.span.start, head: result.span.end };
}

function run(doc: OutlineDoc, i: number, j: number, op: keyof typeof OPS): OpResult<OpOutput> {
  const all = [...walkNodes(doc)];
  const cover = forestCoverOf(doc, all[i % all.length]!, all[j % all.length]!);
  return OPS[op](doc, groupRootsByParent(cover.roots));
}

describe('6.1 the dispatched cover needs no escalation', () => {
  it('escalating the span returns it unchanged', () => {
    let checked = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const result = run(doc, i, j, op);
        if (!result.ok) return true;
        const range = spanRange(result.value);
        checked++;
        return rangesEqual(escalateRange(result.value.doc, range), range);
      }),
      { numRuns: 3000 },
    );
    expect(checked).toBeGreaterThan(500);
  });
});

describe('6.3 the editor stays in block-selection mode across the operation', () => {
  it('the dispatched span is recognised as a whole-subtree cover', () => {
    // This is the predicate the chrome and focus policy read
    // (`allRangesCovered` → `coveredSubtreeRoots`). A cover in and a cover out
    // means no transition, so there is no focus round trip to flash.
    let checked = 0;
    fc.assert(
      fc.property(arbLabeledDoc(), fc.nat(), fc.nat(), arbOp, (doc, i, j, op) => {
        if ([...walkNodes(doc)].length === 0) return true;
        const result = run(doc, i, j, op);
        if (!result.ok) return true;
        checked++;
        return coveredSubtreeRoots(result.value.doc, spanRange(result.value)) !== null;
      }),
      { numRuns: 3000 },
    );
    expect(checked).toBeGreaterThan(500);
  });

  it('the span covers exactly the roots that moved', () => {
    const doc = parse('- p\n- a\n- b\n- c\n');
    const all = [...walkNodes(doc)];
    const cover = forestCoverOf(doc, all[1]!, all[3]!);
    const labels = cover.roots.map((r) => r.node.lines[0]);
    const result = indentGroups(doc, groupRootsByParent(cover.roots));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roots = coveredSubtreeRoots(result.value.doc, spanRange(result.value));
    expect(roots?.map((n) => n.lines[0]!.trim())).toEqual(labels.map((l) => l!.trim()));
    void labelOf;
  });
});

describe('6.2 a dispatched cover is recorded so redo can restore it', () => {
  /** The transaction a structural dispatch produces, built the way the keymap
   * builds it: the change and the resulting selection together. */
  function structuralTransaction(text: string, from: number, to: number) {
    const doc = parse(text);
    const all = [...walkNodes(doc)];
    const cover = forestCoverOf(doc, all[from]!, all[to]!);
    const result = indentGroups(doc, groupRootsByParent(cover.roots));
    if (!result.ok) throw new Error('indent rejected');
    const after = encode(result.value.doc);
    const offsets: number[] = [];
    let acc = 0;
    for (const line of text.split('\n')) {
      offsets.push(acc);
      acc += line.length + 1;
    }
    const newOffsets: number[] = [];
    acc = 0;
    for (const line of after.split('\n')) {
      newOffsets.push(acc);
      acc += line.length + 1;
    }
    const state = EditorState.create({
      doc: text,
      extensions: [history()],
      selection: EditorSelection.range(
        (offsets[cover.cover.start.line] ?? 0) + cover.cover.start.ch,
        (offsets[cover.cover.end.line] ?? 0) + cover.cover.end.ch,
      ),
    });
    const span = result.value.span;
    return state.update({
      changes: { from: 0, to: text.length, insert: after },
      selection: EditorSelection.range(
        (newOffsets[span.start.line] ?? 0) + span.start.ch,
        (newOffsets[span.end.line] ?? 0) + span.end.ch,
      ),
      userEvent: 'input.structure.indent',
      annotations: Transaction.addToHistory.of(true),
    });
  }

  it('a cover dispatch is recorded, because mapping cannot reproduce it', () => {
    const tr = structuralTransaction('- p\n- a\n- b\n- c\n', 1, 3);
    expect(needsRecording(tr)).toBe(true);
  });

  it('and redo restores BOTH ends of the dispatched cover', () => {
    // The predicate above is the decision, not the behaviour. Driven here
    // against a real `EditorState` with the real `@codemirror/commands`
    // history, the way `history-caret.test.ts` drives the caret case: without
    // the recorder, redo recomputes a selection by MAPPING, which is not the
    // cover the operation chose.
    const tr = structuralTransaction('- p\n- a\n- b\n- c\n', 1, 3);
    const dispatched = {
      anchor: tr.newSelection.main.anchor,
      head: tr.newSelection.main.head,
    };
    // What `SemanticCursorRecorder` dispatches: re-assert the selection already
    // in place, so history writes it into the event's `selectionsAfter`.
    const recorded = tr.state.update({ selection: tr.state.selection }).state;

    const withRecorder = makeView(recorded);
    undo(withRecorder);
    redo(withRecorder);
    expect({
      anchor: withRecorder.state.selection.main.anchor,
      head: withRecorder.state.selection.main.head,
    }).toEqual(dispatched);
    // A range, not a collapsed caret — the whole point of the after-state rule.
    expect(withRecorder.state.selection.main.empty).toBe(false);

    // The contrast, stated rather than assumed: with no recording, redo does
    // NOT come back to the same cover, so the assertion above is not something
    // mapping would have satisfied anyway.
    const bare = makeView(tr.state);
    undo(bare);
    redo(bare);
    expect({
      anchor: bare.state.selection.main.anchor,
      head: bare.state.selection.main.head,
    }).not.toEqual(dispatched);
  });

  it('a foreign transaction is still not recorded', () => {
    const state = EditorState.create({ doc: '- a\n' });
    const tr = state.update({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
    expect(needsRecording(tr)).toBe(false);
    void Transaction;
  });
});
