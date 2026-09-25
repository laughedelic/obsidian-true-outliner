/**
 * Place removal on abandonment (`structural-history-integration`): a structural
 * keypress that creates an EMPTY PLACE — a provisional gap line, an empty list
 * item, an empty heading — and is then declined has that place removed, leaving
 * everything else the keypress did standing.
 *
 * Declining is either gesture: moving the caret away without typing there, or
 * deleting the place with Backspace/Delete.
 *
 * This module decides WHETHER to remove and WHEN. It does not decide WHAT: the
 * plan that made the place states the removal edit and the dispatch carries it
 * here (`abandonEdit`). That split is not stylistic — the edit cannot be
 * recovered downstream. A transaction carries a MINIMAL DIFF of the whole
 * transformation, so a keypress that removed a selection before acting fuses
 * both steps into one replacement, and any extent read back out of that shape
 * under-counts by exactly what the removal cancelled.
 *
 * A removal rather than an undo of the keypress, for the same reason: undo
 * reverts everything, including a block selection the same keypress deleted. It
 * also leaves a real history entry, so one undo returns to the empty place.
 *
 * The module also keeps a SECOND, smaller fact, for a different consumer: WHICH
 * LINE an open place occupies, which the operation path is told because the
 * document cannot say (`openPlaceLine`). The two are separate records with
 * separate conditions, and the separation is the point. "Was a place created
 * here" is what the removal needs and is deliberately narrow; "is this blank
 * line a place" is what an operation needs and holds for as long as the place
 * is open, across the keys that carry it. One answer served both until a second
 * structural keypress on the same place was measured reading it as an ordinary
 * blank line and editing the document accordingly.
 *
 * The safety of the whole mechanism rests on a property of this plugin's own
 * `userEvent` values: `@codemirror/commands` joins a change into the previous
 * history entry only for the `input.type` and `delete` families, so a structural
 * keypress is always its own entry and a removal can never swallow the typing
 * before it. That is pinned by `tests/undo-on-abandon.test.ts` with a negative
 * control, because renaming an event into those families would silently turn
 * this cleanup into data loss.
 */


import {
  Annotation,
  ChangeSet,
  EditorSelection,
  Transaction,
  type ChangeSpec,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { undoDepth } from '@codemirror/commands';
import { itemContentIsEmpty } from '../ops';
import { nodeAtLine, nodeStartLine } from '../locate';
import { placeLineText } from '../model';
import {
  nextNodeInOrder,
  nodeContentEnd,
  nodeContentStart,
  previousNodeInOrder,
} from '../caret';
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
  /**
   * Where the caret was BEFORE the keypress — Backspace's landing spot — in
   * the POST-keypress document's coordinates, or `undefined` when the keypress
   * had no caret to start from because it replaced a non-empty selection.
   *
   * Mapped forward rather than stored raw: the raw offset belongs to a document
   * that no longer exists, and `cancel` maps its target through the removal
   * edit, which is expressed against the post-keypress document.
   *
   * Recorded rather than derived, because "the node above the place" is NOT the
   * origin in general. `insertSiblingHeading` writes the new heading after the
   * original's whole section, so for `## Foo` / `body` the node above the place
   * is `body` while the keypress started at `## Foo`. Only the dispatch knows.
   */
  readonly startedAt?: number | undefined;
  /**
   * The edit that removes the place and nothing else, in the post-keypress
   * document's coordinates — STATED BY THE PLAN that made the place, never
   * derived here.
   *
   * Deriving it was the previous design and is impossible in the general case:
   * the transaction carries a MINIMAL DIFF of the whole transformation, so where
   * a keypress removed a selection before acting, the removal and the insertion
   * touch the same lines and are one replacement in it. Reading an extent back
   * out of that shape under-counts by exactly the lines the removal cancelled.
   *
   * A change SET rather than a single change, because a reversal may RESTORE
   * text as well as delete it — abandoning an Enter that renumbered an ordered
   * run puts the original numbers back.
   */
  readonly abandon: ChangeSet;
}

const created = new WeakMap<EditorView, CreatedPlace>();

/**
 * The line an OPEN PLACE occupies in this view, for as long as it is open.
 *
 * A separate record from `created` above, written from the same update and
 * dropped by the same document change, because it answers a different question
 * for a different consumer. `created` says a place was MADE by the keypress in
 * front of it and how to remove it; this says a blank line IS a place, which is
 * what a structural operation has to know to act on the node the place is
 * inside (`grammar.ts`, `placeOutline`).
 *
 * Holding one record for both scoped this one to a single keypress: the
 * conditions that make a removal safe — a creating event, a stated removal
 * edit, an unmoved undo depth — are all about the keypress, and a place outlives
 * the keypress that made it. A key that carried a place therefore left nothing
 * for the key after it to read (docs/research/decoration-follow-ups).
 */
