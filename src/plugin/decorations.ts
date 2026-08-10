/**
 * CM6 adapter for outline mode's decorations. All the pure computation
 * (depth/supplementalDepth, per-line guide depths) lives in decorate.ts;
 * this module only turns those facts into CM6 decorations/DOM, gated
 * per-editor on outline mode via the public `editorInfoField` — same
 * gating pattern as keymap.ts's grammarExtension.
 *
 * Two mechanisms, because Obsidian renders lines two different ways in Live
 * Preview. Which mechanism a line needs is decided by its RENDERED FORM, not
 * by its node kind: the two correlate strongly (the atom kinds are always
 * widget-rendered, headings and paragraphs usually aren't) but they are not
 * the same question, and treating them as one is a bug this module has
 * already had once — see WIDGET_LINE_SELECTOR.
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
 * - Other lines are replaced wholesale by an opaque element. Tables,
 *   callouts, raw HTML blocks, and horizontal rules always are; so is a
 *   paragraph (or list item) Obsidian chooses to render as something else,
 *   such as a wiki embed. Confirmed live: a `Decoration.line` targeting
 *   that line's position has no effect at all (not even a class-merge
 *   partial win), because the widget's own `toDOM()` produces the line's
 *   DOM wholesale and neither CM6 nor Obsidian threads our decoration's
 *   class/attributes through it.
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

import { RangeSetBuilder, type Extension, type EditorState, type Text } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  runScopeHandlers,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type { NodeKind, OutlineDoc } from '../model';
import { parse } from '../parse';
import { coveredForestOf, coveredSubtreeRoots, type LinePos, type LineRange } from '../escalate';
import {
  computeLineGuides,
  computePositionTrail,
  decorate,
  materializeProbe,
  type GuideHighlight,
  type MarkerHighlight,
  type LineDecorationFact,
  type LineGuideFact,
  type PositionTrail,
  type PositionTrailFact,
  type TrailExtent,
} from './decorate';
import type { ModeSource } from './keymap';
import { parsedDoc } from './parsed-doc';
import { isNestedEditor } from './nested-editor';

// ---- Shared per-document fact computation (hardening 5.4) ------------------
//
// All three ViewPlugins below need the same pure facts (parse → decorate →
// computeLineGuides) on every update. Each used to compute them
// independently — same asymptotics, tripled constant (the 2b baseline
// already did it twice; 5a added a third). Consolidated here into one
// computation cached by the *document* (`state.doc`, CM6's immutable `Text`
// instance): whichever plugin runs first on a given document pays the cost,
// every other consumer — and every subsequent non-doc update, where CM6
// reuses the same `Text` instance — gets the cached result. A WeakMap keyed
// on the `Text` itself (not a doc string) means no invalidation logic and
// no leak: entries die with the document they describe. Sound because the
// facts depend on nothing but the document text — mode gating and
// markerVisibility filtering both happen in the consumers, after this.
interface DocFacts {
  readonly facts: readonly LineDecorationFact[];
  readonly factsByLine: ReadonlyMap<number, LineDecorationFact>;
  readonly guides: readonly LineGuideFact[];
  readonly guidesByLine: ReadonlyMap<number, LineGuideFact>;
}

const docFactsCache = new WeakMap<Text, DocFacts>();

function docFacts(state: EditorState): DocFacts {
  const cached = docFactsCache.get(state.doc);
  if (cached) return cached;
  const doc = parse(state.doc.toString());
  const facts = decorate(doc);
  const guides = computeLineGuides(doc);
  const computed: DocFacts = {
    facts,
    factsByLine: new Map(facts.map((f) => [f.lineNumber, f])),
    guides,
    guidesByLine: new Map(guides.map((g) => [g.lineNumber, g])),
  };
  docFactsCache.set(state.doc, computed);
  return computed;
}

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
    `repeating-linear-gradient(to right, var(--to-guide-color) 0 1px, transparent 1px ${UNIT}) ` +
    `calc(${depth} * ${UNIT}) 0 / ${UNIT} 100% no-repeat`
  );
}

// ---- Position indicators (hierarchy-position-indicators) -------------------
//
// The caret-derived accents ride in the SAME comma-separated background list
// as the guides above, on the same `::after`, rather than in a layer of their
// own. Not a shortcut — it's the only place left: `::before` is spoken for
// twice over (Obsidian's native blockquote bar owns it natively, escalated-
// selection chrome owns ours), and appending a real DOM child to a plain
// `.cm-line` is the thing that pegged the renderer at 100% CPU (see the module
// doc comment). Sharing the list costs zero extra DOM nodes and lets an
// accented level REPLACE its plain layer instead of stacking on top of it.
//
// Both variables resolve from the theme (styles.css declares the defaults), so
// a snippet can retune color and weight without a plugin setting.
const ACCENT = 'var(--to-decor-accent)';
const TRAIL_WIDTH = 'var(--to-trail-width)';

/**
 * One accented vertical segment at `depth`. `'full'` covers the row; `'top'`
 * arrives from the row's top and stops at the MARKER on that row, so the path
 * visibly meets the thing it is pointing at.
 *
 * Where that marker is cannot be written as a CSS length. Measured
 * (docs/research/14, finding 5): a marker's top edge sits at its line's
 * CONTENT-box top, so its center is `padding-top + iconSize / 2` down from the
 * row — and `padding-top` is Obsidian's, varying by kind (0 on a paragraph,
 * 16px on a heading) with no way to read it into a `calc`. A fixed 50% of the
 * row is a different anchor entirely: it overshoots the paragraph marker by
 * ~5px and undershoots the heading one.
 *
 * So `MarginCompensation` measures the icon's own center per row and publishes
 * `--to-accent-stop` — the same "read the native value live, never assume it"
 * rule `nativeMarginBasePx` and the table widget's padding already follow. The
 * `50%` fallback only applies on a row with no icon to measure (a list item, or
 * one whose marker `markerVisibility` hides).
 *
 * A previous attempt spent this on CSS instead: draw from the `content-box`
 * origin, with the `::after` inheriting the line's `padding-top` to establish
 * it. That put the segment's END in the right place and its START in the wrong
 * one — the layer began at the content box, so the row's whole padding region
 * went unaccented and the path visibly broke into two pieces with a gap the
 * size of that padding. Which is why the gap "varied": it WAS the padding.
 */
function accentLayer(depth: number, extent: TrailExtent): string {
  const gradient = `linear-gradient(to right, ${ACCENT} 0 ${TRAIL_WIDTH}, transparent ${TRAIL_WIDTH})`;
  const height = extent === 'full' ? '100%' : 'var(--to-accent-stop, 50%)';
  return `${gradient} calc(${depth} * ${UNIT}) top / ${UNIT} ${height} no-repeat`;
}

/**
 * The full background list for one line: the caret-derived accents first
 * (topmost), then the plain guides underneath.
 *
 * A plain guide is dropped only where a `'full'` accent covers the same
 * column — a half-height accent deliberately leaves its plain layer in place,
 * so the base guide stays continuous through the row and the accent merely
 * brightens half of it. Dropping it there would punch a visible gap into a
 * guide the trail is only supposed to be highlighting.
 *
 * Nothing horizontal is ever drawn here. An earlier version linked each level
 * change with an elbow (the Logseq bullet-threading shape); since a marker is
 * centered ON its own guide column, that elbow ran straight through the
 * marker's icon on arrival. The accented ancestor marker is the junction
 * instead — see `MarkerHighlight` in decorate.ts.
 */
function guideBackground(guideDepths: readonly number[], trail?: PositionTrailFact): string {
  if (!trail) return guideDepths.map(guideLayer).join(', ');
  const accents = new Map(trail.accents.map((a) => [a.depth, a.extent]));
  const layers: string[] = [];
  for (const [depth, extent] of accents) layers.push(accentLayer(depth, extent));
  for (const depth of guideDepths) {
    if (accents.get(depth) !== 'full') layers.push(guideLayer(depth));
  }
  return layers.join(', ');
}

/** Whether a line renders the `::after` overlay at all. */
function hasOverlay(guide: LineGuideFact, trail?: PositionTrailFact): boolean {
  return guide.guideDepths.length > 0 || trail !== undefined;
}

/**
 * The PROVISIONAL POSITION the caret currently occupies, if any: the line, the
 * fact it would have once a character is typed there, and the tree that would
 * result (which the trail needs — design D4).
 *
 * The trigger is where the caret IS, not a record of the keypress that put it
 * there. `provisional-cleanup.ts` tracks the created place precisely, but
 * reaching that record from here would mean threading view state into a
 * state-derived computation — and it is unnecessary: the only ways a caret comes
 * to rest on a line with no node content are this plugin's own provisional
 * dispatch and a programmatic placement `content-space-caret` deliberately does
 * not correct. Both get the same truthful rendering, and the decoration
 * disappearing when the caret leaves is then a property of the computation
 * rather than a second mechanism to keep in step with undo-on-abandon.
 *
 * Cached per `EditorState` for the same reason the trail is, and gated first on
 * the cheap tests (one empty cursor, on a line that is blank) so a caret in
 * content space — every caret, almost always — costs a `trim()`.
 */
interface Provisional {
  readonly line: number;
  readonly fact: LineDecorationFact;
  readonly doc: OutlineDoc;
}

const provisionalCache = new WeakMap<EditorState, Provisional | null>();

function provisionalAt(state: EditorState): Provisional | null {
  const cached = provisionalCache.get(state);
  if (cached !== undefined) return cached;
  const computed = computeProvisional(state);
  provisionalCache.set(state, computed);
  return computed;
}

function computeProvisional(state: EditorState): Provisional | null {
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length !== 1) return null;
  const line = state.doc.lineAt(sel.head);
  if (line.text.trim() !== '') return null;
  const probe = materializeProbe(state.doc.toString(), line.number - 1, sel.head - line.from);
  if (probe === null) return null;
  const doc = parse(probe);
  const fact = decorate(doc).find((f) => f.lineNumber === line.number - 1);
  return fact ? { line: line.number - 1, fact, doc } : null;
}

/**
 * The caret-derived trail for the current state, or an empty one.
 *
 * Suppressed entirely while every non-empty range is an escalated cover:
 * block-selection chrome already answers "where am I", and stacking an accent
 * trail on top of a filled rectangle just makes both harder to read.
 */
function computeTrail(state: EditorState, modes: DecorationSource): PositionTrail {
  if (modes.markerHighlight === 'off' && modes.guideHighlight === 'off') {
    return EMPTY_POSITION_TRAIL;
  }
  if (allRangesCovered(state)) return EMPTY_POSITION_TRAIL;
  // On a provisional position the trail describes the node the position stands
  // for. Against the real document a caret on a gap line resolves to the node
  // that OWNS the gap — deliberately, so the trail does not blink off while the
  // caret crosses a blank line between blocks — but for a position opened at the
  // end of a paragraph that is the new node's SIBLING, and accenting it reads as
  // "you are inside this", which is the opposite of true.
  const provisional = provisionalAt(state);
  const doc = provisional ? provisional.doc : parsedDoc(state.doc).doc;
  // The HEAD of the PRIMARY range: head so the trail follows where the user is
  // steering, primary so multiple cursors draw one trail rather than N
  // competing ones.
  const head = state.selection.main.head;
  const cursorLine = state.doc.lineAt(head).number - 1;
  return computePositionTrail(doc, cursorLine, {
    guides: modes.guideHighlight,
    markers: modes.markerHighlight,
  });
}

