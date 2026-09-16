/**
 * The SVG builder every drawn mark in this plugin's own chrome goes through.
 *
 * Its own module because two surfaces reach for it from opposite directions:
 * the footer's controls and rungs, and the lineage row's segment marks, which
 * `lineage-row.ts` draws for the footer, the palette and zoom's trail alike.
 * Node MARKERS are not built here — those come from `buildMarkerIcon`, shared
 * with the editor, because a marker says what kind of node something is and two
 * icon sets would be two answers to one question.
 *
 * Every glyph is built DETACHED and handed to a caller that mounts it, which is
 * the shape the DOM-insertion guard sanctions.
 */
export function glyph(box: number, d: string[], attrs: Record<string, string>): SVGSVGElement {
  const el = createSvg('svg', {
    attr: { viewBox: `0 0 ${box} ${box}`, width: '100%', height: '100%', 'aria-hidden': 'true', ...attrs },
  });
  for (const spec of d) el.createSvg('path', { attr: { d: spec } });
  return el;
}