const openPlace = new WeakMap<EditorView, number>();

/**
 * The empty-item ladder's two operations, `outdent` and `unwrap`, are in this
 * GAP list and out of the NODE one below, and the split is the whole point.
 * Neither CREATES a node: `outdent` moves an item that was already empty, and
 * `unwrap` converts one into a blank position, so undoing either would restore
 * a bullet the user deliberately left the list to escape. What they do leave is
 * a gap line, which nothing occupied before — hence the asymmetry.
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

/**
 * The dispatches that CARRY a place they did not create.
 *
 * Both re-emit the lines of the node the place belongs to, and both leave the
 * caret on the place they moved — which is the rule
 * `caret-placement-policy` states for a derived caret, and what lets the carry
 * be tested at the caret rather than through the change set. Mapping the place
 * line's own offset forward cannot answer it: `editsToChanges` emits line-level
 * replacements, so the mapped position lands at the replaced block's start
 * rather than on the place.
 *
 * `move.structure` is absent by MEASUREMENT, not by category. A move's caret is
 * its subject's content start, so it leaves no place at the caret for this to be
 * about — and `placeOutline` resolves only where the place line and the caret
 * agree, so a record kept through a move would not be read either. The place a
 * move relocated is left behind with its node, which is the parking-lot entry
 * beside this one rather than this one.
 *
 * `outdent` is here for the rule rather than for its effect, and the difference
 * is worth stating so the next reader does not have to re-derive it. Over a GAP
 * place `recordablePlace` answers first — `GAP_PLACE_EVENTS` names `outdent` —
 * so the carry branch is never reached. It IS reached over a NODE place, and
 * there no consumer reads the answer: a node place's own line is a first line,
 * which `positionJoinsANode` refuses, so `placeOutline` resolves nothing. Only
 * `indent` therefore changes what any consumer sees today. The entry stays
 * because the rule is about what an operation DOES to a place, not about which
 * of two lists happens to name the event.
 */
const CARRY_PLACE_EVENTS: readonly string[] = [
  'input.structure.indent',
  'input.structure.outdent',
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
  // An attached block id's line is the node's own, not a gap.
  if (placeLineText(node, lineIndex) === undefined) return { line, kind: 'gap' };
  if (node.kind === 'list-item' && itemContentIsEmpty(node)) return { line, kind: 'node' };
  if (node.kind === 'heading' && headingTitleIsEmpty(node.lines)) return { line, kind: 'node' };
  return null;
}

function emptyPlaceLine(state: EditorState): number | null {
  return emptyPlaceAt(state)?.line ?? null;
}

/** A sole, empty cursor on this line. The shape every place question starts
 * from: a selection is not a caret parked on a place, and neither is one of
 * several cursors. */
function caretIsOnLine(state: EditorState, line: number): boolean {
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length !== 1) return false;
  return state.doc.lineAt(sel.head).number - 1 === line;
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
 * The removal edit a dispatch carries for the place it just made.
 *
 * An annotation rather than a call into this module, because the fact belongs
 * to the transaction: it is expressed in the coordinates of the document that
 * transaction produces, and it travels with it wherever it is dispatched from.
 *
 * It does NOT survive undo/redo, which is honest rather than a gap to paper
 * over — a redone place genuinely has no record here, and the limitation is
 * specified (`structural-history-integration`, known limitations).
 */
export const abandonEdit = Annotation.define<readonly ChangeSpec[]>();

/**
 * The empty place this state's caret is on that `userEvent` could have created,
 * or `null`.
 *
 * Deliberately INDEPENDENT of whether the dispatch stated a removal edit, and
 * the spec requires it to stay that way. The two answer different questions —
 * this one whether a place was left, the edit how to remove one — and keeping
 * them apart is what stops a removal edit from being read as proof of a place.
 * Shift+Tab and the empty-item ladder run the SAME outdent and both state a
 * removal, but an outdent that merely relocates an already-empty item created
 * nothing; only this test excludes it. Where the two disagree the caller does
 * nothing, which is the safe direction.
 */
export function recordablePlace(
  state: EditorState,
  userEvent: string | undefined,
): { line: number } | null {
  const place = emptyPlaceAt(state);
  if (!place) return null;
  return isCreatingTransaction(userEvent, place.kind) ? { line: place.line } : null;
}

