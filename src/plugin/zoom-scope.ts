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
import {
  setStillRootedResolver,
  setVisibleBoundsResolver,
  zoomAnchorField,
} from './zoom-state';
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

/**
 * Installs the resolver `zoom-state.ts` needs for its outside-change exit
 * trigger (D4, trigger 2).
 *
 * The bounds have to be derived where `editorInfoField` is reachable, and the
 * field that consumes them has to stay free of `obsidian`. Rather than duplicate
 * the derivation on either side of that line, the state module declares the
 * shape and this one supplies it — once, at load.
 *
 * Deliberately NOT routed through `zoomScope`: that reads the anchor from the
 * state it is given, and this is asked about the anchor as it stood BEFORE the
 * transaction, which is the only frame where "outside" is well defined.
 */
setVisibleBoundsResolver((state, anchor) => {
  if (state.field(nestedEditorField, false)) return null;
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path) return null;
  if (anchor < 0 || anchor > state.doc.length) return null;
  const { doc } = parsedDoc(state.doc);
  const scope = resolveZoom(doc, state.doc.lineAt(anchor).number - 1);
  if (!scope) return null;
  return {
    from: state.doc.line(scope.cover.start.line + 1).from,
    to: state.doc.line(Math.min(scope.cover.end.line + 1, state.doc.lines)).to,
  };
});

/**
 * The anchor still names a node's own first line.
 *
 * `resolveZoom` answers "which node owns this line", which is the right
 * question for zooming IN from a caret anywhere in a node and the wrong one for
 * deciding whether an existing zoom survived an edit. A line that stops being
 * its own node — an `hr` that a typed character turns back into paragraph text,
 * say — is still OWNED by a node, just no longer the one the user zoomed into.
 */
setStillRootedResolver((state, anchor) => {
  if (anchor < 0 || anchor > state.doc.length) return false;
  const line = state.doc.lineAt(anchor).number - 1;
  const { doc } = parsedDoc(state.doc);
  const scope = resolveZoom(doc, line);
  return scope !== null && scope.startLine === line;
});
