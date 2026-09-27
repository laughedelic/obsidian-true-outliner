/**
 * The user's changes, with the renumbering Obsidian appends set aside, put
 * through both gates the editor puts them through: classification, then the
 * verdict. Every appended change here is one measured in the app
 * (`docs/research/obsidian-list-renumbering`, "The ranges it appends to a user
 * edit"), written in the start document's offsets.
 */

import { describe, expect, it } from 'vitest';
import { ChangeSet, EditorState, Text, type ChangeSpec } from '@codemirror/state';
import { parse } from '../src/parse';
import { classify, type TransactionClass } from '../src/classify';
import { computeVerdictForRanges, type Verdict } from '../src/enforce';
import { applyEdits } from '../src/result';
import {
  changedLineSpansOf,
  editFactsOf,
  isMarkerRenumbering,
  userChanges,
  userEventOf,
  type UserChange,
} from '../src/plugin/user-changes';

/** The offset of `line`/`ch` in `md`. */
function at(md: string, line: number, ch: number): number {
  return Text.of(md.split('\n')).line(line + 1).from + ch;
}

/** A renumbering of the marker on `line` starting at `ch`, from `from` to `to`. */
function renumber(md: string, line: number, ch: number, from: string, to: string): ChangeSpec {
  const start = at(md, line, ch);
  return { from: start, to: start + from.length, insert: to };
}

/**
 * The change set of the user's `user` with `appended` added the way Obsidian's
 * filter adds them: a second, sequential spec, in the offsets of the document
 * the user's change produced. `appended` is written in the start document's
 * offsets and mapped across.
 */
function transaction(md: string, user: ChangeSpec, appended: readonly ChangeSpec[]): ChangeSet {
  const state = EditorState.create({ doc: md });
  const own = ChangeSet.of(user, state.doc.length);
  const mapped = appended.map((spec) => {
    const { from, to, insert } = spec as { from: number; to: number; insert: string };
    return { from: own.mapPos(from, 1), to: own.mapPos(to, 1), insert };
  });
  return state.update({ changes: user }, { changes: mapped, sequential: true }).changes;
}

interface Judged {
  readonly changes: readonly UserChange[];
  readonly cls: TransactionClass;
  readonly verdict: Verdict;
}

/** Both gates, on the user's changes, with the caret at `head`. */
function judge(md: string, changes: ChangeSet, head: number, userEvent: string): Judged {
  const startDoc = Text.of(md.split('\n'));
  const kept = userChanges(startDoc, changes);
  const doc = parse(md);
  const spans = changedLineSpansOf(startDoc, kept);
  const cursor = { line: startDoc.lineAt(head).number - 1, ch: head - startDoc.lineAt(head).from };
  const cls = classify(
    { userEvent, isComposition: false, changedLineSpans: spans, cursorBefore: cursor, emptySelectionBefore: true },
    doc,
  );
  const verdict = computeVerdictForRanges(cls, doc, editFactsOf(startDoc, head, kept));
  return { changes: kept, cls, verdict };
}

function result(md: string, verdict: Verdict): string {
  if (verdict.kind !== 'rewrite') throw new Error(`expected rewrite, got ${verdict.kind}`);
  return applyEdits(md.split('\n'), verdict.edits).join('\n');
}

/** A whole line's text deleted from a selection of it, as the block-selection ⌫ measured. */
function lineDeletion(md: string, line: number): { user: ChangeSpec; head: number } {
  const from = at(md, line, 0);
  const to = from + md.split('\n')[line]!.length;
  return { user: { from, to }, head: to };
}

/** Backspace of the one character before `line`/`ch`, caret there. */
function backspace(md: string, line: number, ch: number): { user: ChangeSpec; head: number } {
  const to = at(md, line, ch);
  return { user: { from: to - 1, to }, head: to };
}

