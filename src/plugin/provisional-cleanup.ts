/**
 * Undo-on-abandon (`structural-history-integration`): a structural keypress
 * that creates an EMPTY PLACE — a provisional gap line, an empty list item, an
 * empty heading — and is then declined is removed by UNDOING that keypress,
 * never by dispatching a new change that deletes what it made.
 *
 * Declining is either gesture: moving the caret away without typing there, or
 * deleting the place with Backspace/Delete.
 *
 * Undo rather than a deletion because a deletion fails three ways (design D6):
 * it adds an undo step the user did not ask for, or is unundoable if it
 * suppresses one; it has to decide what counts as removable content, which asks
 * whether a `#` is content and a bullet is chrome — a question with a real
 * answer that has nothing to do with abandonment; and it can only narrow a gap
 * to what the rule believes is minimal, where an undo restores the exact bytes.
 *
 * The whole mechanism rests on a property of this plugin's own `userEvent`
 * values: `@codemirror/commands` joins a change into the previous history entry
 * only for the `input.type` and `delete` families, so a structural keypress is
 * always its own entry and undoing it can never swallow the typing before it.
 * That is pinned by `tests/undo-on-abandon.test.ts` with a negative control,
 * because renaming an event into those families would silently turn this
 * cleanup into data loss.
 */

import {
  EditorSelection,
  Transaction,
  type ChangeSet,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undo, undoDepth } from '@codemirror/commands';
import { itemContentIsEmpty } from '../ops';
import { nodeAtLine, nodeStartLine } from '../locate';
import { nodeContentStart, nextNodeInOrder } from '../caret';
import { parsedDoc } from './parsed-doc';

/**
 * What one view remembers about the empty place its last structural keypress
 * created. Transient by design: it holds no document data, and losing it
 * degrades to leaving the place alone, which is the pre-existing behaviour and
 * always safe. That is what makes the guard fail-safe by construction rather
 * than by careful invalidation.
 */
interface CreatedPlace {
  /**
   * Undo depth immediately after the creating transaction, as a BACKSTOP for
   * history movement this module never sees — an undo or redo from elsewhere.
   *
   * It is deliberately not the primary guard, because it cannot be: history
   * joins in one direction only. A structural event never joins the entry
   * before it (which is what makes the cleanup safe at all), but `input.type`
   * IS joinable, so the user typing on the place folds into the keypress's OWN
   * entry and leaves the depth unchanged. Type, delete what was typed, walk
   * away, and a depth-only guard would undo an entry containing the user's
   * work. Dropping the record on any document change is what actually covers
   * that; `tests/undo-on-abandon.test.ts` measures the join.
   */
  readonly depth: number;
  /** The line the empty place occupies, in the post-keypress document. */
  readonly line: number;
  /** Where the caret was BEFORE the keypress — Backspace's landing spot, which
   * is exactly "where the cancelled keypress started". */
  readonly startHead: number;
  /** The creating transaction's changes, inverted: the change set undo will
   * apply, used to map a target position back through the removal. */
  readonly inverted: ChangeSet;
}

const created = new WeakMap<EditorView, CreatedPlace>();

/**
 * The dispatches whose UNDO removes an empty place and leaves the document as
 * if the keypress had not happened. That is a narrower test than "leaves the
 * caret on an empty place", and the difference matters.
 *
 * The empty-item ladder's two operations are both absent, for the same reason:
 * neither CREATES the place. `outdent` moves an item that was already empty, so
 * undoing it puts that item back one level deeper. `unwrap` converts an empty
 * item into a blank position, so undoing it restores the `- ` — which would
 * make abandoning an Enter-Enter (make an empty item, then leave the list)
 * leave a bullet behind that would not be there without this feature at all.
 * The blank line the unwrap leaves is the result of a deliberate act, not
 * debris from an unused keypress.
 */
const CREATING_EVENTS: readonly string[] = [
  'input.structure.split',
  'input.structure.sibling-heading',
];

function headingTitleIsEmpty(lines: readonly string[]): boolean {
  const match = /^\s*#{1,6}[ \t]*(.*)$/.exec(lines[0] ?? '');
  return match !== null && match[1]!.trim() === '';
}

/**
 * The line of the empty place the caret currently occupies, or `null`.
 *
 * A gap line is a PROVISIONAL POSITION; an empty list item or an empty heading
 * is a real node with nothing in it. Both are "a place the keypress made that
 * the user has not used", which is the only distinction the cleanup needs — and
 * the reason it never has to answer whether a marker is chrome or content.
 */
function emptyPlaceLine(state: EditorState): number | null {
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length !== 1) return null;
  const { doc: outlineDoc } = parsedDoc(state.doc);
  const line = state.doc.lineAt(sel.head).number - 1;
  const node = nodeAtLine(outlineDoc, line);
  if (!node) return null;
  const lineIndex = line - nodeStartLine(outlineDoc, node.id);
  if (lineIndex >= node.lines.length) return line; // a gap line: provisional
  if (node.kind === 'list-item' && itemContentIsEmpty(node)) return line;
  if (node.kind === 'heading' && headingTitleIsEmpty(node.lines)) return line;
  return null;
}

