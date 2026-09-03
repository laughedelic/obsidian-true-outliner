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
 * One shared decoration value. Block replacements with identical specs are
 * interchangeable, and re-creating one per range per transaction would allocate
 * inside the keystroke budget for no benefit.
 */
const hidden = Decoration.replace({ block: true });

function compute(state: EditorState, modes: ModeSource): DecorationSet {
  const scope = zoomScope(state, modes);
  if (!scope) return Decoration.none;
  const ranges = hiddenOffsetRanges(state.doc, scope);
  if (ranges.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of ranges) builder.add(from, to, hidden);
  return builder.finish();
}

export function zoomDecorationsExtension(modes: ModeSource): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => compute(state, modes),
    update: (_value, tr) => compute(tr.state, modes),
    provide: (f) => EditorView.decorations.from(f),
  });
}
