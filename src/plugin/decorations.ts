/**
 * CM6 adapter for outline mode's decorations. All the pure computation
 * (depth/supplementalDepth, per-line guide depths) lives in decorate.ts;
 * this module only turns those facts into CM6 decorations/DOM, gated
 * per-editor on outline mode via the public `editorInfoField` — same
 * gating pattern as keymap.ts's grammarExtension.
 *
 * Two mechanisms, because Obsidian renders atom kinds two different ways in
 * Live Preview:
 *
 * - Most lines (headings, paragraphs, list items, code fences, plain
 *   blockquotes) render as a real `.cm-line` that CM6 lets us decorate
 *   declaratively: one class plus one CSS custom property per fact (never
 *   an inline shorthand property), so styles.css owns the actual
 *   `padding-left`/`margin-left` rules and their units (additive-only
 *   indentation, Experiment 1) plus the guide-line gradient (Experiment 2b,
 *   see the "Guide lines" section below), PLUS a real CM6 `Decoration.widget`
 *   for the block marker icon (Experiment 5a, see below) — CM6's own,
 *   supported way to insert extra DOM into a line's content without
 *   fighting its own re-render/diffing.
 * - Tables, callouts, raw HTML blocks, and horizontal rules are rendered as
 *   opaque replacement widgets (`.cm-embed-block`, or `.hr` for the rule) —
 *   confirmed live: a `Decoration.line` targeting that line's position has
 *   no effect at all (not even a class-merge partial win), because the
 *   widget's own `toDOM()` produces the line's DOM wholesale and neither
 *   CM6 nor Obsidian threads our decoration's class/attributes through it.
 *   These need a direct, imperative DOM patch instead — a `ViewPlugin`
 *   that, after each render, sets `margin-left` inline (with `!important`,
 *   which always wins for an inline style regardless of what any
 *   stylesheet rule does), and appends a marker icon child, on whichever
 *   such widgets are currently mounted. Appending a child directly into one
 *   of these widgets is safe (proven across this experiment's e2e runs):
 *   they're opaque, Obsidian-owned subtrees CM6 never re-diffs internally.
 *   The equivalent is NOT safe for a plain `.cm-line`, which CM6 actively
 *   owns/re-renders — an earlier version of this code tried appending a
 *   marker child directly into `.cm-line`s from this same ViewPlugin (to
 *   get live-measured multi-line height for code fences) and it pegged
 *   Obsidian's renderer at 100%+ CPU indefinitely, almost certainly CM6's
 *   own DOM-mutation observer (used to detect external/IME edits) reacting
 *   to the unexpected child and re-triggering updates in a feedback loop.
 *   Reverted; plain-line markers stay on the CM6-native `Decoration.widget`
 *   path below, which has no such risk.
 *
 * `MarginCompensation` (below) additionally patches margin-left on BOTH
 * mechanisms to account for Obsidian's own "readable line width" feature,
 * which applies a `margin-inline: auto`-centering rule to every `.cm-line`
 * (any div child of `.cm-content`, in fact) — a *uniform* native base
 * margin our own `calc(depth * unit) !important` rule was silently
 * *replacing* instead of adding to, confirmed live (a depth-0 heading and
 * a depth-1 list item under it rendered with the list-item's own box to
 * the LEFT of the heading's, an inverted/negative-looking indentation —
 * reported by real-vault testing under a community theme with a narrower
 * reading column than the bundled themes, where the effect became large
 * enough to notice; the bug itself is present under any theme/viewport
 * where that base margin is nonzero, bundled themes included). See its
 * own doc comment below for the fix.
 */

