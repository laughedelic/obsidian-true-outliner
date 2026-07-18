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
 *   see the "Guide lines" section below).
 * - Tables, callouts, raw HTML blocks, and horizontal rules are rendered as
 *   opaque replacement widgets (`.cm-embed-block`, or `.hr` for the rule) —
 *   confirmed live: a `Decoration.line` targeting that line's position has
 *   no effect at all (not even a class-merge partial win), because the
 *   widget's own `toDOM()` produces the line's DOM wholesale and neither
 *   CM6 nor Obsidian threads our decoration's class/attributes through it.
 *   These need a direct, imperative DOM patch instead — a `ViewPlugin`
 *   that, after each render, sets `margin-left` inline (with `!important`,
 *   which always wins for an inline style regardless of what any
 *   stylesheet rule does) on whichever such widgets are currently mounted.
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

// Marker sizing shared between the guide-column math below (guides align to
// a marker's own CENTER, not the raw depth boundary — see `GUIDE_COLUMN_
// OFFSET`) and the block-markers section further down. Declared here, ahead
// of both, purely so `guideLayer`'s own module-load-time `const` doesn't
// reference a not-yet-initialized binding.
const MARKER_SIZE = 'var(--to-decor-marker-size, 0.4rem)';
const MARKER_HALF = `calc(${MARKER_SIZE} / 2)`;
const MARKER_GAP = 'var(--to-decor-marker-gap, 0.35rem)';

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
// A guide's own column is offset LEFT of the raw depth boundary by exactly
// `MARKER_HALF + MARKER_GAP` — the same quantity that separates a marker's
// own CENTER from its node's depth column (see `markerOriginX`: a marker's
// left edge sits at `depth*unit - SIZE - GAP`, so its center sits at
// `depth*unit - SIZE/2 - GAP` = `depth*unit - HALF - GAP`). Aligning guides
// with the marker's CENTER, not the bare depth boundary, is what makes a
// vertical line visually pass straight through the dot above/below it —
// the same relationship native nested lists have between their own bullet
// and the connecting indent guide, which this experiment is explicitly
// trying to read as a natural extension of. Before this, guides sat at the
// depth boundary itself — a real, visible seam to the right of the marker,
// not a continuous line through it.
const GUIDE_COLUMN_OFFSET = `calc(${MARKER_HALF} + ${MARKER_GAP})`;

/** How much extra the pseudo's box must widen for a GUIDE at ancestor depth `depth` to reach its (marker-center-aligned) column without clipping. */
function guideShortfall(depth: number): string {
  const unit = 'var(--to-decor-unit, 1.5rem)';
  return `max(0px, calc(${GUIDE_COLUMN_OFFSET} - ${depth} * ${unit}))`;
}

// `extra` (see the block-markers section below) is an additional leftward
// widening of the pseudo's own box, needed whenever a depth-0-ish marker OR
// guide column on the SAME line needs to bleed further left than
// `--to-own-shift` alone would otherwise provide — 0px on most lines, so
// this is a no-op there.
function guideLayer(depth: number, extra: string): string {
  const unit = 'var(--to-decor-unit, 1.5rem)';
  return (
    `repeating-linear-gradient(to right, var(--text-faint) 0 1px, transparent 1px ${unit}) ` +
    `calc(${depth} * ${unit} - ${GUIDE_COLUMN_OFFSET} + ${extra}) 0 / ${unit} 100% no-repeat`
  );
}

function guideBackground(guideDepths: readonly number[], extra: string): string {
  return guideDepths.map((d) => guideLayer(d, extra)).join(', ');
}

