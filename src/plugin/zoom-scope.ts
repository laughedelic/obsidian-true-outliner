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
import { hiddenOffsetRanges } from './zoom-offsets';
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

// ---- Offsets ------------------------------------------------------------

/**
 * Where a block widget that belongs after the document's content should mount.
 *
 * `state.doc.length` normally — and the END OF THE VISIBLE RANGE while a zoom is
 * active, because the trailing hidden range ends at `doc.length` and a block
 * replacement swallows a `side: -1` widget anchored there.
 *
 * Re-anchoring is the only available fix, and that is a measurement rather than
 * a preference (docs/research/23): shortening the hidden range cannot work,
 * because a document ending in a newline has an empty final line whose start IS
 * `doc.length`, so the two candidate endpoints are the same position and no
 * position strictly inside the range leaves the anchor outside it.
 */
export function contentEndAnchor(state: EditorState, modes: ModeSource): number {
  const scope = zoomScope(state, modes);
  if (!scope) return state.doc.length;
  const tail = hiddenOffsetRanges(state.doc, scope).find((r) => r.to === state.doc.length);
  return tail ? tail.from : state.doc.length;
}
