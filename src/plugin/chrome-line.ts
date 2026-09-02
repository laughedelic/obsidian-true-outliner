/**
 * How one outline row is described to CSS: a class and a set of custom
 * properties. The single contract both surfaces emit.
 *
 * The editor computes almost no geometry in JS. `lineDecoration()` puts a class
 * on a line (`to-decor-block` / `to-decor-atom` / `to-decor-list`) and publishes
 * a handful of custom properties (`--to-depth`, `--to-marker-gutter`,
 * `--to-supp-depth`, `--to-list-marker-cols`, `--to-guides`, `--to-own-shift`),
 * and every offset, hanging indent and guide stripe in `styles.css` is derived
 * from those. That pair — class plus properties — is the thing a second surface
 * has to share.
 *
 * `chrome-tokens.ts` shares the vocabulary: the unit, the gutter, the variable
 * names. That was not enough, and the backlinks footer is the measurement that
 * showed it (docs/research/19, S4's corrected verdict). A surface holding only
 * the vocabulary writes its own layout rules from it, and they diverge in ways
 * that all look like small CSS bugs: guides absent because nothing set
 * `--to-guides`, markers off-column because a fixed gutter is not
 * `depth * unit + gutter`, depth applied through `padding` where the editor uses
 * `margin` and so the guide overlay's counter-shift undoing the wrong amount.
 *
 * So this module owns the mapping, and both surfaces call it. What stays behind
 * in `decorations.ts` is what only an editor has: the caret-derived position
 * trail and its accent layers, and the CM6 `Decoration` object the class and
 * properties get packed into.
 */

import { MARKER_GUTTER_CSS, MARKER_ICON_CSS, MARKER_ICON_VAR, UNIT_EXPR } from './chrome-tokens';
import type { LineDecorationFact } from './decorate';

/** A line whose depth moves its text but not its box: `padding-left`. */
export const BLOCK_LINE_CLASS = 'to-decor-block';
/** A line with a visible box (code, table, quote, callout, html, hr) — depth
 * has to move the box itself, so `margin-left`. */
export const ATOM_LINE_CLASS = 'to-decor-atom';
/** A list item, whose own list rendering already positions it within its list;
 * our contribution is the distance down to that list's root. */
export const LIST_LINE_CLASS = 'to-decor-list';
/** Carries the guide gradient overlay. Deliberately matched on its own, with no
 * kind class alongside: a gap line has a guide and no kind at all. */
export const GUIDES_CLASS = 'to-decor-guides';
/**
 * A list item written with exactly one space after its marker, which changes
 * where its native text starts and therefore what the stated hang must be.
 */
export const ONE_SPACE_MARKER_CLASS = 'to-decor-marker-1sp';

export const ONE_SPACE_MARKER_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)]) (?![ \t])/;

/**
 * A depth's COLUMN: the single x every surface positions against. A guide's
 * visible centre, a marker's visible centre and an accent's visible centre are
 * all this value.
 *
 * Stated as a function rather than left to each call site because the call
 * sites disagreed. Measured before this existed: a marker's centre sat at
 * exactly `depth × unit` while a guide painted its 1px as `[column, column+1]`,
 * so every marker was half a pixel left of the line it belongs to. Half a CSS
 * pixel is a whole device pixel at 2x, and against a 1px line it reads.
 */
export function columnExpr(depth: number): string {
  return `calc(${depth} * ${UNIT_EXPR})`;
}

/**
 * Where a stripe of width `w` must START for its own centre to land on
 * `depth`'s column. Every painted stripe goes through this; nothing positions
 * itself at the raw column and hopes.
 */
export function stripeStartExpr(depth: number, width: string): string {
  return `calc(${columnExpr(depth)} - ${width} / 2)`;
}

export const GUIDE_WIDTH = '1px';

/** One vertical guide, centred on `depth`'s column. */
export function guideLayer(depth: number): string {
  return (
    `repeating-linear-gradient(to right, var(--to-guide-color) 0 ${GUIDE_WIDTH}, transparent ${GUIDE_WIDTH} ${UNIT_EXPR}) ` +
    `${stripeStartExpr(depth, GUIDE_WIDTH)} 0 / ${UNIT_EXPR} 100% no-repeat`
  );
}

