/**
 * Reading and writing fold state, so no call site outside this module touches
 * CodeMirror's fold API.
 *
 * The state is Obsidian's own — the same `foldedRanges` its chevron writes and
 * its per-file persistence reads — so everything here is a read or an effect
 * over shared state, never a store of ours. One module for it because the fold
 * layer is reached from four directions (commands, the pointer gestures, the
 * structural dispatch, the decorations), and four call sites each deciding what
 * "is this node folded" means is four chances to disagree.
 */

import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { EditorState, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { foldLines, type FoldEntry } from './fold-model';

export interface FoldRange {
  readonly from: number;
  readonly to: number;
}

/** Every fold currently in the document, in document order. */
export function currentFolds(state: EditorState): FoldRange[] {
  const ranges: FoldRange[] = [];
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to });
  });
  return ranges;
}

/** This node's fold as offsets, or null when it has no children — the one
 * conversion from model lines to document positions. */
export function foldRangeOf(state: EditorState, entry: FoldEntry): FoldRange | null {
  const lines = foldLines(entry.node, entry.startLine);
  if (!lines) return null;
  if (lines.lastLine + 1 > state.doc.lines) return null;
  return {
    from: state.doc.line(lines.headLine + 1).to,
    to: state.doc.line(lines.lastLine + 1).to,
  };
}

/**
 * Whether this node is folded right now.
 *
 * Matched by the fold's START rather than by an exact range, because the two
 * can legitimately differ: Obsidian may have folded the same node through its
 * own provider before ours existed, and a fold restored from workspace state
 * carries whatever extent it was saved with. What makes a node folded is that
 * its own content is hidden from its head line onward.
 */
export function isFolded(state: EditorState, entry: FoldEntry): boolean {
  const range = foldRangeOf(state, entry);
  if (!range) return false;
  let found = false;
  foldedRanges(state).between(range.from, range.from, (from) => {
    if (from === range.from) found = true;
  });
  return found;
}

/** The effect that folds this node, or null when there is nothing to fold or it
 * is already folded — so a caller can dispatch a batch without filtering. */
export function foldEffectFor(state: EditorState, entry: FoldEntry): StateEffect<unknown> | null {
  const range = foldRangeOf(state, entry);
  if (!range || range.to <= range.from) return null;
  if (isFolded(state, entry)) return null;
  return foldEffect.of(range);
}

/** The effects that unfold this node: every fold starting at its head, which is
 * one in practice and defensive against a restored fold with another extent. */
export function unfoldEffectsFor(state: EditorState, entry: FoldEntry): StateEffect<unknown>[] {
  const range = foldRangeOf(state, entry);
  if (!range) return [];
  const effects: StateEffect<unknown>[] = [];
  foldedRanges(state).between(range.from, range.from, (from, to) => {
    if (from === range.from) effects.push(unfoldEffect.of({ from, to }));
  });
  return effects;
}

/** Effects that open every fold inside a document range — what zoom does to its
 * scope, and what a caret arriving in hidden content needs. */
export function unfoldEffectsWithin(
  state: EditorState,
  from: number,
  to: number,
): StateEffect<unknown>[] {
  const effects: StateEffect<unknown>[] = [];
  foldedRanges(state).between(from, to, (a, b) => {
    effects.push(unfoldEffect.of({ from: a, to: b }));
  });
  return effects;
}

/**
 * Apply fold effects, if any, as one transaction.
 *
 * Returns whether anything was dispatched, which is what a command's return
 * value is made of: a fold command on an already-folded node does nothing and
 * that is not a failure.
 */
export function dispatchFolds(view: EditorView, effects: StateEffect<unknown>[]): boolean {
  if (effects.length === 0) return false;
  view.dispatch({ effects });
  return true;
}
