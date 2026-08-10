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
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undoDepth } from '@codemirror/commands';
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
  /**
   * The edit that removes the place and nothing else, in the post-keypress
   * document's coordinates.
   *
   * Recorded rather than computed later, and applied as a NEW transaction
   * rather than by undoing the keypress. Undo reverts the WHOLE keypress, which
   * is wrong whenever it did more than create the place: Enter over a block
   * selection deletes the selection AND opens a position, and abandoning the
   * position brought the selected text back. Reversing only the sub-change that
   * made the place leaves the rest of the keypress standing.
   */
  readonly reverse: { readonly from: number; readonly to: number; readonly insert: string };
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
/**
 * A dispatch of ours that leaves the caret on a GAP line necessarily created
 * that position — a gap line is a place, not a node, so there was nothing there
 * to move the caret onto. Any structural event qualifies, and the list is
 * deliberately broad for a measured reason: which event dissolves a node into a
 * blank line depends on the node's PARENT, not on the gesture. Enter on an empty
 * item at the top of a list unwraps it, but the same item under a PARAGRAPH
 * outdents instead — the reparent rule makes it a paragraph, an empty paragraph
 * has no encoding, and it dissolves into a blank line under a different event.
 * Keying on the event name left that case unrecorded, so the blank line stayed
 * behind; keying on where the caret landed covers every parent.
 */
const GAP_PLACE_EVENTS: readonly string[] = [
  'input.structure.split',
  'input.structure.sibling-heading',
  'input.structure.continue',
  'input.structure.unwrap',
  'input.structure.outdent',
];

/**
 * An EMPTY NODE is different: it can pre-exist the keypress. Only the dispatches
 * that MATERIALIZE one qualify, or an outdent that merely moved an already-empty
 * item would be recorded and then removed out from under the user.
 */
const NODE_PLACE_EVENTS: readonly string[] = [
  'input.structure.split',
  'input.structure.sibling-heading',
  'input.structure.continue',
];

/** The userEvent the abandon edit carries: plugin-own, so the verdict layer
 * short-circuits it (removing lines would otherwise read as a boundary-crossing
 * edit), and outside the joinable families, so it forms its own history entry
 * and one undo returns to the empty place rather than past the keypress. */
const ABANDON_EVENT = 'input.structure.abandon';

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
function emptyPlaceAt(state: EditorState): { line: number; kind: 'gap' | 'node' } | null {
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length !== 1) return null;
  const { doc: outlineDoc } = parsedDoc(state.doc);
  const line = state.doc.lineAt(sel.head).number - 1;
  const node = nodeAtLine(outlineDoc, line);
  if (!node) return null;
  const lineIndex = line - nodeStartLine(outlineDoc, node.id);
  if (lineIndex >= node.lines.length) return { line, kind: 'gap' };
  if (node.kind === 'list-item' && itemContentIsEmpty(node)) return { line, kind: 'node' };
  if (node.kind === 'heading' && headingTitleIsEmpty(node.lines)) return { line, kind: 'node' };
  return null;
}

function emptyPlaceLine(state: EditorState): number | null {
  return emptyPlaceAt(state)?.line ?? null;
}

/**
 * True when this transaction is one that can CREATE an empty place.
 *
 * Keyed ONLY on this plugin's own markers — never on the shape of the change.
 * An earlier version also matched "a generic `input` event that inserts a line
 * break", to catch Shift+Enter's continuation while it still carried the
 * generic event. That signature is indistinguishable from CodeMirror's OWN
 * Enter, which runs inside outline mode whenever the grammar declines: a caret
 * left on a gap line by a programmatic placement is exactly such a case, and
 * `content-space-caret` deliberately permits it. The stock newline would have
 * been recorded as ours and undone on the next caret move, deleting a blank
 * line the user authored. Shift+Enter now carries `input.structure.continue`
 * instead, so recognition needs no guessing. Reported by review.
 */
function isCreatingTransaction(
  userEvent: string | undefined,
  kind: 'gap' | 'node',
): boolean {
  if (userEvent === undefined) return false;
  return (kind === 'gap' ? GAP_PLACE_EVENTS : NODE_PLACE_EVENTS).includes(userEvent);
}

