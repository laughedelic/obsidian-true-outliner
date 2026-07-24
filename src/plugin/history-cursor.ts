/**
 * Structural-history integration (`structural-history-integration`): teach
 * CodeMirror's undo history what cursor a structural operation actually
 * produced, so REDO restores that cursor instead of computing one.
 *
 * ## The bug this fixes
 *
 * `@codemirror/commands`' `HistoryState.pop()` picks the cursor redo restores
 * as:
 *
 *     event.selectionsAfter[0] ||
 *       event.startSelection.map(event.changes.invertedDesc, 1)
 *
 * A document-changing transaction is recorded through `addChanges`, never
 * `addSelection` — the two are mutually exclusive in the history field — so a
 * structural op's OWN resulting selection is never recorded and
 * `selectionsAfter` stays empty. That leaves the mapping branch, which maps
 * the PRE-edit cursor forward through the op's changes with `assoc = 1`. For
 * our dispatch shape (a whole-region line replacement) the pre-edit cursor
 * sits INSIDE the replaced range, and such a position maps to the END of the
 * entire inserted block:
 *
 *     pre-edit cursor ──map(changes, assoc=1)──▶ end of rewritten region
 *     join point / content start (what we set) ─▶ never consulted
 *
 * So the error's magnitude scales with how much the op rewrote: the blank
 * line below a two-paragraph merge, but the start of the NEXT SIBLING for a
 * merge that re-parents children or a Tab that indents a subtree. That is why
 * docs/research/04 Q20 saw "more than one wrong landing shape" and concluded
 * it could not be one off-by-one bug.
 *
 * ## The fix
 *
 * Re-assert the cursor in a following selection-only transaction. History
 * records `tr.startState.selection` — the value already in place, i.e. our
 * cursor — into the preceding event's `selectionsAfter`, and `pop()` then
 * prefers it over the mapping. This uses only documented CodeMirror behavior;
 * nothing here reaches into history internals.
 *
 * ## Why it kept escaping
 *
 * ANY selection-only transaction landing between the op and the undo
 * populates `selectionsAfter[0]` on its own, with the correct cursor — so a
 * single stray cursor touch hides the bug completely. Every earlier automated
 * reproduction had one (a `setCursor`/focus helper), which is why three
 * manual reports never reproduced in the harness. See
 * tests/history-cursor.test.ts, which pins that masking property so it stays
 * visible.
 */

import type { Extension } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import { CURSOR_REASSERT_USER_EVENT, isPluginOwnUserEvent } from '../classify';

/**
 * True when this update contains a structural transaction whose resulting
 * cursor needs recording: one of THIS plugin's own dispatches (the same set
 * that drives classification — D2) that actually changed the document.
 *
 * The `docChanged` half is also what makes a dispatch loop impossible: the
 * re-assertion is selection-only, so it can never satisfy this predicate and
 * re-trigger itself, even though its own `userEvent` is deliberately in the
 * plugin-own set (D4, so classification passes it through untouched).
 *
 * Pure and exported for direct unit testing — the trigger condition is the
 * part most likely to silently stop matching if a future structural dispatch
 * picks a `userEvent` outside the plugin-own set.
 */
export function needsCursorRecording(
  transactions: readonly { docChanged: boolean; userEvent: string | undefined }[],
): boolean {
  return transactions.some((tr) => tr.docChanged && isPluginOwnUserEvent(tr.userEvent));
}

class CursorRecorder implements PluginValue {
  private destroyed = false;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged) return;
    const facts = update.transactions.map((tr) => ({
      docChanged: tr.docChanged,
      userEvent: tr.annotation(Transaction.userEvent),
    }));
    if (!needsCursorRecording(facts)) return;

    // Capture the exact state this recording is FOR. If anything else lands
    // first, that transaction's own selection is what history should record,
    // so this one silently stands down (a stale re-assertion could otherwise
    // dispatch an out-of-range selection against a changed document).
    const recordedState = this.view.state;

    // Deferred because dispatching synchronously from inside an update throws
    // — CodeMirror forbids re-entrant updates. A MICROTASK specifically, not
    // a timeout: microtasks drain before the next user input event can be
    // handled, so an undo pressed immediately after the op still finds the
    // cursor recorded. A timeout would leave a real window in which a fast
    // undo beats the recording — reintroducing this exact bug, intermittently
    // (D3).
    queueMicrotask(() => {
      if (this.destroyed || this.view.state !== recordedState) return;
      this.view.dispatch({
        selection: recordedState.selection,
        userEvent: CURSOR_REASSERT_USER_EVENT,
      });
    });
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * The recorder extension. Registered per editor alongside the rest of the
 * plugin's CM6 extensions; covers BOTH structural dispatch sites
 * (src/plugin/keymap.ts's grammar and src/plugin/transaction-filter.ts's
 * enforcement rewrites) through the one shared trigger set, with no
 * site-specific code that could diverge.
 *
 * Deliberately NOT gated on outline mode: the trigger is this plugin's own
 * structural `userEvent`, which only ever arises from a dispatch that already
 * gated itself on outline mode. A second gate here would be a second thing to
 * keep in sync for no behavioral difference.
 */
export function structuralCursorRecorder(): Extension {
  return ViewPlugin.define((view) => new CursorRecorder(view));
}
