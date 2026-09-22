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

import { columnExpr, guideLayer, markerAnchorLeftExpr, stripeStartExpr, GUIDE_WIDTH } from './chrome-line';
import { UNIT_EXPR } from './chrome-tokens';
import { MARKER_GUTTER_CSS } from './chrome-tokens';
import { nodeMark, type NodeMark } from './marker-shapes';
import type { DragPreview } from './drag-state';

/** A list item's own state, where the ghost draws it in a bullet's place. */
export interface ListMark {
  /** A task, and whether it is done. */
  readonly task?: boolean;
  /** An ordered item, and its delimiter. */
  readonly ordered?: '.' | ')';
}

/** Where on its line a seam is drawn. */
export type SeamEdge = 'top' | 'bottom' | 'middle';

/** The line a seam draws on, and where on it. */
export interface SeamIndicator {
  readonly lineNumber: number;
  /** Normally the line's top. The document's last seam has no row below it to
   * sit above, so it takes the last row's bottom; and the two seams a row's top
   * misreads (below) take the middle of the gap line before them, or the row
   * above's bottom where there is no gap. */
  readonly edge: SeamEdge;
  readonly depth: number;
  /** The mark the run's first root will have where it lands — the ghost. */
  readonly mark: NodeMark;
  /** A list item's checkbox or number, drawn instead of its bullet. */
  readonly list: ListMark | undefined;
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
  /** What kind of node a line belongs to, for the two rows a seam cannot draw
   * on its own top edge. */
  kindAt: (line: number) => { kind: string; atom: boolean } | undefined = () => undefined,
): SeamIndicator | null {
  if (preview === null) return null;
  const depth = preview.destination.depth;
  const mark = nodeMark(preview.destination.mark);
  const list = preview.destination.mark.list;
  let last = -1;
  for (const line of factLines) {
    if (line < preview.seamLine && line > last) last = line;
  }
  if (factLines.has(preview.seamLine)) {
    // Drawn away from this row's top where the top is the wrong place to read
    // it: under a heading, whose own spacing puts the next row's edge well
    // below its text, so the bar seemed to sit on the row below rather than
    // under the heading; and above an atom, whose own background is painted
    // over the overlay this bar rides in. The gap line between the two rows
    // is the seam's own room, so the bar takes its middle; pressed against
    // the heading's own text it read as underlining it. Without a gap, the
    // row above's bottom edge is what is left.
    const here = kindAt(preview.seamLine);
    const above = last >= 0 ? kindAt(last) : undefined;
    if (last >= 0 && ((above && above.kind === 'heading') || (here && here.atom))) {
      return preview.seamLine - last >= 2
        ? { lineNumber: preview.seamLine - 1, edge: 'middle', depth, mark, list }
        : { lineNumber: last, edge: 'bottom', depth, mark, list };
    }
    return { lineNumber: preview.seamLine, edge: 'top', depth, mark, list };
  }
  return last < 0 ? null : { lineNumber: last, edge: 'bottom', depth, mark, list };
}

/**
 * The guide that will connect the absorbed rows to the ghost mark, on the
 * FIRST of them: begun below the mark rather than at the row's top, where a
 * full-height stripe ran up through the glyph sitting on that edge.
 */
export function absorbedGuideHead(depth: number): string {
  return (
    `repeating-linear-gradient(to right, var(--to-guide-color) 0 ${GUIDE_WIDTH}, transparent ${GUIDE_WIDTH} ${UNIT_EXPR}) ` +
    `${stripeStartExpr(depth, GUIDE_WIDTH)} bottom / ${UNIT_EXPR} calc(100% - var(--to-marker-icon-size, 0.85rem) / 2) no-repeat`
  );
}

/** The guide that connects the absorbed rows, on every row after the first. */
export function absorbedGuide(depth: number): string {
  return guideLayer(depth);
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
): AbsorbedRows | null {
  if (preview === null) return null;
  const absorbs = preview.destination.absorbs;
  if (!absorbs) return null;
  return {
    from: absorbs.from + lineOffset,
    to: absorbs.to + lineOffset,
    column: preview.destination.depth,
    shifts: absorbs.shifts.map((s) => ({ from: s.from + lineOffset, to: s.to + lineOffset, by: s.by })),
  };
}

/** The absorbed rows in the source's line space: the span, the run's own
 * column their new guide is drawn on, and how far each absorbed subtree moves. */
export interface AbsorbedRows {
  readonly from: number;
  readonly to: number;
  readonly column: number;
  readonly shifts: readonly { readonly from: number; readonly to: number; readonly by: number }[];
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
    `calc(${columnExpr(at.depth)} + ${MARKER_GUTTER_CSS}) ${at.edge === 'middle' ? 'center' : at.edge} ` +
    `/ 100% ${DROP_WIDTH} no-repeat`
  );
}