import { RangeSetBuilder, StateField, type Extension, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type PluginValue,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { NodeKind } from '../model';
import { parse } from '../parse';
import {
  computeLineGuides,
  decorate,
  type LineDecorationFact,
  type LineGuideFact,
} from './decorate';
import type { ModeSource } from './keymap';

// ---- Guide lines (Experiment 2b: CSS stacked-gradient) ---------------------
//
// @replit/codemirror-indentation-markers' technique: one `--to-guides`
// custom property per line, a comma-joined list of repeating-linear-
// gradient layers (one per active ancestor depth), consumed by a single
// `::before` — O(1) DOM nodes regardless of depth, no JS pixel measurement,
// no overlay layer (contrast Experiment 2a's measured overlay divs).
//
// `to-decor-atom`/`to-decor-list` lines use `margin-left` (Experiment 1's
// fix for the "padding never moves the box" bug), which DOES shift the
// line's own box — an earlier version of this code concluded from that
// alone that a guide could never render on those lines, since their own
// `::before` (position: absolute, relative to the line's own box) can't
// reach a shallower ancestor's column. That reasoning had a real bug: it
// assumed a background is clipped to the *positioned element's own box*,
// but the pseudo-element's own box does NOT have to match its containing
// block's dimensions — `left`/`right` can widen it arbitrarily, including
// leftward past where the line's box starts. Confirmed live (screenshot +
// computed style) that nothing in the ancestor chain up to `.cm-scroller`
// clips that overflow (`.cm-content`/`.cm-contentContainer`/`.cm-sizer`
// are all `overflow: visible`; `.cm-scroller` is `overflow: auto` but its
// own box starts well to the left of any guide column we'd ever need).
//
// The needed compensation ("how far has this line's own box been shifted
// right of the global column origin") is fully known at decoration-build
// time for both kinds, with NO live measurement: an atom's own shift is
// exactly `depth * unit` (our own margin-left value). A list item's own
// shift is exactly `supplementalDepth * unit` (our own margin-left value)
// too — confirmed live that Obsidian's native hang (`text-indent`/
// `padding-left`, applied to the very same `.cm-line`) contributes NOTHING
// to the box's own position: `getBoundingClientRect()` on a list line
// showed its box's left edge exactly matching its `margin-left`, despite a
// nonzero native `padding-left`/`text-indent` also being present — because
// neither property moves a box's own edges (padding shifts content only;
// text-indent shifts only the first inline line's content, per the CSS
// spec), only `margin` does. So both kinds can widen their own pseudo's
// box by exactly `--to-own-shift` units to reach any shallower ancestor's
// column, with no measurement beyond the JS constants this module already
// computes.
const UNIT = 'var(--to-decor-unit, 1.5rem)';

function guideLayer(depth: number): string {
  return (
    `repeating-linear-gradient(to right, var(--text-faint) 0 1px, transparent 1px ${UNIT}) ` +
    `calc(${depth} * ${UNIT}) 0 / ${UNIT} 100% no-repeat`
  );
}

function guideBackground(guideDepths: readonly number[]): string {
  return guideDepths.map(guideLayer).join(', ');
}

// ---- Block markers (Experiment 5a: icon markers) ---------------------------
//
// See docs/research/07-decoration-experiments-plan.md, Experiment 5/5a. A
// small, distinct, self-drawn SVG icon per node kind, rendered on a node's
// own first line only (never a list item — the native bullet/number already
// does that job, same exclusion guides already use).
//
// Placement exploration (post-review): three variants of WHERE the icon
// sits relative to the guide-line column — a real, user-facing setting
// (`markerVariant` on `DecorationSource`, below), not a module constant to
// flip and rebuild: a real-vault comparison needs to be triable without a
// rebuild per attempt. See main.ts's settings tab.
//   'A' — icon's own LEFT edge at the guide column (icon reads as sitting
//         just right of/on top of the guide line); a marker gutter is
//         reserved additively so text still clears the icon.
//   'B' — icon horizontally CENTERED on the guide column; same gutter
//         reservation as 'A'.
//   'C' — text stays at the ORIGINAL (pre-marker) guide column, exactly as
//         if no marker existed at all — no gutter reserved — and the icon's
//         own RIGHT edge sits at that column instead, occupying whatever
//         whitespace already exists to the left (none at depth 0, by
//         construction, matching the trade-off the option itself implies).
// `MarkerVariant` itself lives in mode-registry.ts (not here), so that pure,
// Obsidian-free module can keep defining PluginData without importing this
// one (which pulls in the real `obsidian` package for `editorInfoField`).
export type { MarkerVariant } from './mode-registry';
import type { MarkerVariant } from './mode-registry';

/** Anything that can supply decorations needs to say which notes are in
 * outline mode (ModeSource) AND which marker placement variant is active —
 * a real Obsidian setting now, read fresh on every recompute so switching
 * it live (no rebuild) takes effect on the very next transaction, the same
 * way toggling outline mode already does (see main.ts's refreshDecorations). */
export interface DecorationSource extends ModeSource {
  readonly markerVariant: MarkerVariant;
}

// Only 'A'/'B' reserve extra indentation for the icon; 'C' deliberately
// keeps text/guides byte-identical to the no-marker column and lets the
// icon sit in already-existing whitespace instead.
function isGutterReserved(variant: MarkerVariant): boolean {
  return variant !== 'C';
}
const MARKER_GUTTER_REM = 1.25;
const MARKER_ICON_REM = 0.85;
// The actual CSS length emitted per line (see lineDecoration()) — a single
// source of truth the static CSS rules, the live margin overrides, AND the
// marker's own left-offset calc all agree with.
function markerGutterCss(variant: MarkerVariant): string {
  return isGutterReserved(variant) ? `${MARKER_GUTTER_REM}rem` : '0px';
}
const MARKER_ICON_CSS = `${MARKER_ICON_REM}rem`;

/**
 * Where a marker icon's own LEFT edge should sit, given `targetRelExpr` — a
 * CSS length expression for "the shared target column (where the guide for
 * this depth renders), relative to the box the marker is about to become a
 * child of" (see call sites: block/atom/widget-atom each derive this from
 * their own already-established `--to-own-shift`-style formula, so the
 * marker automatically stays correct if those formulas ever change). Used
 * only by the widget-atom mechanism below (table/callout/hr/html) — the
 * plain-line mechanism uses `markerLeftShiftExpr` instead (see its own doc
 * comment for why the two need different math).
 */
function markerAnchorLeftExpr(targetRelExpr: string, variant: MarkerVariant): string {
  switch (variant) {
    case 'A':
      return targetRelExpr; // icon's own left edge at the target column
    case 'B':
      return `calc(${targetRelExpr} - (${MARKER_ICON_CSS} / 2))`; // centered on the column
    case 'C':
      return `calc(${targetRelExpr} - ${MARKER_ICON_CSS})`; // icon's own right edge at the column
  }
}

/**
 * Horizontal placement for the CM6-widget (plain-line) marker mechanism —
 * see `MarkerWidget`'s own doc comment for why this uses a fundamentally
 * different technique (inline + `vertical-align`, not `position: absolute`
 * relative to the line's own box) from the widget-atom mechanism above.
 *
 * Because the widget is always inserted at the exact position where the
 * node's own text starts (CM6 `Decoration.widget` at the line's first
 * character, `side: -1`), and — by construction — that text position is
 * always exactly `gutter` to the right of the shared target column,
 * regardless of kind or depth (that IS the definition of the gutter), the
 * needed shift collapses to a single depth/kind-independent expression:
 * `iconSize * anchorFraction(variant) - gutter`. Worked through concretely
 * for both block (padding-shifted text, unshifted box) and atom-plain
 * (margin-shifted box, unshifted-relative-to-box text) — the depth terms
 * cancel identically in both cases, confirmed by hand before relying on it
 * here (see the git history of this comment for the full derivation).
 */
function markerLeftShiftExpr(variant: MarkerVariant): string {
  const anchorFraction = variant === 'A' ? 1 : variant === 'B' ? 0.5 : 0;
  return `calc(${MARKER_ICON_CSS} * ${anchorFraction} - ${markerGutterCss(variant)})`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el as SVGElementTagNameMap[K];
}

const STROKE_ATTRS = {
  stroke: 'currentColor',
  'stroke-width': '1.5',
  fill: 'none',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

/**
 * Builds one distinct, self-drawn SVG icon per eligible node kind — via DOM
 * APIs directly (element creation + attribute setting in code), not a
 * data-URI string. Not a final design; exact shapes are expected to be
 * tuned by eye during real-vault review, like every other visual call in
 * this project (see the plan's own framing of Experiment 5a).
 */
function buildMarkerIcon(kind: NodeKind): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 16 16', width: '100%', height: '100%' });

  switch (kind) {
    case 'heading':
      // A blocky "H": two vertical bars + a crossbar.
      svg.append(
        svgEl('rect', { x: '3', y: '2', width: '2', height: '12', fill: 'currentColor' }),
        svgEl('rect', { x: '11', y: '2', width: '2', height: '12', fill: 'currentColor' }),
        svgEl('rect', { x: '3', y: '7', width: '10', height: '2', fill: 'currentColor' }),
      );
      break;
    case 'paragraph':
      // Three text lines, the last one shorter.
      svg.append(
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '4', x2: '14', y2: '4' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '8', x2: '14', y2: '8' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '12', x2: '9', y2: '12' }),
      );
      break;
    case 'code':
      // "</>"
      svg.append(
        svgEl('polyline', { ...STROKE_ATTRS, points: '6,3 2,8 6,13' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '9.5', y1: '2', x2: '6.5', y2: '14' }),
        svgEl('polyline', { ...STROKE_ATTRS, points: '10,3 14,8 10,13' }),
      );
      break;
    case 'table':
      // 2x2 grid.
      svg.append(
        svgEl('rect', { ...STROKE_ATTRS, x: '2', y: '2', width: '12', height: '12', rx: '1' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '8', x2: '14', y2: '8' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '8', y1: '2', x2: '8', y2: '14' }),
      );
      break;
    case 'callout':
      // Filled alert circle with an "!" bar.
      svg.append(
        svgEl('circle', { cx: '8', cy: '8', r: '6', fill: 'currentColor' }),
        svgEl('rect', { x: '7', y: '4', width: '2', height: '5', fill: 'var(--background-primary)' }),
        svgEl('rect', { x: '7', y: '10', width: '2', height: '2', fill: 'var(--background-primary)' }),
      );
      break;
    case 'quote':
      // Two opening-quote marks.
      svg.append(
        svgEl('circle', { cx: '5', cy: '5', r: '2', fill: 'currentColor' }),
        svgEl('rect', { x: '4', y: '5', width: '2', height: '4', fill: 'currentColor' }),
        svgEl('circle', { cx: '11', cy: '5', r: '2', fill: 'currentColor' }),
        svgEl('rect', { x: '10', y: '5', width: '2', height: '4', fill: 'currentColor' }),
      );
      break;
    case 'html':
      // An outlined tag/document shape with a folded corner.
      svg.append(
        svgEl('rect', { ...STROKE_ATTRS, x: '3', y: '2', width: '10', height: '12', rx: '1' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '9', y1: '2', x2: '13', y2: '6' }),
      );
      break;
    case 'hr':
      // A single bold horizontal bar.
      svg.append(svgEl('rect', { x: '2', y: '7', width: '12', height: '2', fill: 'currentColor' }));
      break;
    default:
      // Unreachable for list-item (excluded by every caller) — a small dot
      // keeps this exhaustive-in-spirit without dead code paths elsewhere.
      svg.append(svgEl('circle', { cx: '8', cy: '8', r: '2', fill: 'currentColor' }));
  }

  return svg;
}

