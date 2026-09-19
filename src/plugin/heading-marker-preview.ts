/**
 * The settings tab's preview of a heading's mark (`heading-level-markers`): one
 * mark, drawn by the editor's own `buildMarkerIcon` in the style the two
 * heading marker settings choose, so a reader sees what a choice draws while
 * making it.
 *
 * Drawn from the one builder rather than from an illustration of it, so the
 * preview cannot show a mark the editor would not. Larger than the editor's own
 * mark, because this one is being examined rather than read past.
 */

import { buildMarkerIcon } from './decorations';
import type { HeadingMarkerStyle } from './marker-shapes';

export const HEADING_PREVIEW_CLASS = 'to-heading-marker-preview';

/** The level the preview draws. One mark shows a style, and a middle level
 * shows a digit that is neither the narrowest nor the widest of the six. */
const PREVIEW_LEVEL = 2;

/** Replaces `el`'s content with that one mark, drawn in `style`. */
export function drawHeadingMarkerPreview(el: HTMLElement, style: HeadingMarkerStyle): void {
  el.empty();
  el.addClass(HEADING_PREVIEW_CLASS);
  el.dataset.level = String(PREVIEW_LEVEL);
  // The settings tab's own element, not an editor line: nothing re-diffs it.
  // eslint-disable-next-line no-restricted-syntax -- settings-tab DOM, which no editor owns
  el.appendChild(buildMarkerIcon({ kind: 'heading', level: PREVIEW_LEVEL, style }));
}
