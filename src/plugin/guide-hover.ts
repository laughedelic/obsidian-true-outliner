/**
 * The guide under the pointer, as editor STATE — so the decoration pass paints
 * it thickened, and the thickening survives every rebuild.
 *
 * The first version set a per-line custom property from the pointer tracker.
 * CodeMirror's line decorations own the line's `style` attribute and rewrite
 * it on every rebuild, which every caret move causes: the property vanished on
 * the click that placed a caret, and on any move that reshaped the caret
 * trail, so the lit guide went dark at exactly the moments a reader was
 * acting on it. Held here, the hover is one more input to the same pass that
 * paints the guides, and is applied wherever they are.
 */

import { StateEffect, StateField, type Extension } from '@codemirror/state';

/** The lines the hovered guide runs through (0-based, inclusive), and the
 * column it is drawn at. */
export interface GuideHover {
  readonly first: number;
  readonly last: number;
  readonly column: number;
}

export const setGuideHover = StateEffect.define<GuideHover | null>();

export const guideHoverField = StateField.define<GuideHover | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGuideHover)) return effect.value;
    }
    // Line numbers, and a change moves lines: cleared rather than mapped,
    // since the tracker re-derives the hover from the pointer's own position
    // after any change (`ZoomClickPlugin.update`).
    return tr.docChanged ? null : value;
  },
});

export function guideHoverExtension(): Extension {
  return guideHoverField;
}
