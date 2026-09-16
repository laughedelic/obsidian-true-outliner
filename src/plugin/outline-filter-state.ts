/**
 * What the in-note filter is hiding behind, as editor state.
 *
 * The query the reader typed, the match set frozen when it ran, and the visible
 * lines derived from both. The matches are anchors — one offset per matched
 * node's start — rather than node ids, because ids are per parse and a frozen
 * set of them is not a frozen set of anything (`outline-filter` D2). Ids are
 * spent immediately, at the parse that produced them.
 *
 * What is frozen and what is not divides here. The MATCHES do not change as the
 * document is edited: an anchor maps through every transaction's changes, so
 * editing a match so that it no longer contains the query keeps it visible, and
 * typing the query into a hidden node does not reveal it. The PATH to each match
 * is read from the current parse every time, so moving a match under a different
 * parent makes that parent visible.
 *
 * Per editor view and never persisted, like the zoom anchor beside it.
 *
 * Free of any `obsidian` import, so the derivation stays reachable from the
 * unit suite — the same division, and the same reason, that splits
 * `zoom-state.ts` from `zoom-scope.ts`. The one gate that needs a real editor,
 * telling a nested per-cell editor from an ordinary one, is applied by
 * `outline-filter-scope.ts` on top of this.
 */

import {
  MapMode,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type Transaction,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { OutlineDoc, OutlineNode } from '../model';
import { forEachNodeWithLine } from '../locate';
import { matchNodes } from '../search';
import type { LineSpan } from '../zoom';
import { parsedDoc } from './parsed-doc';
import { isOutlineMode } from './outline-state';

/**
 * Below this, the filter hides nothing.
 *
 * This surface's threshold for when hiding begins, not a rule of the grammar —
 * the footer and the palette both answer a one-character query. Counted on the
 * TRIMMED query, because `matchesText` trims: a space and a letter is a
 * one-character query however many characters were typed.
 *
 * It also keeps the filter off the path `matchNodes` takes for an empty query,
 * which matches everything: committing an anchor per node would mean mapping
 * thousands of them through every transaction to hide nothing.
 */
export const MIN_QUERY = 2;

export interface OutlineFilter {
  /** What the reader has typed, trimmed or not — the field shows it verbatim. */
  readonly query: string;
  /**
   * The frozen match set, or null when nothing has matched yet.
   *
   * Null is what makes "before a filter has been asked for" a different state
   * from "a filter that hides everything", which D8 says cannot arise.
   */
  readonly anchors: readonly number[] | null;
  /** Whether `anchors` answers the query now in the field (D8). */
  readonly matched: boolean;
}

export const filterQuerySet = StateEffect.define<string>();
export const filterCleared = StateEffect.define<null>();

/**
 * Where a matched node's anchor sits: INSIDE its first line, not at the start.
 *
 * One position in, which is what makes a deletion that removes the node remove
 * the anchor with it. At the line's start the anchor sits on the boundary a
 * deletion collapses to, so `TrackDel` keeps it and it comes to rest on
 * whatever node now begins there — measured, and it made a node the reader
 * never matched visible with its own new parent in tow. Clamped for a line with
 * no room, which a node's own first line does not have in practice.
 */
function anchorIn(line: { from: number; to: number }): number {
  return Math.min(line.from + 1, line.to);
}

/** The anchors a query matches in `doc`, as offsets into `text`. */
function anchorsFor(doc: OutlineDoc, text: Text, query: string): number[] {
  if (query.trim().length < MIN_QUERY) return [];
  const starts = new Map<number, number>();
  forEachNodeWithLine(doc, (node, startLine) => {
    starts.set(node.id, startLine);
  });
  const anchors: number[] = [];
  for (const id of matchNodes(doc, query)) {
    const line = starts.get(id);
    if (line === undefined || line >= text.lines) continue;
    anchors.push(anchorIn(text.line(line + 1)));
  }
  return anchors;
}

/**
 * The state a query produces, given what the field already holds.
 *
 * A query that matches nothing does not replace the anchors: the view keeps the
 * last answer it had and the panel says the query missed (D8). A query below the
 * threshold clears them, because that is the state before a filter rather than
 * an answer to one.
 */
function applyQuery(previous: OutlineFilter | null, text: Text, query: string): OutlineFilter {
  if (query.trim().length < MIN_QUERY) return { query, anchors: null, matched: true };
  const { doc } = parsedDoc(text);
  const anchors = anchorsFor(doc, text, query);
  if (anchors.length === 0) return { query, anchors: previous?.anchors ?? null, matched: false };
  return { query, anchors, matched: true };
}

/**
 * The anchors carried across a transaction's changes.
 *
 * `TrackDel` is what drops an anchor deleted with its node: a plain map would
 * put it wherever the deletion collapsed to, keeping whatever node now begins
 * there visible in place of the one the reader matched.
 */
function mapAnchors(anchors: readonly number[], tr: Transaction): number[] {
  const out: number[] = [];
  for (const anchor of anchors) {
    const mapped = tr.changes.mapPos(anchor, 1, MapMode.TrackDel);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

/**
 * Did this transaction change a line the filter was showing, and leave the
 * caret in what it wrote?
 *
 * Both halves are load-bearing. The first is what makes this about the reader's
 * own editing rather than any change at all. The second is what keeps a
 * transaction that moves no caret — a programmatic change, an external edit —
 * from anchoring wherever the selection happened to be sitting.
 */
function editedVisibleAtCaret(tr: Transaction, spans: readonly LineSpan[]): boolean {
  const head = tr.newSelection.main.head;
  let yes = false;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (yes) return;
    if (head < fromB || head > toB) return;
    if (toB === fromB && removesWholeLine(tr.startState.doc, fromA, toA)) return;
    const from = tr.startState.doc.lineAt(fromA).number - 1;
    const to = tr.startState.doc.lineAt(toA).number - 1;
    yes = spans.some((span) => from < span.toLine && to >= span.fromLine);
  });
  return yes;
}

/**
 * Does this deleted range take a whole line with it?
 *
 * What separates a deletion that removes NODES from one that merely joins two
 * lines. A Backspace at a content start deletes a break and a marker, leaving
 * the reader's text inside the node above — which the rule should follow. A
 * deleted subtree takes whole lines, and the caret comes to rest on whatever
 * follows, which the reader never matched and the rule must not resurrect.
 */
function removesWholeLine(doc: Text, from: number, to: number): boolean {
  const first = doc.lineAt(from);
  // The first line that could sit ENTIRELY inside the range starts at or after
  // its start — the one `from` lands in does not, unless it lands on its start.
  const line = first.from >= from ? first : doc.lineAt(Math.min(first.to + 1, doc.length));
  return line.from >= from && line.to <= to;
}

/**
 * The anchor a transaction ADDS, for a node it made from a visible one.
 *
 * Mapping alone does not cover the gestures that produce a node: the far half
 * of a split, the sibling Enter makes, and the node a Backspace merge leaves
 * carrying the text — all hold no anchor, so the derivation hides what the
 * reader is looking at, under the caret that just made it. The catalogue walk
 * in `tests/outline-filter-gestures.test.ts` is which gestures those are.
 *
 * The rule is the caret's: a change that touches what the filter is showing and
 * leaves the caret in what it wrote keeps whatever node the caret landed in
 * visible. One rule covers all three, because in all three the caret is exactly
 * where the reader's text went.
 *
 * Skipped when the caret's line already carries an anchor, so typing inside a
 * match does not add one per keystroke.
 */
function addedAnchor(tr: Transaction, mapped: readonly number[]): number | null {
  const before = unguardedFilterVisibleSpans(tr.startState);
  if (!before || !editedVisibleAtCaret(tr, before)) return null;
  const line = tr.newDoc.lineAt(tr.newSelection.main.head);
  if (mapped.some((anchor) => tr.newDoc.lineAt(anchor).from === line.from)) return null;
  return anchorIn(line);
}

const filterField = StateField.define<OutlineFilter | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(filterCleared)) return null;
      if (effect.is(filterQuerySet)) return applyQuery(value, tr.newDoc, effect.value);
    }
    if (!value || !value.anchors || !tr.docChanged) return value;
    const mapped = mapAnchors(value.anchors, tr);
    const added = addedAnchor(tr, mapped);
    const anchors = added === null ? mapped : [...mapped, added];
    // Editing away the last match leaves nothing to show a filtered view for,
    // and an editor with no visible line is a trap: no caret can be placed in
    // it and nothing the reader types can bring a match back. Falling back to
    // the whole note is the same state as before a query matched, which is what
    // it now is.
    return { ...value, anchors: anchors.length > 0 ? anchors : null };
  },
});