describe('a deletion Obsidian appends a renumbering to (#260)', () => {
  const cases: readonly {
    readonly name: string;
    readonly md: string;
    readonly gesture: { user: ChangeSpec; head: number };
    readonly appended: readonly ChangeSpec[];
    readonly expected: string;
    readonly caret: { line: number; ch: number };
  }[] = (() => {
    const flat = '1. a\n2. b\n3. c\n4. d\n';
    const flatEmptied = '1. a\n2. \n3. c\n4. d\n';
    const nested = '1. p\n   1. a\n   2. b\n   3. c\n2. q\n';
    const nestedEmptied = '1. p\n   1. a\n   2. \n   3. c\n2. q\n';
    const tabEmptied = '1. p\n\t1. a\n\t2. \n\t3. c\n2. q\n';
    const paren = '1) a\n2) b\n3) c\n';
    const digits = '8. a\n9. b\n10. c\n11. d\n';
    const task = '1. [ ] a\n2. [ ] b\n3. [ ] c\n';
    return [
      {
        name: 'a flat list, line deletion',
        md: flat,
        gesture: lineDeletion(flat, 1),
        appended: [renumber(flat, 2, 0, '3. ', '2. '), renumber(flat, 3, 0, '4. ', '3. ')],
        expected: '1. a\n2. c\n3. d\n',
        caret: { line: 0, ch: 4 },
      },
      {
        name: 'a flat list, Backspace on the emptied item',
        md: flatEmptied,
        gesture: backspace(flatEmptied, 1, 3),
        appended: [renumber(flatEmptied, 2, 0, '3. ', '2. '), renumber(flatEmptied, 3, 0, '4. ', '3. ')],
        expected: '1. a\n2. c\n3. d\n',
        caret: { line: 0, ch: 4 },
      },
      {
        name: 'a list nested at three columns, line deletion',
        md: nested,
        gesture: lineDeletion(nested, 2),
        appended: [renumber(nested, 3, 3, '3. ', '2. '), renumber(nested, 4, 0, '2. ', '3. ')],
        expected: '1. p\n   1. a\n   2. c\n2. q\n',
        caret: { line: 1, ch: 7 },
      },
      {
        name: 'a list nested at three columns, Backspace on the emptied item',
        md: nestedEmptied,
        gesture: backspace(nestedEmptied, 2, 6),
        appended: [renumber(nestedEmptied, 3, 3, '3. ', '2. '), renumber(nestedEmptied, 4, 0, '2. ', '3. ')],
        expected: '1. p\n   1. a\n   2. c\n2. q\n',
        caret: { line: 1, ch: 7 },
      },
      {
        name: 'a tab-indented list, Backspace on the emptied item',
        md: tabEmptied,
        gesture: backspace(tabEmptied, 2, 4),
        appended: [renumber(tabEmptied, 3, 1, '3. ', '2. ')],
        expected: '1. p\n\t1. a\n\t2. c\n2. q\n',
        caret: { line: 1, ch: 5 },
      },
      {
        name: 'a `)` list, line deletion',
        md: paren,
        gesture: lineDeletion(paren, 1),
        appended: [renumber(paren, 2, 0, '3) ', '2) ')],
        expected: '1) a\n2) c\n',
        caret: { line: 0, ch: 4 },
      },
      {
        name: 'a list crossing a digit boundary, line deletion',
        md: digits,
        gesture: lineDeletion(digits, 1),
        appended: [renumber(digits, 2, 0, '10. ', '9. '), renumber(digits, 3, 0, '11. ', '10. ')],
        expected: '8. a\n9. c\n10. d\n',
        caret: { line: 0, ch: 4 },
      },
      {
        name: 'a task list, line deletion',
        md: task,
        gesture: lineDeletion(task, 1),
        appended: [renumber(task, 2, 0, '3. ', '2. ')],
        expected: '1. [ ] a\n2. [ ] c\n',
        caret: { line: 0, ch: 8 },
      },
    ];
  })();

  for (const { name, md, gesture, appended, expected, caret } of cases) {
    it(`${name}: judged as the user's change alone`, () => {
      const alone = judge(md, transaction(md, gesture.user, []), gesture.head, 'delete');
      const withAppended = judge(md, transaction(md, gesture.user, appended), gesture.head, 'delete');
      expect(withAppended.changes).toEqual(alone.changes);
      expect(withAppended.cls).toBe('boundary-crossing-edit');
      expect(result(md, withAppended.verdict)).toBe(expected);
      expect((withAppended.verdict as Extract<Verdict, { kind: 'rewrite' }>).cursor).toEqual(caret);
    });
  }

  it('an emptied first item with siblings meets the first-node veto, as a lone first item does', () => {
    const md = '1. \n2. b\n3. c\n';
    const { user, head } = backspace(md, 0, 3);
    const judged = judge(md, transaction(md, user, [renumber(md, 1, 0, '2. ', '1. '), renumber(md, 2, 0, '3. ', '2. ')]), head, 'delete');
    expect(judged.verdict).toEqual({ kind: 'veto', reason: 'no-following-neighbor' });
    expect(judge('1. \n', transaction('1. \n', user, []), head, 'delete').verdict).toEqual(judged.verdict);
  });
});