/**
 * Two consumers need this on the same render — `computeDecorations` for the
 * declarative line decorations, `MarginCompensation` for the widget DOM patch —
 * and both read the same `view.state`, so the walk ran twice per caret move.
 * Measured on this tree: 2.5µs at 110 lines, 16µs at 1.1k, 66µs at 5.2k. Small
 * against a frame, but it is the same "same asymptotics, doubled constant"
 * `docFacts` was consolidated for, and it costs one WeakMap to stop paying.
 *
 * Keyed on the `EditorState` ITSELF, not on a decomposition of it. A CM6 state
 * is immutable, so one identity fixes the document AND the selection together —
 * there is no compound key to get wrong, and a future dependency on some other
 * part of the state (a second selection range, a facet) stays keyed for free
 * rather than silently going stale. Keying on `(doc, main.head, …, whether the
 * selection is covered)` would also have to recompute `allRangesCovered` just
 * to build the key, giving back part of the saving.
 *
 * The settings are checked separately because they live outside the state, and
 * that check is DEFENSIVE rather than load-bearing today: `forceRedraw`
 * (main.ts) applies a settings change by dispatching a cursor transaction, so
 * the next render always arrives on a new state and misses this cache anyway.
 * Deliberately kept, and deliberately noted as untested — deleting it fails
 * nothing in the suite, precisely because `forceRedraw` makes the case
 * unreachable. It stops being unreachable the moment `forceRedraw` is replaced
 * by a real refresh API, which docs/research/12 explicitly contemplates; the
 * three lines are the difference between that swap being safe and it silently
 * serving a stale trail.
 *
 * A WeakMap rather than a single slot, mirroring `docFactsCache`: entries die
 * with the state they describe, and two editors alternating do not evict each
 * other's.
 */
interface TrailCacheEntry {
  readonly guides: GuideHighlight;
  readonly markers: MarkerHighlight;
  readonly trail: PositionTrail;
}

const trailCache = new WeakMap<EditorState, TrailCacheEntry>();

function positionTrail(state: EditorState, modes: DecorationSource): PositionTrail {
  const cached = trailCache.get(state);
  if (
    cached &&
    cached.guides === modes.guideHighlight &&
    cached.markers === modes.markerHighlight
  ) {
    return cached.trail;
  }
  const trail = computeTrail(state, modes);
  trailCache.set(state, {
    guides: modes.guideHighlight,
    markers: modes.markerHighlight,
    trail,
  });
  return trail;
}

/**
 * The classes that accent a marker. Two per role, not one, because the two
 * markers are entirely different DOM: our own icon element (whose `color` the
 * SVG's `currentColor` follows) versus Obsidian's native list bullet (a
 * `.list-bullet` span we only ever restyle, never replace — the same "target
 * the existing native element" discipline `obsidian-outliner` uses). Naming
 * which one a line carries keeps the CSS explicit about which mechanism it is
 * reaching for.
 *
 * Current and ancestor are also kept apart, even though styles.css gives them
 * the same accent today: the DOM then says which role a marker is playing, so
 * a snippet can tell them apart and an assertion can name one without
 * accidentally matching the other.
 *
 * The "first line only" half of the contract needs no guard here: both
 * `currentLine` and every `ancestorLines` key ARE nodes' own first lines
 * (`computePositionTrail`), so a continuation or gap line can never match. A
 * redundant `isFirstLine` check was tried and removed — a mutation that deleted
 * it changed no test's outcome, which is the definition of logic that isn't
 * doing anything.
 */
const CURRENT_MARKER_CLASS = 'to-decor-current';
const CURRENT_NATIVE_MARKER_CLASS = 'to-decor-current-native';
const ANCESTOR_MARKER_CLASS = 'to-decor-ancestor';
const ANCESTOR_NATIVE_MARKER_CLASS = 'to-decor-ancestor-native';

/**
 * Both roles now answer to one setting, so only the current node needs a gate
 * here: `ancestorLines` is populated by `computePositionTrail` only under
 * `markers: 'lineage'`, which already encodes "and the ancestors too". A node
 * is never both roles, so the two can never collide on one line.
 */
function markerClasses(trail: PositionTrail, lineNumber: number, markerAccent: boolean): string {
  if (markerAccent && trail.currentLine === lineNumber) {
    return trail.currentIsListItem
      ? ` ${CURRENT_NATIVE_MARKER_CLASS}`
      : ` ${CURRENT_MARKER_CLASS}`;
  }
  const ancestorIsListItem = trail.ancestorLines.get(lineNumber);
  if (ancestorIsListItem === undefined) return '';
  return ancestorIsListItem
    ? ` ${ANCESTOR_NATIVE_MARKER_CLASS}`
    : ` ${ANCESTOR_MARKER_CLASS}`;
}

// ---- Block markers (Experiment 5a: icon markers) ---------------------------
//
// See docs/research/10-experiment-5-block-markers.md (Experiment 5/5a). A
// small, distinct, self-drawn SVG icon per node kind, rendered on a node's
// own first line only (never a list item — the native bullet/number already
// does that job, same exclusion guides already use).
//
// Placement exploration (post-review) settled on the icon horizontally
// CENTERED on the guide-line column, with a marker gutter reserved
// additively so text still clears the icon (the other two candidates tried —
// icon's own left edge at the column, and no gutter with the icon's own
// right edge at the column — read worse in a real vault and were dropped).
// `MarkerVisibility` itself lives in mode-registry.ts (not here), so that
// pure, Obsidian-free module can keep defining PluginData without importing
// this one (which pulls in the real `obsidian` package for
// `editorInfoField`).
export type { MarkerVisibility } from './mode-registry';
import type { MarkerVisibility } from './mode-registry';

/** Anything that can supply decorations needs to say which notes are in
 * outline mode (ModeSource) and which nodes get a marker at all — a real
 * Obsidian setting, read fresh on every recompute so switching it live (no
 * rebuild) takes effect on the very next transaction, the same way toggling
 * outline mode already does (see main.ts's refreshDecorations). */
export interface DecorationSource extends ModeSource {
  readonly markerVisibility: MarkerVisibility;
  /** Which markers to accent (hierarchy-position-indicators). Read fresh per
   * recompute, same as the settings above. */
  readonly markerHighlight: MarkerHighlight;
  /** How much of the ancestor guides to accent, if any. */
  readonly guideHighlight: GuideHighlight;
}

const EMPTY_POSITION_TRAIL: PositionTrail = {
  currentLine: null,
  currentIsListItem: false,
  ancestorLines: new Map(),
  byLine: new Map(),
};

/**
 * Whether a given node's marker should render at all (Experiment 5a
 * follow-up — see `MarkerVisibility`'s own doc comment in mode-registry.ts
 * for the reasoning). Deliberately does NOT touch the marker gutter
 * reservation (padding-left/margin-left) at all — that stays reserved
 * uniformly regardless of this setting, so hiding some markers never
 * reflows text/shifts indentation; only whether the icon itself is drawn
 * in that already-reserved space changes.
 */
function shouldShowMarker(fact: LineDecorationFact, visibility: MarkerVisibility): boolean {
  switch (visibility) {
    case 'all':
      return true;
    case 'with-children':
      return fact.hasChildren;
    case 'headings-and-paragraphs':
      // The only two marker-eligible kinds that can ever have children in
      // this tree model — atoms are leaves by construction (see hasChildren
      // itself), so `!fact.isAtom` is exactly "heading or paragraph."
      return !fact.isAtom;
  }
}

const MARKER_GUTTER_REM = 1.25;
const MARKER_ICON_REM = 0.85;
// The actual CSS length emitted per line (see lineDecoration()) — a single
// source of truth the static CSS rules, the live margin overrides, AND the
// marker's own left-offset calc all agree with. Every non-list-item line
// reserves this gutter unconditionally (see lineDecoration()'s own
// reasoning for why list items don't).
const MARKER_GUTTER_CSS = `${MARKER_GUTTER_REM}rem`;
const MARKER_ICON_CSS = `${MARKER_ICON_REM}rem`;

/**
 * Where a marker icon's own LEFT edge should sit, given `targetRelExpr` — a
 * CSS length expression for "the shared target column (where the guide for
 * this depth renders), relative to the box the marker is about to become a
 * child of" (see call sites: block/atom/widget-atom each derive this from
 * their own already-established `--to-own-shift`-style formula, so the
 * marker automatically stays correct if those formulas ever change). Used
 * only by the widget-atom mechanism below (table/callout/hr/html) — the
 * plain-line mechanism uses `MARKER_LEFT_SHIFT_EXPR` instead (see its own
 * doc comment for why the two need different math). Centers the icon on the
 * target column (the placement exploration's winner — see the module doc
 * comment above).
 */
function markerAnchorLeftExpr(targetRelExpr: string): string {
  return `calc(${targetRelExpr} - (${MARKER_ICON_CSS} / 2))`;
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
 * `iconSize * 0.5 - gutter` (icon centered on the column). Worked through
 * concretely for both block (padding-shifted text, unshifted box) and
 * atom-plain (margin-shifted box, unshifted-relative-to-box text) — the
 * depth terms cancel identically in both cases, confirmed by hand before
 * relying on it here (see the git history of this comment for the full
 * derivation).
 */
const MARKER_LEFT_SHIFT_EXPR = `calc(${MARKER_ICON_CSS} * 0.5 - ${MARKER_GUTTER_CSS})`;

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
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
  // `aria-hidden`: the marker is purely decorative chrome (the node's kind
  // is already in the accessible text itself — heading level, code fence,
  // etc.), so screen readers should skip it entirely (hardening 5.6).
  const svg = svgEl('svg', {
    viewBox: '0 0 16 16',
    width: '100%',
    height: '100%',
    'aria-hidden': 'true',
  });
  const children: SVGElement[] = [];

  switch (kind) {
    case 'heading':
      // A blocky "H": two vertical bars + a crossbar.
      children.push(
        svgEl('rect', { x: '3', y: '2', width: '2', height: '12', fill: 'currentColor' }),
        svgEl('rect', { x: '11', y: '2', width: '2', height: '12', fill: 'currentColor' }),
        svgEl('rect', { x: '3', y: '7', width: '10', height: '2', fill: 'currentColor' }),
      );
      break;
    case 'paragraph':
      // Three text lines, the last one shorter.
      children.push(
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '4', x2: '14', y2: '4' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '8', x2: '14', y2: '8' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '12', x2: '9', y2: '12' }),
      );
      break;
    case 'code':
      // "</>"
      children.push(
        svgEl('polyline', { ...STROKE_ATTRS, points: '6,3 2,8 6,13' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '9.5', y1: '2', x2: '6.5', y2: '14' }),
        svgEl('polyline', { ...STROKE_ATTRS, points: '10,3 14,8 10,13' }),
      );
      break;
    case 'table':
      // 2x2 grid.
      children.push(
        svgEl('rect', { ...STROKE_ATTRS, x: '2', y: '2', width: '12', height: '12', rx: '1' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '2', y1: '8', x2: '14', y2: '8' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '8', y1: '2', x2: '8', y2: '14' }),
      );
      break;
    case 'callout':
      // Filled alert circle with an "!" bar.
      children.push(
        svgEl('circle', { cx: '8', cy: '8', r: '6', fill: 'currentColor' }),
        svgEl('rect', { x: '7', y: '4', width: '2', height: '5', fill: 'var(--background-primary)' }),
        svgEl('rect', { x: '7', y: '10', width: '2', height: '2', fill: 'var(--background-primary)' }),
      );
      break;
    case 'quote':
      // Two opening-quote marks.
      children.push(
        svgEl('circle', { cx: '5', cy: '5', r: '2', fill: 'currentColor' }),
        svgEl('rect', { x: '4', y: '5', width: '2', height: '4', fill: 'currentColor' }),
        svgEl('circle', { cx: '11', cy: '5', r: '2', fill: 'currentColor' }),
        svgEl('rect', { x: '10', y: '5', width: '2', height: '4', fill: 'currentColor' }),
      );
      break;
    case 'html':
      // An outlined tag/document shape with a folded corner.
      children.push(
        svgEl('rect', { ...STROKE_ATTRS, x: '3', y: '2', width: '10', height: '12', rx: '1' }),
        svgEl('line', { ...STROKE_ATTRS, x1: '9', y1: '2', x2: '13', y2: '6' }),
      );
      break;
    case 'hr':
      // A single bold horizontal bar.
      children.push(svgEl('rect', { x: '2', y: '7', width: '12', height: '2', fill: 'currentColor' }));
      break;
    default:
      // Unreachable for list-item (excluded by every caller) — a small dot
      // keeps this exhaustive-in-spirit without dead code paths elsewhere.
      children.push(svgEl('circle', { cx: '8', cy: '8', r: '2', fill: 'currentColor' }));
  }

  // Safe DOM insertion (see the no-restricted-syntax guard in
  // eslint.config.js, hardening 5.2): `svg` is detached — built here, never
  // queried from the live document — so no CM6-owned or Obsidian-owned
  // subtree is being mutated.
  // eslint-disable-next-line no-restricted-syntax -- detached DOM: built here, never mounted by this code
  svg.append(...children);
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
 *
 * Everything but `left` is a fixed constant, moved into the
 * `.to-decor-marker-icon`/`.to-decor-marker-icon--widget` CSS classes
 * (styles.css) per `eslint-plugin-obsidianmd`'s `no-static-styles-assignment`
 * rule — `left` is the only value that genuinely varies per instance
 * (depth/kind-dependent), so it's the only one JS still sets, via
 * `setCssProps` onto the `--to-marker-left` custom property the class
 * references.
 */
