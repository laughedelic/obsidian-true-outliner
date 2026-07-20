/**
 * Selection escalation math (design.md D4): a non-empty selection range
 * that crosses a node boundary expands to the minimal contiguous cover of
 * whole sibling subtrees. Pure module — no CodeMirror imports; the CM6
 * adapter (src/plugin/transaction-filter.ts) converts to/from character
 * offsets and handles multi-range selections (each range escalates
 * independently, per D4 — that iteration lives in the adapter, not here).
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath } from './model';
import { nodeAtLine } from './locate';

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
 * The end position of a subtree's OWN content: the last line of its
 * deepest last-descendant's `lines`, excluding that leaf's trailing gap
 * (D4: "trailing gap lines excluded from the visual selection but owned
 * for Phase C semantics"). `startLine` is `node`'s own absolute start line.
 */
function subtreeContentEnd(node: OutlineNode, startLine: number): LinePos {
  if (node.children.length === 0) {
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
  return subtreeContentEnd(node.children[node.children.length - 1]!, line);
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
  return { start: { line: start, ch: 0 }, end: subtreeContentEnd(node, start) };
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

  const anchorPath = findPath(doc, anchorNode.id)!;
  const headPath = findPath(doc, headNode.id)!;

  // Deepest common ancestor scope: the longest shared index prefix of the
  // two paths. When one node is an ancestor of the other (paths differ in
  // length with no divergence — the "selection leaves a parent" case, D4),
  // the scope is one level ABOVE the shallower node, so its own sibling
  // index is used as both endpoints' subtree index.
  let k = 0;
  while (k < anchorPath.length && k < headPath.length && anchorPath[k] === headPath[k]) k++;
  const scopeLen = k < anchorPath.length && k < headPath.length ? k : k - 1;

  const scopePath = anchorPath.slice(0, scopeLen);
  const scopeChildren = childrenAtScope(doc, scopePath);
  const anchorIndex = anchorPath[scopeLen]!;
  const headIndex = headPath[scopeLen]!;
  const loIndex = Math.min(anchorIndex, headIndex);
  const hiIndex = Math.max(anchorIndex, headIndex);
  const firstSubtree = scopeChildren[loIndex]!;
  const lastSubtree = scopeChildren[hiIndex]!;

  return expandToCover(range, {
    start: { line: startLineOf(doc, firstSubtree), ch: 0 },
    end: subtreeContentEnd(lastSubtree, startLineOf(doc, lastSubtree)),
  });
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
    if (isEmpty(range)) return range; // cursors never move
    const anchorNode = nodeAtLine(doc, range.anchor.line);
    const headNode = nodeAtLine(doc, range.head.line);
    if (!anchorNode || !headNode) return range; // preamble jurisdiction
    // An unchanged non-empty in-jurisdiction range is a same-node content
    // range — force it up to its node's whole subtree. (expandToCover also
    // makes the already-exact-cover case a clean no-op.)
    return expandToCover(range, subtreeCoverOf(doc, anchorNode));
  });
}