/**
 * True when this transaction is one that can CREATE an empty place.
 *
 * Shift+Enter's continuation carries the generic `input` event on purpose (see
 * `classify.ts`), so it is identified by shape instead: it inserts a line
 * break. No deletion can, which is what keeps a Backspace that happens to empty
 * an item — leaving the caret in a genuinely empty node the user emptied
 * themselves — from being recorded and then silently undone.
 */
function isCreatingTransaction(userEvent: string | undefined, inserted: boolean): boolean {
  if (userEvent !== undefined && CREATING_EVENTS.includes(userEvent)) return true;
  return userEvent === 'input' && inserted;
}

/** Perform the cancel: undo the creating keypress, then place the caret at
 * `target`, mapped through the change undo is about to remove. */
function cancel(view: EditorView, record: CreatedPlace, target: number): void {
  const mapped = record.inverted.mapPos(target, 1);
  created.delete(view);
  undo(view);
  const clamped = Math.max(0, Math.min(mapped, view.state.doc.length));
  view.dispatch({ selection: EditorSelection.cursor(clamped), scrollIntoView: true });
}

/** The record for this view, but only when every guard still holds. */
function liveRecord(view: EditorView): CreatedPlace | undefined {
  const record = created.get(view);
  if (!record) return undefined;
  if (undoDepth(view.state) !== record.depth) return undefined;
  return record;
}

/** Backspace/Delete on the created place cancel it, treating the place as the
 * empty node it stands for rather than narrowing the gap around it by a line. */
export function cancelOnDelete(view: EditorView, forward: boolean): boolean {
  const record = liveRecord(view);
  if (!record) return false;
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  if (view.state.doc.lineAt(sel.head).number - 1 !== record.line) return false;
  if (emptyPlaceLine(view.state) !== record.line) return false;

  let target = record.startHead;
  if (forward) {
    // Delete reaches for what FOLLOWS, so the caret lands at the next node's
    // content start rather than back where the keypress began.
    const { doc: outlineDoc } = parsedDoc(view.state.doc);
    const node = nodeAtLine(outlineDoc, record.line);
    const next = node ? nextNodeInOrder(outlineDoc, node) : undefined;
    if (next) {
      const pos = nodeContentStart(outlineDoc, next);
      const line = view.state.doc.line(pos.line + 1);
      target = line.from + pos.ch;
    }
  }
  cancel(view, record, target);
  return true;
}

/**
 * Records the place a structural keypress creates, and cancels it when a later
 * gesture moves the caret away without typing there.
 *
 * The cancel is deferred out of the update cycle — a transaction cannot be
 * dispatched from within one — and every guard is re-checked when it fires, so
 * anything that happens in between simply means no cleanup. That is what makes
 * the deferral safe rather than a race: the failure mode is "the empty place
 * stays", which is exactly the behaviour without this feature at all.
 */
export function provisionalCleanup(inOutlineMode: (view: EditorView) => boolean): Extension {
  return EditorView.updateListener.of((update) => {
    const { view } = update;

    // Outline mode only, and checked on EVERY update rather than once at
    // registration: `registerEditorExtension` installs this in every editor view,
    // including notes with the mode off and nested table-cell editors. Without
    // the gate the recorder would fire on stock editing — CM6's own Enter carries
    // `userEvent: 'input'` and inserts a line break, which is exactly the shape
    // this module uses to spot Shift+Enter — and a plain newline in an ordinary
    // note would be undone the moment the caret moved away. Reported by review.
    if (!inOutlineMode(view)) {
      created.delete(view);
      return;
    }

    if (update.docChanged) {
      // Any document change replaces whatever was remembered: either it IS the
      // creating keypress (recorded below), or it is something else — including
      // the user typing on the place, which USES it and must never be undone.
      created.delete(view);

      const last = update.transactions[update.transactions.length - 1];
      const event = last?.annotation(Transaction.userEvent) ?? undefined;
      if (last && isCreatingTransaction(event, changesInsertLineBreak(last.changes))) {
        const line = emptyPlaceLine(view.state);
        if (line !== null) {
          created.set(view, {
            depth: undoDepth(view.state),
            line,
            startHead: last.startState.selection.main.head,
            inverted: last.changes.invert(last.startState.doc),
          });
        }
      }
      return;
    }

    if (!update.selectionSet) return;
    const record = liveRecord(view);
    if (!record) return;
    const sel = view.state.selection.main;
    const stillThere =
      sel.empty &&
      view.state.selection.ranges.length === 1 &&
      view.state.doc.lineAt(sel.head).number - 1 === record.line;
    if (stillThere) return;

    const target = sel.head;
    queueMicrotask(() => {
      const live = liveRecord(view);
      if (!live || live !== record) return;
      if (view.state.doc.lineAt(view.state.selection.main.head).number - 1 === live.line) return;
      cancel(view, live, target);
    });
  });
}

/** Whether a change set inserts a line break — Shift+Enter's signature, and
 * something no deletion can do. */
function changesInsertLineBreak(changes: ChangeSet): boolean {
  let found = false;
  changes.iterChanges((_fromA, _toA, _fromB, _toB, insert) => {
    if (insert.lines > 1) found = true;
  });
  return found;
}
