/**
 * Selection escalation math (design.md D4, as replaced by
 * `selection-as-subtree-set`): a non-empty selection range that crosses a
 * node boundary expands to the FOREST SPAN of its two ends — a set of whole
 * subtrees whose roots may sit at different depths, closed downward and
 * still a single contiguous range. Pure module — no CodeMirror imports; the CM6
 * adapter (src/plugin/transaction-filter.ts) converts to/from character
 * offsets and handles multi-range selections (each range escalates
 * independently, per D4 — that iteration lives in the adapter, not here).
 *
 * Cursors (empty ranges) are never touched by this layer — `escalateRange`/
 * `escalateRanges` leave them exactly as received. Cursor PLACEMENT (marker
 * prefixes, and — as of content-space-caret — gap lines too) is a separate,
 * broader mechanism: `./caret.ts`'s `resolvePlacement`, wired in at the
 * same `transaction-filter.ts` call site this module's escalation runs
 * through. Originally that mechanism was list-item-marker-only
 * (`clampCursorToContent`, design.md D13, node-edit-enforcement's second
 * manual pass, 2026-07-21); content-space-caret retired it in favor of the
 * general addressable-position rule, which subsumes the marker case and
 * extends it to gap lines (docs/research/13, "Gap-line cursor
 * transparency").
 *
 * `coveredSubtreeRoots` (escalated-selection-decoration, docs/research/13)
 * is the read-only counterpart: given a range that's already in place,
 * which subtree(s), if any, does it exactly cover? Built from the same
 * `forestCoverOf`/`subtreeCoverOf` geometry `escalateRange` uses to
 * escalate a range in the first place — a membership test, not new math.
 *
 * A cover is a FOREST of whole subtrees whose roots may sit at different
 * depths (`selection-as-subtree-set`), not a run of siblings under one
 * scope. The governing invariant is DOWNWARD CLOSURE: no node is ever
 * covered without its whole subtree. The upward half the sibling-run rule
 * silently also enforced — never covering a node together with content
 * outside its parent — is deliberately gone; it was what made one
 * Shift+ArrowDown out of a subtree select the entire document.
 *
 * A subtree's cover (`subtreeCoverEnd`) includes its own trailing gap
 * in full (escalate-include-owned-gap, docs/research/13's "Escalation math
 * re-examination candidate"): gap ownership is already all-or-nothing in
 * the parse model, so once a node is escalated into a selection — via the
 * gap-line trigger or by a boundary crossing reaching its content — its
 * whole gap comes with it, not just whatever the drag happened to reach.
 *
 * `subtreeCoverOf`/`Cover` are also exported for `select-all-ladder.ts`
 * (progressive-select-all): the Mod-A ladder's rungs are built from the
 * same subtree-cover geometry, not reimplemented.
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath, nodeAt } from './model';
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
      // Gap lines are semantically blank (parse.ts's `isBlank` treats any
      // whitespace-only line as blank) even though whitespace-only ones are
      // stored verbatim — `ch: 0` here, not the stored line's length, so
      // matching (`coveredSubtreeRoots`) doesn't depend on incidental
      // trailing whitespace within a "blank" gap line.
      return { line: startLine + node.lines.length + node.trailingGap.length - 1, ch: 0 };
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

/** A contiguous line-range cover, `start` inclusive through `end` inclusive
 * (both `LinePos`). Exported for `select-all-ladder.ts` (progressive-
 * select-all), which builds its rung sequence from the same subtree-cover
 * geometry rather than recomputing it. */
export interface Cover {
  readonly start: LinePos;
  readonly end: LinePos;
}

/** A node's whole-subtree cover — its own lines through its deepest last
 * descendant's content end, INCLUDING that leaf's own trailing gap in full
 * (see `subtreeCoverEnd`). Exported for `select-all-ladder.ts`. */
export function subtreeCoverOf(doc: OutlineDoc, node: OutlineNode): Cover {
  const start = startLineOf(doc, node);
  return { start: { line: start, ch: 0 }, end: subtreeCoverEnd(node, start) };
}

