/**
 * The marker glyphs, one per node kind. The shapes are the plugin's
 * (`buildMarkerIcon` in `src/plugin/decorations.ts`), restated as strings so a
 * docs page does not have to load the editor to draw them.
 */

import type { Kind } from './tree';

const svg = (body: string) => `<svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">${body}</svg>`;
const stroke = 'stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS: Record<Kind | 'chevron' | 'zoomOut' | 'foldAll' | 'unfoldAll' | 'outline' | 'longForm' | 'edit' | 'link', string> = {
  heading: svg(
    '<rect x="3" y="2" width="2" height="12" fill="currentColor"/><rect x="11" y="2" width="2" height="12" fill="currentColor"/><rect x="3" y="7" width="10" height="2" fill="currentColor"/>',
  ),
  paragraph: svg(
    `<line ${stroke} x1="2" y1="4" x2="14" y2="4"/><line ${stroke} x1="2" y1="8" x2="14" y2="8"/><line ${stroke} x1="2" y1="12" x2="9" y2="12"/>`,
  ),
  item: svg('<circle cx="8" cy="8" r="3" fill="currentColor"/>'),
  code: svg(
    `<polyline ${stroke} points="6,3 2,8 6,13"/><line ${stroke} x1="9.5" y1="2" x2="6.5" y2="14"/><polyline ${stroke} points="10,3 14,8 10,13"/>`,
  ),
  table: svg(
    `<rect ${stroke} x="2" y="2" width="12" height="12" rx="1"/><line ${stroke} x1="2" y1="8" x2="14" y2="8"/><line ${stroke} x1="8" y1="2" x2="8" y2="14"/>`,
  ),
  callout: svg(
    '<circle cx="8" cy="8" r="6" fill="currentColor"/><rect x="7" y="4" width="2" height="5" fill="var(--vp-c-bg)"/><rect x="7" y="10" width="2" height="2" fill="var(--vp-c-bg)"/>',
  ),
  quote: svg(
    '<circle cx="5" cy="5" r="2" fill="currentColor"/><rect x="4" y="5" width="2" height="4" fill="currentColor"/><circle cx="11" cy="5" r="2" fill="currentColor"/><rect x="10" y="5" width="2" height="4" fill="currentColor"/>',
  ),
  hr: svg('<rect x="2" y="7" width="12" height="2" fill="currentColor"/>'),
  media: svg(`<rect ${stroke} x="3" y="2" width="10" height="12" rx="1"/><line ${stroke} x1="9" y1="2" x2="13" y2="6"/>`),
  chevron: svg(`<polyline ${stroke} points="4,6 8,10 12,6"/>`),
  foldAll: svg(`<polyline ${stroke} points="4.5,2.5 8,6 11.5,2.5"/><polyline ${stroke} points="4.5,13.5 8,10 11.5,13.5"/>`),
  unfoldAll: svg(`<polyline ${stroke} points="4.5,6 8,2.5 11.5,6"/><polyline ${stroke} points="4.5,10 8,13.5 11.5,10"/>`),
  outline: svg(
    `<line ${stroke} x1="6" y1="4" x2="14" y2="4"/><line ${stroke} x1="9" y1="8" x2="14" y2="8"/><line ${stroke} x1="9" y1="12" x2="14" y2="12"/><path ${stroke} d="M2.5 4v2.7c0 .7.6 1.3 1.3 1.3h2.2"/><path ${stroke} d="M2.5 6.7v4c0 .7.6 1.3 1.3 1.3h2.2"/>`,
  ),
  longForm: svg(
    `<line ${stroke} x1="2" y1="3.5" x2="14" y2="3.5"/><line ${stroke} x1="2" y1="6.5" x2="14" y2="6.5"/><line ${stroke} x1="2" y1="9.5" x2="14" y2="9.5"/><line ${stroke} x1="2" y1="12.5" x2="9" y2="12.5"/>`,
  ),
  edit: svg(`<path ${stroke} d="M10.5 2.5l3 3L6 13H3v-3z"/><line ${stroke} x1="8.8" y1="4.2" x2="11.8" y2="7.2"/>`),
  link: svg(
    `<path ${stroke} d="M6.5 5H5a3 3 0 0 0 0 6h1.5"/><path ${stroke} d="M9.5 5H11a3 3 0 0 1 0 6H9.5"/><line ${stroke} x1="5.5" y1="8" x2="10.5" y2="8"/>`,
  ),
  zoomOut: svg(
    `<polyline ${stroke} points="6,2 2,2 2,6"/><line ${stroke} x1="2" y1="2" x2="6.5" y2="6.5"/><polyline ${stroke} points="10,14 14,14 14,10"/><line ${stroke} x1="14" y1="14" x2="9.5" y2="9.5"/>`,
  ),
};