// ---- Block markers (Experiment 5b: CSS-shape markers) ----------------------
//
// One SINGLE, consistent shape (a solid dot) for every eligible kind
// (anything that isn't a list item — same reason guides exclude list items:
// the native bullet/number already does this job), painted via a NEW custom
// property (`--to-marker`) folded into the SAME `::after` guides already use
// (see styles.css: `background: var(--to-marker, none), var(--to-guides,
// none);`) — CSS gives each line exactly two pseudo-elements and both are
// already spoken for (native blockquote/callout bar uses `::before`; guides
// use `::after`), so markers must share `::after` with guides rather than
// claim a third one that doesn't exist. Same color as the guide lines
// themselves (`var(--text-faint)`) — a first version tried a distinct
// shape+color per kind (8 different marks), but that read as cryptic rather
// than helpful once actually seen in a real note; a single uniform "this
// line starts a node" bullet is the legibility win, not variety.
//
// Position: every marker sits `MARKER_GAP` left of the node's OWN indent
// column (`fact.depth * unit`, same quantity `--to-depth`/`--to-own-shift`
// already carry — no new coordinate math beyond one clamp, see below). This
// is computed in the SAME local coordinate system guides use (origin =
// global column 0, restored by widening the pseudo's box leftward by
// `--to-own-shift` for margin-shifted kinds) — so a marker on a plain
// padding-left block line needs no widening at all for that PART of the
// reach (its box's own left edge already IS global column 0), while a
// margin-left atom line reuses exactly the widening guides already compute
// for `fact.depth`.
//
// A background can NEVER paint outside its own element's box, regardless of
// what any ancestor's overflow/contain allows — that's a stricter rule than
// the guide-layer doc comment above establishes (which is about the pseudo's
// OWN box being widened via `left`, not about backgrounds escaping a box
// that wasn't widened). A first pass here wrongly assumed the same "bleeds
// left unclipped" finding covered a marker's own small negative
// `background-position` too — it doesn't: confirmed live (screenshot) that
// a depth-0 heading's marker was completely invisible, silently clipped by
// the line's own (unwidened) box edge. At `fact.depth * unit >= MARKER_SIZE
// + MARKER_GAP` the marker's position is already non-negative in local
// coordinates and renders fine unaided (confirmed live too — every depth
// ≥ 1 marker in the corpus rendered correctly on the first attempt); only
// shallow depths (in practice, just depth 0 at this module's default sizes)
// need extra help. `markerShortfall(depth)` computes exactly that missing
// reach via the same `max(0px, ...)` clamp idiom this file's own table
// padding-compensation already established, and BOTH the marker's own
// position formula and any guide layer active on the SAME line fold it in
// (see `guideLayer`'s `extra` parameter) — the pseudo's local coordinate
// origin is a single, shared thing for the whole box, so anything that
// widens it must be accounted for in every layer's position, not just the
// marker's own.
//
// Vertical position: the goal is "centered on the FIRST rendered visual row
// of the node's own text" for every kind uniformly — a heading, a wrapped
// multi-row paragraph/quote, a code fence's opening line, a callout's title
// row, a table's header row. No single CSS-only formula gets this right for
// every kind at once (a plain `%` centers within the pseudo's own box,
// which for a WRAPPED line or a widget spanning many rows is NOT "the first
// row"; a fixed length doesn't scale with a heading's own font-size). Two
// earlier CSS-only attempts confirmed this the hard way:
//   1. `calc(50% - HALF)` was used as "centering," but that DOUBLE-corrects:
//      `background-position`'s `%` component is ALREADY defined relative to
//      (box size − image size), i.e. plain `50%` alone already centers the
//      image — subtracting `HALF` again shifts the image up by `HALF` more
//      than intended. This is why a "corrected" version still rendered
//      visibly high (near the top edge) on plain paragraph/code/quote
//      lines, reported directly by the user.
//   2. A fixed length (chosen per kind — one guess for headings, a
//      different one for widget atoms) doesn't scale with a heading's own
//      font-size at all (confirmed live: changing a heading's level didn't
//      move the marker) and doesn't know where a widget's own "first row"
//      actually is (it sat at the literal top of the whole block instead).
// The actual fix: measure live, the same discipline this ViewPlugin already
// uses for `nativeMarginBasePx`/native table padding. `--to-decor-marker-y`
// is a plain PIXEL length (not a percentage) written by `MarginCompensation`
// below, after each render, via `document.createRange().selectNodeContents`
// + `getClientRects()[0]` — the DOM's own notion of "this element's first
// visual row," which correctly handles word-wrap for free and scales with
// whatever font-size is actually in effect. `markerBackground()` itself only
// ever emits a reference to this custom property with a safe static
// fallback (plain, CORRECTLY centered `50%`) for the brief window before the
// ViewPlugin's own post-render pass overrides it — same "StateField draws a
// reasonable default, ViewPlugin patches in the live-measured true value"
// split already established for margin-left.
// (MARKER_SIZE/MARKER_HALF/MARKER_GAP declared near the top of the file —
// guides need them too, see GUIDE_COLUMN_OFFSET.)
const MARKER_RESERVE = `calc(${MARKER_SIZE} + ${MARKER_GAP})`;
const MARKER_Y = 'var(--to-decor-marker-y, 50%)';
const MARKER_COLOR = 'var(--text-faint)'; // same color as the guide lines