function applyMarkerLeft(el: HTMLElement, leftExpr: string): void {
  el.setCssProps({ '--to-marker-left': leftExpr });
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
    const wrapper = createSpan({ cls: 'to-decor-marker-icon' });
    applyMarkerLeft(wrapper, this.leftShiftExpr);
    // Safe DOM insertion (see the no-restricted-syntax guard in
    // eslint.config.js, hardening 5.2): `wrapper` is detached at this point
    // — CM6 itself mounts a widget's toDOM() result through its own
    // supported insertion path, which is the whole reason plain-line
    // markers use Decoration.widget instead of direct DOM injection.
    // eslint-disable-next-line no-restricted-syntax -- detached DOM: CM6 mounts toDOM()'s result via its own supported path
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

  const totalLines = state.doc.lines;
  const builder = new RangeSetBuilder<Decoration>();
  // The provisional fact joins the document's own, in line order — a marker on
  // the caret's position is not a special case, it is the marker the line it
  // stands for would carry, under the same eligibility and visibility gates. A
  // continuation position is not a first line, so it gets none, exactly as the
  // real continuation line it is about to become gets none.
  const provisional = provisionalAt(state);
  const facts = provisional
    ? [...docFacts(state).facts, provisional.fact].sort((a, b) => a.lineNumber - b.lineNumber)
    : docFacts(state).facts;
  for (const fact of facts) {
    // List items keep their fully native marker, untouched (same exclusion
    // guides already use); continuation lines never repeat the marker. The
    // same predicate gates the widget path (see isMarkerEligible), so the
    // two can't disagree about which lines may carry one.
    if (!isMarkerEligible(fact)) continue;
    // Widget-replaced atoms have no plain `.cm-line` for a widget decoration
    // to attach to — MarginCompensation injects their marker directly.
    if (WIDGET_ATOM_KINDS.has(fact.kind)) continue;
    if (!shouldShowMarker(fact, modes.markerVisibility)) continue;
    if (fact.lineNumber >= totalLines) continue; // stale fact past a shrunk doc

    const from = state.doc.line(fact.lineNumber + 1).from; // CM6 lines are 1-indexed
    builder.add(
      from,
      from,
      Decoration.widget({ widget: new MarkerWidget(fact.kind, MARKER_LEFT_SHIFT_EXPR), side: -1 }),
    );
  }
  return builder.finish();
}

/**
 * Own-shift expression (units of `--to-decor-unit`, plus the marker gutter
 * where applicable): how far this line's own box has been shifted right by
 * its own margin-left/padding-left — the exact compensation a leftward-
 * reaching overlay (a guide, or escalated-selection chrome, below) needs to
 * widen its box by to reach a shallower ancestor's column (see the doc
 * comment above `guideLayer`). `'0px'` means the box isn't shifted at all
 * (block lines: padding-left never moves the box). Static/formula-based —
 * NOT the more precise, live-measured value `MarginCompensation` computes
 * per widget atom (which additionally corrects for native padding); callers
 * needing that precision use their own value instead of this one.
 */
function plainOwnShiftExpr(fact: LineDecorationFact): string {
  if (fact.isListItem) {
    // List items get no marker gutter (native bullet/number only).
    return fact.supplementalDepth > 0 ? `calc(${fact.supplementalDepth} * ${UNIT})` : '0px';
  }
  if (fact.isAtom) {
    // Every non-list line reserves the marker gutter, so the box is always
    // shifted by at least the gutter, even at depth 0.
    return `calc(${fact.depth} * ${UNIT} + var(--to-marker-gutter, 0px))`;
  }
  return '0px'; // padding-left never shifts a block line's own box
}

function lineDecoration(
  fact: LineDecorationFact,
  guide: LineGuideFact,
  trail: PositionTrail,
  markerAccent: boolean,
): Decoration {
  const styles: string[] = [];
  let cls: string;

  if (fact.isListItem) {
    cls = 'to-decor-list';
    styles.push(`--to-supp-depth: ${fact.supplementalDepth}`);
  } else if (fact.isAtom) {
    cls = 'to-decor-atom';
    styles.push(`--to-depth: ${fact.depth}`);
    styles.push(`--to-marker-gutter: ${MARKER_GUTTER_CSS}`);
  } else {
    cls = 'to-decor-block';
    styles.push(`--to-depth: ${fact.depth}`);
    styles.push(`--to-marker-gutter: ${MARKER_GUTTER_CSS}`);
  }

  cls += markerClasses(trail, fact.lineNumber, markerAccent);

  const lineTrail = trail.byLine.get(fact.lineNumber);
  if (hasOverlay(guide, lineTrail)) {
    cls += ' to-decor-guides';
    styles.push(`--to-guides: ${guideBackground(guide.guideDepths, lineTrail)}`);
    styles.push(`--to-own-shift: ${plainOwnShiftExpr(fact)}`);
  }

  return Decoration.line({ class: cls, attributes: { style: styles.join('; ') } });
}

// A blank trailingGap line carrying a guide (see computeLineGuides's doc
// comment) has no decorate() fact at all — no depth, no kind, nothing to
// indent — so it gets a minimal decoration with just the guide class/style,
// not the full lineDecoration() treatment. A trail accent can land on such a
// line too (a path segment passing through the gap between two blocks), so the
// background is built from both sources here as well.
function gapLineDecoration(guide: LineGuideFact, lineTrail?: PositionTrailFact): Decoration {
  return Decoration.line({
    class: 'to-decor-guides',
    attributes: { style: `--to-guides: ${guideBackground(guide.guideDepths, lineTrail)}` },
  });
}

function computeDecorations(state: EditorState, modes: DecorationSource): DecorationSet {
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return Decoration.none;

  // computeLineGuides is a strict superset of decorate() by line coverage
  // (every line decorate() covers, plus gap-only lines) — iterate it as
  // the primary sequence (still ascending by lineNumber, required by
  // RangeSetBuilder) and look up the matching decorate() fact by line
  // number instead of assuming index alignment, since gap lines have no
  // corresponding entry there at all.
  const { factsByLine, guides } = docFacts(state);
  const trail = positionTrail(state, modes);
  const provisional = provisionalAt(state);
  const totalLines = state.doc.lines;
  const builder = new RangeSetBuilder<Decoration>();
  for (const guide of guides) {
    if (guide.lineNumber >= totalLines) continue; // stale fact past a shrunk doc
    const from = state.doc.line(guide.lineNumber + 1).from; // CM6 lines are 1-indexed
    const lineTrail = trail.byLine.get(guide.lineNumber);
    // The caret's own provisional line takes the full treatment, from the fact
    // it would have once a character lands there. Every OTHER gap line keeps the
    // guide-only decoration: this layer renders where the user currently is, not
    // every blank line in the document.
    const fact =
      provisional && provisional.line === guide.lineNumber
        ? provisional.fact
        : factsByLine.get(guide.lineNumber);
    if (guide.isGapLine && !fact) {
      if (!hasOverlay(guide, lineTrail)) continue; // nothing to draw
      builder.add(from, from, gapLineDecoration(guide, lineTrail));
      continue;
    }
    if (!fact) continue; // decorate()/computeLineGuides walks are in sync; defensive only
    builder.add(from, from, lineDecoration(fact, guide, trail, modes.markerHighlight !== 'off'));
  }
  return builder.finish();
}

// ---- Escalated-selection chrome (selection-visual-treatment) ---------------
//
// docs/research/13's "Escalated-selection visual treatment": when the
// current selection covers a whole node/subtree (per escalate.ts's
// `coveredSubtreeRoots` — a stateless, geometric query, not a flag threaded
// from the transaction filter; see design.md), every line that cover spans
// gets an additional class so it reads as "this whole node is selected,"
// not just a wider character-level highlight. Purely additive: the class
// composes with whatever `lineDecoration`/`gapLineDecoration` already put on
// the same line (CM6 merges same-position line decorations across separate
// providers), and this never touches the selection itself.
export const SELECTED_NODE_CLASS = 'to-decor-node-selected';

// Set on `view.dom` (the outer `.cm-editor`) whenever `allRangesCovered`
// holds — styles.css uses it to suppress the native character-level
// `::selection` highlight, so it doesn't visually compete with the chrome
// above (a real finding from user review: showing both looked confusing).
export const BLOCK_SELECTING_CLASS = 'to-decor-block-selecting';

/**
 * Keys that produce a `keydown` on their own but cannot do anything on their
 * own — pressing and holding Cmd, or tapping Shift, is not an attempt to act
 * on the selection.
 *
 * `onDocumentKeyDown` refocuses the editor before it knows whether a key
 * matched anything, because ordinary typing needs the editor focused for the
 * browser's own later `beforeinput` to land there. For a bare modifier that
 * refocus is pure loss: it undoes the blur that keeps a block selection
 * looking like a block selection, so the caret reappears — on the covered
 * subtree's own trailing gap line, since that is where a cover ends — and
 * Live Preview reveals raw markdown again, with nothing to put it back (the
 * blur in `update()` only re-fires when the SELECTION changes, and holding a
 * modifier changes nothing). Reported from a real vault: "press any modifier
 * key, the block selection stays but a blinking caret appears at the last
 * line of the selection, plus the raw formatting shows".
 *
 * Bailing here does not cost the combinations those modifiers exist for:
 * Cmd+A sends its own `keydown` for `a` with `metaKey` set, which is not in
 * this set and so refocuses and replays exactly as before.
 */
/**
 * Whether block-selection mode's key path should decline to focus the editor.
 *
 * A NARROW exclusion, and narrow deliberately. The obvious generalisation — a
 * positive test for "will this produce input" — was tried and reverted: it
 * breaks every command the host handles ABOVE CodeMirror's keymap, undo being
 * the measured case. `runScopeHandlers` does not claim `Mod+Z`, so it reaches
 * the unmatched path, and declining to focus there drops the keystroke
 * entirely — an edit made over a block selection could no longer be undone.
 * Guessing which chords the host owns is not something this layer can do.
 *
 * So the rule is: focus by default, and exclude only what is MEASURED not to
 * need it. Copy qualifies — the platform reads it off the DOM selection, which
 * survives the blur; measured on a covered selection while blurred,
 * `getSelection().toString()` is the covered text. Cut and paste do not: both
 * are delivered as events to the focused editable.
 *
 * KNOWN LIMITATION, recorded rather than papered over: a key that produces
 * neither input nor a selection change still focuses, and nothing re-runs the
 * focus policy without a `selectionSet`, so the editor sits focused over an
 * exact cover until the user acts again. Escape was the suspected instance and
 * is NOT one — measured, CodeMirror's `simplifySelection` claims it, collapses
 * the cover and leaves the mode cleanly. What remains are inert keys such as
 * function keys, which cost a stale-looking frame and nothing else.
 */
function declinesFocus(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key === 'c';
}

const MODIFIER_ONLY_KEYS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
]);

function offsetToLinePos(doc: Text, offset: number): LinePos {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, ch: offset - line.from };
}

