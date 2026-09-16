/**
 * The in-note filter's one gate that needs a real editor.
 *
 * Split from `outline-filter-state.ts` for the reason `zoom-scope.ts` gives for
 * its own split from `zoom-state.ts`: this half needs `nested-editor.ts`, which
 * imports `obsidian`, and that half must stay reachable from the unit suite.
 *
 * A nested per-cell editor holds an outline-mode field like any other editor, so
 * the mode alone cannot tell them apart and would let a filter loose inside a
 * table cell.
 */

import type { EditorState } from '@codemirror/state';
import type { LineSpan } from '../zoom';
import { nestedEditorField } from './nested-editor';
import { zoomScope } from './zoom-scope';
import { coverSpan, intersectSpans } from './zoom-offsets';
import {
  unguardedFilterVisibleSpans,
  unguardedOutlineFilter,
  type OutlineFilter,
} from './outline-filter-state';

export function filterVisibleSpans(state: EditorState): readonly LineSpan[] | null {
  if (state.field(nestedEditorField, false)) return null;
  return unguardedFilterVisibleSpans(state);
}

export function outlineFilter(state: EditorState): OutlineFilter | null {
  if (state.field(nestedEditorField, false)) return null;
  return unguardedOutlineFilter(state);
}

/**
 * The lines the view actually DRAWS: the filter's spans met with the zoom's.
 *
 * One answer for every consumer — the hiding builder, the marks, the caret's
 * vertical walk, the selection refusal — because they must all agree about what
 * is on screen. Asking `filterVisibleSpans` directly is asking a narrower
 * question, and inside a zoom the two differ: the filter's matches run the
 * whole note while the scope shows one subtree of it, so a caret stepping by
 * the filter's answer alone would land on a match the zoom is hiding.
 *
 * `null` means nothing is hiding anything and the note renders whole.
 */
export function shownSpans(state: EditorState): readonly LineSpan[] | null {
  const scope = zoomScope(state);
  const filter = filterVisibleSpans(state);
  if (!scope) return filter;
  if (!filter) return [coverSpan(scope)];
  return intersectSpans(filter, [coverSpan(scope)]);
}

/**
 * How many matches the reader can actually reach, which is what the panel says.
 *
 * The anchors run the whole note; a zoom shows one subtree of it. Reporting the
 * anchor count inside a zoom would name matches the view is not drawing, and a
 * count that disagrees with what is on screen is worse than no count.
 */
export function shownMatchCount(state: EditorState): number {
  const spans = shownSpans(state);
  const filter = unguardedOutlineFilter(state);
  if (!spans || !filter?.anchors) return 0;
  const lines = new Set(
    filter.anchors.map((anchor) => state.doc.lineAt(Math.min(anchor, state.doc.length)).number - 1),
  );
  let count = 0;
  for (const line of lines) {
    if (spans.some((span) => line >= span.fromLine && line < span.toLine)) count++;
  }
  return count;
}
