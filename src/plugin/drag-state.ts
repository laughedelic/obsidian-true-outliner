/**
 * The drag in flight, as editor STATE — so the preview is painted by the same
 * decoration pass everything else on the grid goes through, scrolls with the
 * document, and survives a rebuild without being re-measured (design D10).
 *
 * The shape `guide-hover.ts` already uses, for the same reason: a DOM overlay
 * positioned from the pointer would have to be re-placed on every scroll and
 * every rebuild, and would sit outside the column system every other surface
 * shares.
 *
 * Dispatched only when the resolved destination CHANGES. A pointer emits moves
 * far faster than the destination changes under it, and a transaction per
 * sample is a rebuild per sample; `sameDestination` is what the tracker asks
 * before dispatching, and it lives here beside the state it guards rather than
 * in the tracker, so the field and its writer cannot drift on what "changed"
 * means.
 */

import { StateEffect, StateField, type Extension } from '@codemirror/state';
import type { DropDestination } from '../drop-destinations';

/** Where the run would land, and the seam the indicator is drawn at. */
export interface DragPreview {
  /** The line the seam sits above, in the SOURCE document — the first line of
   * the node below it, or the document's line count where there is none.
   *
   * The source's, not the tree's: under a zoom the seams are resolved against
   * the scope's own re-rooted document, whose line 0 is the scope root's line
   * here, and the decoration pass draws into the source. The one constant
   * offset is applied where the seam is resolved, so everything downstream
   * reads one line space. */
  readonly seamLine: number;
  readonly destination: DropDestination;
  /** What maps the destination's own line spans — its absorbed rows — into
   * the source: the zoom root's line, or 0. The seam is already mapped. */
  readonly lineOffset: number;
}

export const setDragPreview = StateEffect.define<DragPreview | null>();

export const dragPreviewField = StateField.define<DragPreview | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDragPreview)) return effect.value;
    }
    // A seam is a line number and a destination is a node id, and a change
    // moves both. Cleared rather than mapped: a write under a held press
    // cancels the drag outright (`zoom-click.ts`), so there is nothing left
    // for a mapped preview to describe.
    return tr.docChanged ? null : value;
  },
});

/**
 * Whether two previews say the same thing — the question the tracker asks
 * before dispatching.
 *
 * Compared by VALUE and not by identity: each pointer move resolves a fresh
 * object, so an identity check would report a change on every sample and make
 * the guard do nothing at all.
 */
export function sameDestination(a: DragPreview | null, b: DragPreview | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.seamLine === b.seamLine &&
    a.destination.parentId === b.destination.parentId &&
    a.destination.index === b.destination.index &&
    a.destination.depth === b.destination.depth
  );
}

export function dragPreviewExtension(): Extension {
  return dragPreviewField;
}
