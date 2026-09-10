/**
 * What happens to a fold when the document changes underneath it.
 *
 * One rule, covering two things that look separate and are not:
 *
 * - A structural MOVE destroys the fold on the subtree it moves. CodeMirror
 *   maps a folded range through a change set, and a move deletes the block from
 *   one place and inserts it in another, so both ends of the range land in
 *   deleted text and the fold is gone (measured, docs/research/28). Folding a
 *   subtree in order to move it as one unit is the ordinary reason to fold, so
 *   losing it there is the worst possible case.
 * - An EDIT INSIDE a folded subtree leaves the reader watching a fold that no
 *   longer says what it said. Undo is the sharp case — edit a subtree, fold it,
 *   press undo, and the change happens where nobody can see it — but a remote
 *   sync and a find-and-replace do the same thing.
 *
 * The rule: a change that touches a fold's interior OPENS it, unless the same
 * block is still there afterwards — the same lines, in the same order, ignoring
 * each line's indentation — in which case the fold follows it to wherever it
 * landed. A move relocates those lines unchanged and an indent rewrites only
 * their leading whitespace, so both keep the fold; an edit changes what a line
 * SAYS, so it reveals.
 *
 * Indentation is excluded from the comparison rather than being a special case
 * for indent and outdent, because it is the same fact either way: whitespace at
 * the head of a line is where the node sits, not what it says, and a fold is
 * about the latter. (An earlier note recorded that an indent preserves its fold
 * unaided, which measurement did not bear out — both operations lose it, for
 * the same reason.)
 *
 * Two consequences worth stating, because they are the reason this shape was
 * chosen over the alternatives (design D4):
 *
 * - It needs nothing from the operation that caused the change. `OpOutput`
 *   carries an anchor and a span and no per-root paths, `finalize` regenerates
 *   node ids, and the keyboard path never sees an `OpOutput` at all — so any
 *   design that identifies the moved node through the operation has to be
 *   plumbed through two dispatch sites that do not currently carry it.
 * - UNDO restores the fold for free, without folds ever entering the history.
 *   Undoing a move puts the same hidden lines back, so the same rule that
 *   carried the fold forward carries it back; undoing an edit INSIDE a fold
 *   changes those lines, so the same rule opens it. Folding stays what it is —
 *   view state, not document state — and the history stays what it is.
 *
 * A transaction FILTER rather than a listener, because the fold effects have to
 * ride in the same transaction as the change: one undo step, and no frame in
 * which the text has moved and the fold has not.
 */

import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import {
  EditorState,
  type Extension,
  type Text,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { isOutlineMode } from './outline-state';

/** A fold as it stood before the change, with the block it hides. */
interface CarriedFold {
  readonly from: number;
  readonly to: number;
  /**
   * The HIDDEN lines, with their indentation stripped — what this fold is
   * actually hiding, and nothing else.
   *
   * The identity of a folded block, in the only terms that survive both
   * operations that move it: indentation is excluded because an indent rewrites
   * exactly that, and the node's own visible line is excluded because typing on
   * it changes nothing about what is hidden. Comparing one line alone would
   * match the wrong sibling in a list of repeated items, which is why it is the
   * whole run.
   */
  readonly key: readonly string[];
  /** How many lines the run actually has. The key is capped, so this is what
   * says where the fold ends once the run is found again. */
  readonly lineCount: number;
  /** Where the hidden run began, so the nearest candidate can be preferred. */
  readonly blockStart: number;
}

/**
 * How many of a hidden run's lines the fingerprint keeps.
 *
 * The whole run would be read on every document change, for every fold — a note
 * with a thousand hidden lines under one fold would pay for all of them on each
 * keystroke, and nested folds pay again for the same content. A bounded prefix
 * plus the run's length identifies a block well enough for the only thing this
 * does with it: finding where the same block went, near where it was.
 */
const KEY_LINES = 32;

function carriedFolds(state: EditorState): CarriedFold[] {
  const folds: CarriedFold[] = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    // The fold begins at the END of its node's own line, so the hidden run is
    // the line after that one through the line `to` sits on.
    const head = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    if (last <= head) return;
    const key: string[] = [];
    for (let n = head + 1; n <= Math.min(last, head + KEY_LINES); n++) {
      key.push(state.doc.line(n).text.trimStart());
    }
    folds.push({
      from,
      to,
      key,
      lineCount: last - head,
      blockStart: state.doc.line(head + 1).from,
    });
  });
  return folds;
}

/** Do the `key.length` lines starting at `line` (1-based) still say what the
 * block said? */
