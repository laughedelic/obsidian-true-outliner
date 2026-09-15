/**
 * What the in-note filter is hiding behind, as editor state.
 *
 * The one thing every other part of the filter reads: which lines stay visible.
 * `null` is not an empty list — it means no filter is active, so the whole note
 * renders and the hiding builder has nothing to contribute. An empty list would
 * mean a filter that hides everything, which `outline-filter`'s D8 says cannot
 * arise: a query matching nothing keeps the last set that matched.
 *
 * Today the spans are set directly, which is what the spike dispatches to probe
 * the builder against many of them. Task 3.1 moves the source of them inside:
 * the field gains the query and the anchors its matches map through, derives
 * the spans from the current parse, and this accessor keeps answering the same
 * question for the same readers.
 *
 * Per editor view and never persisted, like the zoom anchor beside it.
 */

import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { LineSpan } from '../zoom';
import { nestedEditorField } from './nested-editor';
import { isOutlineMode } from './outline-state';

/** Sorted and merged visible spans, or null to clear the filter. */
export const filterSpansSet = StateEffect.define<readonly LineSpan[] | null>();

const filterSpansField = StateField.define<readonly LineSpan[] | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(filterSpansSet)) return effect.value;
    }
    return value;
  },
});

/**
 * The lines the filter is keeping, or null when it is not active here.
 *
 * Gated like the zoom scope is, and for the same reasons: a nested per-cell
 * editor holds an outline-mode field like any other editor, so the mode alone
 * would let a filter loose inside a table cell.
 */
export function filterVisibleSpans(state: EditorState): readonly LineSpan[] | null {
  if (state.field(nestedEditorField, false)) return null;
  if (!isOutlineMode(state)) return null;
  return state.field(filterSpansField, false) ?? null;
}

/**
 * Put a visible set into an editor, or clear it.
 *
 * The one way the spans change. Task 3.1 gives the panel a query to set
 * instead, and this becomes what that derivation dispatches through rather than
 * a second path beside it.
 */
export function setFilterSpans(view: EditorView, spans: readonly LineSpan[] | null): void {
  view.dispatch({ effects: filterSpansSet.of(spans) });
}

export function outlineFilterStateExtension(): Extension {
  return [filterSpansField];
}