/** Every node's own absolute start line, in ONE traversal. `startLineOf`
 * rescans the document per call, which is fine for the two lookups the
 * single-subtree paths need but quadratic for a forest whose root count
 * grows with the document (Select All being the limiting case). The
 * classification gate that now consumes this geometry runs inside the
 * keystroke-latency budget (`transaction-classification`), so the walk
 * below stays linear. */
function startLineIndex(doc: OutlineDoc): Map<number, number> {
  const index = new Map<number, number>();
  let line = doc.preamble.length;
  const walk = (node: OutlineNode): void => {
    index.set(node.id, line);
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return index;
}

/** The node following `path`'s WHOLE SUBTREE in document order: the next
 * sibling, else the nearest ancestor's next sibling. Distinct from ops.ts's
 * `rawSuccessorPath`, which descends into `path`'s own first child instead
 * — that one answers "what abuts this node's last line", this one answers
 * "what comes after everything this node owns". */
function subtreeSuccessorPath(doc: OutlineDoc, path: NodePath): NodePath | undefined {
  let p: NodePath = path;
  while (p.length > 0) {
    const parentPath = p.slice(0, -1);
    const index = p[p.length - 1]!;
    if (index + 1 < childrenAtScope(doc, parentPath).length) return [...parentPath, index + 1];
    p = parentPath;
  }
  return undefined;
}

/** A forest of whole subtrees and the single contiguous span covering it.
 * `roots` are in document order and may sit at DIFFERENT DEPTHS; grouped by
 * parent they form one contiguous sibling run per parent, which is what
 * `enforce.ts` hands to `deleteSubtreeGroups`. */
export interface ForestCover {
  readonly roots: readonly OutlineNode[];
  readonly cover: Cover;
}

/**
 * The forest span of two distinct nodes (`selection-as-subtree-set` D2) —
 * the shared geometry `escalateRange` (to compute the expand-only union),
 * `coveredSubtreeRoots` (to test an existing range against it), and through
 * the latter `classify.ts` and `enforce.ts` all read. One implementation,
 * every consumer, per that change's D4 and the two silently-stale-duplicate
 * incidents in docs/research/04 (Q18, Q19).
 *
 * When one node is an ancestor of the other, the cover is the ANCESTOR's
 * whole subtree — selecting a parent takes its children, unchanged from the
 * sibling-run rule this replaces.
 *
 * Otherwise the roots are the maximal subtrees of the document-order run
 * from `firstNode` to `lastNode` closed under descendants, walked here as
 * the subtree-successor chain from `firstNode` up to and including the LAST
 * ROOT. That last root is the OUTERMOST ancestor-or-self of `lastNode` whose
 * own start line is at or after the span's start — NOT `lastNode` itself.
 * The distinction is the whole content of D2 and is invisible in the common
 * shapes: with
 *
 *     - P            - S
 *       - c1           - t1
 *       - c2           - t2
 *
 * a drag from inside `c2` to inside `t1` ends at `S`'s subtree end, not at
 * `t1`'s. Ending at `t1` would put `S`'s entire line in the selection while
 * leaving `t2` out — a node selected without its whole subtree, which is
 * exactly the downward-closure violation this geometry exists to prevent,
 * and which would orphan `t2` on deletion.
 *
 * The start needs no such qualification: every ancestor of `firstNode`
 * begins above it, so none can fall inside the span. The asymmetry is
 * inherent to preorder, not a defect in the rule.
 *
 * The cover's end includes the last root's own trailing gap in full
 * (`subtreeCoverEnd`, escalate-include-owned-gap), so reaching a node's
 * content by crossing into it is enough to pull its whole gap in — no
 * separate drag onto the blank line required.
 */
export function forestCoverOf(
  doc: OutlineDoc,
  anchorNode: OutlineNode,
  headNode: OutlineNode,
): ForestCover {
  const anchorPath = findPath(doc, anchorNode.id)!;
  const headPath = findPath(doc, headNode.id)!;
  const startLines = startLineIndex(doc);
  const startOf = (node: OutlineNode): number => startLines.get(node.id)!;

  const isPrefix = (a: NodePath, b: NodePath): boolean =>
    a.length < b.length && a.every((index, i) => index === b[i]);

  // One end's node is an ancestor of the other's: the ancestor's whole
  // subtree is the cover, and it is the only root.
  if (isPrefix(anchorPath, headPath)) return singleRootCover(anchorNode, startOf(anchorNode));
  if (isPrefix(headPath, anchorPath)) return singleRootCover(headNode, startOf(headNode));

  const forward = startOf(anchorNode) <= startOf(headNode);
  const firstNode = forward ? anchorNode : headNode;
  const lastNode = forward ? headNode : anchorNode;
  const firstPath = forward ? anchorPath : headPath;
  const lastPath = forward ? headPath : anchorPath;
  const spanStart = startOf(firstNode);

  // The outermost ancestor-or-self of `lastNode` that begins at or after
  // the span's start. Start lines increase monotonically along a path, so
  // the shallowest prefix that qualifies is the answer and every deeper one
  // qualifies too.
  let lastRoot = lastNode;
  for (let depth = 1; depth < lastPath.length; depth++) {
    const ancestor = nodeAt(doc, lastPath.slice(0, depth))!;
    if (startOf(ancestor) >= spanStart) {
      lastRoot = ancestor;
      break;
    }
  }

  // Walk the subtree-successor chain from `firstNode` to `lastRoot`. Every
  // node it emits is a maximal subtree of the span: the chain never
  // descends, so no emitted node is inside another's subtree, and `lastRoot`
  // is always reached — were it inside some earlier emitted subtree, that
  // subtree's root would be a SHALLOWER ancestor of `lastNode` starting at
  // or after `spanStart`, contradicting `lastRoot`'s outermost-ness.
  const roots: OutlineNode[] = [];
  let path: NodePath | undefined = firstPath;
  while (path) {
    const node = nodeAt(doc, path)!;
    roots.push(node);
    if (node === lastRoot) break;
    path = subtreeSuccessorPath(doc, path);
  }

  return {
    roots,
    cover: {
      start: { line: spanStart, ch: 0 },
      end: subtreeCoverEnd(lastRoot, startOf(lastRoot)),
    },
  };
}

function singleRootCover(node: OutlineNode, startLine: number): ForestCover {
  return {
    roots: [node],
    cover: { start: { line: startLine, ch: 0 }, end: subtreeCoverEnd(node, startLine) },
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
 * single-node-selection trigger), and to the FOREST SPAN of the two ends
 * when they resolve to different nodes (`forestCoverOf`) — in both cases
 * unioned with the original range (expand-only) and with orientation
 * preserved.
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

  return expandToCover(range, forestCoverOf(doc, anchorNode, headNode).cover);
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
    if (isEmpty(range)) return range; // cursors never move (this function's own scope — see ./caret.ts's resolvePlacement for cursor placement)
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
 * The escalated-selection-decoration query (docs/research/13, "Escalated-
 * selection visual treatment"): does `range`'s current bounds cover a
 * single node's whole subtree, or the combined cover of a FOREST of whole
 * subtrees at possibly different depths? Returns the covered subtree roots
 * (length 1 for a single-node cover) when so, `null` otherwise.
 *
 * Three consumers beyond the selection chrome read this, and they read it
 * for different reasons, so widening what it recognizes widens all of them
 * at once (`selection-as-subtree-set` D4): `enforce.ts`'s `coverIdsOf` and
 * `computeMultiRangeDeletionVerdict` turn the roots into deletion groups,
 * and `classify.ts`'s `isExactSubtreeCoverDeletion` uses a non-`null`
 * answer as a CLASSIFICATION GATE — the test that routes an exact-cover
 * deletion to the verdict layer even though its raw line span reads as
 * within-node.
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

  const { roots, cover } =
    anchorNode === headNode
      ? { roots: [anchorNode] as readonly OutlineNode[], cover: subtreeCoverOf(doc, anchorNode) }
      : forestCoverOf(doc, anchorNode, headNode);

  return posEqual(lo, cover.start) && !posBefore(hi, cover.end) ? roots : null;
}
