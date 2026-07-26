/**
 * Content-space caret placement and motion (content-space-caret change,
 * design.md D2-D5): which document positions the caret may occupy in
 * outline mode, and how horizontal motion and non-motion placements resolve
 * to one of them. Pure module — no CodeMirror imports; the CM6 adapter
 * (src/plugin/keymap.ts for motion, src/plugin/transaction-filter.ts for
 * placement resolution) converts to/from character offsets and supplies
 * whatever CM6-only facts a decision needs — which, since Home/End became a
 * single raw-line step with no geometry in it (docs/research/04 Q26), is now
 * only CM6's goal-column-preserving vertical motion for Up/Down.
 *
 * Supersedes `escalate.ts`'s `clampCursorToContent`: the marker-only rule
 * there is the special case of `isAddressable`/`resolvePlacement` here where
 * the non-addressable position is a marker prefix rather than a gap line.
 *
 * Two mechanisms (D2), not one:
 * - Motion (`planHorizontal` here; vertical is computed in the adapter, which
 *   alone has CM6's visual geometry) answers "given a position and a
 *   direction, what's the next addressable position." Home/End also live in
 *   the adapter, but need no geometry: they take the caret's own raw line's
 *   content boundary, in one step, and never cross a line break."
 * - Placement resolution (`resolvePlacement`) answers "given a position
 *   produced by something with no direction — a click, a collapse — what's
 *   the nearest legal position, via gap/marker OWNERSHIP, never proximity."
 */

import type { OutlineDoc, OutlineNode } from './model';
import { nodeAtLine, nodeStartLine } from './locate';

export interface LinePos {
  readonly line: number;
  readonly ch: number;
}

/**
 * The character offset where `line` (one of `node`'s own lines) becomes
 * content: past a list item's indentation and marker, or past a continuation
 * line's alignment whitespace. Zero for every other node kind — a heading's
 * `#`, a quote's `>`, a code fence's backticks are all ordinary content (D7).
 *
 * Computes the list prefix here rather than reusing `ops.ts`'s
 * `contentColumnCh`, which also swallows an ATX heading prefix and requires
 * whitespace after the marker. Both behaviours are wrong for THIS question:
 *
 * - `- # title` — the `#` belongs to the item's content, and this change's own
 *   spec says a heading prefix stays addressable. Sharing the helper made `# `
 *   chrome, so the caret could not be placed on it.
 * - `-` with no trailing space — an empty item mid-edit. Requiring whitespace
 *   left the boundary at 0, making the marker itself addressable and putting a
 *   hole in the invariant exactly where the marker is all there is.
 *
 * Whitespace after the marker is therefore optional only at END OF LINE. A first
 * attempt made it optional everywhere (`[ \t]*`), which then swallowed ordinary
 * punctuation at the start of a CONTINUATION line: `  *emphasis*` measured a
 * boundary of 3, making the `*` non-addressable, and `  -foo` the same. A marker
 * needs a space after it or nothing at all.
 *
 * `contentColumnCh` keeps its own semantics for the structural operations that
 * want them; this is the caret's question, so it gets its own answer.
 */
const LIST_PREFIX = /^[ \t]*(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$))?/;

export function contentBoundaryCh(node: OutlineNode, line: string): number {
  if (node.kind !== 'list-item') return 0;
  return LIST_PREFIX.exec(line)?.[0].length ?? 0;
}

/** The node's own content-start position: its first line, past any marker. */
export function nodeContentStart(doc: OutlineDoc, node: OutlineNode): LinePos {
  const start = nodeStartLine(doc, node.id);
  const firstLine = node.lines[0] ?? '';
  return { line: start, ch: contentBoundaryCh(node, firstLine) };
}

/** The node's own content-end position: its last own line's full length
 * (never its trailing gap). */
export function nodeContentEnd(doc: OutlineDoc, node: OutlineNode): LinePos {
  const start = nodeStartLine(doc, node.id);
  const lastLine = node.lines[node.lines.length - 1] ?? '';
  return { line: start + node.lines.length - 1, ch: lastLine.length };
}

/**
 * The node immediately preceding `node` in full document order — descending
 * into a node's OWN last descendant, not just its previous sibling — found
 * via the same `nodeAtLine` gap/child resolution `escalate.ts`'s `startLineOf`
 * walk relies on: the line right before `node`'s own start belongs to
 * whichever node (or nothing, in the preamble) precedes it, gap lines
 * included, by construction.
 */