/**
 * The line holding an open place AFTER this transaction, or `null`.
 *
 * `startedOn` is the open place the caret was on when the transaction began, or
 * `null` when it was on none. That half is what stops the rule from inventing a
 * place: a Tab from an ordinary caret cannot mark a blank line as one, however
 * its caret happens to land.
 *
 * Two ways to end up with a place, and the order is not arbitrary. A dispatch
 * that CREATED one starts a record where there was none, on exactly the terms
 * the removal path uses — nothing here widens that test. A dispatch that CARRIED
 * one keeps a record that already exists. A key can do the first while doing
 * neither of the second's halves, so asking `recordablePlace` first also keeps
 * the carry list from having to name every creating event a second time.
 *
 * Keyed on this plugin's own `userEvent` values throughout, never on the shape
 * of the change, for the reason `isCreatingTransaction` states: CodeMirror's own
 * Enter runs inside outline mode whenever the grammar declines, and a rule that
 * recognised a dispatch by its shape recognised that one too.
 */
/**
 * The open place a keypress BEGAN on, or `null` — the first half of the carry
 * rule, read from the state as the transaction found it.
 *
 * Exported so the listener and the tests share one copy rather than two that
 * agree today. A test that restates this is testing its own restatement: the
 * rule is small, and that is exactly what makes it easy to restate wrongly.
 */
export function carriedPlace(
  startState: EditorState,
  openBefore: number | null | undefined,
): number | null {
  if (openBefore === undefined || openBefore === null) return null;
  return caretIsOnLine(startState, openBefore) ? openBefore : null;
}