/** How much extra the pseudo's box must widen for a marker at `depth` to avoid negative (clipped) local coordinates. */
function markerShortfall(depth: number): string {
  const unit = 'var(--to-decor-unit, 1.5rem)';
  return `max(0px, calc(${MARKER_RESERVE} - ${depth} * ${unit}))`;
}

/**
 * Combines a marker's own shortfall (if this line has one) with the
 * shallowest active guide's own shortfall (if any) into ONE widening
 * amount for this line's pseudo box — the two are independent reasons the
 * box might need to reach a negative local column (the marker's own left
 * edge; a shallow ancestor's marker-center-aligned guide column), and
 * since they share the same box they share the same widening. Guide
 * depths are ascending, so the shallowest (smallest) is always the worst
 * case — a deeper ancestor's guide column is never further left.
 */
function combineExtra(markerExtra: string | null, guideDepths: readonly number[]): string {
  const parts: string[] = [];
  if (markerExtra) parts.push(markerExtra);
  if (guideDepths.length > 0) parts.push(guideShortfall(guideDepths[0]!));
  if (parts.length === 0) return '0px';
  if (parts.length === 1) return parts[0]!;
  return `max(${parts.join(', ')})`;
}

function markerOriginX(depth: number, extra: string): string {
  const unit = 'var(--to-decor-unit, 1.5rem)';
  return `calc(${depth} * ${unit} - ${MARKER_SIZE} - ${MARKER_GAP} + ${extra})`;
}

/**
 * The vertical center (px, relative to `containerTop`) of `referenceEl`'s
 * own first rendered visual row — `Range.getClientRects()` returns one rect
 * per wrapped visual row, so `[0]` is exactly "the first line of text,"
 * word-wrap handled for free. `null` for an element with no text content
 * at all (e.g. an `<hr>`), which callers fall back on separately.
 */
function firstRowCenterPx(referenceEl: Element, containerTop: number): number | null {
  const range = document.createRange();
  range.selectNodeContents(referenceEl);
  const rects = range.getClientRects();
  if (rects.length === 0) return null;
  const r = rects[0]!;
  return r.top - containerTop + r.height / 2;
}

/**
 * Live-measured "first row" reference for a widget-rendered atom (table/
 * callout/html/hr), returned as a vertical center in px relative to `el`'s
 * own top. Each kind exposes its own natural first-line-equivalent
 * element — a callout's title, a table's first row — rather than centering
 * within the widget's ENTIRE height (which for a multi-line callout or a
 * many-row table would land the marker in the middle of arbitrarily more
 * content, not aligned with anything). `hr` has no text content at all, so
 * its own (thin, single-row) box height stands in; `html` (arbitrary raw
 * markup, no fixed structure to target) falls back to the same
 * `firstRowCenterPx` technique plain lines use, applied to the widget's own
 * root — reasonable for typical raw HTML, not guaranteed for exotic markup,
 * hence the further fallback to half the widget's own height if even that
 * finds no rects.
 */
function widgetMarkerYPx(el: HTMLElement, kind: NodeKind): number {
  const rect = el.getBoundingClientRect();
  if (kind === 'hr') return rect.height / 2;
  const refEl =
    kind === 'callout' ? el.querySelector('.callout-title') : kind === 'table' ? el.querySelector('tr') : null;
  if (refEl) {
    const r = refEl.getBoundingClientRect();
    return r.top - rect.top + r.height / 2;
  }
  return firstRowCenterPx(el, rect.top) ?? rect.height / 2;
}