/**
 * The edit that removes the place `line` occupies, in the coordinates of the
 * document `tr` produced: delete the place's own line, plus however many lines
 * the keypress ADDED beyond it.
 *
 * One rule for every creator, replacing a set of per-event special cases that
 * kept growing as new parents were tried:
 *
 * - an end-of-node Enter widens a gap by two lines → both go;
 * - a materialized `- ` or `## ` occupies one line → it goes;
 * - an unwrap, and an outdent that DISSOLVES an empty item into a blank line,
 *   add no lines at all → the one line they left goes.
 *
 * Always a deletion, never an inversion. Inverting the change would restore
 * what the keypress removed — the `- ` the user pressed Enter to escape — which
 * is the opposite of abandoning the place it left behind.
 */
function reverseFor(tr: Transaction, line: number): { from: number; to: number; insert: string } {
  const doc = tr.state.doc;
  const added = doc.lines - tr.startState.doc.lines;
  const count = Math.max(1, added);
  const first = doc.line(line + 1);
  const last = doc.line(Math.min(line + count, doc.lines));
  const to = Math.min(last.to + 1, doc.length);
  // A place on the document's LAST line has no following newline to take, so
  // the span above is empty and the deletion would silently do nothing. Take
  // the PRECEDING newline instead — the ordinary way to remove a final line.
  if (to <= first.from) return { from: Math.max(0, first.from - 1), to: doc.length, insert: '' };
  return { from: first.from, to, insert: '' };
}

/**
 * Remove the place, as its own undoable edit.
 *
 * NOT an undo of the keypress (design D6, revised): undo reverts everything the
 * keypress did, and a keypress that replaced a block selection did more than
 * open a position — abandoning it brought the deleted text back. It also makes
 * the step invisible, where a real edit lets one undo return to the empty place,
 * which is what a user who changes their mind twice expects.
 */
function cancel(view: EditorView, record: CreatedPlace, target: number): void {
  created.delete(view);
  const { from, to, insert } = record.reverse;
  if (to > view.state.doc.length) return; // the document moved under us: leave it
  const shift = insert.length - (to - from);
  const caret = target >= to ? target + shift : Math.min(target, from);
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(Math.max(0, Math.min(caret, view.state.doc.length + shift))),
    userEvent: ABANDON_EVENT,
    scrollIntoView: true,
  });
}

/** The record for this view, but only when every guard still holds. */
function liveRecord(view: EditorView): CreatedPlace | undefined {
  const record = created.get(view);
  if (!record) return undefined;
  if (undoDepth(view.state) !== record.depth) return undefined;
  return record;
}

/**
 * Enter ON an empty place moves past it: the user is saying "not here". The
 * caret goes to the next node's content start, and the keypress that created
 * the place is cancelled when it is still cancellable — so pressing Enter twice
 * at a paragraph's end leaves the document exactly as it was and the caret in
 * the node below, rather than widening the gap on every press.
 *
 * Declines when there is no next node: at the end of a document there is
 * nowhere to advance to, and stock behaviour (which widens) is the only thing
 * left to do.
 *
 * The cancel is conditional but the MOVE is not. A place left by the
 * empty-item ladder's unwrap has no live record — undoing that would restore
 * the bullet the user just left the list to escape — but Enter there should
 * still move on rather than widen.
 */
export function advanceFromEmptyPlace(view: EditorView): boolean {
  const line = emptyPlaceLine(view.state);
  if (line === null) return false;

  const { doc: outlineDoc } = parsedDoc(view.state.doc);
  const node = nodeAtLine(outlineDoc, line);
  const next = node ? nextNodeInOrder(outlineDoc, node) : undefined;
  if (!next) return false;
  const pos = nodeContentStart(outlineDoc, next);
  const target = view.state.doc.line(pos.line + 1).from + pos.ch;

  const record = liveRecord(view);
  if (record && record.line === line) {
    cancel(view, record, target);
    return true;
  }
  view.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true });
  return true;
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
      if (last) {
        const place = emptyPlaceAt(view.state);
        if (place && isCreatingTransaction(event, place.kind)) {
          created.set(view, {
            depth: undoDepth(view.state),
            line: place.line,
            startHead: last.startState.selection.main.head,
            reverse: reverseFor(last, place.line),
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
