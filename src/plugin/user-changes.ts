/**
 * The changes in a transaction that are the user's own, with the ordered-list
 * renumbering Obsidian appends to them set aside.
 *
 * With "Smart lists" on, Obsidian's transaction filter runs before every
 * plugin's and returns the user's transaction with its renumbering of the
 * surrounding ordered list appended (`docs/research/obsidian-list-renumbering`).
 * Nothing marks those changes as Obsidian's: a combined transaction answers
 * `userEvent` from its first annotation, which is the user's. So they are
 * recognised by the one shape they take — a single line's `N<d> `, from where
 * its number starts, replaced by `M<d> ` with a different number and the same
 * delimiter — and set aside before the transaction is classified or judged
 * (`transaction-classification`, "A transaction is judged on the user's own
 * changes").
 *
 * The changes are read individually, because an appended change can touch the
 * user's: a linewise cut ends at the next line's start, where that line's
 * marker begins. Joined, the two read as one change across two nodes. The
 * user's own touching changes are joined again afterwards, as
 * `iterChangedRanges` joins them, so a transaction with nothing set aside reads
 * exactly as it did.
 */

import type { ChangeSet, Text } from '@codemirror/state';
import type { ChangedLineSpan } from '../classify';
import type { EditFact } from '../enforce';
import { offsetToLinePos } from './cm-pos';

/** One change in start-document offsets, with the text it inserts. */
export interface UserChange {
  readonly fromA: number;
  readonly toA: number;
  readonly insert: string;
}

/** Indentation and any `>` container prefix, then the number, its delimiter and one space. */
const MARKER_RE = /^([>\s]*?)(\d+)([.)]) /;
const REPLACEMENT_RE = /^(\d+)([.)]) $/;

/** Whether `change` rewrites exactly one ordered marker's number and nothing
 * else. The number is compared as text, as Obsidian compares it: `02. ` to `2. `
 * is a renumbering. */
export function isMarkerRenumbering(doc: Text, change: UserChange): boolean {
  const line = doc.lineAt(change.fromA);
  if (change.toA > line.to) return false;
  const marker = MARKER_RE.exec(line.text);
  const replacement = REPLACEMENT_RE.exec(change.insert);
  if (!marker || !replacement) return false;
  const numberFrom = line.from + marker[1]!.length;
  return (
    change.fromA === numberFrom &&
    change.toA === line.from + marker[0].length &&
    replacement[2] === marker[3] &&
    replacement[1] !== marker[2]
  );
}

/** The change set's changes one by one, in document order. */
export function individualChanges(changes: ChangeSet): UserChange[] {
  const out: UserChange[] = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    out.push({ fromA, toA, insert: inserted.toString() });
  }, true);
  return out;
}

/** Touching changes joined into one, as `iterChangedRanges` reads them. */
function joinTouching(changes: readonly UserChange[]): UserChange[] {
  const out: UserChange[] = [];
  for (const change of changes) {
    const last = out[out.length - 1];
    if (last && last.toA === change.fromA) {
      out[out.length - 1] = { fromA: last.fromA, toA: change.toA, insert: last.insert + change.insert };
    } else {
      out.push(change);
    }
  }
  return out;
}

/**
 * The user's changes in `changes`, applied to `startDoc`: every appended
 * renumbering set aside, the rest joined where they touch. When nothing is set
 * aside, or nothing else would remain, every change is kept.
 */
export function userChanges(startDoc: Text, changes: ChangeSet): UserChange[] {
  const all = individualChanges(changes);
  const kept = all.filter((change) => !isMarkerRenumbering(startDoc, change));
  return joinTouching(kept.length === 0 || kept.length === all.length ? all : kept);
}

/** Old-document (`startDoc`) line spans touched by the user's
 * changes (`userChanges`) — inclusive on both ends (classify.ts's
 * convention). A pure insertion (fromA === toA) only ever touches the one
 * line it lands on. Also carries the two Phase C facts classify.ts needs to
 * recognize boundary shapes a line-only span can't (node-edit-enforcement
 * D4/D5): the inserted text itself, and whether this change deletes
 * exactly one line-break character. */
export function changedLineSpansOf(startDoc: Text, changes: readonly UserChange[]): ChangedLineSpan[] {
  return changes.map(({ fromA, toA, insert }) => {
    const fromLineObj = startDoc.lineAt(fromA);
    const toLineObj = startDoc.lineAt(Math.max(fromA, toA - 1));
    return {
      fromLine: fromLineObj.number - 1,
      toLine: toLineObj.number - 1,
      insertedText: insert,
      deletesLineBoundary: toA === fromA + 1 && fromLineObj.to === fromA,
      fromCh: fromA - fromLineObj.from,
      toCh: toA - toLineObj.from,
      rangeEnd: offsetToLinePos(startDoc, toA),
    };
  });
}

/**
 * Every one of the user's changes (`userChanges`), each in
 * old-document `LinePos` coordinates, for the verdict layer (`EditFact`).
 * `fix-orphan-gap-on-node-deletion` D2 lifts the original single-change-range
 * restriction: every range is now collected, and `computeVerdictForRanges` decides per-range
 * whether the shapes it sees are enforceable, falling back to `pass` for
 * anything it doesn't model.
 */
export function editFactsOf(startDoc: Text, head: number, changes: readonly UserChange[]): EditFact[] {
  const cursorBefore = offsetToLinePos(startDoc, head);
  return changes.map(({ fromA, toA, insert }) => ({
    from: offsetToLinePos(startDoc, fromA),
    to: offsetToLinePos(startDoc, toA),
    insert,
    cursorBefore,
  }));
}

/**
 * The transaction's `userEvent` as the user's own edit carried it. Obsidian's
 * appended spec carries `input.renumber`, and a transaction answers `userEvent`
 * from its first annotation: on a dispatch that had none of its own, that is
 * Obsidian's. Read as it stands, it would take an unannotated dispatch out of
 * `programmatic` whenever Obsidian renumbered around it.
 */
export function userEventOf(userEvent: string | undefined): string | undefined {
  return userEvent === 'input.renumber' ? undefined : userEvent;
}
