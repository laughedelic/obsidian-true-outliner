/**
 * The outline's visual vocabulary, in one place, for every surface that draws
 * it.
 *
 * Until the backlinks footer there was only one surface, so these values lived
 * inside `decorations.ts` next to their only consumer. A second surface makes
 * that a latent divergence: two renderers each holding their own copy of "how
 * wide is one level of indentation" agree only until someone changes one of
 * them. The editor keeps its own line-decoration machinery; what it shares with
 * the footer is this — the numbers and the custom-property names.
 *
 * Geometry is expressed in `rem` so it tracks the reader's font size, and as
 * `var(--name, fallback)` expressions so a theme or snippet can retune the
 * whole outline without a plugin setting and without either surface knowing.
 *
 * NOTE on fallbacks: `--to-decor-unit` is DECLARED in styles.css, so the
 * expressions here read it without one. A literal fallback would be a second
 * copy of the number living in JS, and the two would eventually disagree —
 * the same reasoning `decorations.ts` records at its own `UNIT`, one level up.
 */

/** One level of indentation. Mirrors the value styles.css declares; kept here
 * only for callers that need the NUMBER rather than the CSS expression. Prefer
 * `UNIT_EXPR` — a literal in JS is a second copy of a value CSS owns. */
export const DECOR_UNIT_REM = 1.5;
/** Horizontal room reserved for a block marker, left of a node's content. */
export const MARKER_GUTTER_REM = 1.25;
/** The marker glyph's own box. */
export const MARKER_ICON_REM = 0.85;

export const DECOR_UNIT_CSS = `${DECOR_UNIT_REM}rem`;
export const MARKER_GUTTER_CSS = `${MARKER_GUTTER_REM}rem`;
export const MARKER_ICON_CSS = `${MARKER_ICON_REM}rem`;

/**
 * Custom-property names the chrome reads. Held as constants so a rename is a
 * compile error in every surface at once rather than a silent no-op in one of
 * them — a CSS variable that nobody defines fails by falling back, not by
 * complaining.
 */
export const CHROME_VARS = {
  unit: '--to-decor-unit',
  markerGutter: '--to-marker-gutter',
  markerIcon: '--to-marker-icon-size',
  guideColor: '--to-guide-color',
  accent: '--to-decor-accent',
  trailWidth: '--to-trail-width',
} as const;

/** The expression every depth calculation multiplies by, on either surface.
 * No fallback: styles.css is the single declaration. */
export const UNIT_EXPR = `var(${CHROME_VARS.unit})`;

/** Indentation for `depth` levels, plus the marker gutter — the shared column
 * arithmetic both surfaces lay content out against. */
export function depthOffsetExpr(depth: number): string {
  return `calc(${depth} * ${UNIT_EXPR} + var(${CHROME_VARS.markerGutter}, 0px))`;
}
