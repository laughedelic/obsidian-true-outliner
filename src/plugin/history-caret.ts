/**
 * Making a structural operation's own cursor survive redo, for the dispatches
 * where redo could not otherwise reproduce it.
 *
 * ## Why redo cannot just recompute it
 *
 * Pressing redo does NOT re-run the operation. CodeMirror replays a recorded
 * `ChangeSet` — a list of text splices — and derives a cursor from it. By then
 * every semantic fact is gone: history retains the changes and the selection
 * BEFORE the edit, and nothing else. Not the outline tree, not which node was
 * the subject, not which operation ran. So the cursor redo produces can only
 * ever be a function of those two inputs.
 *
 * That is enough for indent and outdent, whose cursor means "wherever you
 * were, shifted by the splices" — a function of exactly those inputs, which
 * `dispatch.ts`'s `mapCursorForward` computes deliberately so that the live
 * dispatch and history's own recomputation agree. It is not enough for a
 * MOVE, whose cursor means "follow that node": a splice carries no notion of
 * which content is which, so mapping faithfully lands the caret on whatever
 * now occupies the old coordinates — the other node.
 *
 * The distinction is not determinism. `ops.ts` computes every cursor as a pure
 * function; the question is whether that function's inputs survive into
 * history. Demonstrated concretely: the identical document, caret and change
 * set arise both from "move `- b` above `- a`" (caret should follow to offset
 * 2) and from two ordinary text edits swapping the letters (caret should stay
 * at offset 6). Redo answers 6 for both, because the inputs are byte-identical
 * — right for one, wrong for the other. No formula over those inputs can be
 * correct for both.
 *
 * Recording is therefore not a workaround for a badly chosen cursor. It
 * preserves the one input redo would otherwise have lost, in the only slot
 * CodeMirror offers for it (`selectionsAfter`, written by a separate
 * selection-only transaction).
 *
 * ## Scope: a property of the DISPATCH, not of the operation
 *
 * `record-decision.ts`'s `needsRecording` owns that question and carries its
 * reasoning. In short: record whenever the dispatched selection is not what
 * CM6's own forward mapping would produce, which subsumes the hand-derived
 * `SEMANTIC_CURSOR_USER_EVENTS` list this replaces and closes the case that
 * list could not express — an indent whose addressability fallback fires is
 * choosing a cursor, even though its operation is on the "derived" side.
 *
 * This module is the trigger and the dispatch; it holds no rule.
 *
 * ## The cost, taken deliberately
 *
 * Unchanged from `fix-redo-cursor-after-structural-ops` (docs/research/04
 * Q21): this makes every redo exact, and makes a SECOND undo restore the
 * recorded cursor rather than the pre-operation one — the event a second undo
 * reads from is created on history's undone branch, and `addSelection` only
 * ever writes to the done branch. Measured both ways before choosing: without
 * recording, redo after a reordering lands on the wrong node every single
 * time, which is plainly worse than a less-precise second undo.
 */

import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { needsRecording } from './record-decision';
import { isNestedEditor } from './nested-editor';
import type { ModeSource } from './keymap';

/** Measured on `- a` / `- b`: without this, move → undo → redo left the caret
 * on `- a` at every depth, where the operation had put it on the moved `- b`. */
class SemanticCursorRecorder implements PluginValue {
  private destroyed = false;

  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
  ) {}

  update(update: ViewUpdate): void {
    if (!update.docChanged) return;
    const relevant = update.transactions.some((tr) => needsRecording(tr));
    if (!relevant) return;

    const path = update.state.field(editorInfoField, false)?.file?.path;
    if (!path || !this.modes.isOutline(path)) return;
    if (isNestedEditor(this.view)) return;

    // The exact state this recording is FOR. Anything landing first owns the
    // cursor instead, and a stale re-assertion could put an out-of-range
    // selection on a document that has since changed.
    const recorded = update.state;

    // Deferred because CM6 forbids dispatching from inside an update, and a
    // MICROTASK rather than a timeout so it drains before the next input
    // event: an undo pressed immediately after the operation still finds the
    // cursor recorded.
    queueMicrotask(() => {
      if (this.destroyed || this.view.state !== recorded) return;
      this.view.dispatch({
        selection: recorded.selection,
        // Visual no-op by construction — the selection it asserts is the one
        // already in place. `filter: false` keeps the enforcement funnel out
        // of it, so escalation and placement resolution cannot move the very
        // cursor this exists to record; that is why it needs no `userEvent` of
        // its own in the plugin-own set, unlike the mechanism this replaces.
        filter: false,
      });
    });
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * The recorder extension, registered per editor alongside the rest of the
 * plugin's CM6 extensions.
 *
 * Self-terminating: the re-assertion it dispatches is selection-only, so it can
 * never satisfy this plugin's own `docChanged` trigger and re-enter.
 */
export function historyCaretExtension(modes: ModeSource): Extension {
  return ViewPlugin.define((view) => new SemanticCursorRecorder(view, modes));
}
