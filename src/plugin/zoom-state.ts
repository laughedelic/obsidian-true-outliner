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
  type ChangeDesc,
  type EditorState,
  type Extension,
  type Text,
  type Transaction,
} from '@codemirror/state';
import type { EditFootprint, ZoomScope } from '../zoom';

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
    // Computed once, in the OLD state, and reused by both triggers below —
    // it names the root's own span before the edit, which is the frame both
    // "did a change reach outside it" and "did the whole of it disappear"
    // need.
    const bounds = tr.docChanged ? visibleBounds?.(tr.startState, value) : undefined;
    const mapped = mapAnchor(value, tr);
    if (mapped === null) return null;
    if (tr.docChanged && bounds) {
      const footprint = footprintOf(tr.changes, tr.state.doc, bounds, value);
      // Trigger 1a: the root's WHOLE subtree was deleted, not merely edited.
      // `mapped` is the anchor mapped FORWARD, which after a deletion spanning
      // the entire old cover lands on whatever now occupies that offset — the
      // following sibling, if the document has one, sliding up to fill the gap.
      // That sibling can perfectly well start a node of its own at that exact
      // line, so asking whether a node is there answers `true` about the wrong
      // node. Detected instead by mapping the OLD cover's END backward through
      // the same changes: if that lands at or before `mapped`, nothing between
      // the two old endpoints survived — the whole root is gone, sibling or no.
      if (footprint.coverRemoved) return null;
      // Triggers 1b and 2, as ONE question (design D6). The predicate is
      // `zoom.ts`'s, the same one the enforcement filter refuses with, so the
      // refusal and the exit cannot disagree about what leaving the scope means.
      //
      // It replaces an offset comparison that answered two ways wrongly: an
      // append at the very end of the scope was dispatched at the first HIDDEN
      // line's start and read as outside, and a root dissolved without touching
      // a byte outside the range was read as inside. What remains here is what
      // this trigger was always for — changes that never pass enforcement:
      // history transactions, which `@codemirror/commands` dispatches with
      // `filter: false`; a sync or external write; an edit dispatched from
      // another pane onto the same file. An ENFORCED escaping edit is refused
      // before it applies and so never reaches this at all.
      if (changeEscapes?.(tr, bounds, value, footprint)) return null;
    }
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
 * The two facts `zoom.ts`'s escape check needs about a change.
 *
 * Derived HERE, once, and handed to both consumers — the exit trigger above and
 * `transaction-filter.ts`'s refusal — because "did the root survive" answered
 * twice is "did the root survive" answered two ways. The rewrite path passes the
 * change set its own edits produce rather than `tr.changes`, so both are asked
 * about the change that will actually land.
 */
/**
 * A scope's visible range as document offsets.
 *
 * One formula, in the module that owns the triggers reading it, because the
 * enforcement refusal needs the SAME offsets to ask the same question. A bounds
 * that disagrees with the one the exit uses is a refusal and an exit that
 * disagree, which is what this whole arrangement exists to prevent.
 */
export function visibleBoundsOf(doc: Text, scope: ZoomScope): { from: number; to: number } {
  return {
    from: doc.line(scope.cover.start.line + 1).from,
    to: doc.line(Math.min(scope.cover.end.line + 1, doc.lines)).to,
  };
}

export function footprintOf(
  changes: ChangeDesc,
  newDoc: Text,
  bounds: { from: number; to: number },
  anchor: number,
): EditFootprint {
  const mapped = changes.mapPos(anchor, 1);
  return {
    anchorLine: newDoc.lineAt(Math.min(Math.max(mapped, 0), newDoc.length)).number - 1,
    coverRemoved: changes.mapPos(bounds.to, -1) <= mapped,
  };
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

/**
 * Would this change leave content outside the scope? — `zoom.ts`'s predicate,
 * injected for the same reason `visibleBounds` is: answering it needs a parse
 * of both states and the gating this module must stay free of.
 *
 * Without a resolver installed the trigger simply never fires, which is the
 * safe direction: a zoom that outstays its welcome, not one that vanishes.
 */
let changeEscapes:
  | ((tr: Transaction, bounds: { from: number; to: number }, anchor: number, footprint: EditFootprint) => boolean)
  | undefined;

export function setChangeEscapesResolver(
  resolve: (
    tr: Transaction,
    bounds: { from: number; to: number },
    anchor: number,
    footprint: EditFootprint,
  ) => boolean,
): void {
  changeEscapes = resolve;
}

function mapAnchor(anchor: number, tr: Transaction): number | null {
  if (!tr.docChanged) return anchor;
  return tr.changes.mapPos(anchor, 1);
}

export function zoomStateExtension(): Extension {
  return zoomAnchorField;
}