/**
 * The `--to-marker` background-layer string: a single solid dot. Vertical
 * position always references `--to-decor-marker-y` (see the doc comment
 * above) — `MarginCompensation` sets the real, live-measured value after
 * each render; the `50%` fallback baked into `MARKER_Y` only matters for
 * the brief window before that pass runs.
 */
function markerBackground(depth: number, extra: string): string {
  const x = markerOriginX(depth, extra);
  return `radial-gradient(circle, ${MARKER_COLOR} 62%, transparent 64%) ${x} ${MARKER_Y} / ${MARKER_SIZE} ${MARKER_SIZE} no-repeat`;
}

function lineDecoration(fact: LineDecorationFact, guide: LineGuideFact): Decoration {
  const styles: string[] = [];
  let cls: string;
  // Units of `--to-decor-unit` this line's own box has been shifted right
  // by its own margin-left — the exact compensation the guide's pseudo
  // needs to widen its box by, leftward, to reach a shallower ancestor's
  // column (see the doc comment above).
  let ownShiftUnits: number;

  if (fact.isListItem) {
    cls = 'to-decor-list';
    styles.push(`--to-supp-depth: ${fact.supplementalDepth}`);
    ownShiftUnits = fact.supplementalDepth;
  } else if (fact.isAtom) {
    cls = 'to-decor-atom';
    styles.push(`--to-depth: ${fact.depth}`);
    ownShiftUnits = fact.depth;
  } else {
    cls = 'to-decor-block';
    styles.push(`--to-depth: ${fact.depth}`);
    ownShiftUnits = 0; // padding-left never shifts a block line's own box
  }

  // Markers only ever go on a node's own first line, never a continuation,
  // and never on a list item — the native bullet/number already does this
  // job (same exclusion guides already use). Depth-0 nodes with zero
  // ancestors (no guide of their own today) still need a marker, so the
  // `to-decor-guides` gate (which also drives `position: relative` and the
  // whole `::after` rule) can no longer be guarded on the guide alone.
  const markerExtra = fact.isFirstLine && !fact.isListItem ? markerShortfall(fact.depth) : null;
  const hasGuide = guide.guideDepths.length > 0;
  // Widen for whichever of the marker's own reach / the shallowest active
  // guide's reach needs more (see `combineExtra`'s doc comment) — either
  // can independently require it now that guides align to a marker's
  // CENTER column, which goes negative earlier than the old depth-boundary
  // column did. Computed BEFORE building `marker`: the box only has ONE
  // `left` offset (`--to-own-shift`), so the marker's own X formula MUST
  // use this same combined value, not its own (possibly smaller) shortfall
  // alone — otherwise the two stop canceling out algebraically and the
  // marker renders offset from its intended column. A first version got
  // this backwards (built `marker` from `markerExtra` alone, then combined
  // separately for `--to-own-shift`), which is exactly why deeper markers
  // drifted left of their guide columns — caught by the user comparing a
  // real screenshot, not by any of this experiment's own assertions, none
  // of which checked cross-depth alignment against a REAL multi-level
  // chain (the one dedicated alignment test used a depth-0/depth-1 pair,
  // where the bug's `markerExtra` and combined `extra` happen to coincide).
  const extra = combineExtra(markerExtra, guide.guideDepths);
  // Vertical position is NOT computed here — see `MARKER_Y`'s doc comment:
  // `markerBackground()` always references `--to-decor-marker-y`, which
  // `MarginCompensation` sets live after render for every marker-bearing
  // line, plain or widget alike.
  const marker = markerExtra !== null ? markerBackground(fact.depth, extra) : null;

  if (hasGuide || marker) {
    cls += ' to-decor-guides';
    if (hasGuide) styles.push(`--to-guides: ${guideBackground(guide.guideDepths, extra)}`);
    if (marker) styles.push(`--to-marker: ${marker}`);
    if (ownShiftUnits > 0 || marker || hasGuide) {
      styles.push(
        `--to-own-shift: calc(${ownShiftUnits} * var(--to-decor-unit, 1.5rem) + ${extra})`,
      );
    }
  }

  return Decoration.line({ class: cls, attributes: { style: styles.join('; ') } });
}