/**
 * The lines a match set keeps: each match's OWN lines and each ancestor's.
 *
 * Own lines, not subtree covers — a match's children are hidden unless they
 * match themselves — and not the trailing gap either, which belongs to the node
 * but is not part of what it says.
 *
 * The ancestor chain is read from the parse rather than frozen with the match,
 * which is what keeps a match's path honest as the document moves.
 */
function spansFor(doc: OutlineDoc, text: Text, anchors: readonly number[]): LineSpan[] {
  const lines = [...new Set(anchors.map((a) => text.lineAt(Math.min(a, text.length)).number - 1))];
  lines.sort((a, b) => a - b);
  if (lines.length === 0) return [];

  const keep = new Set<number>();
  const stack: { node: OutlineNode; startLine: number }[] = [];
  forEachNodeWithLine(doc, (node, startLine, depth) => {
    stack.length = depth;
    stack[depth] = { node, startLine };
    const end = startLine + node.lines.length;
    // A node holds an anchor when one of the frozen lines is one of its OWN.
    if (!lines.some((line) => line >= startLine && line < end)) return;
    for (const up of stack) {
      for (let n = up.startLine; n < up.startLine + up.node.lines.length; n++) keep.add(n);
    }
  });

  return mergeLines([...keep].sort((a, b) => a - b));
}

