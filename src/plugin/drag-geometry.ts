/**
 * What the view knows that the destination resolution does not: where a seam
 * sits and where a depth's column is.
 *
 * Its own module because it is the only place in this plugin that needs a
 * column as a NUMBER. Every surface positions itself in CSS against
 * `chrome-line.ts`'s column expression, so nothing had ever resolved one —
 * until a pointer had to be compared against them.
 *
 * `column(depth) = contentLeft + depth × unit`, measured
 * (docs/research/node-drag-and-drop section 6a). The unit comes from a probe
 * element rather than from `getComputedStyle`, which hands back the unresolved
 * `2rem` for a custom property, and the origin is the CONTENT box rather than
 * a line's own: a line at depth 1 carries the depth in its own margin, so
 * reading its rect would count the depth twice.
 */

import type { EditorView } from '@codemirror/view';
import type { DropSeam, PointerGeometry } from '../drop-destinations';

/** The class the probe below is declared by, so no length is written here —
 * `styles/90-dragging.css` holds the one declaration. */
const UNIT_PROBE_CLASS = 'to-drag-unit-probe';

/** The width of one depth step, in CSS pixels, or `null` where it cannot be
 * resolved — a view being torn down under the measurement. */
function measureUnit(view: EditorView): number | null {
  const probe = createDiv({ cls: UNIT_PROBE_CLASS });
  // Safe DOM insertion (see the no-restricted-syntax guard in
  // eslint.config.js, hardening 5.2): the editor ROOT, never a line and never
  // the content — CM6's mutation observer watches `contentDOM`, which is what
  // the guard is about. The probe is a sibling of that subtree, is measured in
  // the frame it is added, and is gone before this returns.
  // eslint-disable-next-line no-restricted-syntax -- editor root, not contentDOM: measured and removed within the call
  view.dom.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width > 0 ? width : null;
}

/**
 * The geometry a pointer position is resolved against: one vertical position
 * per seam, and a column per depth.
 *
 * `null` where the view cannot answer — an empty document has no seams, and a
 * unit that measures zero means the stylesheet has not applied yet.
 */
export function dragGeometry(
  view: EditorView,
  seams: readonly DropSeam[],
  lineOffset = 0,
): PointerGeometry | null {
  const unit = measureUnit(view);
  if (unit === null || seams.length === 0) return null;
  const content = view.contentDOM.getBoundingClientRect();
  const origin = content.left + parseFloat(getComputedStyle(view.contentDOM).paddingLeft || '0');

  const lastLine = view.state.doc.lines;
  // A block's own `top` is stated in DOCUMENT coordinates — measured from the
  // first line, not from the window — while the pointer arrives in viewport
  // coordinates, which is the space the column expression above is already in.
  // `documentTop` maps between them and carries the scroll
  // (docs/research/node-drag-and-drop section 6c).
  const top = view.documentTop;
  const seamY = seams.map((seam) => {
    // A seam's line is stated in the tree the seams were resolved against, and
    // under a zoom that is the scope's own re-rooted document — whose line 0
    // is the scope root's line in the source. One constant offset maps it
    // back, which is what the scope publishes it for.
    const line = seam.line + lineOffset;
    // A seam sits at the TOP of the line below it. Past the last line there is
    // no line to ask, so the document's own bottom stands for it.
    if (line >= lastLine) {
      return top + view.lineBlockAt(view.state.doc.length).bottom;
    }
    return top + view.lineBlockAt(view.state.doc.line(line + 1).from).top;
  });

  return { seamY, columnX: (depth: number) => origin + depth * unit };
}
