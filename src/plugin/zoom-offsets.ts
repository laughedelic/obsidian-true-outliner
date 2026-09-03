/**
 * Line-space scope → CodeMirror offsets.
 *
 * Its own module, free of any `obsidian` import, so the boundary arithmetic is
 * reachable from the unit suite. That is not incidental tidiness: this is the
 * calculation docs/research/23 went looking for an off-by-one in, since getting
 * either edge wrong by one position leaves a rendered empty line where a
 * replacement ends. Two layers consume it — the hiding decorations and the
 * footer's anchor — and a one-position disagreement between them would put the
 * footer back inside the hidden range.
 */

import type { Text } from '@codemirror/state';
import type { ZoomScope } from '../zoom';

/**
 * The hidden spans as CM6 offset ranges, ready for a block replacement.
 *
 * Each range swallows the newline that would otherwise be left behind: the head
 * range ends at the START of the first visible line, and the tail range begins
 * at the END of the last visible one. Measured, not reasoned: the spike
 * confirmed this pair renders no stray empty line at either edge, in a document
 * with and without frontmatter, and with either range absent.
 */
export function hiddenOffsetRanges(doc: Text, scope: ZoomScope): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const span of scope.hidden) {
    if (span.fromLine === 0) {
      // Hides source lines 0..toLine-1, so the first visible one is `toLine`.
      const firstVisible = Math.min(span.toLine + 1, doc.lines);
      out.push({ from: 0, to: doc.line(firstVisible).from });
    } else {
      // Hides source lines fromLine..end, so the last visible one is
      // `fromLine - 1` — CM line `fromLine`, one-indexed.
      const lastVisible = Math.max(1, Math.min(span.fromLine, doc.lines));
      out.push({ from: doc.line(lastVisible).to, to: doc.length });
    }
  }
  return out.filter((r) => r.to > r.from);
}