function matchesAt(doc: Text, line: number, fold: CarriedFold): boolean {
  const key = fold.key;
  // The run has to still FIT, whole — the key is only its first lines.
  if (line < 1 || line + fold.lineCount - 1 > doc.lines) return false;
  for (let i = 0; i < key.length; i++) {
    if (doc.line(line + i).text.trimStart() !== key[i]) return false;
  }
  return true;
}

/**
 * The line the block starts on now (1-based), or null when it is no longer
 * there in one piece.
 *
 * Tries where the change set says the block went first, which is the answer for
 * every edit that leaves the block alone, and falls back to a scan of the
 * document — an indent rewrites its lines in place, so no insertion carries the
 * block and its new position has to be found rather than mapped.
 *
 * Ties in the scan go to the candidate nearest where the block used to be. A
 * document can hold two identical subtrees, and the one this fold belonged to
 * is the one it moved the least far from.
 */
function relocatedTo(fold: CarriedFold, tr: Transaction, touched: boolean): number | null {
  const doc = tr.newDoc;
  const target = tr.changes.mapPos(fold.blockStart, 1);
  const mapped = doc.lineAt(Math.min(target, doc.length)).number;
  if (matchesAt(doc, mapped, fold)) return mapped;
  // The scan is only for a run the change actually disturbed. A change that
  // never reached inside the fold leaves the run where mapping says it is, so a
  // miss there means the block is genuinely gone — and scanning the document
  // for it on every unrelated keystroke is what makes a large folded note
  // expensive.
  if (!touched) return null;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let n = 1; n + fold.lineCount - 1 <= doc.lines; n++) {
    if (!matchesAt(doc, n, fold)) continue;
    const distance = Math.abs(doc.line(n).from - target);
    if (distance < bestDistance) {
      best = n;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What every fold in the document should be after this change.
 *
 * Every fold is RESTATED rather than only the ones a change reaches, because
 * CodeMirror's own mapping cannot be relied on to keep one: measured, a
 * structural move drops the fold on a subtree it relocates even though the
 * change set never overlaps the folded range. Restating is idempotent —
 * CodeMirror ignores a `foldEffect` for a fold that already exists.
 *
 * What that costs is bounded on both axes it could grow along: the fingerprint
 * is capped at `KEY_LINES` however much a fold hides, and the document-wide
 * scan runs only for a fold whose interior the change actually touched. An
 * ordinary keystroke away from every fold therefore pays one mapped-position
 * comparison of at most `KEY_LINES` lines per fold.
 *
 * A fold whose block is gone gets an explicit UNFOLD rather than being left
 * alone, since mapping may well have preserved a range that now hides
 * different content. That is the reveal: an edit inside a folded subtree —
 * typed, synced, or undone — opens it, so nothing changes where nobody can see.
 */
export function foldCarryEffects(tr: Transaction): TransactionSpec | null {
  const carried = carriedFolds(tr.startState);
  if (carried.length === 0) return null;
  const doc = tr.newDoc;
  const effects = [];
  for (const fold of carried) {
    let touched = false;
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA < fold.to && toA > fold.from) touched = true;
    });
    const hiddenStart = relocatedTo(fold, tr, touched);
    if (hiddenStart === null || hiddenStart < 2) {
      const from = tr.changes.mapPos(fold.from, 1);
      const to = tr.changes.mapPos(fold.to, 1);
      if (to > from) effects.push(unfoldEffect.of({ from, to }));
      continue;
    }
    // The fold starts at the end of the line ABOVE the hidden run — the node's
    // own line, wherever it now is.
    const from = doc.line(hiddenStart - 1).to;
    const to = doc.line(hiddenStart + fold.lineCount - 1).to;
    if (to > from) effects.push(foldEffect.of({ from, to }));
  }
  // `sequential`, and it is load-bearing. Without it CodeMirror merges this
  // spec into the transaction NON-sequentially and maps its effects through the
  // change set — a second time, since these positions are already stated in the
  // document the change produces. Measured: a fold carried through an indent
  // landed one line late, and one carried through a move landed inside deleted
  // text and vanished. `sequential` says "these positions are already in the
  // new coordinate space", which is what they are.
  return effects.length > 0 ? { effects, sequential: true } : null;
}

export function foldCarryExtension(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    if (!isOutlineMode(tr.startState)) return tr;
    const carry = foldCarryEffects(tr);
    // Appended as a second spec, which CodeMirror combines with the first into
    // ONE transaction — the same shape `transaction-filter.ts` uses to attach a
    // corrected selection.
    return carry ? [tr, carry] : tr;
  });
}