/** Consecutive line numbers as half-open spans. */
function mergeLines(sorted: readonly number[]): LineSpan[] {
  const spans: LineSpan[] = [];
  for (const line of sorted) {
    const last = spans[spans.length - 1];
    if (last && last.toLine === line) spans[spans.length - 1] = { ...last, toLine: line + 1 };
    else spans.push({ fromLine: line, toLine: line + 1 });
  }
  return spans;
}

/**
 * The first line the filter shows at or beyond `line`, going `direction`.
 *
 * `null` means there is nothing that way — which a vertical motion reads as the
 * document edge, since the filter has hidden everything between the caret and
 * it. A caret that has to land SOMEWHERE wants `nearestVisibleLine` instead.
 */
export function nextVisibleLine(
  spans: readonly LineSpan[],
  line: number,
  direction: 1 | -1,
): number | null {
  if (spans.some((span) => line >= span.fromLine && line < span.toLine)) return line;
  if (direction === 1) {
    const below = spans.find((span) => span.fromLine > line);
    return below ? below.fromLine : null;
  }
  const above = [...spans].reverse().find((span) => span.toLine <= line);
  return above ? above.toLine - 1 : null;
}

/**
 * The nearest line the filter is showing, searching `direction` first.
 *
 * `outline-filter`'s caret rule: a gesture whose result would put the caret on
 * a hidden line puts it on the nearest visible one, in the direction of the
 * movement. Searching the direction of travel first is what makes Down past a
 * run of hidden nodes land below them rather than bouncing back above.
 *
 * Unlike `nextVisibleLine` this falls back to the other direction at either end
 * of the document, because its callers have a caret that has to go somewhere
 * and the filter is still drawing lines for it to go to.
 */
export function nearestVisibleLine(
  spans: readonly LineSpan[],
  line: number,
  direction: 1 | -1,
): number | null {
  if (spans.length === 0) return null;
  return nextVisibleLine(spans, line, direction) ?? nextVisibleLine(spans, line, -direction as 1 | -1);
}

/** One derivation per `EditorState`, shared by every consumer — `zoomScope`'s
 * shape and for its reason: several extensions ask on every transaction. */
const spanCache = new WeakMap<EditorState, { spans: readonly LineSpan[] | null }>();

function computeSpans(state: EditorState): readonly LineSpan[] | null {
  if (!isOutlineMode(state)) return null;
  const filter = state.field(filterField, false);
  if (!filter?.anchors) return null;
  const { doc } = parsedDoc(state.doc);
  return spansFor(doc, state.doc, filter.anchors);
}

/**
 * The lines the filter is keeping, or null when it is not active here.
 *
 * Outline mode only. The nested-editor gate is the other half and lives in
 * `outline-filter-scope.ts`, which is what every consumer outside the unit
 * suite reads.
 */
export function unguardedFilterVisibleSpans(state: EditorState): readonly LineSpan[] | null {
  const cached = spanCache.get(state);
  if (cached) return cached.spans;
  const spans = computeSpans(state);
  spanCache.set(state, { spans });
  return spans;
}

/** What the panel reports: the query, whether it matched, and how many. */
export function unguardedOutlineFilter(state: EditorState): OutlineFilter | null {
  if (!isOutlineMode(state)) return null;
  return state.field(filterField, false) ?? null;
}

export function setFilterQuery(view: EditorView, query: string): void {
  view.dispatch({ effects: filterQuerySet.of(query) });
}

export function clearFilter(view: EditorView): void {
  view.dispatch({ effects: filterCleared.of(null) });
}

export function outlineFilterStateExtension(): Extension {
  return [filterField];
}
