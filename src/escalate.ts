/**
 * Selection escalation math (design.md D4): a non-empty selection range
 * that crosses a node boundary expands to the minimal contiguous cover of
 * whole sibling subtrees. Pure module — no CodeMirror imports; the CM6
 * adapter (src/plugin/transaction-filter.ts) converts to/from character
 * offsets and handles multi-range selections (each range escalates
 * independently, per D4 — that iteration lives in the adapter, not here).
 *
 * Cursors (empty ranges) were originally never touched by this layer at
 * all. D13 (node-edit-enforcement, second manual pass, 2026-07-21) narrows
 * that for LIST-ITEM MARKERS only: `clampCursorToContent` redirects a
 * cursor landing in a marker's prefix to its content start. Gap-line cursor
 * placement is deliberately untouched — see docs/research/13's "Gap-line
 * cursor transparency" entry for why that's a separate, larger, deferred
 * piece, not an oversight here.
 *
 * `coveredSubtreeRoots` (escalated-selection-decoration, docs/research/13)
 * is the read-only counterpart: given a range that's already in place,
 * which subtree(s), if any, does it exactly cover? Built from the same
 * `siblingRunCover`/`subtreeCoverOf` geometry `escalateRange` uses to
 * escalate a range in the first place — a membership test, not new math.
 *
 * A subtree's cover (`subtreeCoverEnd`) includes its own owned trailing gap
 * in full (escalate-include-owned-gap, docs/research/13's "Escalation math
 * re-examination candidate"): gap ownership is already all-or-nothing in
 * the parse model, so once a node is escalated into a selection — via the
 * gap-line trigger or by a boundary crossing reaching its content — its
 * whole gap comes with it, not just whatever the drag happened to reach.
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath } from './model';
import { nodeAtLine } from './locate';
import { contentColumnCh } from './ops';

export interface LinePos {
  readonly line: number;
  readonly ch: number;
}

/** A selection range with orientation preserved: `anchor` is the drag/
 * extend origin, `head` is the current end — `head` may be before or after
 * `anchor` in document order ("backward" vs "forward"). */
export interface LineRange {
  readonly anchor: LinePos;
  readonly head: LinePos;
}

function isEmpty(range: LineRange): boolean {
  return range.anchor.line === range.head.line && range.anchor.ch === range.head.ch;
}

function posBefore(a: LinePos, b: LinePos): boolean {
  return a.line < b.line || (a.line === b.line && a.ch < b.ch);
}

function isBackward(range: LineRange): boolean {
  return posBefore(range.head, range.anchor);
}

function posEqual(a: LinePos, b: LinePos): boolean {
  return a.line === b.line && a.ch === b.ch;
}

export function rangesEqual(a: LineRange, b: LineRange): boolean {
  return posEqual(a.anchor, b.anchor) && posEqual(a.head, b.head);
}

/** A node's own absolute start line (0-based) in `doc`. */
function startLineOf(doc: OutlineDoc, target: OutlineNode): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node === target) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found;
}

/** Total line count of a node's own subtree (its lines + gap, plus every
 * descendant's), for skipping past a preceding sibling wholesale. */
function subtreeLineCount(node: OutlineNode): number {
  let count = node.lines.length + node.trailingGap.length;
  for (const child of node.children) count += subtreeLineCount(child);
  return count;
}

/**
 * The end position of a subtree's cover: the last line of its deepest
 * last-descendant, INCLUDING that leaf's own trailing gap in full
 * (escalate-include-owned-gap: gap ownership is all-or-nothing, so a
 * subtree's cover always carries its whole owned gap along, not just
 * whatever a drag happened to reach). `startLine` is `node`'s own absolute
 * start line.
 */
function subtreeCoverEnd(node: OutlineNode, startLine: number): LinePos {
  if (node.children.length === 0) {
    if (node.trailingGap.length > 0) {
      const lastGapLine = node.trailingGap[node.trailingGap.length - 1] ?? '';
      return { line: startLine + node.lines.length + node.trailingGap.length - 1, ch: lastGapLine.length };
    }
    const lastLine = node.lines[node.lines.length - 1] ?? '';
    return { line: startLine + node.lines.length - 1, ch: lastLine.length };
  }
  let line = startLine + node.lines.length + node.trailingGap.length;
  // Preceding siblings must be skipped by their FULL subtree size — a
  // sibling's own lines+gap alone undercounts it if it has descendants of
  // its own (the bug a naive `sibling.lines.length + sibling.trailingGap.
  // length` sum would introduce: it silently landed inside an earlier
  // sibling's subtree instead of at the actual last child).
  for (let i = 0; i < node.children.length - 1; i++) {
    line += subtreeLineCount(node.children[i]!);
  }
  return subtreeCoverEnd(node.children[node.children.length - 1]!, line);
}

function childrenAtScope(doc: OutlineDoc, scopePath: NodePath): readonly OutlineNode[] {
  let list: readonly OutlineNode[] = doc.children;
  for (const index of scopePath) list = list[index]!.children;
  return list;
}

interface Cover {
  readonly start: LinePos;
  readonly end: LinePos;
}