/**
 * The guide background for a row with no caret trail over it — which is every
 * row on a surface that has no caret. The editor's own `guideBackground` adds
 * accent layers on top of this and is not shared, because an accent is a
 * treatment of the reader's current position and the footer has no such thing.
 */
export function plainGuideBackground(guideDepths: readonly number[]): string {
  return guideDepths.map(guideLayer).join(', ');
}

/**
 * How far a line's own box has already been shifted right by the depth rules,
 * so the guide overlay can shift itself back and paint from the true column
 * origin.
 *
 * Static/formula-based — NOT the more precise, live-measured value
 * `MarginCompensation` computes per widget atom (which additionally corrects
 * for native padding); callers needing that precision use their own value.
 */
export function ownShiftExpr(fact: LineDecorationFact, nativeBlocks = true): string {
  if (fact.isListItem && nativeBlocks) {
    // List items get no marker gutter (native bullet/number only).
    return fact.supplementalDepth > 0 ? `calc(${fact.supplementalDepth} * ${UNIT_EXPR})` : '0px';
  }
  if (fact.isAtom && nativeBlocks) {
    // Every non-list line reserves the marker gutter, so the box is always
    // shifted by at least the gutter, even at depth 0.
    return `calc(${fact.depth} * ${UNIT_EXPR} + var(--to-marker-gutter, 0px))`;
  }
  return '0px'; // padding-left never shifts a block line's own box
}

/**
 * Horizontal placement for a marker that sits in NORMAL INLINE FLOW at the
 * start of a line's own text — the plain-line mechanism, as opposed to the
 * absolutely-positioned one the editor's widget atoms need.
 *
 * The marker is inserted exactly where the node's own text starts, and by
 * construction that position is always exactly `gutter` right of the shared
 * target column, regardless of kind or depth — that IS the definition of the
 * gutter. So the needed shift collapses to one depth- and kind-independent
 * expression: `iconSize * 0.5 - gutter`, centring the icon on the column. The
 * depth terms cancel identically for a padding-shifted block line and a
 * margin-shifted atom, worked through by hand for both before being relied on.
 *
 * The footer uses it for every row, since every footer row is a plain line.
 *
 * The icon term is `MARKER_ICON_VAR`, not the literal, so a surface that resizes
 * its own markers keeps them on their column — see that constant. The absolute
 * helpers below still spell it literally: they serve the editor's widget atoms,
 * which no surface scopes a size onto. Anything that starts scoping one must
 * move them over too.
 */
export const MARKER_LEFT_SHIFT_EXPR = `calc(${MARKER_ICON_VAR} * 0.5 - ${MARKER_GUTTER_CSS})`;

/**
 * Where a marker icon's own LEFT edge should sit, given `targetRelExpr` — a CSS
 * length expression for "the shared target column (where this depth's guide
 * renders), relative to the box the marker is about to become a child of".
 *
 * Each caller derives that from its own already-established `--to-own-shift`
 * formula, so the marker stays correct if those formulas change. Used by the
 * ABSOLUTE mechanism: a node with a visible box has no text run to sit beside,
 * so the marker is positioned against the box instead of placed in its flow.
 * The plain-line mechanism uses `MARKER_LEFT_SHIFT_EXPR`.
 */
export function markerAnchorLeftExpr(targetRelExpr: string): string {
  return `calc(${targetRelExpr} - (${MARKER_ICON_CSS} / 2))`;
}

/** A class list and the custom properties that go with it. Deliberately data:
 * the caller decides whether that becomes a CM6 `Decoration` or an element's
 * `class` and `style`. */
export interface LineChrome {
  readonly classes: readonly string[];
  readonly vars: ReadonlyArray<readonly [string, string]>;
}

