/**
 * The settings tab's preview of a heading's mark (`heading-level-markers`): the
 * six levels as a small indented outline, each drawn by the editor's own
 * `buildMarkerIcon` in the style the two heading marker settings choose, so a
 * reader sees what a choice draws while making it.
 *
 * Drawn from the one builder rather than from an illustration of it, so the
 * preview cannot show a mark the editor would not.
 */

import { buildMarkerIcon } from './decorations';
import type { HeadingMarkerStyle } from './marker-shapes';

export const HEADING_PREVIEW_CLASS = 'to-heading-marker-preview';

const LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Replaces `el`'s children with the six levels drawn in `style`. */
export function drawHeadingMarkerPreview(el: HTMLElement, style: HeadingMarkerStyle): void {
  const rows = LEVELS.map((level) => {
    const row = createDiv({ cls: `${HEADING_PREVIEW_CLASS}-row` });
    row.setCssProps({ '--to-preview-depth': String(level - 1) });
    const mark = row.createSpan({ cls: `${HEADING_PREVIEW_CLASS}-mark` });
    mark.dataset.level = String(level);
    // `mark` is detached: `row` is not mounted until the loop below.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: built here, mounted below
    mark.appendChild(buildMarkerIcon({ kind: 'heading', level, style }));
    row.createSpan({ text: `Heading ${level}` });
    return row;
  });
  el.empty();
  el.addClass(HEADING_PREVIEW_CLASS);
  // The settings tab's own container, not an editor line: nothing re-diffs it.
  // eslint-disable-next-line no-restricted-syntax -- settings-tab DOM, which no editor owns
  el.append(...rows);
}