describe('a linewise cut, whose change touches the appended one', () => {
  const md = '1. a\n2. b\n3. c\n';
  const user = { from: at(md, 1, 0), to: at(md, 2, 0) };
  const changes = transaction(md, user, [renumber(md, 2, 0, '3. ', '2. ')]);

  it('is read apart from it, and judged as the cut alone', () => {
    const judged = judge(md, changes, at(md, 1, 2), 'delete.cut');
    expect(judged.changes).toEqual([{ fromA: user.from, toA: user.to, insert: '' }]);
    const alone = judge(md, transaction(md, user, []), at(md, 1, 2), 'delete.cut');
    expect([judged.cls, judged.verdict]).toEqual([alone.cls, alone.verdict]);
    expect(judged.verdict).toEqual({ kind: 'pass' });
    expect(changes.apply(Text.of(md.split('\n'))).toString()).toBe('1. a\n2. c\n');
  });

  it('joined with it, reads as a type-over across two nodes', () => {
    const joined: UserChange[] = [];
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      joined.push({ fromA, toA, insert: changes.apply(Text.of(md.split('\n'))).sliceString(fromB, toB) });
    });
    expect(joined).toEqual([{ fromA: user.from, toA: at(md, 2, 3), insert: '2. ' }]);
  });
});

describe('other gestures on an item with items after it', () => {
  const md = '1. a\n2. b\n3. c\n4. d\n';
  const appended = [renumber(md, 2, 0, '3. ', '2. '), renumber(md, 3, 0, '4. ', '3. ')];

  it('a type-over of the item is judged as the type-over alone', () => {
    const user = { from: at(md, 1, 0), to: at(md, 1, 4), insert: 'x' };
    const judged = judge(md, transaction(md, user, appended), at(md, 1, 4), 'input.type');
    const alone = judge(md, transaction(md, user, []), at(md, 1, 4), 'input.type');
    expect(judged.changes).toEqual(alone.changes);
    expect(judged.cls).toBe(alone.cls);
    expect(judged.verdict.kind).toBe(alone.verdict.kind);
  });

  it('Delete at the end of the item is judged as the Delete alone', () => {
    const user = { from: at(md, 1, 4), to: at(md, 2, 0) };
    const judged = judge(md, transaction(md, user, [renumber(md, 3, 0, '4. ', '3. ')]), at(md, 1, 4), 'delete.forward');
    expect(judged.changes).toEqual([{ fromA: user.from, toA: user.to, insert: '' }]);
    expect(result(md, judged.verdict)).toBe(result(md, judge(md, transaction(md, user, []), at(md, 1, 4), 'delete.forward').verdict));
  });
});