// A blank trailingGap line carrying a guide (see computeLineGuides's doc
// comment) has no decorate() fact at all — no depth, no kind, nothing to
// indent, and never a marker — so it gets a minimal decoration with just
// the guide class/style, not the full lineDecoration() treatment. It CAN
// still need `--to-own-shift`, though: a guide at a shallow (e.g. depth-0)
// ancestor now aligns to that ancestor's marker-center column (see
// `GUIDE_COLUMN_OFFSET`), which is negative in local coordinates the same
// way it is on any other line with that guide active.
function gapLineDecoration(guide: LineGuideFact): Decoration {
  const extra = combineExtra(null, guide.guideDepths);
  const styles = [`--to-guides: ${guideBackground(guide.guideDepths, extra)}`];
  if (guide.guideDepths.length > 0) styles.push(`--to-own-shift: ${extra}`);
  return Decoration.line({ class: 'to-decor-guides', attributes: { style: styles.join('; ') } });
}

function computeDecorations(state: EditorState, modes: ModeSource): DecorationSet {
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
    builder.add(from, from, lineDecoration(fact, guide));
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

class MarginCompensation implements PluginValue {
  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
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
        // added to margin-left but never to `--to-own-shift`.
        const ownShiftExpr = `max(0px, calc(${fact.depth} * var(--to-decor-unit, 1.5rem) - ${nativePaddingLeft}px))`;
        el.style.setProperty('margin-left', `calc(${nativeBasePx}px + ${ownShiftExpr})`, 'important');

        const guide = guidesByLine.get(lineNumber);
        const hasGuide = !!guide && guide.guideDepths.length > 0;
        // Same marker eligibility as lineDecoration() (first line, list
        // items excluded — moot here, list items are never widget-rendered
        // anyway): position uses plain `fact.depth`, unrelated to
        // `ownShiftExpr`'s native-padding compensation, same as guide
        // layers above — both resolve in the SAME local coordinate system
        // (origin = nativeBasePx, restored by `--to-own-shift` cancelling
        // exactly whatever value it's set to against the matching
        // margin-left term), so any ownShiftExpr formula works unchanged.
        // `markerShortfall` (see its doc comment) additionally folds in for
        // a shallow (in practice, depth-0) widget atom, e.g. a bare `---`
        // as literally the first line of a document — same reasoning as
        // lineDecoration()'s plain-line case. `extra` (combined marker +
        // guide reach) is computed BEFORE `marker` itself and used for
        // BOTH — see lineDecoration()'s own doc comment for why using the
        // marker's own (possibly smaller) shortfall alone here was a real,
        // shipped bug (deeper markers drifting left of their guide column).
        const markerExtra = fact.isFirstLine ? markerShortfall(fact.depth) : null;
        const extra = combineExtra(markerExtra, hasGuide ? guide.guideDepths : []);
        const marker = markerExtra !== null ? markerBackground(fact.depth, extra) : null;
        if (hasGuide || marker) {
          el.classList.add('to-decor-guides');
          if (hasGuide) el.style.setProperty('--to-guides', guideBackground(guide.guideDepths, extra));
          else el.style.removeProperty('--to-guides');
          if (marker) el.style.setProperty('--to-marker', marker);
          else el.style.removeProperty('--to-marker');
          el.style.setProperty('--to-own-shift', `calc(${ownShiftExpr} + ${extra})`);
        } else {
          el.classList.remove('to-decor-guides');
          el.style.removeProperty('--to-guides');
          el.style.removeProperty('--to-marker');
          el.style.removeProperty('--to-own-shift');
        }
        if (marker) {
          const centerPx = widgetMarkerYPx(el, fact.kind);
          el.style.setProperty('--to-decor-marker-y', `calc(${centerPx}px - ${MARKER_HALF})`);
        } else {
          el.style.removeProperty('--to-decor-marker-y');
        }
      } else {
        el.style.removeProperty('margin-left');
        el.classList.remove('to-decor-guides');
        el.style.removeProperty('--to-guides');
        el.style.removeProperty('--to-marker');
        el.style.removeProperty('--to-own-shift');
        el.style.removeProperty('--to-decor-marker-y');
      }
    }

    // Marker vertical position for PLAIN `.cm-line`s (heading/paragraph/
    // code/quote — widget atoms are handled above): live-measured against
    // each line's own first rendered visual row (see `MARKER_Y`'s doc
    // comment) — `.hr` excluded, it's widget-rendered despite carrying
    // `.cm-line` (handled in the loop above instead).
    //
    // Code fences are a deliberate exception, not a bug in the general
    // technique: a fence's structural first LINE is the OPENING marker row
    // (` ```js `) — a real, separately-rendered `.cm-line` occupying its
    // own normal row height (confirmed live: same height as every body
    // line), NOT collapsed to zero — but Live Preview shows nothing but a
    // language badge on it, with the actual code text starting on the
    // NEXT line down. Measuring the opener's own first row (as every other
    // kind does) is therefore internally consistent but visually wrong:
    // it puts the marker a full row above the code the reader actually
    // sees, confirmed by an earlier version of this code doing exactly
    // that (caught by the user on a real screenshot, not by any
    // assertion). Reaching into the NEXT `.cm-line` for a "true" first-row
    // measurement was considered and rejected: this pseudo-element's own
    // box is exactly this ONE line's height (`top: 0; bottom: 0`), and a
    // background can never paint outside its own box (the same hard rule
    // that broke depth-0 markers earlier) — the next line's own content
    // sits fully outside that box, and reliably reaching it would need
    // the same kind of box-widening `--to-own-shift` already uses on the
    // X axis, this time vertically, risking a NEW paint-order fight with
    // the next (opaque-backgrounded) code line's own box that hasn't been
    // verified live. Simpler and safer, per an explicit user ask ("if
    // that is harder to calculate, let's try an offset, to make it a bit
    // lower"): bias toward the BOTTOM of the opener's own row instead of
    // its center — still fully inside that row's own box (zero clipping
    // risk, unlike the rejected approach), and visually closer to the
    // code text immediately below without claiming an exact alignment
    // this mechanism can't safely reach.
    const CODE_MARKER_Y = '95%';
    const markerLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-line:not(.hr)'),
    );
    for (const el of markerLines) {
      const lineNumber = this.view.state.doc.lineAt(this.view.posAtDOM(el)).number - 1;
      const fact = factsByLine.get(lineNumber);
      if (fact?.isFirstLine && !fact.isListItem) {
        if (fact.kind === 'code') {
          el.style.setProperty('--to-decor-marker-y', CODE_MARKER_Y);
          continue;
        }
        const center = firstRowCenterPx(el, el.getBoundingClientRect().top);
        if (center !== null) {
          el.style.setProperty('--to-decor-marker-y', `calc(${center}px - ${MARKER_HALF})`);
        } else {
          el.style.removeProperty('--to-decor-marker-y');
        }
      } else {
        el.style.removeProperty('--to-decor-marker-y');
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
    for (const el of plainLines) {
      const isListItem = el.classList.contains('to-decor-list');
      const depthVar = isListItem ? '--to-supp-depth' : '--to-depth';
      el.style.setProperty(
        'margin-left',
        `calc(${nativeBasePx}px + var(${depthVar}, 0) * var(--to-decor-unit, 1.5rem))`,
        'important',
      );
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
      el.style.removeProperty('--to-marker');
      el.style.removeProperty('--to-own-shift');
      el.style.removeProperty('--to-decor-marker-y');
    }
    const plainLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(PLAIN_MARGIN_SELECTOR),
    );
    for (const el of plainLines) el.style.removeProperty('margin-left');
    const markerLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>('.cm-line:not(.hr)'),
    );
    for (const el of markerLines) el.style.removeProperty('--to-decor-marker-y');
  }
}

export function decorationsExtension(modes: ModeSource): Extension {
  return [
    StateField.define<DecorationSet>({
      create: (state) => computeDecorations(state, modes),
      // Recomputes on every transaction, not just docChanged ones:
      // toggling outline mode has no doc change of its own, only a nudged
      // selection transaction (see main.ts) to make this field re-run.
      update: (_value, tr) => computeDecorations(tr.state, modes),
      provide: (field) => EditorView.decorations.from(field),
    }),
    ViewPlugin.define<MarginCompensation>((view) => new MarginCompensation(view, modes)),
  ];
}
