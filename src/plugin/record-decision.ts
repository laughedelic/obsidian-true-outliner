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
 * What the derived rule guarantees is BEHAVIOURAL equivalence, not identical
 * membership: every dispatch mapping cannot reproduce is recorded, so redo is
 * exact wherever the old list made it exact. It can record strictly FEWER
 * transactions, and that is a feature. A chosen position sometimes coincides
 * with the mapped one — splitting `- alpha beta` before `beta` inserts `\n- `
 * at the caret, and assoc=1 maps that caret onto the new item's content start,
 * which is exactly the split's own anchor (measured: both offset 11). The old
 * name-based list recorded it anyway; recording it buys nothing and costs the
 * second-undo precision, so the derived rule correctly skips it.
 *
 * And it cannot drift from the dispatch sites, because there is no list to keep
 * in sync.
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
