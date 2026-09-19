/**
 * The marker glyphs, one per node kind, drawn from the plugin's own shape
 * data (`src/plugin/marker-shapes.ts`, which has no DOM and no editor in it),
 * so a docs page shows the marks a note would. The rest are the site's own
 * controls.
 */

import { markerShapes, type HeadingMarkerStyle, type MarkSubject, type Shape } from '../../../../src/plugin/marker-shapes';
import type { Kind } from './tree';

const svg = (body: string) => `<svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">${body}</svg>`;
const stroke = 'stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';

// The plugin's defaults for a heading's mark.
const HEADING_STYLE: HeadingMarkerStyle = { glyph: 'H', level: 'beside' };

const draw = (shape: Shape): string => {
  const attrs = Object.entries(shape.attrs)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');
  return `<${shape.tag} ${attrs}>${(shape.children ?? []).map(draw).join('')}</${shape.tag}>`;
};

function subject(kind: Kind, level: number): MarkSubject {
  if (kind === 'heading') return { kind, level, style: HEADING_STYLE };
  if (kind === 'item') return { kind: 'list-item' };
  if (kind === 'media') return { kind: 'html' };
  return { kind };
}

const cache = new Map<string, string>();

/** A node's mark; a heading's names its level. */
export function markIcon(kind: Kind, level = 1): string {
  const key = kind === 'heading' ? `heading:${level}` : kind;
  let icon = cache.get(key);
  if (!icon) cache.set(key, (icon = svg(markerShapes(subject(kind, level)).map(draw).join(''))));
  return icon;
}

export const ICONS: Record<'chevron' | 'zoomOut' | 'foldAll' | 'unfoldAll' | 'outline' | 'longForm' | 'edit' | 'link', string> = {
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