describe('the class comes from the user\'s changes', () => {
  // The empty item is the document's last line: there a change covering its
  // marker covers the whole node, which the classifier reads as a deletion of it.
  const md = '1. p\n   1. ab\n2. ';
  const { user, head } = backspace(md, 1, 8);
  const appended = [renumber(md, 1, 3, '1. ', '2. '), renumber(md, 2, 0, '2. ', '3. ')];

  it('Backspace inside a line, with an empty item renumbered below it, stays within the node', () => {
    const judged = judge(md, transaction(md, user, appended), head, 'delete.backward');
    expect(judged.cls).toBe('within-node-edit');
    expect(judged.verdict).toEqual({ kind: 'pass' });
  });

  it('classified with every change, the same Backspace reads as crossing a boundary', () => {
    const startDoc = Text.of(md.split('\n'));
    const all: UserChange[] = [];
    transaction(md, user, appended).iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      all.push({ fromA, toA, insert: inserted.toString() });
    }, true);
    const cls = classify(
      {
        userEvent: 'delete.backward',
        isComposition: false,
        changedLineSpans: changedLineSpansOf(startDoc, all),
        cursorBefore: { line: 1, ch: 8 },
        emptySelectionBefore: true,
      },
      parse(md),
    );
    expect(cls).toBe('boundary-crossing-edit');
  });
});

describe('what is not an appended renumbering', () => {
  const md = '1. a\n2. b\n13. c\n   4. d\n';
  const doc = Text.of(md.split('\n'));
  const change = (line: number, ch: number, length: number, insert: string): UserChange => ({
    fromA: at(md, line, ch),
    toA: at(md, line, ch) + length,
    insert,
  });

  it('recognises the measured shape', () => {
    expect(isMarkerRenumbering(doc, change(2, 0, 4, '2. '))).toBe(true);
    expect(isMarkerRenumbering(doc, change(3, 3, 3, '3. '))).toBe(true);
  });
  it('not one digit deleted inside a number', () => {
    expect(isMarkerRenumbering(doc, change(2, 0, 1, ''))).toBe(false);
  });
  it('not a changed delimiter', () => {
    expect(isMarkerRenumbering(doc, change(2, 0, 4, '2) '))).toBe(false);
  });
  it('not a replacement reaching past the marker\'s space', () => {
    expect(isMarkerRenumbering(doc, change(2, 0, 5, '2. x'))).toBe(false);
  });
  it('not the same number written back', () => {
    expect(isMarkerRenumbering(doc, change(2, 0, 4, '13. '))).toBe(false);
  });
  it('but a zero-padded number rewritten, as Obsidian compares numbers as text', () => {
    const padded = Text.of(['02. b', '']);
    expect(isMarkerRenumbering(padded, { fromA: 0, toA: 4, insert: '2. ' })).toBe(true);
  });
  it('not a change starting before the number', () => {
    expect(isMarkerRenumbering(doc, change(3, 0, 6, '   3. '))).toBe(false);
  });
  it('not a change spanning a line break', () => {
    expect(isMarkerRenumbering(doc, change(1, 4, 4, '2. '))).toBe(false);
  });

  it('a transaction of renumberings alone is kept whole', () => {
    const src = '1. a\n3. b\n4. c\n';
    const changes = transaction(src, renumber(src, 1, 0, '3. ', '2. '), [renumber(src, 2, 0, '4. ', '3. ')]);
    expect(userChanges(Text.of(src.split('\n')), changes)).toHaveLength(2);
  });

  it('with nothing set aside, the changes read as iterChangedRanges joins them', () => {
    const src = 'abc\ndef\nghi\n';
    const startDoc = Text.of(src.split('\n'));
    const changes = transaction(src, { from: 1, to: 3, insert: 'X' }, [{ from: 3, to: 5, insert: 'Y' }, { from: 9, to: 10 }]);
    const joined: UserChange[] = [];
    changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      joined.push({ fromA, toA, insert: changes.apply(startDoc).sliceString(fromB, toB) });
    });
    expect(userChanges(startDoc, changes)).toEqual(joined);
  });
});

describe('the userEvent a transaction is classified under', () => {
  it('is none when the only one is the renumbering Obsidian appended', () => {
    expect(userEventOf('input.renumber')).toBeUndefined();
    expect(classify(
      { userEvent: userEventOf('input.renumber'), isComposition: false, changedLineSpans: [], cursorBefore: { line: 0, ch: 0 }, emptySelectionBefore: true },
      parse('1. a\n'),
    )).toBe('programmatic');
  });
  it('is the user\'s own otherwise', () => {
    expect(userEventOf('delete.backward')).toBe('delete.backward');
    expect(userEventOf(undefined)).toBeUndefined();
  });
});
