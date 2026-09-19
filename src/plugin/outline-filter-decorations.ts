/**
 * The filter's marks: every occurrence of the query inside a visible node.
 *
 * `Decoration.mark` with `tagName: 'mark'`, so the editor puts the same element
 * with the same class in the DOM as the backlinks footer does for its own
 * matches (`outline-filter` D6). One stylesheet rule then covers both surfaces
 * — including the resets a theme's own `<mark>` styling needs — rather than two
 * that look alike until someone edits one of them.
 *
 * The class is what keeps our mark apart from an author's `==highlight==`,
 * which renders as a bare `<mark>` on both surfaces.
 *
 * Marked with the query the anchors ANSWER rather than the one in the field: a
 * query that matches nothing keeps the last matching view (D8), and that view
 * is that earlier query's result, so its marks are too.
 */

import { RangeSetBuilder, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { outlineFilter, shownSpans } from './outline-filter-scope';
import { markRanges } from './outline-filter-state';

export const MATCH_CLASS = 'to-match';

const matchMark = Decoration.mark({ tagName: 'mark', class: MATCH_CLASS });

function compute(state: EditorState): DecorationSet {
  const spans = shownSpans(state);
  const filter = outlineFilter(state);
  if (!spans || !filter?.answered) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of markRanges(spans, state.doc, filter.answered)) {
    builder.add(from, to, matchMark);
  }
  return builder.finish();
}

export function outlineFilterDecorationsExtension(): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => compute(state),
    update: (_value, tr) => compute(tr.state),
    provide: (f) => EditorView.decorations.from(f),
  });
}
