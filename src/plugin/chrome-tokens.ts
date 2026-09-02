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
/**
 * The visual gap between a mark's ink and the text that mark names.
 *
 * The one value in the gutter's derivation that is chosen rather than measured.
 * Its floor is not free: every mark whose row is written with a single space
 * after it is sized as "the gutter, less one space", so a gap under a space's
 * own advance drives that sizing negative and the mark overflows into the column
 * its text was to begin on. A space's advance varies with the reader's font,
 * which is why this sits clear of it rather than on it.
 *
 * Argued once, in docs/research/21-marker-text-gap.md.
 */
export const MARKER_GAP_REM = 0.375;

/**
 * The ink the gutter reserves whatever the theme does — a floor, not the answer.
 *
 * It covers the marks this layer draws for itself, which are much narrower than
 * this (an icon's glyph, a bullet's dot), and it is set well above them for a
 * second reason: a single-digit ordered number's own box is sized "gutter less
 * one space", so a gutter that collapsed to the icon's width would push an
 * ordered item's text off the column its siblings share.
 *
 * A checkbox is not covered here, because it is not ours to predict — see the
 * expression below.
 */
export const MIN_MARK_INK_REM = 0.5;

/** The marker glyph's own box. */
export const MARKER_ICON_REM = 0.85;

/**
 * Horizontal room reserved for a block marker, left of a node's content.
 *
 * DERIVED, and derived AT RENDER TIME rather than frozen into a number here.
 *
 * The widest mark this layer positions is a task's checkbox, and its size is the
 * theme's — `--checkbox-size`, which Obsidian resolves differently per platform
 * (measured: 16px on desktop, 18.4px on mobile). A constant taken from one of
 * them is wrong on the other, and wrong in the quiet way this whole derivation
 * exists to prevent: the checkbox does not clip, its own text simply leaves the
 * column every other kind's text sits on. So the checkbox term reads the live
 * value and the arithmetic happens in CSS.
 *
 * What is NOT in the max is any mark drawn by the reader's FONT — a single-digit
 * ordered number. Its ink is a glyph's width, unknowable before layout, so it
 * cannot be a term here; the guarantee it gets instead is the floor its own box
 * mechanism sets (one space's advance), which is what keeps it on the shared
 * column. docs/research/21-marker-text-gap.md records both halves.
 */
export const DECOR_UNIT_CSS = `${DECOR_UNIT_REM}rem`;
export const MARKER_GUTTER_CSS =
  `calc(max(${MIN_MARK_INK_REM}rem, var(--checkbox-size, 1rem) / 2) + ${MARKER_GAP_REM}rem)`;
export const MARKER_GAP_CSS = `${MARKER_GAP_REM}rem`;
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
  markerGap: '--to-marker-gap',
  markerIcon: '--to-marker-icon-size',
  guideColor: '--to-guide-color',
  accent: '--to-decor-accent',
  trailWidth: '--to-trail-width',
} as const;

/**
 * The marker glyph's box as a REFERENCE rather than a literal, for placement
 * arithmetic that must survive a surface resizing its own markers.
 *
 * `.to-decor-marker-icon` takes its width, height, margin and baseline
 * correction from this property, and its centre lands on the target column only
 * while the horizontal shift agrees with them. Spelling the shift with the
 * literal instead left the two free to disagree: overriding the property alone
 * drifted the centre right by half the size delta — the column breaks silently,
 * because everything still looks like a marker beside some text.
 *
 * The editor sets the property to exactly `MARKER_ICON_CSS`, so this changes no
 * computed value there; it only makes a scoped override possible (the footer
 * draws its markers smaller than the editor's).
 */
export const MARKER_ICON_VAR = `var(${CHROME_VARS.markerIcon}, ${MARKER_ICON_CSS})`;

/** The expression every depth calculation multiplies by, on either surface.
 * No fallback: styles.css is the single declaration. */
export const UNIT_EXPR = `var(${CHROME_VARS.unit})`;

/** Indentation for `depth` levels, plus the marker gutter — the shared column
 * arithmetic both surfaces lay content out against. */
export function depthOffsetExpr(depth: number): string {
  return `calc(${depth} * ${UNIT_EXPR} + var(${CHROME_VARS.markerGutter}, 0px))`;
}
