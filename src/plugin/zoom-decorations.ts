/**
 * Zoom's hiding layer: two block-level replace decorations bracketing the
 * visible range (`outline-zoom` design D2).
 *
 * Proven before this was written — docs/research/23 measured the mechanism
 * against a real Obsidian with the three established decoration sources and the
 * backlinks footer mounted, which is the composition question that mattered.
 * What it found: hidden lines leave the layout entirely (content height 770px →
 * 589px for a four-line span), widget-rendered atoms are fine inside and
 * outside the span, and a visible line's own chrome is byte-identical to its
 * unzoomed rendering.
 *
 * The ranges are DERIVED from the scope on every state, never stored and never
 * mapped. That is D1's whole point: there is one piece of mapped state, an
 * integer, so the hiding cannot drift out of agreement with the content the way
 * obsidian-zoom's mapped decorations can.
 *
 * A `StateField` and not a `ViewPlugin`, and not by preference: CodeMirror
 * refuses decorations that replace line breaks from a plugin source, and both
 * of these necessarily do.
 */

import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { ModeSource } from './keymap';
import { zoomScope } from './zoom-scope';
import { hiddenOffsetRanges } from './zoom-offsets';

/**
 * The two hiding decorations, and the pair is not redundant.
 *
 * `inclusiveEnd` stays true for both: a range ends on the last line it removes,
 * and that line's own content has to go with it. `inclusiveStart` differs,
 * because the two edges begin at different KINDS of position
 * (`zoom-offsets.ts`).
 *
 * The head begins at offset 0, the start of a line it removes, so its start is
 * inclusive — measured: made non-inclusive, the document's first line renders
 * above the trail.
 *
 * The tail begins at the last VISIBLE line's END, which is a position that line
 * keeps. On an ordinary line that is past everything anchored there; on an EMPTY
 * one — the cover's own trailing gap, which D3 keeps — the line's start, end and
 * every decoration on it are all that same position, and an inclusive start
 * takes the line with them. Measured: a cover ending on a gap lost that gap, so
 * the visible range was a line shorter than the scope said.
 *
 * `inclusiveEnd: false` was tried as one answer for both and is not one: it
 * rescues our line decorations and not Obsidian's, and it lets the tail range's
 * last line escape.
 */
const hiddenHead = Decoration.replace({ block: true });
const hiddenTail = Decoration.replace({ block: true, inclusiveStart: false });

function compute(state: EditorState, modes: ModeSource): DecorationSet {
  const scope = zoomScope(state, modes);
  if (!scope) return Decoration.none;
  const ranges = hiddenOffsetRanges(state.doc, scope);
  if (ranges.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  // Which spec a range takes is decided by where it begins, which is the same
  // thing that decides where it begins: only the head starts at offset 0.
  for (const { from, to } of ranges) builder.add(from, to, from === 0 ? hiddenHead : hiddenTail);
  return builder.finish();
}

/**
 * The class a zoomed editor carries, so the stylesheet can hide the chrome that
 * is not part of the zoomed subtree — Obsidian's inline title and its properties
 * block, which are siblings of the content inside `.cm-sizer` and therefore not
 * document lines our block replacements could reach.
 *
 * Declared through CM6's own `editorAttributes` facet rather than written onto
 * `view.dom` with `classList`, for the reason `decorationsExtension` records for
 * the block-selection class: `EditorView.updateAttrs` recomputes the editor's
 * whole class string and writes the attribute wholesale, so an imperative class
 * is clobbered by the next focus change and flickers once per gesture.
 */
export const ZOOMED_CLASS = 'to-zoomed';

export function zoomDecorationsExtension(modes: ModeSource): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => compute(state, modes),
    update: (_value, tr) => compute(tr.state, modes),
    provide: (f) => EditorView.decorations.from(f),
  });
  return [
    field,
    EditorView.editorAttributes.of((view) =>
      zoomScope(view.state, modes) ? { class: ZOOMED_CLASS } : null,
    ),
  ];
}
