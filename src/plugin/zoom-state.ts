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
  type EditorState,
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
    // Trigger 2 (design D4): a change touching any position OUTSIDE the visible
    // range as it stood before the transaction clears the zoom.
    //
    // This is the catch-all for changes that never passed the clamps — history
    // transactions, which `@codemirror/commands` dispatches with `filter:
    // false` and which therefore never see the enforcement funnel at all; a
    // sync or external write; an edit dispatched from another pane onto the
    // same file. An in-scope edit cannot trip it, which is what makes the
    // anchor safe from silently retargeting: the node above the root is outside
    // the range, so an edit that would merge the root into it trips this first.
    if (tr.docChanged && touchesOutside(value, tr)) return null;
    const mapped = mapAnchor(value, tr);
    if (mapped === null) return null;
    // Trigger 1, in its real form. The anchor IS "the start of the zoom root's
    // own first line", so if it stops naming a node's start, the node it named
    // is gone.
    //
    // Not the same thing as the line being deleted, which is what an earlier
    // draft of D4 assumed trigger 1 covered. Zoom into an `hr` (`***`), type a
    // character, and the line stops parsing as an hr: it becomes a continuation
    // of the paragraph ABOVE, and the anchor now resolves to a node starting
    // outside the old scope. The edit touched only the root's own line, so
    // neither the clamps nor `touchesOutside` can see it — the merge is a
    // consequence of re-parsing, not of where the change landed. Found by the
    // retarget property, which is why that property is stated over generated
    // documents rather than argued.
    if (tr.docChanged && stillRooted && !stillRooted(tr.state, mapped)) return null;
    return mapped;
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
/**
 * Did any of this transaction's changes reach outside the visible range?
 *
 * Measured against `tr.startState` — the range as it stood BEFORE the change,
 * which is the only frame in which "outside" is still well defined. The scope
 * cannot be recomputed here (that needs `editorInfoField`, see the module
 * note), so the bounds come from re-deriving them in the old state via the
 * caller-supplied resolver.
 */
function touchesOutside(anchor: number, tr: Transaction): boolean {
  const bounds = visibleBounds?.(tr.startState, anchor);
  if (!bounds) return false;
  let outside = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (fromA < bounds.from || toA > bounds.to) outside = true;
  });
  return outside;
}

/**
 * How to find the visible range's offsets in a given state.
 *
 * Injected rather than imported, because resolving it needs `editorInfoField`
 * and this module must stay free of `obsidian` to remain reachable from the unit
 * suite. `zoom-scope.ts` installs the real one at load; without it the field
 * simply never clears on trigger 2, which is the safe direction to fail.
 */
let visibleBounds: ((state: EditorState, anchor: number) => { from: number; to: number } | null) | undefined;

export function setVisibleBoundsResolver(
  resolve: (state: EditorState, anchor: number) => { from: number; to: number } | null,
): void {
  visibleBounds = resolve;
}

/** Does this anchor still name the START of a node? See the trigger-1 note. */
let stillRooted: ((state: EditorState, anchor: number) => boolean) | undefined;

export function setStillRootedResolver(
  resolve: (state: EditorState, anchor: number) => boolean,
): void {
  stillRooted = resolve;
}

function mapAnchor(anchor: number, tr: Transaction): number | null {
  if (!tr.docChanged) return anchor;
  return tr.changes.mapPos(anchor, 1);
}

export function zoomStateExtension(): Extension {
  return zoomAnchorField;
}
