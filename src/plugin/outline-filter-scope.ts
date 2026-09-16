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
