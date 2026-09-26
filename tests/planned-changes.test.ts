/**
 * A transaction this plugin planned lands as planned, whatever a filter of
 * default precedence renumbers on top of it.
 *
 * Obsidian's own renumbering filter is not reachable from here, so a stand-in
 * does what it was measured to do (`docs/research/obsidian-list-renumbering`):
 * append a marker rewrite to the same transaction, sequentially, under
 * `userEvent: 'input.renumber'`.
 */

import { describe, expect, it } from 'vitest';
import {
  EditorSelection,
  EditorState,
  Text,
  Transaction,
  type ChangeSpec,
  type Extension,
} from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import {
  markerNumberRestorations,
  plannedChanges,
  plannedChangesExtension,
} from '../src/plugin/planned-changes';

/** Rewrites the number of every line starting `N. q` to `renumbered`, as Obsidian's filter would. */
function renumberingStandIn(renumbered: string, extra?: (doc: Text) => ChangeSpec[]): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.isUserEvent('input.renumber')) return tr;
    const changes: ChangeSpec[] = [];
    for (let n = 1; n <= tr.newDoc.lines; n++) {
      const line = tr.newDoc.line(n);
      const m = /^(\d+)\. q/.exec(line.text);
      if (m && m[1] !== renumbered) changes.push({ from: line.from, to: line.from + m[1]!.length, insert: renumbered });
    }
    changes.push(...(extra?.(tr.newDoc) ?? []));
    return changes.length > 0
      ? [tr, { changes, sequential: true, userEvent: 'input.renumber' }]
      : tr;
  });
}

function stateOf(text: string, extensions: Extension[]): EditorState {
  return EditorState.create({ doc: text, extensions: [history(), ...extensions] });
}

/** The ⏎ at the end of `   1. a` in `1. p` / `   1. a` / `2. q`, as the grammar plans it. */
function plannedEnter(state: EditorState, annotate: boolean): Transaction {
  const at = state.doc.line(3).from;
  const changes = state.changes({ from: at, insert: '   2. \n' });
  return state.update({
    changes,
    selection: EditorSelection.cursor(at + 6),
    userEvent: 'input.structure.split',
    ...(annotate ? { annotations: plannedChanges.of(changes) } : {}),
  });
}

describe('planned-changes', () => {
  const SOURCE = '1. p\n   1. a\n2. q\n';

  it('a planned transaction keeps the numbers it planned', () => {
    const state = stateOf(SOURCE, [plannedChangesExtension(), renumberingStandIn('3')]);
    const tr = plannedEnter(state, true);
    expect(tr.newDoc.toString()).toBe('1. p\n   1. a\n   2. \n2. q\n');
    expect(tr.newSelection.main.head).toBe(state.doc.line(3).from + 6);
  });

  it('control: without the planned change set, the stand-in renumbers', () => {
    const state = stateOf(SOURCE, [plannedChangesExtension(), renumberingStandIn('3')]);
    expect(plannedEnter(state, false).newDoc.toString()).toBe('1. p\n   1. a\n   2. \n3. q\n');
  });

  it('restores whichever order the two are registered in', () => {
    const state = stateOf(SOURCE, [renumberingStandIn('3'), plannedChangesExtension()]);
    expect(plannedEnter(state, true).newDoc.toString()).toBe('1. p\n   1. a\n   2. \n2. q\n');
  });

  it('one undo takes the planned transaction back to the source', () => {
    const state = stateOf(SOURCE, [plannedChangesExtension(), renumberingStandIn('3')]);
    let current = plannedEnter(state, true).state;
    undo({ state: current, dispatch: (tr) => (current = tr.state) });
    expect(current.doc.toString()).toBe(SOURCE);
  });

  it('a renumbering that widens the marker is narrowed back, and the caret stays put', () => {
    const state = stateOf(SOURCE, [plannedChangesExtension(), renumberingStandIn('10')]);
    const tr = plannedEnter(state, true);
    expect(tr.newDoc.toString()).toBe('1. p\n   1. a\n   2. \n2. q\n');
    expect(tr.newSelection.main.head).toBe(state.doc.line(3).from + 6);
  });

  it('a change that is not a marker number is left to stand', () => {
    const appendX = (doc: Text): ChangeSpec[] => [{ from: doc.line(1).to, insert: 'X' }];
    const state = stateOf(SOURCE, [plannedChangesExtension(), renumberingStandIn('3', appendX)]);
    expect(plannedEnter(state, true).newDoc.toString()).toBe('1. pX\n   1. a\n   2. \n2. q\n');
  });
});

describe('markerNumberRestorations', () => {
  const restored = (intended: string, actual: string): string => {
    const doc = Text.of(actual.split('\n'));
    const state = EditorState.create({ doc });
    return state.update({ changes: markerNumberRestorations(Text.of(intended.split('\n')), doc) })
      .newDoc.toString();
  };

  it('restores a number under a quote and with either delimiter', () => {
    expect(restored('> 1. a\n> 2) b', '> 7. a\n> 9) b')).toBe('> 1. a\n> 2) b');
  });

  it('restores a number on an empty item', () => {
    expect(restored('   2.', '   3.')).toBe('   2.');
  });

  it('leaves a line whose text differs past the number', () => {
    expect(restored('2. q', '3. qq')).toBe('3. qq');
  });

  it('leaves a line whose delimiter differs', () => {
    expect(restored('2. q', '2) q')).toBe('2) q');
  });

  it('leaves a bullet and a paragraph', () => {
    expect(restored('- a\n2 apples', '* a\n3 apples')).toBe('* a\n3 apples');
  });

  it('leaves everything when the line counts differ', () => {
    expect(markerNumberRestorations(Text.of(['1. a', '2. b']), Text.of(['1. a', '3. b', '']))).toEqual([]);
  });
});