/**
 * Every physical line (0-based) covered by an escalated-selection-cover
 * range in the current selection, mapped to the CSS expression for that
 * cover's ROOT column — shared by the plain-`.cm-line` path
 * (`computeSelectionDecorations`, below) and the widget-atom DOM-patch path
 * (`MarginCompensation.apply`), the same declarative/imperative split every
 * other decoration in this module already uses. Not cached: unlike
 * `docFacts` (keyed on the doc `Text` alone), this also depends on the
 * current selection, which changes far more often than the document —
 * caching it would need a compound key for no measured benefit (see
 * design.md's Risks section).
 *
 * The root's column, not each line's own: a covered range's whole subtree
 * should read as ONE rectangle bounded on the left by the covered ROOT's own
 * column — e.g. selecting an H3 section highlights from that H3's own guide
 * column all the way to the right edge, INCLUDING under any more-indented
 * descendant (a nested list, a code fence, a table) — never each line's own
 * (deeper) indentation, which would leave the space between the root's
 * column and a descendant's own narrower box untinted (the "no block-
 * selection background under the indentation" gap). The root's own fact is
 * looked up at the cover's start line — exactly the root's own first line,
 * by construction of `coveredSubtreeRoots`/`siblingRunCover`. A list-item
 * root has no additive column of its own (list guides are deferred entirely
 * to native rendering, same as `computeLineGuides`'s own precedent) — its
 * target is just its own line's shift, i.e. the rectangle starts at the
 * root's own box with no further leftward reach.
 */
function selectedLineRootTargets(state: EditorState): ReadonlyMap<number, string> {
  const { doc } = parsedDoc(state.doc);
  const { factsByLine } = docFacts(state);
  const totalLines = state.doc.lines;
  const targets = new Map<number, string>();
  for (const selRange of state.selection.ranges) {
    if (selRange.empty) continue; // cursors never get chrome
    const lineRange: LineRange = {
      anchor: offsetToLinePos(state.doc, selRange.anchor),
      head: offsetToLinePos(state.doc, selRange.head),
    };
    const forest = coveredForestOf(doc, lineRange);
    if (!forest) continue;
    const hiLine = Math.min(Math.max(lineRange.anchor.line, lineRange.head.line), totalLines - 1);

    // PER ROOT, not once for the whole range (`selection-as-subtree-set`): a
    // cover's roots may sit at different depths, and they run DEEPEST-FIRST
    // (each root is the subtree successor of the last, which only ever moves
    // outward). Anchoring every line at the cover's start line — the old
    // behavior — would therefore have pinned a whole mixed-depth selection
    // to its deepest root's column, indenting the shallower subtrees below
    // it. Roots tile the span contiguously, so walking them covers every
    // line exactly once with no gaps.
    for (const root of forest.roots) {
      // `root.cover` comes from the forest walk, which already held a
      // start-line index — deriving it here per root (`nodeStartLine` plus
      // `subtreeCoverOf`, two full traversals each) made every decoration
      // recomputation Θ(n²) in the root count, worst exactly where covers are
      // largest (a whole-document ladder rung).
      const rootLine = root.cover.start.line;
      const rootFact = factsByLine.get(rootLine);
      if (!rootFact) continue; // a root's own first line always has a fact; defensive only
      // One level further left than the root's own column — the PARENT's own
      // guide column, not the root's — so the chrome clears the root's own
      // marker icon (centered ON the root's column) instead of running
      // through its middle. Matches Logseq's own block-selection convention
      // (confirmed by user review): the highlighted rectangle is wider on the
      // left than the block's own indentation, reaching the next level out.
      // A top-level root (depth 0) has no shallower level to reach for the
      // same reason a guide never renders at a negative depth — subtracting
      // one full UNIT anyway keeps the same "one level out" amount uniform
      // rather than clamping to 0 (which would put the edge right back at the
      // root's own column, reintroducing the exact problem this fixes) and
      // stays within the leftward-overflow margin the guide layer's own doc
      // comment already confirmed is never clipped.
      const rootTarget = rootFact.isListItem
        ? `calc(${plainOwnShiftExpr(rootFact)} - ${UNIT})`
        : `calc((${rootFact.depth} - 1) * ${UNIT})`;
      const rootEnd = Math.min(root.cover.end.line, hiLine);
      for (let line = rootLine; line <= rootEnd; line++) targets.set(line, rootTarget);
    }
  }
  return targets;
}

/**
 * True when the current selection has at least one non-empty range and
 * EVERY non-empty range is an escalated-selection cover — i.e. the whole
 * selection reads as "block-selected," not a mix of block and character
 * selection. Drives suppressing the native character-level highlight
 * (styles.css), so the two don't visually overlap and compete. Per-range
 * suppression isn't attempted: a genuinely mixed selection (one covered
 * range, one plain-content range) can't arise through the real transaction
 * filter — the uniform multi-range rule (node-selection-enforcement) forces
 * every range to at least its own node's cover once any range escalates —
 * so the only way to reach a mixed state is a raw, atypical programmatic
 * dispatch bypassing the filter, which this all-or-nothing check simply
 * doesn't suppress for (native highlight stays visible there, same as any
 * non-covered selection).
 */
function allRangesCovered(state: EditorState): boolean {
  const { doc } = parsedDoc(state.doc);
  let sawNonEmpty = false;
  for (const selRange of state.selection.ranges) {
    if (selRange.empty) continue;
    sawNonEmpty = true;
    const lineRange: LineRange = {
      anchor: offsetToLinePos(state.doc, selRange.anchor),
      head: offsetToLinePos(state.doc, selRange.head),
    };
    if (!coveredSubtreeRoots(doc, lineRange)) return false;
  }
  return sawNonEmpty;
}

function computeSelectionDecorations(state: EditorState, modes: DecorationSource): DecorationSet {
  const path = state.field(editorInfoField, false)?.file?.path;
  if (!path || !modes.isOutline(path)) return Decoration.none;

  const totalLines = state.doc.lines;
  const { factsByLine } = docFacts(state);
  const builder = new RangeSetBuilder<Decoration>();
  const targets = Array.from(selectedLineRootTargets(state).entries()).sort((a, b) => a[0] - b[0]);
  for (const [line, rootTarget] of targets) {
    if (line >= totalLines) continue; // stale, defensive only
    const from = state.doc.line(line + 1).from; // CM6 lines are 1-indexed
    // A gap line has no fact (no shift of its own — a blank line is never
    // margin/padding-shifted), same fallback `gapLineDecoration` relies on.
    const ownShift = factsByLine.get(line) ? plainOwnShiftExpr(factsByLine.get(line)!) : '0px';
    const style = `--to-selected-left: calc(${rootTarget} - (${ownShift}))`;
    builder.add(from, from, Decoration.line({ class: SELECTED_NODE_CLASS, attributes: { style } }));
  }
  return builder.finish();
}

// Every element that stands in for a WHOLE editor line instead of the
// plain `.cm-line` CM6 would otherwise render — whatever node kind that
// line's text happens to parse as.
//
// This is deliberately STRUCTURAL rather than a list of Obsidian's own
// classes. The previous version enumerated `.cm-embed-block, .cm-line.hr`,
// which covers the four atom kinds (table/callout/raw HTML carry
// `cm-embed-block`; the rule oddly carries `cm-line` but is widget-rendered
// all the same) and silently covers nothing else. A wiki embed is rendered
// as `internal-embed markdown-embed` with no `cm-embed-block` class at all,
// so it matched ZERO elements and was never decorated — measured live, not
// inferred (see the decorate-widget-rendered-lines change). Adding
// `.markdown-embed` to the list would just reset the same trap for the next
// widget-rendered kind, so the question asked here is the one that actually
// matters: does this element take the place of a line?
//
// A line-level replacement is a direct child of `.cm-content`; anything
// Obsidian renders INSIDE a line (an inline embed among a paragraph's text,
// an embed in a list item) is not, and must be left alone — its host line
// is a real `.cm-line` that already got its decoration declaratively, so
// patching the nested element too would shift it a second time. The
// stylesheet already encodes this same invariant via its `.cm-content > …`
// child combinators, so JS and CSS agree by construction rather than by
// coincidence.
//
// The exclusions are CM6's own scaffolding, which is also mounted as direct
// children: `.cm-gap` (viewport-virtualization placeholders, present only
// in documents long enough to be virtualized) and `.cm-widgetBuffer` (cursor
// -placement helpers around widgets). Neither renders a line.
const WIDGET_LINE_SELECTOR =
  ':scope > *:not(.cm-line):not(.cm-gap):not(.cm-widgetBuffer), :scope > .cm-line.hr';

// Plain `.cm-line`s that carry one of our own margin-based decorations
// (atoms, list items) — needs the SAME native-base compensation as
// widgets, for the same reason (see MarginCompensation's doc comment).
const PLAIN_MARGIN_SELECTOR = '.cm-line.to-decor-atom, .cm-line.to-decor-list';

/**
 * The rightward shift a widget-replaced line's own box needs, from OUR
 * contribution alone — the single formula every consumer derives from, so
 * the margin, the marker's target column, the guide's leftward widening and
 * the selection chrome's left edge can never silently disagree.
 *
 * Deliberately NOT including `nativeMarginBasePx`: that applies uniformly to
 * every line regardless of depth, so it cancels out of the *difference*
 * between any two lines' columns. It belongs on `margin-left` and nowhere
 * else (see the call site).
 *
 * The depth term is `supplementalDepth` for a list item and `depth` for
 * everything else — the same split `decorate.ts` documents and the plain-
 * line path already applies via `--to-supp-depth`/`--to-depth`. The gutter
 * term is the marker gutter for every kind EXCEPT list items, which show
 * their native bullet/number instead and reserve nothing; it is added
 * unconditionally, never gated on `markerVisibility`, so hiding a marker
 * cannot reflow text.
 *
 * `nativePaddingLeft` is whatever native left padding the element carries
 * on its own (a table's row/column drag-handle gutter, say): padding never
 * moves a box's own edge, so it only pushes the widget's *visible content*
 * further right than a same-depth line of another kind. Read live by the
 * caller, never hardcoded, and clamped at 0 so a depth-0 line can't go
 * negative.
 *
 * For an atom fact this reduces to exactly the expression this code used
 * before it was generalized past atoms — the point of extracting it rather
 * than adding a parallel branch.
 */
function widgetOwnShiftExpr(fact: LineDecorationFact, nativePaddingLeft: number): string {
  const depth = fact.isListItem ? fact.supplementalDepth : fact.depth;
  const gutter = fact.isListItem ? '0px' : MARKER_GUTTER_CSS;
  return `max(0px, calc(${depth} * ${UNIT} - ${nativePaddingLeft}px)) + ${gutter}`;
}

/**
 * Whether this line may carry a synthetic marker at all, before the
 * `markerVisibility` setting gets a say. Two rules, both independent of
 * rendered form, hoisted here so the plain-line path and the widget path
 * cannot disagree about them:
 *
 * - only a node's own FIRST line carries one (never a continuation line,
 *   never a blank gap line);
 * - a list item NEVER carries one — its native bullet/number already
 *   signals the node, and Experiment 1 leaves that untouched.
 *
 * The widget path could previously skip both checks and stay correct by
 * accident: an atom's widget always maps to its own first line, and an atom
 * is never a list item. Neither holds once that path admits other kinds.
 */
function isMarkerEligible(fact: LineDecorationFact): boolean {
  return fact.isFirstLine && !fact.isListItem;
}