export function previousNodeInOrder(doc: OutlineDoc, node: OutlineNode): OutlineNode | undefined {
  return nodeAtLine(doc, nodeStartLine(doc, node.id) - 1);
}

/**
 * The node immediately following `node` in full document order: the line
 * right after `node`'s own lines-plus-gap is either its first child (which
 * starts exactly there) or, if it has none, the next sibling — `nodeAtLine`
 * resolves either uniformly, so no separate child/sibling branch is needed
 * here.
 */
export function nextNodeInOrder(doc: OutlineDoc, node: OutlineNode): OutlineNode | undefined {
  const start = nodeStartLine(doc, node.id);
  return nodeAtLine(doc, start + node.lines.length + node.trailingGap.length);
}

/**
 * The addressable-position predicate (content-space-caret spec): true for
 * every position in the preamble (out of jurisdiction, D10) and every
 * position at or past a node's own line's content boundary; false for a
 * gap line or a position inside a marker prefix/continuation alignment.
 */
export function isAddressable(doc: OutlineDoc, pos: LinePos): boolean {
  const node = nodeAtLine(doc, pos.line);
  if (!node) return true; // preamble
  const lineIndex = pos.line - nodeStartLine(doc, node.id);
  if (lineIndex >= node.lines.length) return false; // this node's own trailing gap
  const line = node.lines[lineIndex] ?? '';
  return pos.ch >= contentBoundaryCh(node, line);
}

/**
 * Placement resolution (D2): maps a non-addressable position to a content
 * position via gap/marker OWNERSHIP, no proximity heuristic. A gap line
 * resolves to the owning node's (the one above it) content end; a marker
 * prefix resolves to that line's own content-start column. Positions
 * already addressable, and every preamble position, pass through unchanged.
 * Supersedes `escalate.ts`'s `clampCursorToContent`, which only handled the
 * marker case.
 */
export function resolvePlacement(doc: OutlineDoc, pos: LinePos): LinePos {
  const node = nodeAtLine(doc, pos.line);
  if (!node) return pos; // preamble: out of jurisdiction (D10)
  const lineIndex = pos.line - nodeStartLine(doc, node.id);
  if (lineIndex >= node.lines.length) return nodeContentEnd(doc, node); // gap line
  const line = node.lines[lineIndex] ?? '';
  const boundary = contentBoundaryCh(node, line);
  return pos.ch >= boundary ? pos : { line: pos.line, ch: boundary };
}

/**
 * The MARKER half of `resolvePlacement`, without the gap half: a position
 * inside a marker prefix resolves to that line's own content start;
 * everything else — including a gap line — passes through unchanged.
 *
 * This is exactly the old `escalate.ts`'s `clampCursorToContent` (design.md
 * D13, node-edit-enforcement), which content-space-caret generalized into
 * `resolvePlacement`. It survives as its own function because the two
 * halves have DIFFERENT jurisdiction over programmatic transactions
 * (docs/research/04 Q25): the marker clamp predates this change and has
 * always applied to any cursor from any source, while D2 deliberately
 * scopes the new gap-line half to real user gestures, leaving a
 * programmatic gap-line placement (`Editor.setSelection` from a plugin, a
 * workspace restore, a nested table-cell editor's focus hand-off) alone.
 * `transaction-filter.ts`'s `resolveForeignCursors` is the caller that
 * needs the marker half alone.
 */
export function resolveMarkerPlacement(doc: OutlineDoc, pos: LinePos): LinePos {
  const node = nodeAtLine(doc, pos.line);
  if (!node) return pos; // preamble: out of jurisdiction (D10)
  const lineIndex = pos.line - nodeStartLine(doc, node.id);
  if (lineIndex >= node.lines.length) return pos; // gap line: D2 leaves these to user gestures
  const line = node.lines[lineIndex] ?? '';
  const boundary = contentBoundaryCh(node, line);
  return pos.ch >= boundary ? pos : { line: pos.line, ch: boundary };
}

/**
 * Grapheme-cluster stepping for within-line horizontal motion.
 *
 * `ch` is a UTF-16 offset, so `ch ± 1` is a code UNIT, not a character: on
 * `a😀b`, Right from just after `a` landed between the emoji's surrogate halves,
 * and combining sequences (`e` + U+0301) split the same way. Native arrow motion
 * moves by grapheme cluster, and this planner replaced native motion, so it has
 * to do the same.
 *
 * `Intl.Segmenter` keeps this module CM6-free — CodeMirror's own
 * `findClusterBreak` would work but is not importable here. One segmenter is
 * built lazily and reused; segmenting a single line per keypress is cheap.
 */
