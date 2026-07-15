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
function guideLayer(depth: number): string {
  const unit = 'var(--to-decor-unit, 1.5rem)';
  return (
    `repeating-linear-gradient(to right, var(--text-faint) 0 1px, transparent 1px ${unit}) ` +
    `calc(${depth} * ${unit}) 0 / ${unit} 100% no-repeat`
  );
}

function guideBackground(guideDepths: readonly number[]): string {
  return guideDepths.map(guideLayer).join(', ');
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

  if (guide.guideDepths.length > 0) {
    cls += ' to-decor-guides';
    styles.push(`--to-guides: ${guideBackground(guide.guideDepths)}`);
    if (ownShiftUnits > 0) {
      styles.push(`--to-own-shift: calc(${ownShiftUnits} * var(--to-decor-unit, 1.5rem))`);
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
        if (guide && guide.guideDepths.length > 0) {
          el.classList.add('to-decor-guides');
          el.style.setProperty('--to-guides', guideBackground(guide.guideDepths));
          el.style.setProperty('--to-own-shift', ownShiftExpr);
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
      el.style.removeProperty('--to-own-shift');
    }
    const plainLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(PLAIN_MARGIN_SELECTOR),
    );
    for (const el of plainLines) el.style.removeProperty('margin-left');
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