/**
 * Injects/updates the marker icon child on a widget-replaced line's element
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
function applyWidgetMarker(el: HTMLElement, kind: NodeKind, ownShiftExpr: string): void {
  const targetRelExpr = `calc(${el.dataset.markerDepth ?? '0'} * ${UNIT} - (${ownShiftExpr}))`;
  const leftExpr = markerAnchorLeftExpr(targetRelExpr);
  const existing = el.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
  if (existing) {
    applyMarkerLeft(existing, leftExpr);
    if (existing.dataset.kind === kind) return;
    existing.remove();
  }
  const icon = createSpan({ cls: 'to-decor-marker-icon to-decor-marker-icon--widget' });
  icon.dataset.kind = kind;
  applyMarkerLeft(icon, leftExpr);
  // Safe DOM insertion: `icon` is still detached here.
  // eslint-disable-next-line no-restricted-syntax -- detached DOM: icon not yet mounted
  icon.appendChild(buildMarkerIcon(kind));
  // THE sanctioned live-DOM injection site (invariant (a), see the module
  // doc comment and the no-restricted-syntax guard in eslint.config.js):
  // `el` is a widget-replaced LINE (matched by WIDGET_LINE_SELECTOR only) —
  // an opaque subtree CM6 never re-diffs internally, which is what makes
  // this append safe where the same call on a plain `.cm-line` pegs the
  // renderer.
  //
  // For the atom kinds that subtree is Obsidian-owned and static once
  // rendered. A wiki embed is a weaker guarantee: its contents are rendered
  // by Obsidian's own markdown renderer and can re-render on their own
  // schedule (the embedded note finishes loading, or is edited elsewhere).
  // The icon is prepended to THIS element — the line-level wrapper — never
  // into the embed's inner rendered content, so an inner re-render leaves it
  // alone. If a re-render ever does clobber it the failure mode is a lost or
  // duplicated marker: the idempotence guard above (kind/position skip) is
  // the first line of defense, and the duplicate-marker e2e tests in
  // 52-block-markers-icons and 54-widget-rendered-lines the second.
  // eslint-disable-next-line no-restricted-syntax -- sanctioned widget-line injection (invariant (a), see comment above)
  el.prepend(icon);
}

function clearWidgetMarker(el: HTMLElement): void {
  el.querySelector(':scope > .to-decor-marker-icon')?.remove();
  el.classList.remove('to-decor-marker');
  delete el.dataset.markerDepth;
}

/**
 * Marks an element as one WE have patched. The patch loop's selector says
 * which elements are eligible *right now*; this says which ones actually
 * carry our state, and the two are not the same set over time.
 *
 * The gap is real and was a shipped bug: Obsidian REUSES a rendered embed's
 * element and RE-PARENTS it into a `.cm-line` when the line stops being a
 * whole-line replacement (e.g. `![[note]]` indented into `- ![[note]]`).
 * The element is then no longer a direct child of `.cm-content`, so neither
 * the patch loop nor a same-selector cleanup can see it — and it keeps our
 * inline `margin-left` forever, on top of its new host line's own
 * indentation, which is exactly the doubled indentation that was reported.
 * Cleaning up by "what did we patch" instead of "what does the selector
 * match" is what closes it, and it stays closed for any future re-parenting
 * Obsidian invents.
 */
const WIDGET_PATCHED_CLASS = 'to-decor-widget-line';

/** Removes every trace of a widget-line patch, wherever the element now is. */
function clearWidgetPatch(el: HTMLElement): void {
  el.style.removeProperty('margin-left');
  el.classList.remove('to-decor-guides');
  el.classList.remove(CURRENT_MARKER_CLASS);
  el.classList.remove(ANCESTOR_MARKER_CLASS);
  el.classList.remove(SELECTED_NODE_CLASS);
  el.classList.remove(WIDGET_PATCHED_CLASS);
  el.style.removeProperty('--to-guides');
  el.style.removeProperty('--to-own-shift');
  el.style.removeProperty('--to-selected-left');
  el.style.removeProperty('--to-selected-right');
  clearWidgetMarker(el);
}


class DecorationsPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(
    private readonly view: EditorView,
    private readonly modes: DecorationSource,
  ) {
    this.decorations = this.compute();
  }

  update(): void {
    this.decorations = this.compute();
  }

  private compute(): DecorationSet {
    if (isNestedEditor(this.view)) return Decoration.none;
    return computeDecorations(this.view.state, this.modes);
  }
}

class MarkersPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(
    private readonly view: EditorView,
    private readonly modes: DecorationSource,
  ) {
    this.decorations = this.compute();
  }

  update(): void {
    this.decorations = this.compute();
  }

  private compute(): DecorationSet {
    if (isNestedEditor(this.view)) return Decoration.none;
    return computeMarkers(this.view.state, this.modes);
  }
}

class SelectionDecorationPlugin implements PluginValue {
  decorations: DecorationSet;
  private mouseDown = false;
  /** Whether the last policy evaluation saw block-selection mode. Detects the
   * mode's exit edge; see `applyFocusPolicy`. */
  private inBlockMode = false;

  constructor(
    private readonly view: EditorView,
    private readonly modes: DecorationSource,
  ) {
    this.decorations = this.compute();
    // Evaluate the policy once at construction. The chrome, the highlight
    // suppression and the mode class are all derived and therefore correct
    // immediately, but focus is driven by TRANSITIONS — and until this runs
    // there has been none. A view created over an existing exact cover (plugin
    // load, a reconfigure, a note reopened with its selection restored) would
    // otherwise show block chrome on a focused, raw-markdown editor until some
    // later gesture happened to move the selection.
    this.applyFocusPolicy();
    this.view.dom.addEventListener('mousedown', this.onMouseDown);
    this.view.dom.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('keydown', this.onDocumentKeyDown, { capture: true });
  }

  /**
   * The focus half of BLOCK-SELECTION MODE (node-selection-extension
   * design.md D9). The mode is derived, never stored: an outline-mode editor
   * is in it exactly when `allRangesCovered` holds, and Live Preview
   * rendering, the `::selection` suppression and the chrome all key off that
   * same predicate, so they cannot disagree with each other or with what is
   * selected.
   *
   * Focus follows the mode's TRANSITIONS, not its negation. Entering blurs,
   * LEAVING restores — and a selection that is merely outside the mode asserts
   * nothing, which is the load-bearing part: asserting focus on every
   * non-cover selection reaches the ordinary click path and was measured
   * breaking caret placement there. See the focus branch below.
   *
   * This replaced three separate focus manipulations, each originally added
   * to patch the previous one's fallout: a blur here when a selection turned
   * out to be a cover, a second blur in `onMouseUp` for the case this hook
   * skips, and an unconditional refocus in `onDocumentKeyDown` because
   * blurring had broken keyboard input. Their consequence was that every
   * keypress in a block selection did focus → run → blur, i.e. a full round
   * trip out of the mode and back, which is what made keyboard extension
   * flicker where a mouse drag does not. Under one policy two consecutive
   * block selections are the same mode, so nothing happens between them and
   * the flicker is unreachable rather than merely brief.
   *
   * The BLUR direction stays DEFERRED — NOT optional, and not what D9 changes.
   * It is scheduled with `requestAnimationFrame` rather than a timer: both are
   * asynchronous with respect to the current task, which is what the race below
   * requires, but only rAF is guaranteed to run before the next paint. With a
   * timer one frame was measured rendering block chrome over a still-focused,
   * raw-markdown editor. A real bug found live: blurring synchronously inside
   * `update()` (still in the same dispatch cycle as the keystroke that
   * changed the selection) races CM6's own DOM-selection sync. CM6 keeps the
   * browser's native `Selection`/`Range` mirroring its internal
   * `EditorState.selection`, but that sync is not guaranteed complete the
   * instant `update()` fires — blurring first can freeze the DOM's own
   * selection at a STALE position (confirmed: typing over a keyboard-built
   * block selection sometimes inserted text somewhere unexpected instead of
   * replacing it, consistent with the DOM's stale selection being what the
   * browser's `beforeinput` read once refocused). A real mouse drag never hit
   * this because it updates the DOM's native selection continuously.
   *
   * The FOCUS direction must go through `EditorView.focus()`, NOT
   * `contentDOM.focus()`. A first version used the raw DOM call and broke
   * caret placement for a plain mouse click: focusing a contenteditable lets
   * CodeMirror's own selection observer read the BROWSER's DOM selection back
   * into state, and after a click that is the raw clicked offset, not the
   * corrected one the transaction filter had just resolved. Measured under
   * mobile emulation on `- alpha / - bravo`: clicking the second item's marker
   * landed the caret at `ch 1`, between the `-` and its space, instead of
   * content start at `ch 2` (`65-content-space-caret.e2e.ts` D2). That is the
   * exact mirror of the blur race above — one direction strands the DOM's
   * selection, the other lets it win.
   *
   * `EditorView.focus()` is built for this: it wraps the focus in
   * `observer.ignore(...)` so nothing is read back, then calls
   * `docView.updateSelection()` to push STATE to DOM. So it cannot resurrect a
   * pre-correction position, and it needs no re-assert afterward —
   * `keymap.ts`'s `dispatchCursor` already records that re-dispatching on a
   * later frame is inherently a race.
   *
   * It is guarded so the policy can only take focus back for a view that lost
   * it to this same mechanism: only when the view is blurred, nothing else has
   * claimed focus (`document.activeElement === document.body`), and this view
   * is the host's own active editor. Without the last guard two blurred panes
   * both act — see `isActiveEditor`.
   */
  private applyFocusPolicy(): void {
    window.requestAnimationFrame(() => {
      // Losing outline mode IS a mode exit, not a reason to stop evaluating.
      // Returning early left `inBlockMode` stale and skipped the exit edge, so
      // toggling the mode off over a block selection stranded the editor
      // blurred — and `onDocumentKeyDown` then correctly declines, being
      // off-mode, so nothing brought focus back either.
      const covered = this.isOutlineNote() && allRangesCovered(this.view.state);
      const wasCovered = this.inBlockMode;
      this.inBlockMode = covered;

      if (covered) {
        if (this.view.hasFocus) this.view.contentDOM.blur();
        return;
      }
      // Focus is restored on the mode's EXIT EDGE, not asserted continuously
      // on every non-cover selection. That distinction is load-bearing: a
      // plain click also produces a non-cover selection, and calling focus on
      // that path regressed caret placement even through `EditorView.focus()`
      // (measured — `65-content-space-caret.e2e.ts` D2 landed at `ch 1`
      // instead of content start `ch 2`). A click never exits the mode,
      // because it was never in it, so this edge leaves the click path
      // untouched. `inBlockMode` is a transition detector, not selection
      // state — the mode itself stays derived.
      if (!wasCovered) return;
      if (this.view.hasFocus) return;
      if (document.activeElement !== document.body) return;
      if (!this.isActiveEditor()) return;
      this.view.focus();
    });
  }

  /**
   * Guarded on `!this.mouseDown`: an in-progress mouse drag also dispatches
   * one transaction per pointer move (each its own `selectionSet` update),
   * and may reach a covering shape WHILE THE BUTTON IS STILL HELD — blurring
   * mid-drag would risk interrupting the browser's own native drag-select
   * gesture, which relies on continuous focus/mousedown state on the target.
   * `onMouseUp` invokes the same policy for the mouse-completion case, which
   * this hook genuinely cannot cover: by the time a drag's mouseup fires the
   * last selection-settling transaction may already have committed while
   * `mouseDown` was still true, and nothing later re-triggers `update()`.
   * Two TRIGGERS for one policy, rather than two copies of the decision.
   */
  update(update: ViewUpdate): void {
    this.decorations = this.compute();
    if (update.selectionSet && !this.mouseDown) this.applyFocusPolicy();
  }

  destroy(): void {
    this.view.dom.removeEventListener('mousedown', this.onMouseDown);
    this.view.dom.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('keydown', this.onDocumentKeyDown, { capture: true });
  }

  private isOutlineNote(): boolean {
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    return !isNestedEditor(this.view) && !!path && this.modes.isOutline(path);
  }

  /**
   * True when THIS view is Obsidian's own notion of the currently active
   * editor (`app.workspace.activeEditor`) — a real bug found live with two
   * outline-mode panes open side by side, both blurred/block-selected at
   * once: `document.activeElement === document.body` alone can't tell them
   * apart (it's equally true for both), so `onDocumentKeyDown` always acted
   * on whichever view's listener happened to be registered first,
   * regardless of which pane the user had actually clicked into. Obsidian
   * tracks "active editor" independently of raw DOM focus (updated on a
   * real click/mousedown into a leaf, including the one that starts a NEW
   * block-selection drag there) and keeps pointing at that leaf even after
   * this same plugin's own blur call removes DOM focus from it — comparing
   * against the SAME `MarkdownFileInfo` object `editorInfoField` already
   * exposes (identity, not a path string) is exactly the signal needed.
   */
  private isActiveEditor(): boolean {
    const info = this.view.state.field(editorInfoField, false);
    return !!info && info.app.workspace.activeEditor === info;
  }