let graphemeSegmenter: Intl.Segmenter | undefined;

function boundariesOf(line: string): number[] {
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const out = [0];
  for (const { index, segment } of graphemeSegmenter.segment(line)) out.push(index + segment.length);
  return out;
}

/** The next grapheme boundary strictly after `ch`, clamped to the line's end. */
function stepRight(line: string, ch: number): number {
  return boundariesOf(line).find((b) => b > ch) ?? line.length;
}

/** The last grapheme boundary strictly before `ch`, clamped to `floor`. */
function stepLeft(line: string, ch: number, floor: number): number {
  let prev = floor;
  for (const b of boundariesOf(line)) {
    if (b >= ch) break;
    if (b > prev) prev = b;
  }
  return prev;
}

/**
 * Horizontal-motion planner (D4): the next addressable position moving one
 * character in `direction`, or `null` when there is none to compute —
 * either the position is out of jurisdiction (the preamble) or there is no
 * neighboring node to cross to (a document boundary), in which case the
 * caller should decline and let stock CM6 handle the key (a true no-op at
 * the document's edge, or entering the preamble, both already correct
 * native behavior — see D10).
 *
 * Ordinary within-line motion (not at a line's own content boundary) is
 * answered directly rather than left to the caller, so a continuation
 * line's alignment whitespace and a list item's marker are skipped on
 * EVERY line of a multi-line node, not only at the node's own first/last
 * line — the addressable-position invariant is stated over every line, not
 * just node boundaries.
 */
export function planHorizontal(
  doc: OutlineDoc,
  pos: LinePos,
  direction: 'left' | 'right',
): LinePos | 'noop' | null {
  const node = nodeAtLine(doc, pos.line);
  if (!node) return null; // preamble: out of jurisdiction (D10), let stock CM6 run
  const lineIndex = pos.line - nodeStartLine(doc, node.id);

  // A caret CAN legitimately sit on a gap line: D2 scopes gap resolution to real
  // user gestures, so a programmatic placement is deliberately left there. Plan
  // it directionally rather than declining — declining sent the key to native
  // motion, which on the first line of a MULTI-line gap advanced to the next
  // blank line, and the placement filter then resolved that back to the
  // preceding node's content end: a press that moved the caret in the OPPOSITE
  // direction to the one requested. A gap belongs to the node above it, so left
  // means that owner's content end and right means the next node's start.
  if (lineIndex >= node.lines.length) {
    if (direction === 'left') return nodeContentEnd(doc, node);
    const afterGap = nextNodeInOrder(doc, node);
    return afterGap ? nodeContentStart(doc, afterGap) : 'noop';
  }

  const line = node.lines[lineIndex] ?? '';

  if (direction === 'left') {
    const boundary = contentBoundaryCh(node, line);
    if (pos.ch > boundary) return { line: pos.line, ch: stepLeft(line, pos.ch, boundary) };
    if (lineIndex > 0) {
      const prevLine = node.lines[lineIndex - 1] ?? '';
      return { line: pos.line - 1, ch: prevLine.length };
    }
    const prev = previousNodeInOrder(doc, node);
    if (prev) return nodeContentEnd(doc, prev);
    // Nothing above in NODE space — but a preamble is still reachable, and it is
    // out of jurisdiction (D10), so decline and let stock CM6 enter it. Only a
    // document with no preamble at all is a true edge.
    //
    // 'noop' rather than null for that edge: null declines the key, and native
    // motion at an edge is not the no-op it appears to be — it steps onto a
    // non-addressable line and only the placement filter brings it back, which is
    // the post-hoc correction bound motion exists to avoid.
    return doc.preamble.length > 0 ? null : 'noop';
  }

  if (pos.ch < line.length) return { line: pos.line, ch: stepRight(line, pos.ch) };
  if (lineIndex < node.lines.length - 1) {
    const nextLine = node.lines[lineIndex + 1] ?? '';
    return { line: pos.line + 1, ch: contentBoundaryCh(node, nextLine) };
  }
  const next = nextNodeInOrder(doc, node);
  return next ? nodeContentStart(doc, next) : 'noop';
}

