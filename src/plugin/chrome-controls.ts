/**
 * The small pieces of chrome that more than one surface draws: the SVG builder
 * every drawn mark goes through, and the disclosure — its chevron and the
 * semantics that go with it — which is one control in two parts.
 *
 * Its own module because the callers reach for these from opposite directions.
 * The footer draws a disclosure on its own heading and the lineage list draws
 * one on every group head, and the list is shared with the search palette; the
 * builder is reached for by both, and by the segment marks in `lineage-row.ts`.
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

/**
 * The chevron, in both the orientations this file needs.
 *
 * Both chevrons in the footer — fold and cap — come from this one path.
 *
 * It was the lineage separator too, before every segment gained its own icon
 * and the separator went. Before that it was the text glyph `❯` (U+276F), a
 * DINGBAT most UI fonts do not carry: it rendered from whatever fallback the
 * platform chose, at a weight and baseline nobody picked and differing between
 * machines. Worth keeping in mind for any future mark — an SVG has none of that.
 */
export function chevronGlyph(open: boolean): SVGSVGElement {
  return glyph(16, [open ? 'M3 6l5 5 5-5' : 'M6 3l5 5-5 5'], {
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
}

/**
 * Makes an element operable as a disclosure control.
 *
 * The heads are rows of several spans rather than single controls, so they
 * cannot be `button` elements without nesting interactive content inside one.
 * `role` plus a tab stop plus a key handler is the equivalent a composite row
 * gets — and `aria-expanded` is the part that matters, because the control's
 * meaning is which way it will move, which no label can say.
 */
export function makeDisclosure(el: HTMLElement, expanded: boolean, label: string): void {
  el.setAttribute('role', 'button');
  el.setAttribute('aria-expanded', String(expanded));
  el.setAttribute('aria-label', label);
  el.tabIndex = 0;
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Only when EL ITSELF has focus. The section header carries this
    // disclosure and also carries the filter and sort buttons as children —
    // Enter or Space on one of those bubbles here too, and without this guard
    // it both fired `el.click()` (folding the section) and, via
    // `preventDefault`, cancelled the button's OWN native activation from the
    // same keypress. A keyboard reader tabbing to the filter toggle could
    // never open it; every press folded the footer instead.
    if (event.target !== el) return;
    event.preventDefault();
    el.click();
  });
}
