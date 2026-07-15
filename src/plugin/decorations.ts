/**
 * CM6 adapter for outline mode's decorations. All the pure computation
 * (depth/supplementalDepth, guide spans) lives in decorate.ts; this module
 * only turns those facts into CM6 decorations/DOM, gated per-editor on
 * outline mode via the public `editorInfoField` — same gating pattern as
 * keymap.ts's grammarExtension.
 *
 * Three mechanisms:
 *
 * - Most lines (headings, paragraphs, list items, code fences, plain
 *   blockquotes) render as a real `.cm-line` that CM6 lets us decorate
 *   declaratively: one class plus one CSS custom property per fact (never
 *   an inline shorthand property), so styles.css owns the actual
 *   `padding-left`/`margin-left` rules and their units (additive-only
 *   indentation, Experiment 1).
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
 * - Guide lines (Experiment 2a, see
 *   docs/research/07-decoration-experiments-plan.md) are pixel-measured
 *   overlay divs in a layer outside `.cm-content` — see the "Guide lines"
 *   section below for the full rationale.
 */

import { RangeSetBuilder, StateField, type Extension, type EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  RectangleMarker,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { parse } from '../parse';
import { computeGuides, decorate, type LineDecorationFact } from './decorate';
import type { ModeSource } from './keymap';

function lineDecoration(fact: LineDecorationFact): Decoration {
  if (fact.isListItem) {
    return Decoration.line({
      class: 'to-decor-list',
      attributes: { style: `--to-supp-depth: ${fact.supplementalDepth}` },
    });
  }
  const cls = fact.isAtom ? 'to-decor-atom' : 'to-decor-block';
  return Decoration.line({ class: cls, attributes: { style: `--to-depth: ${fact.depth}` } });
}

function currentlyOutline(state: EditorState, modes: ModeSource): boolean {
  const path = state.field(editorInfoField, false)?.file?.path;
  return !!path && modes.isOutline(path);
}

/**
 * StateField value bundles the computed decorations with the outline-mode
 * flag they were computed for. Toggling outline mode dispatches no doc
 * change of its own (see main.ts's refreshDecorations, a real public-API
 * transaction that's otherwise a no-op) — carrying `wasOutline` in the
 * field's own value lets `update` detect that flip and recompute exactly
 * then, instead of on every transaction that reaches this field (the
 * "prior attempt's per-ViewUpdate recompute" the Experiment 2a plan calls
 * out to fix).
 */
interface DecorationFieldValue {
  readonly decorations: DecorationSet;
  readonly wasOutline: boolean;
}

function computeDecorations(state: EditorState, modes: ModeSource): DecorationFieldValue {
  const isOutline = currentlyOutline(state, modes);
  if (!isOutline) return { decorations: Decoration.none, wasOutline: false };

  const facts = decorate(parse(state.doc.toString()));
  const totalLines = state.doc.lines;
  const builder = new RangeSetBuilder<Decoration>();
  for (const fact of facts) {
    if (fact.lineNumber >= totalLines) continue; // stale fact past a shrunk doc
    const from = state.doc.line(fact.lineNumber + 1).from; // CM6 lines are 1-indexed
    builder.add(from, from, lineDecoration(fact));
  }
  return { decorations: builder.finish(), wasOutline: true };
}

// Obsidian's own selectors for widget-replaced atom kinds — matches tables,
// callouts, and raw HTML blocks (`.cm-embed-block`) plus horizontal rules
// (`.hr`, which oddly also carries `cm-line` but is widget-rendered all the
// same). Broad by design: elements it catches that don't correspond to an
// atom fact (e.g. an inline image embed inside a paragraph) just get their
// margin cleared, a no-op.
const WIDGET_ATOM_SELECTOR = '.cm-embed-block, .cm-line.hr';

class AtomWidgetMargins implements PluginValue {
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

  private apply(): void {
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    if (!path || !this.modes.isOutline(path)) {
      this.clearAll();
      return;
    }

    const factsByLine = new Map(
      decorate(parse(this.view.state.doc.toString())).map((f) => [f.lineNumber, f]),
    );
    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) {
      const fact = factsByLine.get(this.view.state.doc.lineAt(this.view.posAtDOM(el)).number - 1);
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
        el.style.setProperty(
          'margin-left',
          `max(0px, calc(${fact.depth} * var(--to-decor-unit, 1.5rem) - ${nativePaddingLeft}px))`,
          'important',
        );
      } else {
        el.style.removeProperty('margin-left');
      }
    }
  }

  private clearAll(): void {
    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_ATOM_SELECTOR),
    );
    for (const el of widgets) el.style.removeProperty('margin-left');
  }
}

// ---- Guide lines (Experiment 2a: pixel-measured overlay) -------------------
//
// obsidian-outliner's proven technique (its VerticalLines.ts): read
// already-rendered pixel positions via coordsAtPos()/lineBlockAt() *after*
// Experiment 1's indentation has been laid out, and draw absolutely-
// positioned overlay divs in a layer outside .cm-content. Measuring instead
// of recomputing depth × unit here also means list items (native marker
// position, the supplementalDepth quirk) need no special-casing at all —
// wherever an ancestor's own line actually renders is, by construction,
// where its children's guide should hang.
//
// CM6 ships a first-party `layer()`/`RectangleMarker` pair for exactly this
// (used internally for the selection/cursor layers) that already solves the
// scroll-coordinate-calibration problem — but its `update()` hook can only
// request a *synchronous* redraw, with no way to debounce the recompute the
// plan calls for. So this hand-rolls a ViewPlugin (matching the plan's own
// framing) that still reuses RectangleMarker purely as a positioned-div
// factory (its `draw()` sets `style.left/top/width/height` directly, not via
// CSS classes — confirmed from @codemirror/view's own source), but drives it
// with a real setTimeout debounce and manual scroll-coordinate calibration.

