/**
 * The zoom scope for an editor state: `zoom-state.ts`'s anchor resolved against
 * the current parse, gated on the things only a real editor can answer.
 *
 * Split from `zoom-state.ts` because this half needs `editorInfoField` and that
 * half must stay reachable from the unit suite — `obsidian` does not resolve
 * there. Same division, and the same reason, as `mode-registry.ts`'s own module
 * comment gives for keeping its data types out of `decorations.ts`.
 */

import type { EditorState } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { resolveZoom, type ZoomScope } from '../zoom';
import { zoomAnchorField } from './zoom-state';
import { parsedDoc } from './parsed-doc';
import { nestedEditorField } from './nested-editor';
import type { ModeSource } from './keymap';

/**
 * The scope for this state, or null when there is no zoom — or when zoom has no
 * business here.
 *
 * Gated on outline mode and on NOT being a nested per-cell editor, through the
 * same state-level route `transaction-filter.ts` uses: a nested editor resolves
 * to the same host `MarkdownFileInfo`, so `editorInfoField` alone cannot tell
 * them apart and would let a zoom scope loose inside a table cell.
 */
function computeScope(state: EditorState, modes: ModeSource): ZoomScope | null {
  const anchor = state.field(zoomAnchorField, false);
  if (anchor === null || anchor === undefined) return null;
  if (state.field(nestedEditorField, false)) return null;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return null;
  if (anchor < 0 || anchor > state.doc.length) return null;
  const { doc } = parsedDoc(state.doc);
  return resolveZoom(doc, state.doc.lineAt(anchor).number - 1);
}

/**
 * One derivation per `EditorState`, shared by every consumer.
 *
 * The decorations, the breadcrumb panel, the keymap handlers and the
 * enforcement filter each ask for the scope on every transaction, and the walk
 * behind it runs inside the keystroke budget `transaction-classification`
 * sets. Same `WeakMap`-per-state shape as `decorations.ts`'s `factsFor`,
 * `parsed-doc.ts` and `source-tree-cache.ts` — not a `StateField`, so no
 * extension-ordering coupling with anything that reads it.
 *
 * `null` is a real cached answer, so the map stores the result rather than
 * being probed for presence: a document with no zoom is the common case and
 * must not re-walk the tree once per consumer.
 */
const scopeCache = new WeakMap<EditorState, { scope: ZoomScope | null }>();

export function zoomScope(state: EditorState, modes: ModeSource): ZoomScope | null {
  const cached = scopeCache.get(state);
  if (cached) return cached.scope;
  const scope = computeScope(state, modes);
  scopeCache.set(state, { scope });
  return scope;
}
