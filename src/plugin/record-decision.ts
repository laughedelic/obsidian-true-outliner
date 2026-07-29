/**
 * Does a transaction dispatch a cursor CodeMirror's history could not
 * recompute — i.e. must it be recorded (`caret-placement-policy`)?
 *
 * Its own module, rather than a function inside `history-caret.ts`, for two
 * reasons. It is a pure function of the transaction, with no view, no DOM and
 * no Obsidian import — so it is directly unit-testable, which the ViewPlugin
 * around it is not (`history-caret.ts` imports `obsidian`, and the suite has
 * no DOM). And testing it directly is the point: the history tests build the
 * re-assertion themselves, so they stay green whether or not this predicate
 * selects the right dispatches — the "test that cannot fail for the right
 * reason" shape docs/research/04 Q28 catalogues.
 */

import { Transaction } from '@codemirror/state';
import { isPluginOwnUserEvent } from '../classify';

/**
 * The rule: record whenever the cursor being dispatched is not what mapping
 * would produce.
 *
 * `assoc = 1` is not a preference — it is the association
 * `@codemirror/commands` hardcodes in its redo restore
 * (`event.startSelection.map(event.changes.invertedDesc, 1)`), so this asks
 * CM6's own mapping the exact question that matters: *is this the selection
 * redo would recompute?* If yes, recording buys nothing and would only add
 * the second-undo cost; if no, recording is the only channel that can carry
 * the choice forward.
 *
 * This replaces a hand-derived list of OPERATIONS whose cursor was a choice
 * (move, split, merge, paste, structural delete). That list was almost right,
 * and its one failure was measurable: when indent or outdent falls back to the
 * operation's own cursor because the mapped position would not be addressable,
 * THAT dispatch is choosing a cursor too, and a per-operation list left it
 * unrecorded — so redo recomputed the mapped position and put the caret back
 * on a gap line.
 *
 * The derived rule subsumes the old set exactly (a chosen cursor never equals
 * the mapped one; a derived cursor always does) and cannot drift from the
 * dispatch sites, because there is no list to keep in sync.
 *
 * The `userEvent` gate keeps foreign and ordinary-typing transactions out of
 * the comparison entirely: only this plugin's own structural dispatches are
 * ever examined.
 */
export function needsRecording(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  if (!isPluginOwnUserEvent(tr.annotation(Transaction.userEvent))) return false;
  return !tr.startState.selection.map(tr.changes, 1).eq(tr.newSelection);
}