function subtreeCoverOf(doc: OutlineDoc, node: OutlineNode): Cover {
  const start = startLineOf(doc, node);
  return { start: { line: start, ch: 0 }, end: subtreeCoverEnd(node, start) };
}

/**
 * The minimal contiguous run of sibling subtrees (at the ends' deepest
 * common ancestor scope) spanning two distinct nodes, plus its combined
 * cover — the shared geometry both `escalateRange` (to compute the
 * expand-only union) and `coveredSubtreeRoots` (to test an existing range
 * against it) need. The cover's end includes the last subtree's own owned
 * trailing gap in full (`subtreeCoverEnd`), so reaching a node's content by
 * crossing into it is enough to pull its whole gap into the cover — no
 * separate drag onto the blank line required. See `escalateRange`'s own doc
 * comment for the "one node is an ancestor of the other" scope-resolution
 * note; unchanged here, just extracted so both callers agree by
 * construction rather than by duplicated logic.
 */
function siblingRunCover(
  doc: OutlineDoc,
  anchorNode: OutlineNode,
  headNode: OutlineNode,
): { readonly nodes: readonly OutlineNode[]; readonly cover: Cover } {
  const anchorPath = findPath(doc, anchorNode.id)!;
  const headPath = findPath(doc, headNode.id)!;

  let k = 0;
  while (k < anchorPath.length && k < headPath.length && anchorPath[k] === headPath[k]) k++;
  const scopeLen = k < anchorPath.length && k < headPath.length ? k : k - 1;

  const scopePath = anchorPath.slice(0, scopeLen);
  const scopeChildren = childrenAtScope(doc, scopePath);
  const anchorIndex = anchorPath[scopeLen]!;
  const headIndex = headPath[scopeLen]!;
  const loIndex = Math.min(anchorIndex, headIndex);
  const hiIndex = Math.max(anchorIndex, headIndex);
  const nodes = scopeChildren.slice(loIndex, hiIndex + 1);
  const firstSubtree = nodes[0]!;
  const lastSubtree = nodes[nodes.length - 1]!;

  return {
    nodes,
    cover: {
      start: { line: startLineOf(doc, firstSubtree), ch: 0 },
      end: subtreeCoverEnd(lastSubtree, startLineOf(doc, lastSubtree)),
    },
  };
}

/**
 * The expand-only invariant (D4 amendment): the escalated range is the
 * UNION of the computed cover and the original range — escalation only
 * ever moves ends outward, never pulls one back. Without this, an end the
 * user placed beyond the cover (a trailing gap line, the document's final
 * empty line) would be dragged back to the last content character —
 * concretely, Select All in a no-frontmatter note would silently drop its
 * trailing newline from the selection (sharpest in a single-node note,
 * where the head-on-final-gap-line shape is exactly the gap-line trigger).
 * Returns the ORIGINAL range object when the union changes nothing, so
 * callers can use identity/equality to detect a real escalation.
 */
function expandToCover(range: LineRange, cover: Cover): LineRange {
  const lo = isBackward(range) ? range.head : range.anchor;
  const hi = isBackward(range) ? range.anchor : range.head;
  const newLo = posBefore(cover.start, lo) ? cover.start : lo;
  const newHi = posBefore(hi, cover.end) ? cover.end : hi;
  if (posEqual(newLo, lo) && posEqual(newHi, hi)) return range;
  return isBackward(range) ? { anchor: newHi, head: newLo } : { anchor: newLo, head: newHi };
}

/**
 * Escalate one selection range per D4 (as amended). Returns `range`
 * unchanged for: empty ranges (cursors — never altered), ranges with
 * either end in the preamble (D5 jurisdiction), and ranges whose ends both
 * rest on a single node's own content lines. Escalates to the node's whole
 * subtree when a same-node range has an end on a trailing gap line (the
 * single-node-selection trigger), and to the minimal contiguous run of
 * whole sibling subtrees when the ends resolve to different nodes — in
 * both cases unioned with the original range (expand-only) and with
 * orientation preserved.
 */
export function escalateRange(doc: OutlineDoc, range: LineRange): LineRange {
  if (isEmpty(range)) return range;

  const anchorNode = nodeAtLine(doc, range.anchor.line);
  const headNode = nodeAtLine(doc, range.head.line);
  if (!anchorNode || !headNode) return range; // preamble jurisdiction (D5)

  if (anchorNode === headNode) {
    // Same node: untouched while both ends stay on the node's own content
    // lines; an end on a trailing gap line escalates to this one node's
    // subtree (the drag-past-the-end-selects-the-node gesture).
    const start = startLineOf(doc, anchorNode);
    const firstGapLine = start + anchorNode.lines.length;
    if (range.anchor.line < firstGapLine && range.head.line < firstGapLine) return range;
    return expandToCover(range, subtreeCoverOf(doc, anchorNode));
  }

  // Deepest common ancestor scope: the longest shared index prefix of the
  // two paths. When one node is an ancestor of the other (paths differ in
  // length with no divergence — the "selection leaves a parent" case, D4),
  // the scope is one level ABOVE the shallower node, so its own sibling
  // index is used as both endpoints' subtree index. (See `siblingRunCover`.)
  return expandToCover(range, siblingRunCover(doc, anchorNode, headNode).cover);
}

