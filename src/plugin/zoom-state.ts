/**
 * The zoom scope's only piece of state: one mapped document position
 * (`outline-zoom` design D1).
 *
 * The anchor is the start of the zoom root's own first line. Everything else —
 * the root, the visible cover, the hidden spans, the ancestor trail, the
 * re-rooted sub-document — is DERIVED from `(anchor, parsed doc)` by
 * `src/zoom.ts` at the moment it is needed, and none of it is stored. So a
 * scope that disagrees with the document cannot exist: there is one integer to
 * keep current, and CodeMirror keeps it.
 *
 * That is the difference from obsidian-zoom, which maps the hidden-range
 * decorations themselves and can therefore drift.
 *
 * This module imports no `obsidian`, deliberately, so it is reachable from the
 * unit suite — the same reason `mode-registry.ts` keeps its data types away
 * from `decorations.ts`. Deriving the scope needs `editorInfoField`, so that
 * half lives in `zoom-scope.ts` and is covered by e2e instead.
 */

import {
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
} from '@codemirror/state';

/** Zoom to the node whose own first line starts at this document position. */
export const zoomTo = StateEffect.define<number>();

/** Clear the zoom, in this view. */
export const zoomCleared = StateEffect.define();

export const zoomAnchorField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(zoomCleared)) return null;
      if (effect.is(zoomTo)) return effect.value;
    }
    if (value === null) return null;
    return mapAnchor(value, tr);
  },
});

/**
 * The anchor through this transaction's changes, with FORWARD association.
 *
 * `assoc: 1`, not CodeMirror's default of -1, and it is observable rather than
 * a matter of taste. Insert text CONTAINING A NEWLINE at the root's own line
 * start — a paste, or typing then Enter, both ordinary in-scope edits — and
 * `assoc: -1` leaves the anchor before the insertion, which is now the inserted
 * line; `assoc: 1` carries it past, onto the root's own line, where it belongs.
 * The two resolve to different NODES, and only the forward one resolves to the
 * node the user zoomed into.
 *
 * An insertion at the anchor with no newline in it moves the anchor along its
 * own line, which resolves identically either way — so forward is never worse
 * and is sometimes the only correct answer.
 *
 * An earlier draft of the design claimed the argument could not matter at all,
 * on the grounds that the anchor is only ever consumed as "which line is this".
 * That was wrong; the negative control for it is in `tests/zoom-state.test.ts`.
 */
function mapAnchor(anchor: number, tr: Transaction): number | null {
  if (!tr.docChanged) return anchor;
  return tr.changes.mapPos(anchor, 1);
}

export function zoomStateExtension(): Extension {
  return zoomAnchorField;
}
