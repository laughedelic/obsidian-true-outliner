/**
 * Line-space scope → CodeMirror offsets.
 *
 * Its own module, free of any `obsidian` import, so the boundary arithmetic is
 * reachable from the unit suite. That is not incidental tidiness: this is the
 * calculation docs/research/23 went looking for an off-by-one in, since getting
 * either edge wrong by one position drops a line that should render or renders
 * one that should be gone.
 */

import type { Text } from '@codemirror/state';
import type { ZoomScope } from '../zoom';

/**
 * The hidden spans as CM6 offset ranges, ready for a block replacement.
 *
 * Every range ENDS on the last line it removes, never on the first line it
 * keeps. That position is where every point decoration on the kept line is
 * anchored, and a line decoration sorts BEFORE the position it marks (`-2e8`,
 * against a block replacement's inclusive end at `+2e8`), so a range reaching it
 * swallowed the lot — ours and Obsidian's alike. The zoom root came out a bare
 * `.cm-line`: no marker, no depth variables, no `HyperMD-list-line`, and a list
 * root drawn from raw `- ` text at the wrong column.
 *
 * The two edges START differently, and the asymmetry is the document's, not a
 * preference. The head begins at offset 0, which is a line's start and must be
 * covered. The tail begins at the last VISIBLE line's end, one position short
 * of the first hidden line — because a block replacement beginning exactly
 * where another one does is a tie, resolved by decoration precedence, and
 * Obsidian's own widget for a table won it: zooming into a code fence rendered
 * the sibling table below the footer, editable. Starting one position earlier
 * is outside every such decoration and ties with nothing.
 *
 * `zoom-decorations.ts` carries the matching pair of specs: the tail's start is
 * NON-inclusive, so the empty line that position sits on — the cover's own
 * trailing gap, which D3 keeps — is not swallowed by a range that begins on it.
 * The head's start is inclusive, because the line at offset 0 is one it removes.
 *
 * A HEAD range of zero length is emitted, not filtered out: that is the shape a
 * blank first line takes — no character to cover, only a line — and a
 * zero-length block replacement does hide it. Measured both ways in
 * `80-outline-zoom`; with the range dropped, the blank line renders.
 */
export function hiddenOffsetRanges(doc: Text, scope: ZoomScope): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const span of scope.hidden) {
    // Source lines are 0-indexed and the span is half-open; CM lines are
    // 1-indexed. Clamped against the real document, whose trailing-line count
    // can differ from the parse's.
    const first = span.fromLine + 1;
    const last = Math.min(span.toLine, doc.lines);
    if (first > last) continue;
    out.push({
      from: first > 1 ? doc.line(first - 1).to : 0,
      to: doc.line(last).to,
    });
  }
  return out;
}