  /**
   * EXPERIMENTAL, manual-testing-only hypothesis (docs/research/13's
   * "Escalated-selection visual treatment" follow-ups): a real, manual
   * "click outside the text area" after a block-covering selection already
   * returns Live Preview to its fully native rendered form (confirmed by
   * user report) — every raw-mark-hiding edge case a CSS-only approach
   * chased individually (list bullets, task checkboxes, code-fence badges,
   * callout widgets, wiki-link aliases) is just Obsidian's OWN correct
   * rendering once unfocused, not something to re-derive piecemeal (see
   * docs/research/13 for that abandoned approach's full history).
   *
   * This reproduces that SAME transition programmatically: right after a
   * drag settles into a whole-block cover, blur the content DOM — the same
   * DOM effect a manual click elsewhere already produces. Deferred (see
   * `applyFocusPolicy`, which this now routes through): the drag's own
   * selection-escalation transaction (and CM6's own internal mouseup handling)
   * may not have committed yet at the exact moment this native event fires.
   *
   * Confirmed by the user in their real vault: stays fully rendered with no
   * raw-markdown flash at all. Real, confirmed cost: blurring removes DOM
   * focus, so typing/Backspace/Delete/arrow keys are silently ignored while
   * unfocused (identical to manually clicking away) — `onDocumentKeyDown`
   * below is the current attempt at recovering that.
   */
  private readonly onMouseDown = (): void => {
    this.mouseDown = true;
  };

  private readonly onMouseUp = (): void => {
    this.mouseDown = false;
    this.applyFocusPolicy();
  };