export function placeLineAfter(
  state: EditorState,
  userEvent: string | undefined,
  startedOn: number | null,
): number | null {
  const madeHere = recordablePlace(state, userEvent);
  if (madeHere) return madeHere.line;
  if (startedOn === null) return null;
  if (userEvent === undefined || !CARRY_PLACE_EVENTS.includes(userEvent)) return null;
  return emptyPlaceAt(state)?.line ?? null;
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
  const { abandon } = record;
  // The document moved under us: leave it. The record is dropped on any change,
  // so this is a belt-and-braces check against a stale span rather than a
  // reachable path — and leaving the place alone is always safe.
  if (abandon.length !== view.state.doc.length) return;
  // Mapped rather than shifted by one change's length: a reversal can be
  // several changes and can restore text as well as remove it, so there is no
  // single displacement to add.
  const caret = abandon.mapPos(Math.max(0, Math.min(target, view.state.doc.length)), 1);
  view.dispatch({
    changes: abandon,
    selection: EditorSelection.cursor(caret),
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
 * The line holding the place THIS view currently has open, or null.
 *
 * A structural operation acting on a bisected node has to know that the blank
 * line inside it is a PLACE, and the document cannot say: a blank line the user
 * authored between two paragraphs is byte-identical to one Shift+Enter opened
 * inside one paragraph. `enter-and-shift-enter-grammar`'s D1 met the same
 * ambiguity between Enter's position and Shift+Enter's and answered it by
 * making the two documents differ; here they cannot be made to differ, because
 * one of them is a document the user already wrote.
 *
 * The RENDERING layer can live with that (`decorate-provisional-positions` D5
 * takes the truthful reading either way, and the cost is recorded in
 * docs/research/decoration-follow-ups). An OPERATION cannot: measured, Tab with the caret on the
 * gap between `para` and `last` treated the two paragraphs as one node and
 * indented both. So the operation path asks this instead, which is the same
 * "told apart by whether a structural keypress of ours put the position there"
 * rule `node-edit-enforcement` already states for its own gap-line case —
 * PUT rather than CREATED, since a key that carried one put it where it is.
 *
 * Reads `openPlace`, not the removal record, and carries NO undo-depth guard.
 * `liveRecord`'s guard is there because a removal is an EDIT and the editor
 * joins typing into the keypress's own history entry, so a depth that moved
 * unseen can mean an entry holding the user's work. This issues no edit, and
 * every history movement that could move a place changes the document — which
 * is the invalidation `openPlace` already has. It was named `createdPlaceLine`,
 * and the name was the defect: the caller means OPEN, and the record it read
 * answered CREATED.
 *
 * The answer is CONFIRMED against the live state before it is given, which is
 * what keeps this record's failure direction the same as the removal record's.
 * Both are keyed on the VIEW and both are maintained from an update listener,
 * so a path that swaps a view's state without producing an update — Obsidian
 * reusing one editor across files is the shape to worry about — leaves whatever
 * was remembered behind. A stale removal record fails safe, because it only ever
 * declines to remove; a stale place line fails the other way, and its consumer
 * rewrites the user's document around a blank line nothing opened. Re-deriving
 * costs nothing (`parsedDoc` is cached, and both callers are about to parse
 * anyway) and makes the record self-validating rather than dependent on every
 * mutation being observed.
 */
export function openPlaceLine(view: EditorView): number | null {
  const line = openPlace.get(view);
  if (line === undefined) return null;
  return emptyPlaceAt(view.state)?.line === line ? line : null;
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
  const place = emptyPlaceAt(view.state);
  if (!place || place.line !== record.line) return false;

  // Backspace returns to where the keypress STARTED, which the recorder keeps
  // in this document's coordinates. It is a recorded fact rather than a derived
  // one because no rule over the parse recovers it: a drafted sibling heading
  // lands after the original's whole section, so the node above the place is
  // that section's last node while the keypress started at the heading.
  //
  // Only where there was no caret to start from — the keypress replaced a
  // non-empty selection — is there nothing to return to, and the caret goes to
  // the node above the place instead. Deriving that for EVERY shape was tried
  // and regressed the sibling-heading case; deriving it for none put the caret
  // inside the node BELOW the place after a block selection.
  const { doc: outlineDoc } = parsedDoc(view.state.doc);
  const node = nodeAtLine(outlineDoc, record.line);
  const offsetOf = (pos: { line: number; ch: number }): number =>
    view.state.doc.line(pos.line + 1).from + pos.ch;

  let target = 0;
  if (forward) {
    // Delete reaches for what FOLLOWS, so the caret lands at the next node's
    // content start rather than back where the keypress began.
    const next = node ? nextNodeInOrder(outlineDoc, node) : undefined;
    if (next) target = offsetOf(nodeContentStart(outlineDoc, next));
    else if (node) target = offsetOf(nodeContentEnd(outlineDoc, node));
  } else if (record.startedAt !== undefined) {
    target = record.startedAt;
  } else if (node) {
    // A GAP place is owned by the node above it, so that node IS the one the
    // caret returns to; an empty NODE place has the node above as its
    // predecessor in document order.
    const above = place.kind === 'gap' ? node : previousNodeInOrder(outlineDoc, node);
    if (above) target = offsetOf(nodeContentEnd(outlineDoc, above));
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
      openPlace.delete(view);
      return;
    }

    if (update.docChanged) {
      // Any document change replaces whatever was remembered: either it IS the
      // creating keypress (recorded below), or it is something else — including
      // the user typing on the place, which USES it and must never be undone.
      // Both records go, and both are re-established from this same transaction
      // or not at all — which is what keeps them from drifting apart while
      // answering different questions.
      const openBefore = openPlace.get(view);
      created.delete(view);
      openPlace.delete(view);

      const last = update.transactions[update.transactions.length - 1];
      if (last) {
        const event = last.annotation(Transaction.userEvent) ?? undefined;
        // The place a CARRYING dispatch could have moved: the one this view had
        // open, and only when the caret was actually on it when the transaction
        // began. A key pressed anywhere else carries nothing.
        const startedOn = carriedPlace(last.startState, openBefore);
        const open = placeLineAfter(view.state, event, startedOn);
        if (open !== null) openPlace.set(view, open);

        // BOTH must agree, and they are independent by contract: the dispatch
        // states how to remove a place, this module decides whether one was
        // left. Neither is evidence for the other — Shift+Tab states a removal
        // for an outdent that may only have relocated an already-empty item,
        // and `recordablePlace` is what excludes that. Disagreement means no
        // cleanup, which leaves the place standing: the safe direction.
        const stated = last.annotation(abandonEdit);
        const place = recordablePlace(view.state, event);
        if (stated && place) {
          const before = last.startState.selection.main;
          created.set(view, {
            depth: undoDepth(view.state),
            line: place.line,
            startedAt: before.empty ? last.changes.mapPos(before.head, -1) : undefined,
            abandon: ChangeSet.of(stated, view.state.doc.length),
          });
        }
      }
      return;
    }

    if (!update.selectionSet) return;

    // The caret leaving a place ends it, whether or not a removal record is
    // still live for it. That is the same gesture the cleanup reads as
    // declining, and the two facts differ in their CONDITIONS rather than in
    // how long a place lasts: a place the user has walked away from is not one
    // an operation should still be acting on.
    //
    // Belt-and-braces rather than the only defence: `openPlaceLine` re-derives
    // from the live state before answering, so a record this misses is refused
    // there instead of believed. Dropping it here keeps the map from holding
    // what it has no business holding.
    const open = openPlace.get(view);
    if (open !== undefined && !caretIsOnLine(view.state, open)) openPlace.delete(view);

    const record = liveRecord(view);
    if (!record) return;
    const sel = view.state.selection.main;
    if (caretIsOnLine(view.state, record.line)) return;

    const target = sel.head;
    queueMicrotask(() => {
      const live = liveRecord(view);
      if (!live || live !== record) return;
      if (view.state.doc.lineAt(view.state.selection.main.head).number - 1 === live.line) return;
      cancel(view, live, target);
    });
  });
}