/** Widget-replaced atom kinds (see the module doc comment) — markers on
 * these are injected directly by MarginCompensation, not the CM6 widget
 * below (a `Decoration` has zero effect on these elements). */
const WIDGET_ATOM_KINDS: ReadonlySet<NodeKind> = new Set(['table', 'callout', 'html', 'hr']);

/**
 * "top:0; bottom:0; flex-center" positioning for the WIDGET-ATOM marker
 * only (table/callout/hr/html) — the plain-line marker (`MarkerWidget`,
 * above) uses a different, inline/`vertical-align` technique instead; see
 * its own doc comment for why. A widget atom IS its own single, opaque,
 * already-full-height DOM element (unlike a `.cm-line`, which can carry
 * extra margin/padding a naive "center in the whole box" approach would
 * wrongly include), so stretching to its own box height and flex-centering
 * is correct here without that risk. Deliberately NOT `top: 50%; transform:
 * translateY(-50%)` (an earlier version of this code used that and a
 * single-line paragraph's icon visibly sat lower than the text's own
 * center) — percentage/transform-based centering is sensitive to CSS
 * line-height/leading asymmetry; stretching the box to its full containing-
 * block height via `top`+`bottom` and centering the icon inside with flex
 * lets the browser's own box layout do the centering, unambiguously.
 */
