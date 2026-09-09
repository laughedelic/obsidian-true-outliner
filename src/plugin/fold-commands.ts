/**
 * The fold gestures, as operations on a view: fold, unfold, toggle — for a
 * node, for a selection's worth of nodes, and for the whole document.
 *
 * Everything here dispatches EFFECTS and never a change. A fold produces no
 * `ChangeSet`, so `transaction-classification`, the enforcement filter and the
 * undo history never see one: folding cannot alter the document, and that is a
 * property of the mechanism rather than a rule anyone has to keep.
 *
 * Where the operand comes from is `selection-structural-ops`' answer, not a
 * second one — the covered subtree roots of the current selection, which for an
 * empty selection is the node the caret is in. The one thing folding adds is
 * ESCALATION: a caret in a childless node folds the nearest ancestor that has
 * children, because that is what "collapse this branch" means from inside a
 * leaf, and a leaf is where a caret usually is.
 */

import type { EditorState, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { parsedDoc } from './parsed-doc';
import { foldChromeTarget } from './fold-service';
import { isOutlineMode } from './outline-state';
import { zoomScope } from './zoom-scope';
import {
  ancestryAtLine,
  foldableEntries,
  foldTargetAtLine,
  isFoldable,
  subtreeSpan,
  type FoldEntry,
} from './fold-model';
import { ownSpan } from '../model';
import {
  currentFolds,
  dispatchFolds,
  foldEffectFor,
  foldRangeOf,
  isFolded,
  unfoldEffectsFor,
} from './fold-ops';
import { resolveOperand } from '../operand';
import { forEachNodeWithLine } from '../locate';

export type FoldAction = 'fold' | 'unfold' | 'toggle';

/**
 * The nodes a gesture at the current selection acts on.
 *
 * One range only — a multi-range selection declines, the same answer the
 * structural commands give, because acting would silently pick one range.
 */
export function foldOperands(state: EditorState): FoldEntry[] {
  if (state.selection.ranges.length !== 1) return [];
  const { doc } = parsedDoc(state.doc);
  const main = state.selection.main;
  const from = state.doc.lineAt(main.from);
  const to = state.doc.lineAt(main.to);

  if (main.empty) {
    // The escalating answer, and the only place it applies: a caret in a leaf
    // means "collapse this branch". A selection names its nodes explicitly, so
    // escalating there would fold something the user did not reach.
    const target = foldTargetAtLine(doc, from.number - 1);
    return target ? [target] : [];
  }

  // Otherwise `selection-structural-ops`' own rule, through the same function
  // the structural commands resolve their operand with — including for a range
  // that covers no whole subtree, where it answers with the subtree cover
  // rather than declining. Rebuilding that decision here would be the second
  // copy `caret-placement-policy` exists to prevent, one layer up.
  const operand = resolveOperand(doc, {
    anchor: { line: from.number - 1, ch: main.from - from.from },
    head: { line: to.number - 1, ch: main.to - to.from },
  });
  if (!operand) return [];
  const wanted = new Set(operand.groups.flat());
  const entries: FoldEntry[] = [];
  forEachNodeWithLine(doc, (node, startLine, depth) => {
    if (wanted.has(node.id) && isFoldable(node)) entries.push({ node, startLine, depth });
  });
  return entries;
}

/**
 * Apply `action` to `entries`, and move the caret out of anything it hides.
 *
 * The caret rule is the spec's one exception to "folding never moves the
 * caret": a caret inside the range about to disappear would be unreachable, and
 * the escalating gesture puts it there routinely — pressing fold from inside a
 * leaf hides the line the caret is on.
 */
export function applyFold(view: EditorView, entries: FoldEntry[], action: FoldAction): boolean {
  const { state } = view;
  const effects: StateEffect<unknown>[] = [];
  const hiding: { from: number; to: number }[] = [];

  for (const entry of entries) {
    const folded = isFolded(state, entry);
    const wants = action === 'toggle' ? !folded : action === 'fold';
    if (wants === folded) continue;
    if (wants) {
      const effect = foldEffectFor(state, entry);
      if (!effect) continue;
      effects.push(effect);
      const range = foldRangeOf(state, entry);
      if (range) hiding.push(range);
    } else {
      effects.push(...unfoldEffectsFor(state, entry));
    }
  }
  if (effects.length === 0) return false;

  const head = state.selection.main.head;
  const swallowed = hiding.find((r) => head > r.from && head <= r.to);
  if (!swallowed) return dispatchFolds(view, effects);
  // The fold's own head line: the position the hidden content followed, which
  // is the node the reader just acted on.
  view.dispatch({ effects, selection: { anchor: swallowed.from } });
  return true;
}

/**
 * Toggle the fold of the node whose own line this is — the pointer gesture's
 * entry point, which names its node by the line it was drawn on rather than by
 * the selection. No escalation: the affordance belongs to one node, and it is
 * the one the reader clicked.
 */
export function toggleFoldAtLine(view: EditorView, lineNumber: number): boolean {
  const entry = foldChromeTarget(view.state, lineNumber);
  return entry ? applyFold(view, [entry], 'toggle') : false;
}

/**
 * The guide gesture: fold or unfold every child of the node that guide belongs
 * to.
 *
 * Toggle by majority-of-one: if ANY of those children is unfolded they all
 * fold, and only when every one is already folded do they open. Reading a
 * single branch by collapsing everything beside it is what this exists for, and
 * that reading is reached in one click from any starting state.
 *
 * `depth` is the guide's own column, so the node it belongs to is the ancestor
 * at that depth — the guide at column 0 belongs to the top-level node whose
 * subtree the line sits in, not to the line itself.
 */
export function toggleGuideAt(view: EditorView, lineNumber: number, depth: number): boolean {
  const { doc } = parsedDoc(view.state.doc);
  const chain = ancestryAtLine(doc, lineNumber);
  const owner = chain[depth];
  if (!owner) return false;
  const children: FoldEntry[] = [];
  let startLine = owner.startLine + ownSpan(owner.node);
  for (const child of owner.node.children) {
    if (isFoldable(child)) children.push({ node: child, startLine, depth: owner.depth + 1 });
    startLine += subtreeSpan(child);
  }
  if (children.length === 0) return false;
  const anyOpen = children.some((child) => !isFolded(view.state, child));
  return applyFold(view, children, anyOpen ? 'fold' : 'unfold');
}

/** The gesture, end to end: resolve, act, report whether anything happened. */
export function runFoldGesture(view: EditorView, action: FoldAction): boolean {
  return applyFold(view, foldOperands(view.state), action);
}

/** Whether a fold gesture has anything to act on — for a command's `checking`
 * pass, which must not dispatch. */
export function foldGestureAvailable(state: EditorState): boolean {
  if (!isOutlineMode(state)) return false;
  return foldOperands(state).length > 0;
}

// ---- Document-wide -------------------------------------------------------

/**
 * Every foldable node in scope: the whole document, or the zoom root's subtree
 * while a zoom is active.
 *
 * Scoped because the rest of the document is not on screen to be folded — a
 * fold-all that reached outside the scope would leave the reader's return
 * unrecognizable when they zoom out.
 */
export function foldableInScope(state: EditorState): FoldEntry[] {
  const { doc } = parsedDoc(state.doc);
  const entries = foldableEntries(doc);
  const scope = zoomScope(state);
  if (!scope) return entries;
  const rootLine = scope.startLine;
  return entries.filter((entry) => {
    if (entry.startLine === rootLine) return true;
    return ancestryAtLine(doc, entry.startLine).some((a) => a.startLine === rootLine);
  });
}

/** Fold or unfold everything in scope. */
export function runFoldAll(view: EditorView, action: 'fold' | 'unfold'): boolean {
  return applyFold(view, foldableInScope(view.state), action);
}

/**
 * Fold one level deeper, or unfold one level shallower.
 *
 * "Deeper" and "shallower" are read from the CURRENT state each time rather
 * than from a remembered depth: an edit between two invocations can change what
 * the levels are, and a remembered number would then fold a level that no
 * longer means what it did. Repeated invocation walks the outline's depth in
 * either direction, which is the whole contract.
 */
export function runFoldLevel(view: EditorView, direction: 'more' | 'less'): boolean {
  const { state } = view;
  const entries = foldableInScope(state);
  const open = entries.filter((e) => !isFolded(state, e));
  const closed = entries.filter((e) => isFolded(state, e));
  if (direction === 'more') {
    if (open.length === 0) return false;
    const deepest = Math.max(...open.map((e) => e.depth));
    return applyFold(
      view,
      open.filter((e) => e.depth === deepest),
      'fold',
    );
  }
  if (closed.length === 0) return false;
  const shallowest = Math.min(...closed.map((e) => e.depth));
  return applyFold(
    view,
    closed.filter((e) => e.depth === shallowest),
    'unfold',
  );
}

/** Whether the document has any fold at all — the availability answer for
 * unfold-all, which is otherwise offered on a document with nothing folded. */
export function hasAnyFold(state: EditorState): boolean {
  return currentFolds(state).length > 0;
}