/**
 * Escalate a full selection's ranges with the uniform multi-range rule (D4
 * amendment): every range is first escalated independently; if ANY range
 * escalated, every other non-empty in-jurisdiction range is then escalated
 * to at least its own node's whole subtree. The result is that an
 * escalated multi-range selection is always a set of whole-subtree ranges
 * — a multi-range copy concatenates complete subtrees, never a mix of
 * block-level and mid-node fragments. Cursors and preamble ranges are
 * never touched; when nothing escalates, all ranges come back unchanged.
 */
export function escalateRanges(doc: OutlineDoc, ranges: readonly LineRange[]): LineRange[] {
  const escalated = ranges.map((range) => escalateRange(doc, range));
  const anyEscalated = escalated.some((range, i) => !rangesEqual(range, ranges[i]!));
  if (!anyEscalated) return escalated;

  return escalated.map((range, i) => {
    if (!rangesEqual(range, ranges[i]!)) return range; // already escalated
    if (isEmpty(range)) return range; // cursors never move (this function's own scope — see clampCursorToContent for the separate marker mechanism)
    const anchorNode = nodeAtLine(doc, range.anchor.line);
    const headNode = nodeAtLine(doc, range.head.line);
    if (!anchorNode || !headNode) return range; // preamble jurisdiction
    // An unchanged non-empty in-jurisdiction range is a same-node content
    // range — force it up to its node's whole subtree. (expandToCover also
    // makes the already-exact-cover case a clean no-op.)
    return expandToCover(range, subtreeCoverOf(doc, anchorNode));
  });
}

/**
 * Marker-transparent cursor placement (design.md D13): redirects a cursor
 * that would land inside a list item's marker prefix — its leading
 * indentation, marker character, and the single space after it on the
 * marker's own first line, or the equivalent alignment whitespace on a
 * continuation line — to that line's content-start column instead
 * (`contentColumnCh`, the same boundary the structural ops already use).
 * Input-agnostic: applies uniformly whether the position came from Left,
 * Home, a mouse click, or vertical motion. Non-list-item lines (including
 * headings, whose own `#` marker IS conventionally direct-edit text) and
 * gap lines are untouched — this is deliberately narrower than "no chrome
 * cursor position anywhere" (see the module doc comment).
 */
export function clampCursorToContent(doc: OutlineDoc, pos: LinePos): LinePos {
  const node = nodeAtLine(doc, pos.line);
  if (!node || node.kind !== 'list-item') return pos;
  const lineIndex = pos.line - startLineOf(doc, node);
  if (lineIndex < 0 || lineIndex >= node.lines.length) return pos; // node's own trailing gap
  const boundary = contentColumnCh(node.lines[lineIndex] ?? '');
  return pos.ch >= boundary ? pos : { line: pos.line, ch: boundary };
}

/**
 * The escalated-selection-decoration query (docs/research/13, "Escalated-
 * selection visual treatment"): does `range`'s current bounds cover a
 * single node's whole subtree, or the combined cover of a contiguous run of
 * sibling subtrees? Returns the covered subtree roots (length 1 for a
 * single-node cover) when so, `null` otherwise.
 *
 * The match is `lo` at the cover's exact start AND `hi` at-or-beyond the
 * cover's end — NOT strict equality on both ends. `cover.end` is already
 * gap-inclusive (`subtreeCoverEnd`, escalate-include-owned-gap), so for an
 * escalated range `hi` almost always lands exactly on it; `!posBefore(hi,
 * cover.end)` rather than strict equality is kept for robustness (`hi`
 * cannot stray past this node/run's own territory without `headNode`
 * resolving to a different node and taking the other branch below) and
 * because it's what makes an exact single-line leaf match (no gap at all,
 * `hi` lands precisely on `cover.end`) qualify too, satisfying the "any
 * exact cover, leaf included" decision in design.md with no separate case
 * for it.
 *
 * Stateless and history-independent by design: this asks "does the CURRENT
 * selection cover this subtree," not "was this selection produced by
 * escalation" — a plain native selection that happens to match (e.g. Home
 * then Shift+End on a single-line paragraph) is indistinguishable from an
 * escalated one, and is meant to be: the same thing is selected either way.
 */
export function coveredSubtreeRoots(doc: OutlineDoc, range: LineRange): readonly OutlineNode[] | null {
  if (isEmpty(range)) return null;

  const lo = isBackward(range) ? range.head : range.anchor;
  const hi = isBackward(range) ? range.anchor : range.head;
  const anchorNode = nodeAtLine(doc, lo.line);
  const headNode = nodeAtLine(doc, hi.line);
  if (!anchorNode || !headNode) return null; // preamble jurisdiction

  const { nodes, cover } =
    anchorNode === headNode
      ? { nodes: [anchorNode] as readonly OutlineNode[], cover: subtreeCoverOf(doc, anchorNode) }
      : siblingRunCover(doc, anchorNode, headNode);

  return posEqual(lo, cover.start) && !posBefore(hi, cover.end) ? nodes : null;
}