function applyMarkerWrapperStyle(el: HTMLElement, leftExpr: string): void {
  el.style.position = 'absolute';
  el.style.top = '0';
  el.style.bottom = '0';
  el.style.left = leftExpr;
  el.style.width = MARKER_ICON_CSS;
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.pointerEvents = 'none';
  el.style.color = 'var(--text-faint)';
}

class MarkerWidget extends WidgetType {
  constructor(
    private readonly kind: NodeKind,
    private readonly leftShiftExpr: string,
  ) {
    super();
  }

  override eq(other: MarkerWidget): boolean {
    return other.kind === this.kind && other.leftShiftExpr === this.leftShiftExpr;
  }

  /**
   * Deliberately NOT `position: absolute` (unlike the widget-atom marker
   * below) — an earlier version used `position: absolute; top: 0; bottom:
   * 0` relative to the LINE's own (padded) box, and a heading's marker sat
   * visibly too high, worse the bigger the heading. Root cause: a heading's
   * `.cm-line` box includes real, asymmetric spacing (more margin/padding
   * ABOVE the text than below, for visual breathing room from the
   * preceding block) that scales with heading level — centering within the
   * WHOLE box (spacing included) puts the icon above the text's own visual
   * center, more so for a bigger heading's bigger spacing. Fixed by staying
   * in NORMAL INLINE FLOW (`display: inline-block`), which aligns relative
   * to the surrounding TEXT's own font metrics (the actual heading text run
   * this widget sits next to) — completely blind to the outer block's own
   * margin/padding, by construction.
   *
   * `vertical-align: baseline` (the CSS default — set explicitly here so a
   * future reader doesn't need to know that), not `middle`: a real second
   * bug found in review — `middle` aligns THIS box's own vertical center to
   * "the parent's baseline + half the parent's x-height," a formula that
   * assumes the aligned box's own height is comparable to the surrounding
   * text's x-height. Our icon's height is a fixed, unrelated constant, so
   * that assumption doesn't hold — the mismatch put the icon consistently
   * low by roughly half its own height, on every kind, not just headings
   * (this time correctly *not* scaling with font size, since `middle`'s
   * error term doesn't depend on the wrapper's own fixed height — but still
   * visibly wrong). `baseline` instead aligns THIS element's own baseline —
   * for an inline-block whose only content is a single replaced child (the
   * SVG, itself baseline-aligned with no descender by default), that
   * resolves to the SVG's own bottom edge — to the surrounding text's
   * baseline. That's the same place a bare capital letter or a digit sits:
   * the natural, no-extra-math alignment for an icon meant to read as part
   * of the text, confirmed live against every heading level and paragraph.
   */
  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'to-decor-marker-icon';
    wrapper.style.display = 'inline-block';
    wrapper.style.verticalAlign = 'baseline';
    wrapper.style.position = 'relative';
    wrapper.style.left = this.leftShiftExpr;
    wrapper.style.marginLeft = `calc(-1 * ${MARKER_ICON_CSS})`;
    wrapper.style.width = MARKER_ICON_CSS;
    wrapper.style.height = MARKER_ICON_CSS;
    wrapper.style.pointerEvents = 'none';
    wrapper.style.color = 'var(--text-faint)';
    wrapper.appendChild(buildMarkerIcon(this.kind));
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function computeMarkers(state: EditorState, modes: DecorationSource): DecorationSet {
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return Decoration.none;

  const doc = parse(state.doc.toString());
  const totalLines = state.doc.lines;
  // Depth/kind-independent (see markerLeftShiftExpr's doc comment) — computed
  // once per recompute, not per fact.
  const leftShiftExpr = markerLeftShiftExpr(modes.markerVariant);
  const builder = new RangeSetBuilder<Decoration>();
  for (const fact of decorate(doc)) {
    // List items keep their fully native marker, untouched (same exclusion
    // guides already use); continuation lines never repeat the marker.
    if (fact.isListItem || !fact.isFirstLine) continue;
    // Widget-replaced atoms have no plain `.cm-line` for a widget decoration
    // to attach to — MarginCompensation injects their marker directly.
    if (WIDGET_ATOM_KINDS.has(fact.kind)) continue;
    if (fact.lineNumber >= totalLines) continue; // stale fact past a shrunk doc

    const from = state.doc.line(fact.lineNumber + 1).from; // CM6 lines are 1-indexed
    builder.add(
      from,
      from,
      Decoration.widget({ widget: new MarkerWidget(fact.kind, leftShiftExpr), side: -1 }),
    );
  }
  return builder.finish();
}

function lineDecoration(fact: LineDecorationFact, guide: LineGuideFact, variant: MarkerVariant): Decoration {
  const styles: string[] = [];
  let cls: string;
  // Own-shift expression (units of `--to-decor-unit`, plus the marker
  // gutter where applicable) this line's own box has been shifted right by
  // its own margin-left — the exact compensation the guide's pseudo needs
  // to widen its box by, leftward, to reach a shallower ancestor's column
  // (see the doc comment above `guideLayer`). `undefined` means the box
  // isn't shifted at all (block lines: padding-left never moves the box).
  let ownShiftExpr: string | undefined;

  if (fact.isListItem) {
    cls = 'to-decor-list';
    styles.push(`--to-supp-depth: ${fact.supplementalDepth}`);
    // List items get no marker gutter (native bullet/number only).
    ownShiftExpr = fact.supplementalDepth > 0 ? `calc(${fact.supplementalDepth} * ${UNIT})` : undefined;
  } else if (fact.isAtom) {
    cls = 'to-decor-atom';
    styles.push(`--to-depth: ${fact.depth}`);
    styles.push(`--to-marker-gutter: ${markerGutterCss(variant)}`);
    // Every non-list line reserves the marker gutter (when the variant
    // calls for one), so the box is always shifted by at least the
    // gutter, even at depth 0.
    ownShiftExpr = `calc(${fact.depth} * ${UNIT} + var(--to-marker-gutter, 0px))`;
  } else {
    cls = 'to-decor-block';
    styles.push(`--to-depth: ${fact.depth}`);
    styles.push(`--to-marker-gutter: ${markerGutterCss(variant)}`);
    ownShiftExpr = undefined; // padding-left never shifts a block line's own box
  }

  if (guide.guideDepths.length > 0) {
    cls += ' to-decor-guides';
    styles.push(`--to-guides: ${guideBackground(guide.guideDepths)}`);
    if (ownShiftExpr) {
      styles.push(`--to-own-shift: ${ownShiftExpr}`);
    }
  }

  return Decoration.line({ class: cls, attributes: { style: styles.join('; ') } });
}

// A blank trailingGap line carrying a guide (see computeLineGuides's doc
// comment) has no decorate() fact at all — no depth, no kind, nothing to
// indent — so it gets a minimal decoration with just the guide class/style,
// not the full lineDecoration() treatment.
function gapLineDecoration(guide: LineGuideFact): Decoration {
  return Decoration.line({
    class: 'to-decor-guides',
    attributes: { style: `--to-guides: ${guideBackground(guide.guideDepths)}` },
  });
}

function computeDecorations(state: EditorState, modes: DecorationSource): DecorationSet {
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return Decoration.none;

  const doc = parse(state.doc.toString());
  // computeLineGuides is a strict superset of decorate() by line coverage
  // (every line decorate() covers, plus gap-only lines) — iterate it as
  // the primary sequence (still ascending by lineNumber, required by
  // RangeSetBuilder) and look up the matching decorate() fact by line
  // number instead of assuming index alignment, since gap lines have no
  // corresponding entry there at all.
  const factsByLine = new Map(decorate(doc).map((f) => [f.lineNumber, f]));
  const guides = computeLineGuides(doc);
  const totalLines = state.doc.lines;
  const builder = new RangeSetBuilder<Decoration>();
  for (const guide of guides) {
    if (guide.lineNumber >= totalLines) continue; // stale fact past a shrunk doc
    const from = state.doc.line(guide.lineNumber + 1).from; // CM6 lines are 1-indexed
    if (guide.isGapLine) {
      if (guide.guideDepths.length === 0) continue; // nothing to draw
      builder.add(from, from, gapLineDecoration(guide));
      continue;
    }
    const fact = factsByLine.get(guide.lineNumber);
    if (!fact) continue; // decorate()/computeLineGuides walks are in sync; defensive only
    builder.add(from, from, lineDecoration(fact, guide, modes.markerVariant));
  }
  return builder.finish();
}

// Obsidian's own selectors for widget-replaced atom kinds — matches tables,
// callouts, and raw HTML blocks (`.cm-embed-block`) plus horizontal rules
// (`.hr`, which oddly also carries `cm-line` but is widget-rendered all the
// same). Broad by design: elements it catches that don't correspond to an
// atom fact (e.g. an inline image embed inside a paragraph) just get their
// margin cleared, a no-op.
const WIDGET_ATOM_SELECTOR = '.cm-embed-block, .cm-line.hr';

// Plain `.cm-line`s that carry one of our own margin-based decorations
// (atoms, list items) — needs the SAME native-base compensation as
// widgets, for the same reason (see MarginCompensation's doc comment).
const PLAIN_MARGIN_SELECTOR = '.cm-line.to-decor-atom, .cm-line.to-decor-list';

/**
 * Injects/updates the marker icon child on a widget-replaced atom element
 * (table/callout/html/hr) — the only way to reach these (Experiment 5a),
 * same reasoning as the margin-left patch above: a CM6 decoration has no
 * effect on these elements at all. Idempotent: skips the rebuild when the
 * kind/position hasn't changed, so a `docViewUpdate` on every render
 * doesn't thrash the DOM. Appending a child directly into one of these
 * widgets is safe — see the module doc comment for why this is NOT safe to
 * do for a plain `.cm-line`.
 *
 * `ownShiftExpr` is the EXACT expression this widget's own margin-left was
 * just computed with (below) — deriving the marker's target column FROM
 * that shared expression (`depth*unit - ownShiftExpr`), rather than
 * assuming a simplified `-gutter` shortcut, is what fixes a real bug: an
 * earlier version used the simplified shortcut for every atom-like kind,
 * which happened to match for code/quote (no native-padding correction)
 * but silently diverged for tables — whose `ownShiftExpr` ALSO subtracts
 * the table widget's own native cell padding (see the margin-left comment
 * below) — visibly offsetting the table's marker from every other kind's
 * marker at the same depth.
 */
function applyWidgetMarker(
  el: HTMLElement,
  kind: NodeKind,
  ownShiftExpr: string,
  variant: MarkerVariant,
): void {
  const targetRelExpr = `calc(${el.dataset.markerDepth ?? '0'} * ${UNIT} - (${ownShiftExpr}))`;
  const leftExpr = markerAnchorLeftExpr(targetRelExpr, variant);
  const existing = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
  if (existing) {
    applyMarkerWrapperStyle(existing, leftExpr);
    if (existing.dataset.kind === kind) return;
    existing.remove();
  }
  const icon = document.createElement('span');
  icon.className = 'to-decor-marker-icon';
  icon.dataset.kind = kind;
  applyMarkerWrapperStyle(icon, leftExpr);
  icon.appendChild(buildMarkerIcon(kind));
  el.prepend(icon);
}

function clearWidgetMarker(el: HTMLElement): void {
  el.querySelector(':scope > .to-decor-marker-icon')?.remove();
  el.classList.remove('to-decor-marker');
  delete el.dataset.markerDepth;
}

class MarginCompensation implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly modes: DecorationSource,
  ) {
    this.apply();
  }

  docViewUpdate(): void {
    this.apply();
  }

  destroy(): void {
    this.clearAll();
  }

  /**
   * The margin-left every undecorated `.cm-line` gets natively (Obsidian's
   * "readable line width" centering, `margin-inline: auto` under a
   * `max-width` — see the module doc comment). Read live, not hardcoded or
   * replicated via a calc() formula, since its value depends on the
   * current theme/viewport/setting and isn't exposed as a plain-length CSS
   * custom property we could reference (`--content-margin`'s own
   * *specified* value is literally the keyword `auto`, not a length).
   * `.to-decor-block` lines never have their own margin-left touched (they
   * use padding), so any one of them is an uncontaminated reference; a
   * completely undecorated line (blank gap, preamble) works just as well.
   * Falls back to 0 only if the current viewport has neither (e.g. a
   * document that is 100% margin-decorated content with nothing else
   * rendered) — a graceful degradation, not silently wrong in the common
   * case.
   */
  private nativeMarginBasePx(): number {
    // `.hr` is excluded too: it carries `.cm-line` but is widget-rendered
    // (see WIDGET_ATOM_SELECTOR) and patched by the loop below — if a
    // previous `apply()` call already set its margin-left, querying it
    // here would read back our OWN prior value, not the native one.
    const ref = this.view.contentDOM.querySelector<HTMLElement>(
      `.cm-line:not(.to-decor-atom):not(.to-decor-list):not(.hr)`,
    );
    return ref ? parseFloat(getComputedStyle(ref).marginLeft) || 0 : 0;
  }

  private apply(): void {
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    if (!path || !this.modes.isOutline(path)) {
      this.clearAll();
      return;
    }

    const variant = this.modes.markerVariant;
    const doc = parse(this.view.state.doc.toString());
    const factsByLine = new Map(decorate(doc).map((f) => [f.lineNumber, f]));
    const guidesByLine = new Map(computeLineGuides(doc).map((g) => [g.lineNumber, g]));
    const nativeBasePx = this.nativeMarginBasePx();

    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) {
      const lineNumber = this.view.state.doc.lineAt(this.view.posAtDOM(el)).number - 1;
      const fact = factsByLine.get(lineNumber);
      if (fact?.isAtom) {
        // Some widgets (tables, for their row/column drag-handles) carry
        // their own native left padding that our margin doesn't know
        // about — padding never moves a box's own edge, so it just pushes
        // the widget's *visible content* (e.g. the <table> grid) further
        // right than a same-depth code block or callout, whose background
        // fills their own padding invisibly. Reading it live (not a
        // hardcoded constant) keeps this correct across themes; clamped at
        // 0 so a depth-0 atom never goes negative.
        const nativePaddingLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
        // The widget's own box's rightward shift *from our own
        // contribution alone* — this (NOT including nativeBasePx) is also
        // the exact compensation a guide's pseudo-element needs to widen
        // itself by, leftward, to reach a shallower ancestor's column (see
        // the "Guide lines" doc comment above): nativeBasePx applies
        // uniformly to every line regardless of depth, so it cancels out
        // of the *difference* between any two lines' columns and must be
        // added to margin-left but never to `--to-own-shift`. Includes the
        // marker gutter (Experiment 5a) — every widget atom always gets a
        // marker, so its own box is always shifted by at least the gutter
        // (when RESERVE_MARKER_GUTTER), even at depth 0. `applyWidgetMarker`
        // below derives the marker's OWN target column from this exact
        // same expression, so the two can never silently diverge again.
        const ownShiftExpr = `max(0px, calc(${fact.depth} * ${UNIT} - ${nativePaddingLeft}px)) + ${markerGutterCss(variant)}`;
        el.style.setProperty('margin-left', `calc(${nativeBasePx}px + ${ownShiftExpr})`, 'important');

        el.classList.add('to-decor-marker');
        el.dataset.markerDepth = String(fact.depth);
        applyWidgetMarker(el, fact.kind, ownShiftExpr, variant);

        const guide = guidesByLine.get(lineNumber);
        if (guide && guide.guideDepths.length > 0) {
          el.classList.add('to-decor-guides');
          el.style.setProperty('--to-guides', guideBackground(guide.guideDepths));
          el.style.setProperty('--to-own-shift', `calc(${ownShiftExpr})`);
        } else {
          el.classList.remove('to-decor-guides');
          el.style.removeProperty('--to-guides');
          el.style.removeProperty('--to-own-shift');
        }
      } else {
        el.style.removeProperty('margin-left');
        el.classList.remove('to-decor-guides');
        el.style.removeProperty('--to-guides');
        el.style.removeProperty('--to-own-shift');
        clearWidgetMarker(el);
      }
    }

    // Plain lines (atoms/list items rendered as genuine `.cm-line`s, not
    // widgets): styles.css's static `calc(depth * unit) !important` rule
    // already sets the class-driven part correctly, but has no way to
    // read/add nativeBasePx (a StateField has no DOM to measure — only a
    // ViewPlugin, running after render, can). This overrides it inline
    // (inline `!important` beats any stylesheet `!important`, regardless
    // of specificity) with the same value PLUS the live-read native base.
    const plainLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(PLAIN_MARGIN_SELECTOR),
    );
    const markerLeftShift = markerLeftShiftExpr(variant);
    for (const el of plainLines) {
      const isListItem = el.classList.contains('to-decor-list');
      const depthVar = isListItem ? '--to-supp-depth' : '--to-depth';
      // List items get no marker gutter (native bullet/number only, no
      // icon); atom lines (code/quote) always reserve one (when the
      // variant calls for one), even at depth 0.
      const gutter = isListItem ? '0px' : markerGutterCss(variant);
      el.style.setProperty(
        'margin-left',
        `calc(${nativeBasePx}px + var(${depthVar}, 0) * ${UNIT} + ${gutter})`,
        'important',
      );

      // Marker horizontal compensation: `computeMarkers`'s own `left` calc
      // (via markerLeftShiftExpr) assumes the widget's insertion point has
      // zero native rightward shift on this line — true for a plain
      // paragraph, but not for two atom-plain cases, both live-verified:
      //
      // - A code fence's own opener line (`.HyperMD-codeblock-begin`)
      //   carries plain native `padding-left` (confirmed live: 16px in
      //   bundled themes, presumably reserved for the language-label
      //   pill) with no offsetting `text-indent` — shifts the insertion
      //   point right by the full padding amount.
      // - A blockquote's own line carries the SAME hanging-indent PAIR
      //   the original postmortem already flagged for list-item bullets
      //   (`text-indent: -13px` matched with `padding-left: 13px`,
      //   confirmed live) — the negative text-indent cancels the padding
      //   for the line's own FIRST inline position, so naively
      //   subtracting `padding-left` alone overcorrects by the full
      //   padding amount (confirmed live: produced a new, equal-and-
      //   opposite misalignment). Summing `padding-left + text-indent`
      //   (text-indent already negative when present) gives the correct
      //   net shift in both cases: 16px + 0 for code, 13px + -13px = 0
      //   for quote.
      //
      // Same class of bug the widget-atom fix above already handles for
      // tables (a native offset our own formula doesn't know about) — same
      // fix here: read it live, never hardcode it, since it depends on the
      // active theme. A `querySelector` (not a `decorate()` fact lookup)
      // gates this: only a line `computeMarkers` actually placed an icon
      // on has one to correct.
      const icon = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
      if (icon) {
        const iconLineStyle = getComputedStyle(el);
        const nativeShift =
          (parseFloat(iconLineStyle.paddingLeft) || 0) + (parseFloat(iconLineStyle.textIndent) || 0);
        // Always SET (never remove) `left` here: this element is the SAME
        // node `MarkerWidget.toDOM()` already applied its own base
        // `left` to (in the same inline-style object) — `removeProperty`
        // would delete that value entirely (falling back to `auto`, i.e.
        // no shift at all) instead of restoring it, a real bug caught live
        // when a blockquote's own padding/text-indent pair summed to
        // exactly 0 and the marker landed with no shift whatsoever.
        icon.style.setProperty(
          'left',
          nativeShift !== 0 ? `calc(${markerLeftShift} - ${nativeShift}px)` : markerLeftShift,
          'important',
        );
      }
    }
  }

  private clearAll(): void {
    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) {
      el.style.removeProperty('margin-left');
      el.classList.remove('to-decor-guides');
      el.style.removeProperty('--to-guides');
      el.style.removeProperty('--to-own-shift');
      clearWidgetMarker(el);
    }
    const plainLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(PLAIN_MARGIN_SELECTOR),
    );
    for (const el of plainLines) el.style.removeProperty('margin-left');
  }
}

export function decorationsExtension(modes: DecorationSource): Extension {
  return [
    StateField.define<DecorationSet>({
      create: (state) => computeDecorations(state, modes),
      // Recomputes on every transaction, not just docChanged ones:
      // toggling outline mode has no doc change of its own, only a nudged
      // selection transaction (see main.ts) to make this field re-run.
      update: (_value, tr) => computeDecorations(tr.state, modes),
      provide: (field) => EditorView.decorations.from(field),
    }),
    // A SEPARATE StateField for block-marker widgets (Experiment 5a), not
    // merged into the same RangeSetBuilder as the line decorations above —
    // CM6 merges decorations from multiple StateFields correctly on its
    // own, sidestepping any need to reason about Decoration.line/
    // Decoration.widget ordering at the same document position.
    StateField.define<DecorationSet>({
      create: (state) => computeMarkers(state, modes),
      update: (_value, tr) => computeMarkers(tr.state, modes),
      provide: (field) => EditorView.decorations.from(field),
    }),
    ViewPlugin.define<MarginCompensation>((view) => new MarginCompensation(view, modes)),
  ];
}
