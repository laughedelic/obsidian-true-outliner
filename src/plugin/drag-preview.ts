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

import { columnExpr, markerAnchorLeftExpr } from './chrome-line';
import { MARKER_GUTTER_CSS } from './chrome-tokens';
import { parse } from '../parse';
import { nodeMark, type NodeMark } from './marker-shapes';
import type { DragPreview } from './drag-state';

/** The line a seam draws on, and which of its edges. */
export interface SeamIndicator {
  readonly lineNumber: number;
  /** The seam is the line's BOTTOM edge rather than its top: the document's
   * last seam has no row below it to sit above. */
  readonly below: boolean;
  readonly depth: number;
  /** The run's first line as this destination would write it — what the
   * ghost mark is read from. */
  readonly firstLine: string;
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
  const firstLine = preview.destination.firstLine;
  if (factLines.has(preview.seamLine)) {
    return { lineNumber: preview.seamLine, below: false, depth, firstLine };
  }
  let last = -1;
  for (const line of factLines) {
    if (line < preview.seamLine && line > last) last = line;
  }
  return last < 0 ? null : { lineNumber: last, below: true, depth, firstLine };
}

/**
 * The mark the run will have WHERE IT LANDS, read from the line the
 * destination would write it as.
 *
 * From the written line and not from the run's current kind, which is the
 * whole of design D7: a heading section dropped into a list is re-encoded as a
 * list item carrying its own `#` run as text, and a preview drawing the glyph
 * the run has in flight would state a result that is not going to happen. The
 * line itself comes from the same `reencodeBlocksForDestination` call the
 * release makes, so there is no second derivation to drift.
 *
 * Null where the line parses to no node at all — nothing this module can
 * draw, and not a case to guess at.
 */
export function ghostMark(firstLine: string): NodeMark | null {
  const node = parse(firstLine).children[0];
  return node === undefined ? null : nodeMark(node);
}

/**
 * Where the ghost mark's own left edge goes, relative to the row it is mounted
 * in.
 *
 * The row's box has already been shifted right by its own depth, so the column
 * is reached by undoing that first — the same correction the guide overlay
 * makes, through the same property the row already carries. Then the icon is
 * centred on the column by the shared helper, so the ghost sits exactly where
 * a real mark at that depth would.
 */
export function ghostMarkLeftExpr(depth: number): string {
  return markerAnchorLeftExpr(`calc(${columnExpr(depth)} - var(--to-own-shift, 0px))`);
}

/**
 * The rows a drop would take into the run, in the SOURCE's line space, and the
 * depth they would then sit at — one level inside the destination. Empty where
 * the destination absorbs nothing.
 *
 * Those rows are drawn one column in for the drag's duration, under the ghost
 * mark, with the guide that will connect them: the result shown as the result,
 * rather than a region marked and left to be explained. It is the one part of
 * the preview that moves rows before the release — horizontally, and only
 * these — which `node-dragging` states beside its rule that the document does
 * not.
 */
export function absorbedRows(
  preview: DragPreview | null,
  lineOffset: number,
): { readonly from: number; readonly to: number; readonly depth: number } | null {
  const absorbs = preview?.destination.absorbs;
  if (!absorbs) return null;
  return {
    from: absorbs.from + lineOffset,
    to: absorbs.to + lineOffset,
    depth: preview!.destination.depth + 1,
  };
}

/** The indicator's colour and thickness; `90-dragging.css` declares both. */
const DROP_COLOR = 'var(--to-drop-color)';
const DROP_WIDTH = 'var(--to-drop-width)';

/**
 * The indicator as one background layer: a bar beginning where the run's TEXT
 * will start — one marker gutter right of the destination's column — and
 * running to the row's right edge.
 *
 * It states the depth by where it STARTS, which is the whole point — a
 * full-width rule draws identically for every destination a seam offers, and
 * one seam offers as many as there are levels flanking it (design D8). The
 * gutter's width off the column is the ghost mark's place: the mark sits ON the
 * column, and a bar starting there ran through it.
 */
export function seamLayer(at: SeamIndicator): string {
  return (
    `linear-gradient(to right, ${DROP_COLOR} 0 100%) ` +
    `calc(${columnExpr(at.depth)} + ${MARKER_GUTTER_CSS}) ${at.below ? 'bottom' : 'top'} ` +
    `/ 100% ${DROP_WIDTH} no-repeat`
  );
}