export interface LineChromeOptions {
  /**
   * The row's raw source line, needed only to detect the one-space list marker.
   * A caller with no raw text omits it, which reads as "not a one-space marker"
   * — correct, since a row with no source text has no marker written in it.
   */
  readonly lineText?: string;
  /**
   * The already-built guide background, or absent for a row that draws none. A
   * parameter rather than something computed here because the two surfaces
   * build it differently: the editor folds caret accents into the same
   * comma-separated list, and `plainGuideBackground` builds a plain one for any
   * surface that wants stripes without them. The footer passes nothing — it
   * draws no guides.
   */
  readonly guides?: string | undefined;
  /**
   * Whether this surface renders a node through the platform's own BLOCK
   * rendering — native list machinery for a list item, a visible box for an
   * atom — or draws every node as one plain line.
   *
   * True in the editor: a list item is editable source text whose marker is
   * characters the reader can type, and a table or callout is a real box that
   * depth has to move rather than indent into.
   *
   * False in the backlinks footer, where a row's content is inline by
   * construction (D18): the rendered `<li>` is unwrapped, no atom keeps its box,
   * and every kind is laid out as an ordinary block line with our own marker.
   *
   * An explicit option rather than a doctored `fact`: the difference is real
   * and belongs to the SURFACE, and a fact that lied about `isListItem` or
   * `isAtom` would be wrong for every other reader of it.
   */
  readonly nativeBlocks?: boolean;
}

/** The chrome for one row. */
export function lineChrome(
  fact: LineDecorationFact,
  { lineText = '', guides, nativeBlocks = true }: LineChromeOptions = {},
): LineChrome {
  const classes: string[] = [];
  const vars: Array<readonly [string, string]> = [];

  if (fact.isListItem && nativeBlocks) {
    classes.push(LIST_LINE_CLASS);
    vars.push(['--to-supp-depth', `${fact.supplementalDepth}`]);
    // The item's own tree depth as well as its list root's: the difference is
    // the item's depth WITHIN its list, which is how far Obsidian's own list
    // rendering carries it right of the line box, and therefore what the stated
    // hanging indent has to account for.
    vars.push(['--to-depth', `${fact.depth}`]);
    // The gutter too, even though a list line reserves none of its OWN: its
    // native marker occupies the same gutter every other kind's marker does,
    // and the rules that size the marker span and state the hang both read it.
    vars.push(['--to-marker-gutter', MARKER_GUTTER_CSS]);
    // The marker's own share of the stated hang. A first line spends the gutter
    // on its native bullet/number/checkbox, so its leading whitespace stops one
    // gutter short of its text; a CONTINUATION line has no marker and belongs
    // under the item's TEXT, so its whitespace takes the whole hang.
    vars.push(['--to-list-marker-cols', fact.hasNativeMarker ? MARKER_GUTTER_CSS : '0px']);
    if (fact.hasNativeMarker && ONE_SPACE_MARKER_RE.test(lineText)) {
      classes.push(ONE_SPACE_MARKER_CLASS);
    }
  } else {
    // An atom's class exists to move its BOX. A surface that gives it no box
    // must not ask for that, or the box moves and the content does not.
    classes.push(fact.isAtom && nativeBlocks ? ATOM_LINE_CLASS : BLOCK_LINE_CLASS);
    vars.push(['--to-depth', `${fact.depth}`]);
    vars.push(['--to-marker-gutter', MARKER_GUTTER_CSS]);
  }

  if (guides !== undefined) {
    classes.push(GUIDES_CLASS);
    vars.push(['--to-guides', guides]);
    vars.push(['--to-own-shift', ownShiftExpr(fact, nativeBlocks)]);
  }

  return { classes, vars };
}

/** `vars` as an inline `style` string — the form both a CM6 line decoration's
 * `attributes` and an element's `style` attribute take. */
export function chromeStyle(chrome: LineChrome): string {
  return chrome.vars.map(([name, value]) => `${name}: ${value}`).join('; ');
}

/** Applies a row's chrome to a real element. The footer's half of the contract;
 * the editor packs the same data into a `Decoration` instead. */
export function applyLineChrome(el: HTMLElement, chrome: LineChrome): void {
  for (const cls of chrome.classes) el.addClass(cls);
  for (const [name, value] of chrome.vars) el.style.setProperty(name, value);
}