const GUIDE_DEBOUNCE_MS = 50;
const GUIDE_WIDTH_PX = 1;

/**
 * Our own container sits at `scrollDOM`'s own top-left (a plain absolute
 * div at local (0,0) inside it) — this is the origin every marker's
 * `left`/`top` must be expressed relative to. Mirrors @codemirror/view's
 * own internal (unexported) `getBase` helper used by RectangleMarker.forRange
 * for the *viewport-relative* half of that conversion (`coordsAtPos`), minus
 * RTL handling (Obsidian's outline mode has no RTL requirement here).
 */
function documentBase(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

/**
 * `lineBlockAt().top/.bottom` are relative to `view.documentTop` — NOT to
 * our container's origin (`documentBase(view).top`, i.e. scrollDOM's own
 * top). The two differ by a real, non-zero constant (`.cm-content`'s own
 * top offset within the scroller) — confirmed live: a guide's vertical
 * position was off by exactly that offset until this conversion was added.
 * `documentTop` is itself viewport-relative (like coordsAtPos), so route
 * through it to convert a document-relative distance into our container's
 * local frame, the same way `coordsAtPos(...).left - base.left` does for x.
 */
function localTop(view: EditorView, documentRelativeY: number, base: { top: number }): number {
  return view.documentTop + documentRelativeY - base.top;
}

function computeGuideMarkers(view: EditorView, modes: ModeSource): readonly RectangleMarker[] {
  const state = view.state;
  if (!currentlyOutline(state, modes)) return [];

  const guides = computeGuides(parse(state.doc.toString()));
  const base = documentBase(view);
  const markers: RectangleMarker[] = [];
  for (const guide of guides) {
    const anchorLine = state.doc.line(guide.anchorLine + 1); // CM6 lines are 1-indexed
    // A nested list item's raw source line starts with the indentation
    // whitespace itself (e.g. "  - nested item") — Obsidian visually
    // collapses/hides that leading whitespace via its own native indent
    // mechanism rather than rendering it at normal character width, so
    // coordsAtPos at `line.from` lands at the wrong x (confirmed live: it
    // landed at the *parent* list level's own column, one level too far
    // left). Skip past it to the marker/text's real first character.
    const indentLen = anchorLine.text.length - anchorLine.text.trimStart().length;
    const anchorPos = anchorLine.from + indentLen;
    // side -1 ("before"): at a line's very first position, side 1 ("after")
    // returns the far edge of the first character (its right edge, past a
    // list item's own bullet glyph) — confirmed live, off by exactly the
    // bullet's width. -1 gives the character's own left edge, matching the
    // bullet/text's true rendered start (and the reference `.cm-formatting-
    // list` rect the e2e spec checks this against).
    const anchorCoords = view.coordsAtPos(anchorPos, -1);
    if (!anchorCoords) continue; // anchor not currently rendered (known limitation for very long docs)

    const fromPos = state.doc.line(guide.fromLine + 1).from;
    const toPos = state.doc.line(guide.toLine + 1).from;
    // lineBlockAt is block-level: for a multi-line (Shift+Enter) node it
    // covers every wrapped visual row, so a guide through a multi-line node
    // spans its full rendered height for free.
    const top = localTop(view, view.lineBlockAt(fromPos).top, base);
    const bottom = localTop(view, view.lineBlockAt(toPos).bottom, base);
    if (bottom <= top) continue;

    markers.push(
      new RectangleMarker('to-decor-guide', anchorCoords.left - base.left, top, GUIDE_WIDTH_PX, bottom - top),
    );
  }
  return markers;
}

class GuideLines implements PluginValue {
  private readonly container: HTMLElement;
  private timer: number | undefined;
  private wasOutline = false;

  constructor(
    private readonly view: EditorView,
    private readonly modes: ModeSource,
  ) {
    this.container = view.scrollDOM.createDiv({ cls: 'to-decor-guides-layer' });
    // Moved before (not left appended after) .cm-content so it paints
    // underneath the text in normal DOM stacking order, no z-index needed.
    view.scrollDOM.insertBefore(this.container, view.scrollDOM.firstChild);
    this.recompute(); // first paint: synchronous, nothing to debounce yet
  }

  update(update: ViewUpdate): void {
    const isOutline = currentlyOutline(update.state, this.modes);
    const toggled = isOutline !== this.wasOutline;
    this.wasOutline = isOutline;
    // Gate on docChanged || viewportChanged || an out-of-band mode toggle —
    // NOT unconditionally on every ViewUpdate (e.g. a plain cursor move
    // changes neither and must not trigger a recompute).
    if (update.docChanged || update.viewportChanged || toggled) this.scheduleRecompute();
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.container.remove();
  }

  private scheduleRecompute(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.recompute(), GUIDE_DEBOUNCE_MS);
  }

  private recompute(): void {
    const markers = computeGuideMarkers(this.view, this.modes);
    this.container.replaceChildren(...markers.map((m) => m.draw()));
  }
}

export function decorationsExtension(modes: ModeSource): Extension {
  return [
    StateField.define<DecorationFieldValue>({
      create: (state) => computeDecorations(state, modes),
      update: (value, tr) => {
        const isOutline = currentlyOutline(tr.state, modes);
        if (!tr.docChanged && isOutline === value.wasOutline) return value;
        return computeDecorations(tr.state, modes);
      },
      provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
    }),
    ViewPlugin.define<AtomWidgetMargins>((view) => new AtomWidgetMargins(view, modes)),
    ViewPlugin.define<GuideLines>((view) => new GuideLines(view, modes)),
  ];
}
