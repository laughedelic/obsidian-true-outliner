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
 * One rule for both edges: a range spans exactly the lines it removes, from the
 * first hidden line's START to the last hidden line's END. It never reaches the
 * neighbouring visible line's own boundary, and it does not need to — a block
 * replacement covers whole lines, so the line break beside it is consumed as
 * the block's own boundary and no stray empty line renders at either edge.
 *
 * Both edges used to reach one position further, onto the neighbouring visible
 * line's boundary, and both were wrong there. That position is where every
 * point decoration on that line is anchored, and a line decoration sorts BEFORE
 * the position it marks (`-2e8`, against a block replacement's inclusive end at
 * `+2e8`), so the replacement swallowed the lot — ours and Obsidian's alike:
 * the zoom root came out a bare `.cm-line` with no marker, no depth variables
 * and no `HyperMD-list-line`, a list root drawn with raw `- ` text at the wrong
 * column. At the other end the tail range swallowed the whole line: a cover
 * ending on a trailing gap lost that gap, so the visible range was one line
 * shorter than the scope said. `Decoration.replace`'s `inclusiveEnd: false` was
 * measured as the alternative and is not one — it rescues our line decorations
 * but not Obsidian's, and it lets the tail range's last line escape.
 *
 * A range of ZERO length is emitted, not filtered out. That is the shape a
 * single blank line takes — no character to cover, only a line — and a
 * zero-length block replacement does hide it; with the range dropped, the blank
 * line renders. Both halves measured in `80-outline-zoom`.
 */
export function hiddenOffsetRanges(doc: Text, scope: ZoomScope): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const span of scope.hidden) {
    // Source lines are 0-indexed and the span is half-open; CM lines are
    // 1-indexed and this range takes both of its own ends. Clamped against the
    // real document, whose trailing-line count can differ from the parse's.
    const first = span.fromLine + 1;
    const last = Math.min(span.toLine, doc.lines);
    if (first > last) continue;
    out.push({ from: doc.line(first).from, to: doc.line(last).to });
  }
  return out;
}