  /**
   * BLOCK-SELECTION MODE'S OWN KEY PATH (design.md D9). Not a recovery hack:
   * while the mode is active the editor is deliberately blurred, so this is
   * simply where its keys arrive. A blurred `contentDOM` never sees `keydown`
   * at all (events target `document.activeElement`, typically `document.body`
   * once blurred, and `contentDOM` isn't an ancestor of that) — so this
   * listens on `document` itself, then, for a key press meant for this view:
   *
   * 1. Replays the SAME `KeyboardEvent` through `runScopeHandlers`
   *    (`@codemirror/view`'s own public API for exactly this situation —
   *    "run this view's installed keymap against an event that didn't
   *    originate on its own DOM"). This matters for anything CM6 handles
   *    via keydown-bound commands rather than beforeinput — Backspace,
   *    Delete, arrow keys, Tab, Cmd+A, and this project's OWN layered
   *    keymap (the structural-edit rewriting, marker-transparent cursor
   *    placement, etc.) — refocusing alone would NOT reach those, since
   *    THIS event's own propagation path is already fixed to
   *    `document.body`'s ancestry, not `contentDOM`'s; CM6's real keymap
   *    facet never sees it without this. Deliberately NOT reimplemented by
   *    hand (e.g. calling `@codemirror/commands` functions directly) —
   *    that would bypass this project's own higher-precedence keymap
   *    entirely; `runScopeHandlers` runs the SAME real, fully-layered
   *    keymap this editor already has installed.
   * 2. Focuses `contentDOM` ONLY if step 1 claimed nothing. Ordinary
   *    character typing is inserted by a SEPARATE, later
   *    `beforeinput`/`input` dispatch (not this `keydown` continuing
   *    somehow), evaluated against whatever is focused at THAT time — so an
   *    unmatched key must leave the editor focused for the browser's own
   *    insertion to land. A matched key needs none of that, and focusing for
   *    it is what produced the flicker (D9).
   *
   * Guarded to only act when THIS view is the one currently blurred due to
   * a covering selection AND nothing else has legitimately claimed focus
   * since (`document.activeElement === document.body`) AND this view is
   * Obsidian's own currently active editor (`isActiveEditor`, needed for
   * the two-panes-both-blurred case — see its own doc comment) — otherwise
   * this would steal keystrokes meant for a different pane, the search
   * box, or any other UI element entirely.
   *
   * A real bug found on the first manual test round, once `runScopeHandlers`
   * DID match and run a command (Backspace, Delete, Tab): the ORIGINAL
   * event was never told it had been handled, so once the browser finished
   * dispatching it, it ALSO applied its own native default action against
   * whatever ended up focused — a SECOND, generic contentEditable deletion
   * on top of the correct structural one (confirmed live: pressing Backspace
   * once needed TWO undos to fully revert, and the surviving cursor position
   * matched exactly what a second, redundant single-character deletion from
   * the correctly-placed post-command cursor would produce), and, for Tab,
   * the browser's own native "cycle focus to the next focusable element"
   * behavior (stealing focus to a toolbar button) since Tab's native default
   * outside a text field is focus-cycling. `preventDefault`/
   * `stopPropagation` — but ONLY when a command actually matched — fixes
   * both: an UNMATCHED key (plain character typing) must NOT be prevented
   * here, since that default action (the browser's own native `beforeinput`
   * insertion against the now-refocused editor) is exactly what makes
   * ordinary typing work at all.
   *
   * Manual-testing-only by design: focus/blur timing interacting with real
   * keyboard input is exactly the kind of thing unlikely to test reliably
   * through the automated e2e harness.
   */
  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (this.view.hasFocus) return;
    if (MODIFIER_ONLY_KEYS.has(event.key)) return;
    if (document.activeElement !== document.body) return;
    if (!this.isOutlineNote() || !this.isActiveEditor() || !allRangesCovered(this.view.state)) {
      return;
    }
    // Run the keymap FIRST, and focus only if nothing claimed the key
    // (design.md D9). The original order focused unconditionally before
    // replaying, which meant every keypress in a block selection left the
    // mode and came back — the flicker's direct cause. A bound command needs
    // no DOM focus: it computes its own result and dispatches it, and the
    // selection that results decides focus through `applyFocusPolicy`. So a
    // cover-to-cover press (keyboard extension) now changes focus not at all.
    //
    // An UNMATCHED key still focuses immediately, and must: plain typing is
    // inserted by the browser's own later `beforeinput` against whatever is
    // focused at that moment, not by this event. `beforeinput` is dispatched
    // after this handler returns, so focusing here is still in time. That
    // case also ends in a non-cover selection, so the immediate focus agrees
    // with the policy rather than racing it.
    const handled = runScopeHandlers(this.view, event, 'editor');
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      // If the command LEFT the mode, take focus back now rather than waiting
      // for the deferred policy. The policy would get there, but not before
      // the user's next keystroke can arrive — and this handler only replays
      // keys while the selection is still a cover, so anything pressed in that
      // window is dropped outright. Measured as an intermittent failure of
      // "delete a multi-cursor block selection, then undo": the delete left a
      // caret, the editor was still blurred, and `Mod+Z` — which the editor's
      // own keymap does not claim — fell into the gap.
      //
      // Restoring focus eagerly here is the same exit edge, applied on the
      // path that caused the exit. It cannot resurrect a stale selection:
      // `EditorView.focus` pushes state to the DOM rather than reading it.
      if (!allRangesCovered(this.view.state)) this.view.focus();
      return;
    }
    // Focus by default; see `declinesFocus` for why the exclusion is one
    // measured key rather than a positive "produces input" test.
    if (declinesFocus(event)) return;
    this.view.focus();
  };

  private compute(): DecorationSet {
    // The BLOCK_SELECTING_CLASS is NOT toggled here — see the
    // `editorAttributes` facet in `decorationsExtension` for why writing it
    // imperatively flickered.
    if (!this.isOutlineNote()) return Decoration.none;
    return computeSelectionDecorations(this.view.state, this.modes);
  }
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
    // (see WIDGET_LINE_SELECTOR) and patched by the loop below — if a
    // previous `apply()` call already set its margin-left, querying it
    // here would read back our OWN prior value, not the native one.
    const ref = this.view.contentDOM.querySelector<HTMLElement>(
      `.cm-line:not(.to-decor-atom):not(.to-decor-list):not(.hr)`,
    );
    return ref ? parseFloat(getComputedStyle(ref).marginLeft) || 0 : 0;
  }

  /**
   * The right edge every plain, undecorated `.cm-line` actually renders at —
   * used to pull the escalated-selection chrome's right edge in to match,
   * for a widget atom whose own box is wider (see the call site's own doc
   * comment). Deliberately NOT `contentDOM.getBoundingClientRect().right`
   * (a real bug in the first version of this fix, found live): Obsidian's
   * "readable line width" centers each `.cm-line` INDIVIDUALLY via its own
   * `margin-inline: auto` under a `max-width` (see `nativeMarginBasePx`'s
   * own doc comment) — `.cm-content` itself stays full-viewport-width
   * regardless, so referencing it directly only happened to work in a
   * narrow viewport (below the max-width threshold, where no line actually
   * gets centered yet); at a wide enough viewport, every plain line's own
   * right edge sits well short of `.cm-content`'s own, and the fix
   * silently regressed to pulling the chrome in far MORE than intended.
   * Same reference-line selector as `nativeMarginBasePx`, for the same
   * "uncontaminated, not one of our own widget patches" reason.
   */
  private nativeContentRightPx(): number {
    const ref = this.view.contentDOM.querySelector<HTMLElement>(
      `.cm-line:not(.to-decor-atom):not(.to-decor-list):not(.hr)`,
    );
    return ref ? ref.getBoundingClientRect().right : this.view.contentDOM.getBoundingClientRect().right;
  }

  /**
   * Live measurement for the fold-chevron repositioning transform
   * (styles.css) — hardening 5.1, replacing two hardcoded measured
   * constants with the same read-native-values-live pattern
   * `nativeMarginBasePx` establishes: measure one representative element
   * per render, apply uniformly via a custom property on the content DOM
   * (custom properties inherit, so every chevron's transform picks it up).
   *
   * What the transform needs (see styles.css's own comment for the full
   * spatial story): shift = gutter + half our marker icon's width + a small
   * visual gap − the chevron's own right-side DEAD SPACE (the invisible
   * hit-area padding between its `.collapse-indicator` box's right edge and
   * the painted `<svg>` glyph's right edge — ~6px in the bundled themes,
   * but native Obsidian sizing that a theme/Obsidian update can change,
   * which is exactly why it must be measured, not hardcoded). Only the dead
   * space is a native measurement; the gutter and icon size are our own
   * constants, threaded from their single JS source of truth
   * (`MARKER_GUTTER_CSS`/`MARKER_ICON_CSS`) per the shared-value lesson.
   *
   * Measures `.collapse-indicator` (the element that actually carries the
   * box width) against its own painted `<svg>` — NOT the `.cm-fold-indicator`
   * wrapper, which is a zero-width anchor whose rect is technically true but
   * practically useless (the measure-the-glyph-not-the-wrapper lesson,
   * 11-decoration-lessons.md). A width DIFFERENCE is translation-invariant,
   * so measuring an already-transformed chevron still yields the correct
   * dead space — no untransformed-position bookkeeping needed. When no
   * chevron is currently rendered (nothing foldable in the viewport), the
   * last measurement — or, before any, the CSS fallback matching the
   * previously-validated bundled-theme values — stays in effect.
   *
   * The property is written to `view.dom` (the outer `.cm-editor`), NOT
   * `view.contentDOM`, and only when the (rounded) value actually changed —
   * both preventive, chosen deliberately rather than in response to an
   * observed failure. CM6's DOMObserver observes `contentDOM` itself with
   * `attributes: true` (confirmed in @codemirror/view's source), so a
   * style-attribute write there lands inside the observed set; and this
   * measurement is a rect difference on a transformed element, which could
   * in principle jitter subpixel between renders. A value that keeps
   * changing, written to an observed attribute, from a hook the resulting
   * mutation might re-trigger, is the same mutation-observer feedback-loop
   * family as the module doc comment's "never append a child into a plain
   * `.cm-line`" invariant — staying outside the observed subtree removes
   * the question entirely, at zero cost (custom properties inherit, so
   * `view.dom` serves the descendant chevron rule just as well).
   */
  private lastDeadRight = '';

  /**
   * Lines currently carrying a measured `--to-accent-stop`, kept so the next
   * render can clear exactly those instead of rescanning every line. Elements
   * CM6 has since detached are harmless to call `removeProperty` on.
   */
  private accentStopLines: HTMLElement[] = [];

  /**
   * Publishes, per row where the `path` style's segment arrives, how far down
   * that row the row's own marker sits — the one number `accentLayer` cannot
   * express in CSS, because it is `Obsidian's padding-top + half our icon` and
   * that padding varies by kind with no way to read it into a `calc`.
   *
   * Measured from the icon itself rather than reconstructed from the padding:
   * it is the thing the segment has to meet, so measuring it directly cannot
   * drift from it. Rows with no icon to measure (a list item, or a marker
   * `markerVisibility` hides) get nothing and fall back to the CSS `50%`.
   *
   * Measures the SVG, NOT its wrapper span — they are not in the same place.
   * The wrapper is an `inline-block` sized to the icon; the SVG inside it is an
   * inline box that gets baseline-aligned WITHIN that wrapper, so it renders
   * offset downward and overflowing (measured: wrapper top 0 / glyph top 4.4 on
   * a paragraph row, 16 / 24.9 on an H2 — see docs/research/14, finding 6). The
   * wrapper's box is therefore not where the user sees the marker, and aiming
   * at it lands the segment near the glyph's TOP edge rather than its middle.
   */
  private measureAccentStops(trail: PositionTrail): void {
    for (const el of this.accentStopLines) el.style.removeProperty('--to-accent-stop');
    this.accentStopLines = [];

    const doc = this.view.state.doc;
    for (const [lineNumber, fact] of trail.byLine) {
      if (!fact.accents.some((a) => a.extent === 'top')) continue;
      if (lineNumber >= doc.lines) continue; // stale fact past a shrunk doc
      const from = doc.line(lineNumber + 1).from;
      // Only rendered lines can be measured; CM6 keeps just the viewport (plus
      // a margin) in the DOM.
      if (!this.view.visibleRanges.some((r) => from >= r.from && from <= r.to)) continue;
      const node = this.view.domAtPos(from).node;
      const host = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
      const line = host?.closest<HTMLElement>('.cm-line');
      const icon = line?.querySelector<HTMLElement>(':scope > .to-decor-marker-icon');
      // The painted glyph, falling back to its wrapper only if the SVG is
      // somehow absent — never the other way round.
      const glyph = icon?.querySelector('svg') ?? icon;
      if (!line || !glyph) continue;
      const glyphRect = glyph.getBoundingClientRect();
      if (glyphRect.height === 0) continue; // not laid out yet
      const stop = glyphRect.top + glyphRect.height / 2 - line.getBoundingClientRect().top;
      line.style.setProperty('--to-accent-stop', `${stop}px`);
      this.accentStopLines.push(line);
    }
  }

  private measureChevron(): void {
    const wrapper = this.view.contentDOM.querySelector<HTMLElement>(
      '.cm-fold-indicator .collapse-indicator',
    );
    const glyph = wrapper?.querySelector('svg');
    if (!wrapper || !glyph) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const glyphRect = glyph.getBoundingClientRect();
    if (wrapperRect.width === 0 || glyphRect.width === 0) return;
    const deadRight = `${(wrapperRect.right - glyphRect.right).toFixed(1)}px`;
    if (deadRight === this.lastDeadRight) return;
    this.lastDeadRight = deadRight;
    this.view.dom.setCssProps({ '--to-chevron-dead-right': deadRight });
  }

  /**
   * Resolves `--text-selection` to a CONCRETE color value (not a `var()`
   * reference) and stores it as `--to-selected-bg` on `view.dom`, for the
   * escalated-selection chrome (styles.css) to consume instead of
   * referencing `--text-selection` directly. A real bug found live, not
   * assumed: Obsidian's own native CSS sets
   * `.cm-table-widget.is-selected { --text-selection: transparent; }`
   * (avoiding a double-selection render inside table cells, which have
   * their OWN native selection UI) — since a `var()` reference re-resolves
   * against the referenced property's value AT THE ELEMENT WHERE IT'S
   * USED (not "frozen" at whatever ancestor declared it), the chrome rule
   * on a SELECTED table's own `::before` would inherit that SAME
   * transparent override merely by referencing `--text-selection`,
   * silently making the chrome invisible on any table currently under an
   * escalated selection — confirmed live via `document.styleSheets`
   * after the effect first showed up as chrome visibly stopping partway
   * through a table in a manual visual pass. Reading the value once via
   * `getComputedStyle` on `contentDOM` (never itself `.is-selected`) and
   * writing it back as a literal breaks that inheritance chain: no
   * property named `--to-selected-bg` is ever reset by that native rule,
   * so it reaches the table unchanged. Re-measured every render (a theme
   * switch corrects on the next one), same as `--to-marker-icon-size` and
   * the chevron dead-space above.
   */
  private measureSelectionColor(): void {
    const color = getComputedStyle(this.view.contentDOM).getPropertyValue('--text-selection');
    if (!color) return;
    this.view.dom.setCssProps({ '--to-selected-bg': color });
  }

  private apply(): void {
    const path = this.view.state.field(editorInfoField, false)?.file?.path;
    // See isNestedEditor's own doc comment — a nested per-cell editor
    // shares this.modes.isOutline's own path with the real top-level note,
    // so that check alone can't exclude it; only the DOM-level one can.
    if (!path || !this.modes.isOutline(path) || isNestedEditor(this.view)) {
      this.clearAll();
      return;
    }

    // The chevron transform's inputs: our own icon size, threaded from its
    // JS source of truth (a constant, so writing it repeatedly is safe),
    // plus the live-measured native dead space (see measureChevron — set on
    // `view.dom`, not `contentDOM`, for the observer-loop reason documented
    // there; same target here for consistency). Re-measured every render,
    // so a theme switch mid-session corrects on the next update.
    this.view.dom.setCssProps({ '--to-marker-icon-size': MARKER_ICON_CSS });
    this.measureChevron();
    this.measureSelectionColor();

    const { factsByLine, guidesByLine } = docFacts(this.view.state);
    const nativeBasePx = this.nativeMarginBasePx();
    const selectedLineTargets = selectedLineRootTargets(this.view.state);
    // Position indicators reach widget atoms the same way everything else
    // does — through this imperative patch, since a CM6 decoration has no
    // effect on them at all (module doc comment).
    const trail = positionTrail(this.view.state, this.modes);
    this.measureAccentStops(trail);
    // The right edge every plain `.cm-line` naturally reaches — read live
    // (not assumed to be `right: 0` relative to a widget's OWN box), since
    // a widget atom's own box can be WIDER than that on the right (a table
    // reserves extra space past its visible grid for the "+ column" button,
    // confirmed live: same width regardless of whether the button is
    // currently visible). Used below to pull the chrome's right edge back
    // in to match every other line, rather than reaching as far as the
    // widget's own wider box — a real "notch" found by user review
    // (visibly poking out past the right edge of surrounding chrome, as
    // tall as the whole widget). See `nativeContentRightPx`'s own doc
    // comment for why this must be a reference LINE's own edge, not
    // `contentDOM`'s.
    const contentRightPx = this.nativeContentRightPx();

    const widgets = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_LINE_SELECTOR),
    );

    // Document lines that ALSO have a plain `.cm-line` of their own right
    // now. A line-level widget is usually its line's only rendering, but not
    // always: with the cursor on the line, Obsidian reveals the raw source
    // as a real `.cm-line` AND keeps the rendered block, so ONE document
    // line has TWO elements. Measured for both a wiki embed and a depth-0
    // table.
    //
    // That only causes a DOUBLE MARKER when the declarative path also
    // emitted one for the line, which it does for every kind except the
    // always-widget-rendered atoms (see computeMarkers's own
    // WIDGET_ATOM_KINDS skip). So this set alone is not the suppression
    // condition — pairing it with that same kind test is (see the marker
    // branch below). Suppressing on the set alone silently deleted every
    // widget atom's marker the moment the cursor landed on it, caught by
    // 52-block-markers-icons.
    //
    // `.hr` is excluded because it is BOTH a `.cm-line` and widget-rendered
    // — counting it here would make it look doubly rendered to itself.
    const linesWithPlainRendering = new Set<number>();
    for (const line of Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(':scope > .cm-line:not(.hr)'),
    )) {
      try {
        linesWithPlainRendering.add(this.view.state.doc.lineAt(this.view.posAtDOM(line)).number - 1);
      } catch {
        // Mid-update DOM the current document can't place — nothing to add.
      }
    }

    const patched = new Set<HTMLElement>();
    for (const el of widgets) {
      let lineNumber: number;
      try {
        lineNumber = this.view.state.doc.lineAt(this.view.posAtDOM(el)).number - 1;
      } catch {
        // An element the CURRENT state cannot place — mid-update DOM that
        // has already moved on. Guarded because this runs inside
        // `docViewUpdate`: an exception here would abandon the rest of the
        // pass, leaving every later widget on this render undecorated, and
        // would propagate into CM6's own update cycle.
        //
        // Marked as patched-this-pass on purpose, so the stranded sweep
        // below leaves it alone. Skipping is strictly better than clearing:
        // the element most likely still holds a correct patch from a pass
        // that COULD place it, and the next update recomputes it either
        // way — whereas clearing on a transient failure would visibly strip
        // a live line's decoration.
        patched.add(el);
        continue;
      }
      patched.add(el);
      el.classList.add(WIDGET_PATCHED_CLASS);
      // Same class the plain-`.cm-line` path applies via CM6 decoration
      // (computeSelectionDecorations) — widgets need the imperative DOM
      // patch instead, same reasoning as margin/marker below. Toggled
      // unconditionally so it's cleared the moment the line leaves the
      // covered set, on every render. `--to-selected-left` (the covered
      // range's root-column target minus THIS widget's own, live-measured
      // shift — more precise than the generic per-kind formula
      // `selectedLineRootTargets` uses for plain lines) is set per branch
      // below, wherever this widget's own `ownShiftExpr` is in scope.
      const rootTarget = selectedLineTargets.get(lineNumber);
      el.classList.toggle(SELECTED_NODE_CLASS, rootTarget !== undefined);
      const fact = factsByLine.get(lineNumber);
      // Keyed on "this element renders a line that HAS a fact", not on the
      // line's node kind. The gate here used to be `fact?.isAtom`, which
      // asked what kind of node the line held when the only thing that
      // matters is that the line was rendered as an opaque element, so the
      // declarative decoration never landed on it. Those coincided while
      // the selector above could only ever find atoms; they stopped
      // coinciding the moment it could find a widget-rendered paragraph.
      if (fact) {
        // Some widgets (tables, for their row/column drag-handles) carry
        // their own native left padding that our margin doesn't know
        // about — padding never moves a box's own edge, so it just pushes
        // the widget's *visible content* (e.g. the <table> grid) further
        // right than a same-depth code block or callout, whose background
        // fills their own padding invisibly. Reading it live (not a
        // hardcoded constant) keeps this correct across themes.
        const elStyle = getComputedStyle(el);
        const nativePaddingLeft = parseFloat(elStyle.paddingLeft) || 0;
        // The one shift formula every consumer below derives from — the
        // margin, the marker's own target column, the guide's leftward
        // widening, and the selection chrome's left edge — so they can
        // never silently diverge. See widgetOwnShiftExpr's doc comment for
        // why nativeBasePx is added to `margin-left` here and nowhere else.
        const ownShiftExpr = widgetOwnShiftExpr(fact, nativePaddingLeft);
        el.style.setProperty('margin-left', `calc(${nativeBasePx}px + ${ownShiftExpr})`, 'important');

        // Everything BELOW positions an absolutely-positioned box (the
        // marker child, the guide's `::after`, the chrome's `::before`)
        // inside this element, and `left` on such a box resolves against
        // its containing block's PADDING box — inset from the border box by
        // the border width. `ownShiftExpr` above is measured from the
        // border box (that's what `margin-left` moves), so every positioned
        // consumer needs the border added back to stay on the same column.
        //
        // Zero for the atom kinds, which carry no border — which is exactly
        // why this never surfaced before. A wiki embed carries
        // `border-left: 2px` (measured live), and every one of its
        // positioned children landed 2px right of a same-depth plain line's.
        // Read live rather than hardcoded, same as the padding above, since
        // it is entirely theme-determined. The mirror-image rule for the
        // right edge is already documented at `--to-selected-right` below.
        const nativeBorderLeft = parseFloat(elStyle.borderLeftWidth) || 0;
        const positionedShiftExpr = `${ownShiftExpr} + ${nativeBorderLeft}px`;

        // The gutter reservation above stays unconditional regardless of
        // markerVisibility — hiding some markers should never reflow text
        // or shift indentation, only whether the icon itself is drawn in
        // that already-reserved space (see shouldShowMarker's own doc
        // comment). `isMarkerEligible` is the structural half of the
        // question (first line, not a list item), which this path could
        // previously leave out and stay correct only because every atom
        // satisfied both by construction.
        // Exactly the complement of computeMarkers's own emit condition: it
        // skips the always-widget-rendered atom kinds and handles every
        // other kind declaratively. So a declarative marker exists for this
        // line, and has a `.cm-line` to land on, precisely when the kind is
        // NOT an atom kind and the line is doubly rendered — and that is the
        // only case where this path would add a second one. The two paths
        // partition the work by the same test, from opposite sides.
        const declarativeMarkerLands =
          !WIDGET_ATOM_KINDS.has(fact.kind) && linesWithPlainRendering.has(lineNumber);
        if (
          isMarkerEligible(fact) &&
          !declarativeMarkerLands &&
          shouldShowMarker(fact, this.modes.markerVisibility)
        ) {
          el.classList.add('to-decor-marker');
          // Same depth term the shift above used, for the same reason: the
          // marker's target column and the box it sits in must be derived
          // from one number. (List items would need `supplementalDepth`
          // here, and are excluded by `isMarkerEligible` before this runs.)
          el.dataset.markerDepth = String(fact.isListItem ? fact.supplementalDepth : fact.depth);
          applyWidgetMarker(el, fact.kind, positionedShiftExpr);
        } else {
          clearWidgetMarker(el);
        }

        // Toggled (not just added) so an accent clears the moment the caret
        // leaves, on the very next render.
        //
        // BOTH roles apply here, not just the current node. That was not true
        // while this loop gated on `fact.isAtom`: an atom is a leaf by
        // construction, so a widget could never be an ancestor. Deciding by
        // rendered form instead (decorate-widget-rendered-lines) admits
        // widget-rendered PARAGRAPHS — a whole-line embed is one — and the
        // attachment rule (`listAttachesTo`) makes a following list that
        // paragraph's children. So a widget line genuinely can be an ancestor,
        // and skipping that here left `markerHighlight: 'lineage'` silently
        // unable to accent an embed it had descended from.
        //
        // Only the synthetic-marker classes are reachable: `isMarkerEligible`
        // excludes list items, so the native-bullet variants never apply.
        const markerAccent = this.modes.markerHighlight !== 'off';
        el.classList.toggle(
          CURRENT_MARKER_CLASS,
          markerAccent && trail.currentLine === lineNumber,
        );
        el.classList.toggle(
          ANCESTOR_MARKER_CLASS,
          markerAccent && trail.ancestorLines.has(lineNumber),
        );

        const guide = guidesByLine.get(lineNumber);
        const lineTrail = trail.byLine.get(lineNumber);
        if (guide && hasOverlay(guide, lineTrail)) {
          el.classList.add('to-decor-guides');
          el.style.setProperty('--to-guides', guideBackground(guide.guideDepths, lineTrail));
          el.style.setProperty('--to-own-shift', `calc(${positionedShiftExpr})`);
        } else {
          el.classList.remove('to-decor-guides');
          el.style.removeProperty('--to-guides');
          el.style.removeProperty('--to-own-shift');
        }

        if (rootTarget !== undefined) {
          el.style.setProperty('--to-selected-left', `calc(${rootTarget} - (${positionedShiftExpr}))`);
          // `right` resolves against the containing block's PADDING box,
          // whose edge sits INSET FROM THE BORDER BOX BY THE BORDER WIDTH
          // only (not by padding — a wrong assumption in an earlier version
          // of this fix, corrected after re-deriving it from the CSS box
          // model instead of assuming). See `nativeBorderLeft` above, which
          // applies the same rule to every LEFT-positioned consumer. The
          // atom kinds have no border (`border-width: 0`, confirmed live),
          // so for them the padding box and
          // border box coincide exactly — `getBoundingClientRect()` (the
          // border box) is already the correct reference with no further
          // adjustment. Read `borderRightWidth` live anyway rather than
          // hardcoding the zero, in case a theme ever adds one.
          const nativeBorderRight = parseFloat(getComputedStyle(el).borderRightWidth) || 0;
          const paddingBoxRight = el.getBoundingClientRect().right - nativeBorderRight;
          const rightOverhang = Math.max(0, paddingBoxRight - contentRightPx);
          // POSITIVE, not negated: CSS `right` pushes an absolutely
          // positioned box's own right edge INWARD (leftward) from its
          // containing block's edge as the value increases — the opposite
          // sign from `left` (where more negative reaches further outward).
          // A real bug in an earlier version of this fix, found by forcing
          // an extreme value (-300px) and seeing NO visual change from
          // -16px: both were actually extending the edge outward, past an
          // ancestor's real overflow-clipping boundary, and getting clipped
          // to the same visible result either way — not, as first assumed,
          // `right` having no effect at all.
          el.style.setProperty('--to-selected-right', `${rightOverhang}px`);
        } else {
          el.style.removeProperty('--to-selected-left');
          el.style.removeProperty('--to-selected-right');
        }
      } else {
        // Defensive only, and genuinely a no-op in the steady state: every
        // element this loop sees renders a real line, and every real line
        // has a fact. (The mid-update case where the element cannot be
        // placed at all no longer arrives here — it is caught at the
        // `lineAt` call above, which throws rather than returning a stale
        // line number, so this branch was never actually reachable that
        // way.) Kept for a line that resolves but has no fact, where
        // leaving a stale patch behind would be worse than clearing it.
        //
        // This is NOT the branch a widget-rendered non-atom takes. It used
        // to be: while the gate above read `fact?.isAtom`, any
        // widget-rendered paragraph landed here and had its decoration
        // stripped. That was the bug, not the design.
        clearWidgetPatch(el);
      }
    }

    // Anything we patched on an earlier pass that this one did NOT reach.
    // Obsidian re-parents a rendered embed's own element into a `.cm-line`
    // when the line stops being a whole-line replacement, at which point the
    // selector above can no longer find it and its stale inline margin adds
    // to its new host line's own indentation. Sweeping by our own marker
    // class instead reaches it wherever it now sits — see
    // WIDGET_PATCHED_CLASS.
    for (const el of Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(`.${WIDGET_PATCHED_CLASS}`),
    )) {
      if (!patched.has(el)) clearWidgetPatch(el);
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
      // List items get no marker gutter (native bullet/number only, no
      // icon); atom lines (code/quote) always reserve one, even at depth 0.
      const gutter = isListItem ? '0px' : MARKER_GUTTER_CSS;
      el.style.setProperty(
        'margin-left',
        `calc(${nativeBasePx}px + var(${depthVar}, 0) * ${UNIT} + ${gutter})`,
        'important',
      );

      // Marker horizontal compensation: `computeMarkers`'s own `left` calc
      // (via MARKER_LEFT_SHIFT_EXPR) assumes the widget's insertion point has
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
          nativeShift !== 0
            ? `calc(${MARKER_LEFT_SHIFT_EXPR} - ${nativeShift}px)`
            : MARKER_LEFT_SHIFT_EXPR,
          'important',
        );
      }
    }
  }

  private clearAll(): void {
    this.view.dom.style.removeProperty('--to-marker-icon-size');
    this.view.dom.style.removeProperty('--to-chevron-dead-right');
    this.view.dom.style.removeProperty('--to-selected-bg');
    this.lastDeadRight = '';
    // Swept by our OWN patch class, not by `WIDGET_LINE_SELECTOR`, and
    // deliberately unscoped. An element we patched may since have been
    // re-parented inside a `.cm-line` (see WIDGET_PATCHED_CLASS), where the
    // selector can no longer reach it — turning outline mode off has to
    // strip its inline margin and marker all the same, or stock rendering
    // is not restored. The union with the selector keeps the sweep correct
    // even for an element patched before this class existed in a session.
    const widgets = new Set<HTMLElement>([
      ...Array.from(
        this.view.contentDOM.querySelectorAll<HTMLElement>(`.${WIDGET_PATCHED_CLASS}`),
      ),
      ...Array.from(this.view.contentDOM.querySelectorAll<HTMLElement>(WIDGET_LINE_SELECTOR)),
    ]);
    for (const el of widgets) clearWidgetPatch(el);
    const plainLines = Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(PLAIN_MARGIN_SELECTOR),
    );
    for (const el of plainLines) el.style.removeProperty('margin-left');
    for (const el of this.accentStopLines) el.style.removeProperty('--to-accent-stop');
    this.accentStopLines = [];
  }
}

