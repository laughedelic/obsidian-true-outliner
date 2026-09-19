/**
 * What a drag in flight DRAWS: the indicator at the seam, on the destination
 * depth's own column.
 *
 * Its own module rather than a corner of `decorations.ts`, on the one-part-per-
 * feature line the styles already follow — but it produces a background LAYER,
 * not an element, because a `.cm-line` has no pseudo-element left to take. Both
 * are spoken for (`10-editor.css` says by what), and the guides and the caret
 * trail's accents already share one overlay's comma-separated background list
 * for exactly that reason. The indicator rides in the same list.
 *
 * Which also settles its coordinate space for free: that overlay is shifted
 * back to the true column origin, so a layer positioned at `columnExpr(depth)`
 * lands on the column every marker, guide and accent at that depth is already
 * on. Taken from the expression rather than measured off a mark's box, because
 * a list bullet's span BEGINS at its column where every other mark is centred
 * on it (docs/research/node-drag-and-drop section 1) — so a measurement would
 * be right for list destinations and wrong for the rest, or the reverse.
 */

import { columnExpr } from './chrome-line';
import type { DragPreview } from './drag-state';

/** The line a seam draws on, and which of its edges. */
export interface SeamIndicator {
  readonly lineNumber: number;
  /** The seam is the line's BOTTOM edge rather than its top: the document's
   * last seam has no row below it to sit above. */
  readonly below: boolean;
  readonly depth: number;
}

/**
 * The row the indicator hangs on, or null when the preview names none.
 *
 * A seam is stated as the line BELOW it, so it normally draws on that line's
 * top edge. The document's last seam is past every node, so it draws instead
 * under the last row that has a fact — the last row a reader can see, which is
 * not always the last line: a note's terminating newline is a gap line, and a
 * gap line can be collapsed to no height at all.
 */
export function seamIndicator(
  preview: DragPreview | null,
  factLines: ReadonlySet<number>,
): SeamIndicator | null {
  if (preview === null) return null;
  const depth = preview.destination.depth;
  if (factLines.has(preview.seamLine)) {
    return { lineNumber: preview.seamLine, below: false, depth };
  }
  let last = -1;
  for (const line of factLines) {
    if (line < preview.seamLine && line > last) last = line;
  }
  return last < 0 ? null : { lineNumber: last, below: true, depth };
}

/** The indicator's colour and thickness; `90-dragging.css` declares both. */
const DROP_COLOR = 'var(--to-drop-color)';
const DROP_WIDTH = 'var(--to-drop-width)';

/**
 * The indicator as one background layer: a bar beginning on the destination's
 * column and running to the row's right edge.
 *
 * It states the depth by where it STARTS, which is the whole point — a
 * full-width rule draws identically for every destination a seam offers, and
 * one seam offers as many as there are levels flanking it (design D8).
 */
export function seamLayer(at: SeamIndicator): string {
  return (
    `linear-gradient(to right, ${DROP_COLOR} 0 100%) ` +
    `${columnExpr(at.depth)} ${at.below ? 'bottom' : 'top'} / 100% ${DROP_WIDTH} no-repeat`
  );
}