export function decorationsExtension(modes: DecorationSource): Extension {
  return [
    // ViewPlugins (not plain StateFields) specifically so each has `view`
    // access to run isNestedEditor's DOM-ancestry check — state alone can't
    // tell a nested per-cell editor apart from the real top-level note (see
    // isNestedEditor's own doc comment). Recomputes on every update, not
    // just docChanged ones: toggling outline mode has no doc change of its
    // own, only a nudged selection transaction (see main.ts) to make these
    // re-run.
    ViewPlugin.define((view) => new DecorationsPlugin(view, modes), {
      decorations: (v) => v.decorations,
    }),
    // A SEPARATE plugin for block-marker widgets (Experiment 5a), not
    // merged into the same RangeSetBuilder as the line decorations above —
    // CM6 merges decorations from multiple sources correctly on its own,
    // sidestepping any need to reason about Decoration.line/Decoration.
    // widget ordering at the same document position.
    ViewPlugin.define((view) => new MarkersPlugin(view, modes), {
      decorations: (v) => v.decorations,
    }),
    // A fourth, independent plugin for escalated-selection chrome
    // (selection-visual-treatment) — same reasoning as MarkersPlugin above:
    // a separate DecorationSet CM6 merges with the others at the same line
    // position, not extra branching inside DecorationsPlugin's own builder.
    ViewPlugin.define((view) => new SelectionDecorationPlugin(view, modes), {
      decorations: (v) => v.decorations,
    }),
    ViewPlugin.define<MarginCompensation>((view) => new MarginCompensation(view, modes)),
    // Block-selection mode's marker class, declared through CM6's own
    // `editorAttributes` facet rather than written onto `view.dom` with
    // `classList` (node-selection-extension, real-vault pass 5.3c).
    //
    // The imperative version flickered once per gesture, and the mechanism is
    // not ours: `EditorView.updateAttrs` recomputes the editor's whole class
    // string — `"cm-editor" + (hasFocus ? " cm-focused " : " ") + themeClasses`
    // plus this facet — and writes the `class` ATTRIBUTE wholesale. So the
    // focus change that block-selection mode itself causes made CM6 clobber
    // our class, and the next `update()` put it straight back. Measured with a
    // MutationObserver: `class=ON` at 6.8ms, `blur` at 6.9ms, then `class=off`
    // at 21.5ms and `class=ON` again at 21.9ms — with the selection unchanged
    // throughout, which is what ruled out `allRangesCovered` as the cause. A
    // paint landed in that window, so exactly one frame rendered without
    // chrome and with the native highlight showing through.
    //
    // Through the facet there is no window at all: CM6 folds this class into
    // the same computed string, so its rewrite carries it rather than dropping
    // it. `attrsFromFacet` re-evaluates function sources on every
    // `updateAttrs`, and `combineAttrs` concatenates `class` values, so this
    // composes with the theme's own classes instead of racing them.
    EditorView.editorAttributes.of((view) =>
      !isNestedEditor(view) &&
      isOutlineView(view, modes) &&
      allRangesCovered(view.state)
        ? { class: BLOCK_SELECTING_CLASS }
        : null,
    ),
  ];
}

/** Whether `view`'s file is an outline-mode note. The state-only half of
 * `SelectionDecorationPlugin.isOutlineNote`, split out so the facet above can
 * ask the same question without a plugin instance. */
function isOutlineView(view: EditorView, modes: DecorationSource): boolean {
  const path = view.state.field(editorInfoField, false)?.file?.path;
  return !!path && modes.isOutline(path);
}
