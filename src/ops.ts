/**
 * Structural operations under the two-regime algebra
 * (docs/research/04-open-questions.md):
 *
 *   HEADINGS         indent/outdent = level ± 1, whole subtree shifts,
 *                    hierarchy re-derives from levels; reject at h1/h6.
 *   EVERYTHING ELSE  indent = child of previous sibling, outdent =
 *                    brother→uncle; encoding recomputed from context.
 *
 * Implementation strategy: each op performs line surgery on the tree, then
 * the canonical result is parse(encode(surgery)) — closure with the mapping
 * holds by construction, and the inverse-law tests guard semantics.
 *
 * Markdown-imposed rejections beyond the bounds:
 * - content cannot become a *sibling of a heading section it is inside*
 *   (heading scope is positional), so outdent out of a heading is rejected;
 * - only list items can nest under a paragraph, and nothing nests under an
 *   atom;
 * - reordering across the heading/content divide (or between heading
 *   levels) has no positional encoding and is rejected.
 */

import type { NodePath, OutlineDoc, OutlineNode } from './model';
import { findPath, isAtom, makeNode, nodeAt, updateSiblings } from './model';
import { encode, encodeLines } from './encode';
import { parse, indentWidth } from './parse';
import type { Edit, OpResult } from './result';
import { accept, diffLines, reject } from './result';
import { encodingKindAtDestination } from './rules';
import {
  childBaseCol,
  headingWithLevel,
  leadingWhitespace,
  markerWidth,
  reencodeForDestination,
  shiftSubtree,
} from './reencode';

export interface OpOutput {
  readonly doc: OutlineDoc;
  readonly edits: readonly Edit[];
  /**
   * Where the operated-on node landed: its first line (0-based, in the new
   * text) and the character offset of its content start (after indentation
   * and any list/heading marker) — ready to become an editor cursor.
   */
  readonly cursor: { readonly line: number; readonly ch: number };
}

const isContent = (node: OutlineNode): boolean =>
  node.kind === 'paragraph' || node.kind === 'list-item';

function childrenAt(doc: OutlineDoc, path: readonly number[]): readonly OutlineNode[] {
  return path.length === 0 ? doc.children : (nodeAt(doc, path)?.children ?? []);
}

/** Char offset where a line's content starts (after indent + marker). */
export function contentColumnCh(line: string): number {
  const match = /^[ \t]*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+)?(?:#{1,6}[ \t]+)?/.exec(line);
  return match ? match[0].length : 0;
}

/** Start line of a node in a doc's encoding (ids preserved from surgery). */
function startLineOf(doc: OutlineDoc, id: number): number {
  let line = doc.preamble.length;
  let found = -1;
  const walk = (node: OutlineNode): void => {
    if (found !== -1) return;
    if (node.id === id) {
      found = line;
      return;
    }
    line += node.lines.length + node.trailingGap.length;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found === -1 ? 0 : found;
}

/**
 * `subjectId` is `undefined` only when a delete op consumes every node in
 * scope (deleteSubtrees's empty-document / empty-scope edge case) — the
 * cursor then lands at the scope's own start rather than on any node.
 */
export function finalize(
  oldDoc: OutlineDoc,
  surgery: OutlineDoc,
  subjectId: number | undefined,
): OpResult<OpOutput> {
  const normalized = normalizeBoundaries(surgery);
  const text = encode(normalized);
  const lines = text === '' ? [] : text.split('\n');
  const subjectLine =
    subjectId === undefined ? normalized.preamble.length : startLineOf(normalized, subjectId);
  return accept({
    doc: parse(text),
    edits: diffLines(encodeLines(oldDoc), lines),
    cursor: { line: subjectLine, ch: contentColumnCh(lines[subjectLine] ?? '') },
  });
}

// ---------------------------------------------------------------- headings

function shiftHeadingLevels(node: OutlineNode, delta: number): OutlineNode {
  const self =
    node.kind === 'heading' ? headingWithLevel(node, (node.level ?? 1) + delta) : node;
  return { ...self, children: self.children.map((child) => shiftHeadingLevels(child, delta)) };
}

function maxHeadingLevel(node: OutlineNode): number {
  let max = node.kind === 'heading' ? (node.level ?? 1) : 0;
  for (const child of node.children) max = Math.max(max, maxHeadingLevel(child));
  return max;
}

function headingLevelOp(
  doc: OutlineDoc,
  path: readonly number[],
  node: OutlineNode,
  delta: number,
): OpResult<OpOutput> {
  if (delta > 0 && maxHeadingLevel(node) >= 6) return reject('at-h6-bound');
  if (delta < 0 && (node.level ?? 1) <= 1) return reject('at-h1-bound');
  const surgery = updateSiblings(doc, path.slice(0, -1), (siblings) =>
    siblings.map((sibling, i) =>
      i === path[path.length - 1] ? shiftHeadingLevels(sibling, delta) : sibling,
    ),
  );
  return finalize(doc, surgery, node.id);
}

// ------------------------------------------------------- separation repair

function subtreeFinalNode(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  return last ? subtreeFinalNode(last) : node;
}

function appendFinalGap(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [...node.trailingGap, ''] };
  return {
    ...node,
    children: [...node.children.slice(0, -1), appendFinalGap(last)],
  };
}

function stripFinalGap(node: OutlineNode): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [] };
  return { ...node, children: [...node.children.slice(0, -1), stripFinalGap(last)] };
}

function setFinalGap(node: OutlineNode, gap: readonly string[]): OutlineNode {
  const last = node.children[node.children.length - 1];
  if (!last) return { ...node, trailingGap: [...gap] };
  return { ...node, children: [...node.children.slice(0, -1), setFinalGap(last, gap)] };
}

function needsBlankBetween(prev: OutlineNode, next: OutlineNode): boolean {
  const leaf = subtreeFinalNode(prev);
  if (leaf.trailingGap.length > 0) return false;
  if (leaf.kind === 'paragraph') {
    return (
      next.kind === 'paragraph' ||
      next.kind === 'html' ||
      (next.kind === 'heading' && next.setext === true) ||
      (next.kind === 'hr' && (next.lines[0] ?? '').includes('-'))
    );
  }
  if (leaf.kind === 'list-item') {
    const contentCol = indentWidth(leaf.lines[0] ?? '') + markerWidth(leaf);
    return (
      (next.kind === 'paragraph' || next.kind === 'html') &&
      indentWidth(next.lines[0] ?? '') >= contentCol
    );
  }
  return false;
}

/**
 * Insert the blank lines that keep adjacent blocks from merging on reparse.
 * On any tree that came out of `parse` this is a no-op — such boundaries
 * cannot exist there — so it only ever touches op-created seams.
 */
function normalizeBoundaries(doc: OutlineDoc): OutlineDoc {
  const fixList = (nodes: readonly OutlineNode[]): readonly OutlineNode[] => {
    const out = nodes.map((node) => {
      let fixed: OutlineNode = { ...node, children: fixList(node.children) };
      const firstChild = fixed.children[0];
      if (
        firstChild &&
        fixed.kind === 'list-item' &&
        fixed.trailingGap.length === 0 &&
        (firstChild.kind === 'paragraph' || firstChild.kind === 'html')
      ) {
        fixed = { ...fixed, trailingGap: [''] };
      }
      return fixed;
    });
    return out.map((node, i) =>
      i < out.length - 1 && needsBlankBetween(node, out[i + 1]!) ? appendFinalGap(node) : node,
    );
  };
  return { ...doc, children: fixList(doc.children) };
}

// ------------------------------------------------------ ordered renumbering

const ORDERED_MARKER_RE = /^([ \t]*)\d{1,9}([.)])/;

/**
 * Renumber maximal runs of ordered items. A run keeps its start number
 * (taken as the minimum present, so a swap doesn't inherit the moved item's
 * number while `5. 6. 7.`-style lists keep starting at 5).
 */
function renumberOrdered(nodes: readonly OutlineNode[]): readonly OutlineNode[] {
  const isOrdered = (n: OutlineNode): boolean =>
    n.kind === 'list-item' && n.listStyle?.type === 'ordered';

  const out = [...nodes];
  let i = 0;
  while (i < out.length) {
    if (!isOrdered(out[i]!)) {
      i++;
      continue;
    }
    let end = i;
    while (end < out.length && isOrdered(out[end]!)) end++;
    const run = out.slice(i, end);
    const startNumber = Math.min(
      ...run.map((n) => (n.listStyle as { number: number }).number),
    );
    run.forEach((node, k) => {
      const number = startNumber + k;
      const style = node.listStyle as { type: 'ordered'; number: number; delimiter: '.' | ')' };
      if (style.number === number) return;
      out[i + k] = {
        ...node,
        listStyle: { ...style, number },
        lines: node.lines.map((line, li) =>
          li === 0 ? line.replace(ORDERED_MARKER_RE, `$1${number}$2`) : line,
        ),
      };
    });
    i = end;
  }
  return out;
}

/**
 * The indentation STRING a node adopts at its destination — taken verbatim
 * from context (so tab-indented vaults stay tab-indented):
 * 1. an existing list-item at the landing site (sibling-to-be),
 * 2. else the parent's own indentation plus one inferred unit (list-item
 *    parents) or exactly the parent's indentation (paragraph parents),
 * 3. else '' under headings/root.
 */
export function destinationIndent(
  doc: OutlineDoc,
  parent: OutlineNode | 'root',
  siblingsAtDestination: readonly OutlineNode[],
): string {
  const sibling = siblingsAtDestination.find((n) => n.kind === 'list-item');
  if (sibling) return leadingWhitespace(sibling.lines[0] ?? '');
  if (parent === 'root' || parent.kind === 'heading') return '';
  const parentIndent = leadingWhitespace(parent.lines[0] ?? '');
  if (parent.kind === 'paragraph') return parentIndent;
  return parentIndent + inferIndentUnit(doc);
}

/** The document's list indent unit: tab if any indented list line uses one,
 * else the first indented item's spaces, else two spaces. */
function inferIndentUnit(doc: OutlineDoc): string {
  for (const node of walkDoc(doc)) {
    if (node.kind !== 'list-item') continue;
    const ws = leadingWhitespace(node.lines[0] ?? '');
    if (ws.includes('\t')) return '\t';
    if (ws.length > 0) return ws.length >= 4 ? '    ' : ws;
  }
  return '  ';
}

function* walkDoc(doc: OutlineDoc): Generator<OutlineNode> {
  function* walk(nodes: readonly OutlineNode[]): Generator<OutlineNode> {
    for (const node of nodes) {
      yield node;
      yield* walk(node.children);
    }
  }
  yield* walk(doc.children);
}

// ------------------------------------------------------------------ indent

export function indent(doc: OutlineDoc, nodeId: number): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelOp(doc, path, node, +1);

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const siblings = childrenAt(doc, parentPath);
  if (index === 0) return reject('no-previous-sibling');
  const target = siblings[index - 1]!;

  if (isAtom(target)) return reject('not-expressible-under-target');
  if (target.kind === 'paragraph' && !isContent(node)) {
    // Only list items can follow a paragraph as its children.
    return reject('not-expressible-under-target');
  }

  // Under a heading, direct content ends at the first sub-heading — insert
  // there so the node lands in the target's own section, not a child's.
  const firstSubheading = target.children.findIndex((child) => child.kind === 'heading');
  const insertIndex =
    target.kind === 'heading' && firstSubheading !== -1
      ? firstSubheading
      : target.children.length;

  const newKind = isContent(node)
    ? encodingKindAtDestination({
        parentKind: target.kind,
        precedingSiblings: target.children.slice(0, insertIndex),
        followingSiblings: target.children.slice(insertIndex),
      })
    : undefined;
  const moved = reencodeForDestination(
    node,
    newKind,
    destinationIndent(doc, target, target.children.slice(0, insertIndex)),
  );

  let surgery = updateSiblings(doc, parentPath, (nodes) => {
    const rest = nodes.filter((_, i) => i !== index);
    return renumberOrdered(rest);
  });
  surgery = updateSiblings(surgery, [...parentPath, index - 1], (nodes) =>
    renumberOrdered([...nodes.slice(0, insertIndex), moved, ...nodes.slice(insertIndex)]),
  );
  return finalize(doc, surgery, moved.id);
}

// ----------------------------------------------------------------- outdent

export function outdent(doc: OutlineDoc, nodeId: number): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;

  if (node.kind === 'heading') return headingLevelOp(doc, path, node, -1);

  if (path.length === 1) return reject('at-top-level');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = nodeAt(doc, parentPath)!;

  if (parent.kind === 'heading') {
    // Heading scope is positional: content placed after a section's body is
    // still inside the section — there is no "sibling of my heading" spot.
    return reject('not-expressible-under-target');
  }

  const grandPath = parentPath.slice(0, -1);
  const parentIndex = parentPath[parentPath.length - 1]!;
  const grandParent = grandPath.length === 0 ? undefined : nodeAt(doc, grandPath)!;
  if (grandPath.length > 0 && grandParent!.kind === 'heading' && node.kind !== 'paragraph' && node.kind !== 'list-item' && !isAtom(node)) {
    return reject('not-expressible-under-target');
  }
  const grandSiblings = childrenAt(doc, grandPath);

  const newKind = isContent(node)
    ? encodingKindAtDestination({
        parentKind: grandParent ? grandParent.kind : 'root',
        precedingSiblings: grandSiblings.slice(0, parentIndex + 1),
        followingSiblings: grandSiblings.slice(parentIndex + 1),
      })
    : undefined;
  const moved = reencodeForDestination(
    node,
    newKind,
    // Brother→uncle: the node lands at its former parent's level, so it
    // adopts the parent's own indentation string.
    node.kind === 'list-item' || newKind === 'list-item'
      ? leadingWhitespace(parent.lines[0] ?? '')
      : destinationIndent(doc, grandParent ?? 'root', []),
  );

  let surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrdered(nodes.filter((_, i) => i !== index)),
  );
  surgery = updateSiblings(surgery, grandPath, (nodes) =>
    renumberOrdered([
      ...nodes.slice(0, parentIndex + 1),
      moved,
      ...nodes.slice(parentIndex + 1),
    ]),
  );
  return finalize(doc, surgery, moved.id);
}

// -------------------------------------------------------------- reordering

function move(doc: OutlineDoc, nodeId: number, delta: -1 | 1): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const siblings = childrenAt(doc, parentPath);
  const other = siblings[index + delta];
  if (!other) return reject(delta < 0 ? 'no-sibling-above' : 'no-sibling-below');

  const bothHeadings = node.kind === 'heading' && other.kind === 'heading';
  if (node.kind === 'heading' || other.kind === 'heading') {
    // Positional encoding only supports swapping same-level sections.
    if (!bothHeadings || node.level !== other.level) {
      return reject('cannot-reorder-across-heading-boundary');
    }
  }

  const surgery = updateSiblings(doc, parentPath, (nodes) => {
    const out = [...nodes];
    const a = Math.min(index, index + delta);
    // Separator gaps are positional, not node-owned: the gap that followed
    // slot a stays at slot a (else the final-newline gap migrates mid-doc).
    const gapA = subtreeFinalNode(out[a]!).trailingGap;
    const gapB = subtreeFinalNode(out[a + 1]!).trailingGap;
    [out[a], out[a + 1]] = [setFinalGap(out[a + 1]!, gapA), setFinalGap(out[a]!, gapB)];
    return renumberOrdered(out);
  });
  return finalize(doc, surgery, node.id);
}

export const moveUp = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, -1);
export const moveDown = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, 1);

// ------------------------------------------------------------------- split

const LIST_MARKER_SPLIT_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]*)/;

/**
 * Split a paragraph/list-item node at a document position into two adjacent
 * same-kind siblings; children stay with the original (upper) node.
 *
 * Markdown nuance: an empty PARAGRAPH has no encoding (a blank line is a
 * gap), so an end-of-paragraph split yields no new node — just the blank
 * separation with the cursor on it; the sibling materializes when text is
 * typed. An empty list item ("-") is a real node.
 */
export function splitNode(
  doc: OutlineDoc,
  nodeId: number,
  position: { line: number; ch: number },
): OpResult<OpOutput> {
  const path = findPath(doc, nodeId);
  if (!path) return reject('node-not-found');
  const node = nodeAt(doc, path)!;
  if (node.kind !== 'paragraph' && node.kind !== 'list-item') return reject('cannot-split');

  const startLine = startLineOf(doc, nodeId);
  const lineIndex = position.line - startLine;
  if (lineIndex < 0 || lineIndex >= node.lines.length) return reject('cannot-split');
  const line = node.lines[lineIndex]!;
  // Never split inside indentation or a list marker.
  const ch = Math.min(Math.max(position.ch, contentColumnCh(line)), line.length);

  const upperLines = [...node.lines.slice(0, lineIndex), line.slice(0, ch)];
  const remainderFirst = line.slice(ch);
  const lowerRest = node.lines.slice(lineIndex + 1);
  const emptyRemainder = remainderFirst.trim() === '' && lowerRest.length === 0;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;

  // Content-adjacent split (structural-operations amendment 2026-07-21): a
  // node WITH children puts the remainder where the split point actually is
  // — directly above the existing children, as the new FIRST CHILD, encoded
  // per the child scope's kind rules — instead of a sibling that visually
  // jumps over the whole subtree. Falls through to the sibling path for the
  // one child-kind shape with no empty encoding (see below).
  if (node.children.length > 0) {
    const childKind = encodingKindAtDestination({
      parentKind: node.kind,
      precedingSiblings: [],
      followingSiblings: node.children,
    });
    // An empty paragraph has no markdown encoding, so an end-of-node split
    // whose child scope demands a paragraph can't materialize a first child
    // — fall through to the childless sibling behavior for that edge.
    if (!(emptyRemainder && childKind === 'paragraph')) {
      const indentText = destinationIndent(doc, node, node.children);
      let lower: OutlineNode;
      if (childKind === 'list-item') {
        const firstLine = emptyRemainder
          ? `${indentText}- `
          : `${indentText}- ${remainderFirst.trimStart()}`;
        const contPad = `${indentText}  `;
        lower = makeNode({
          kind: 'list-item',
          listStyle: { type: 'bullet', marker: '-' },
          lines: [firstLine, ...lowerRest.map((l) => `${contPad}${l.trimStart()}`)],
        });
      } else {
        lower = makeNode({
          kind: 'paragraph',
          lines: [
            `${indentText}${remainderFirst.trimStart()}`,
            ...lowerRest.map((l) => `${indentText}${l.trimStart()}`),
          ],
        });
      }
      const upper: OutlineNode = {
        ...node,
        lines: upperLines,
        children: [lower, ...node.children],
      };
      const surgery = updateSiblings(doc, parentPath, (nodes) =>
        nodes.map((n, i) => (i === index ? upper : n)),
      );
      return finalize(doc, surgery, lower.id);
    }
  }

  if (node.kind === 'paragraph' && emptyRemainder) {
    // End-of-paragraph split: no empty-paragraph encoding exists, so widen
    // the gap and put the cursor on a line that is blank-separated on BOTH
    // sides — typing there materializes the sibling instead of rejoining a
    // neighbor.
    const surgery = updateSiblings(doc, parentPath, (nodes) =>
      nodes.map((n, i) => (i === index ? { ...n, trailingGap: ['', '', ...n.trailingGap] } : n)),
    );
    const result = finalize(doc, surgery, nodeId);
    if (!result.ok) return result;
    return accept({
      ...result.value,
      cursor: { line: startLine + node.lines.length + 1, ch: 0 },
    });
  }

  let lower: OutlineNode;
  if (node.kind === 'list-item') {
    const match = LIST_MARKER_SPLIT_RE.exec(node.lines[0] ?? '')!;
    const markerPrefix = `${match[1]}${match[2]} `;
    const firstLine = emptyRemainder
      ? markerPrefix
      : `${markerPrefix}${remainderFirst.trimStart()}`;
    lower = makeNode({
      kind: 'list-item',
      ...(node.listStyle ? { listStyle: node.listStyle } : {}),
      lines: [firstLine, ...lowerRest],
    });
  } else {
    lower = makeNode({
      kind: 'paragraph',
      lines: [remainderFirst, ...lowerRest],
    });
  }

  // The gap that separated the node's SUBTREE from what follows moves to the
  // lower half — it is now what precedes the next sibling.
  let upper: OutlineNode = { ...node, lines: upperLines };
  const finalGap = subtreeFinalNode(upper).trailingGap;
  upper = stripFinalGap(upper);
  lower = { ...lower, trailingGap: [...finalGap] };

  const surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrdered([...nodes.slice(0, index), upper, lower, ...nodes.slice(index + 1)]),
  );
  return finalize(doc, surgery, lower.id);
}

// ---------------------------------------------------------- edit-enforcement
//
// The three operations node-edit-enforcement's verdict layer (src/enforce.ts)
// rewrites boundary-crossing user edits into (design.md D2). Same discipline
// as the ops above: total (accept or typed reject, never throw), closure
// (accepted results re-parse to themselves), minimal edits.

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Subtree deletion (structural-operations delta): removes a contiguous run
 * of whole sibling subtrees, trailing gaps included — each removed node's
 * own `trailingGap` (and, for a subtree with children, its deepest last
 * descendant's) leaves with it, so the surviving neighbors' own lines and
 * gaps are untouched verbatim. `nodeIds` order doesn't matter; the set must
 * be exactly one contiguous run of siblings under one parent, or the whole
 * call is rejected (no partial application).
 */
export function deleteSubtrees(doc: OutlineDoc, nodeIds: readonly number[]): OpResult<OpOutput> {
  if (nodeIds.length === 0) return reject('empty-selection');
  const paths: NodePath[] = [];
  for (const id of nodeIds) {
    const path = findPath(doc, id);
    if (!path) return reject('node-not-found');
    paths.push(path);
  }
  const parentPath = paths[0]!.slice(0, -1);
  if (!paths.every((p) => arraysEqual(p.slice(0, -1), parentPath))) {
    return reject('non-contiguous-subtrees');
  }
  const indices = paths.map((p) => p[p.length - 1]!).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1) return reject('non-contiguous-subtrees');
  }
  const lo = indices[0]!;
  const hi = indices[indices.length - 1]!;
  const siblings = childrenAt(doc, parentPath);

  const survivorAfter = siblings[hi + 1];
  const survivorBefore = lo > 0 ? siblings[lo - 1] : undefined;
  const subjectId =
    survivorAfter?.id ??
    survivorBefore?.id ??
    (parentPath.length > 0 ? nodeAt(doc, parentPath)!.id : undefined);

  const surgery = updateSiblings(doc, parentPath, (nodes) =>
    renumberOrdered([...nodes.slice(0, lo), ...nodes.slice(hi + 1)]),
  );
  return finalize(doc, surgery, subjectId);
}

/**
 * The node immediately following `path` in full document order (preorder
 * traversal successor): descends into `path`'s own first child when it has
 * children (the raw-next-line owner — what Delete-at-end actually abuts),
 * else the next sibling, else walks up to the nearest ancestor with one.
 */
function rawSuccessorPath(doc: OutlineDoc, path: NodePath): NodePath | undefined {
  const node = nodeAt(doc, path)!;
  if (node.children.length > 0) return [...path, 0];
  let p: NodePath = path;
  while (p.length > 0) {
    const parentPath = p.slice(0, -1);
    const index = p[p.length - 1]!;
    const siblings = childrenAt(doc, parentPath);
    if (index + 1 < siblings.length) return [...parentPath, index + 1];
    p = parentPath;
  }
  return undefined;
}

/**
 * `second`'s content as bare text lines: first line stripped of any list
 * marker, continuation lines stripped of their leading whitespace — the
 * kind-free content the merge appends, re-clothed in `first`'s own encoding.
 */
function bareContentLines(node: OutlineNode): string[] {
  const first = node.lines[0] ?? '';
  const match = node.kind === 'list-item' ? LIST_MARKER_SPLIT_RE.exec(first) : null;
  const head = match ? first.slice(match[0].length) : first.trimStart();
  return [head, ...node.lines.slice(1).map((line) => line.trimStart())];
}

/**
 * Per-kind merge table (structural-operations delta, as amended 2026-07-21 —
 * pinned here): content kinds (paragraph/list-item) join ACROSS kinds, the
 * survivor keeping its own kind and marker, `second`'s content appended
 * directly at `first`'s content end and its children re-parented under the
 * merged node; a heading `first` absorbs single-line content only (a
 * markdown heading has no continuation lines); absorbing a heading, or an
 * atom on either side, rejects. `first`'s trailing gap is consumed
 * (chrome-transparency: the merge behaves as if the gap did not exist).
 */
export function mergeNodes(doc: OutlineDoc, firstId: number): OpResult<OpOutput> {
  const path = findPath(doc, firstId);
  if (!path) return reject('node-not-found');
  const first = nodeAt(doc, path)!;
  const nextPath = rawSuccessorPath(doc, path);
  if (!nextPath) return reject('no-following-neighbor');
  const second = nodeAt(doc, nextPath)!;

  if (isAtom(first) || isAtom(second)) return reject('merge-not-expressible');
  if (second.kind === 'heading') return reject('merge-not-expressible');

  const content = bareContentLines(second);
  let mergedLines: readonly string[];
  if (first.kind === 'heading') {
    if (content.length > 1) return reject('merge-not-expressible');
    // Append to the heading's TEXT line — for setext that's line 0 (the
    // underline's length is not significant to the parser), for ATX the
    // single line.
    const textIdx = first.setext ? 0 : first.lines.length - 1;
    mergedLines = first.lines.map((line, i) => (i === textIdx ? line + (content[0] ?? '') : line));
  } else {
    // Continuations re-clothe in first's own encoding: aligned to its
    // content column (list items) or its own indent (paragraphs).
    const contPad =
      first.kind === 'list-item'
        ? leadingWhitespace(first.lines[0] ?? '') + ' '.repeat(markerWidth(first))
        : leadingWhitespace(first.lines[0] ?? '');
    mergedLines = [
      ...first.lines.slice(0, -1),
      (first.lines[first.lines.length - 1] ?? '') + (content[0] ?? ''),
      ...content.slice(1).map((line) => contPad + line),
    ];
  }

  // second's children re-parent under the merged node: shift from second's
  // child column to first's, preserving internal structure; when second was
  // first's own first child they precede first's remaining children (they
  // take second's structural position), else first is childless (its raw
  // successor was reached by walking up or sideways) and they become its
  // only children.
  const childShift = childBaseCol(first) - childBaseCol(second);
  const adopted = second.children.map((child) => shiftSubtree(child, childShift));

  const firstParentPath = path.slice(0, -1);
  const firstIndex = path[path.length - 1]!;
  const secondParentPath = nextPath.slice(0, -1);
  const secondIndex = nextPath[nextPath.length - 1]!;
  const secondIsFirstChild =
    arraysEqual(secondParentPath, path) && secondIndex === 0;

  const merged: OutlineNode = {
    ...first,
    lines: [...mergedLines],
    trailingGap: second.trailingGap,
    children: secondIsFirstChild
      ? [...adopted, ...first.children.slice(1)]
      : adopted,
  };

  let surgery: OutlineDoc;
  if (secondIsFirstChild) {
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      nodes.map((n, i) => (i === firstIndex ? merged : n)),
    );
  } else if (arraysEqual(firstParentPath, secondParentPath)) {
    surgery = updateSiblings(doc, firstParentPath, (nodes) =>
      renumberOrdered([
        ...nodes.slice(0, firstIndex),
        merged,
        ...nodes.slice(firstIndex + 1, secondIndex),
        ...nodes.slice(secondIndex + 1),
      ]),
    );
  } else {
    // `second` sits at a different scope, reached by walking up past `first`
    // (which is childless in this branch — a node with children always has
    // its own first child as successor): remove `second` from its own level
    // first, then replace `first` in place at its own level.
    surgery = updateSiblings(doc, secondParentPath, (nodes) =>
      renumberOrdered([...nodes.slice(0, secondIndex), ...nodes.slice(secondIndex + 1)]),
    );
    surgery = updateSiblings(surgery, firstParentPath, (nodes) =>
      nodes.map((n, i) => (i === firstIndex ? merged : n)),
    );
  }

  const result = finalize(doc, surgery, merged.id);
  if (!result.ok) return result;
  // Cursor at the JOIN point, not the merged node's start (finalize's
  // generic convention, right for indent/outdent/split but not a merge):
  // the join line is `first`'s own last (or, for a setext heading, first)
  // line — still findable post-reparse since it's a fixed offset from the
  // already-correct start-of-node line `finalize` computed.
  const joinLineOffset = first.kind === 'heading' && first.setext ? 0 : first.lines.length - 1;
  const joinLine = result.value.cursor.line + joinLineOffset;
  const joinCh = (first.lines[joinLineOffset] ?? '').length;
  return accept({ ...result.value, cursor: { line: joinLine, ch: joinCh } });
}

/**
 * Splices a parsed sequence of whole subtrees into the tree immediately
 * before/after `anchorId`, re-encoded (kind and indentation) for the
 * anchor's own sibling scope per the same mapping algebra `indent`/`outdent`
 * use. Rejects sequences inexpressible at that scope: a heading anywhere in
 * the sequence when the scope isn't root/heading-section level (headings
 * are positional/global — parse.ts never nests one under a list or
 * paragraph), or an atom when the scope is a paragraph's children (atoms
 * cannot nest under a paragraph, mirroring `indent`'s own rule).
 */
/**
 * Re-indents a whole subtree for a new destination by swapping its OWN
 * leading-whitespace PREFIX for `indentText` on every line, top to bottom —
 * preserving each descendant's ORIGINAL relative indent string beyond the
 * top node's own prefix verbatim, rather than adding a flat column delta.
 * Fixes a real bug `shiftSubtree`'s delta approach has for a pasted
 * subtree specifically (unlike indent/outdent's own single-level moves,
 * which keep using `reencodeForDestination`/`shiftSubtree` unchanged): a
 * numeric delta gets inserted as spaces regardless of the destination's own
 * unit, so a multi-level tab-indented subtree pasted somewhere landed with
 * descendants mixing the original tabs with newly-added spaces — same
 * WIDTH, wrong characters, and visibly inconsistent (design.md D15, third
 * manual pass finding). A string-prefix swap can't mismatch: whatever unit
 * the copied subtree's OWN internal nesting already used carries over
 * exactly, just re-rooted at the new depth.
 */
export function reindentSubtreeVerbatim(node: OutlineNode, indentText: string): OutlineNode {
  const topWs = leadingWhitespace(node.lines[0] ?? '');
  const swapLine = (line: string): string => {
    if (line.trim() === '') return line;
    const ws = leadingWhitespace(line);
    return ws.startsWith(topWs) ? indentText + line.slice(topWs.length) : line;
  };
  const recur = (n: OutlineNode): OutlineNode => ({
    ...n,
    lines: n.lines.map(swapLine),
    children: n.children.map(recur),
  });
  return recur(node);
}

/**
 * The shared re-encode step `insertSubtrees` and enforce.ts's own
 * no-surviving-anchor fallback (a paste replacing the only content in some
 * scope, D16) both need: given the destination scope's context (parent plus
 * whatever siblings will flank the inserted run — empty arrays when there
 * are none), re-encode each parsed block for that depth/kind, exactly once,
 * so the two call sites can never drift apart on the rule (the exact
 * failure D16 was: a second, ad hoc call site that forgot to re-indent at
 * all).
 */
export function reencodeBlocksForDestination(
  doc: OutlineDoc,
  parent: OutlineNode | 'root',
  precedingSiblings: readonly OutlineNode[],
  followingSiblings: readonly OutlineNode[],
  parsedBlocks: readonly OutlineNode[],
): readonly OutlineNode[] {
  const indentText = destinationIndent(doc, parent, precedingSiblings);
  const newContentKind = encodingKindAtDestination({
    parentKind: parent === 'root' ? 'root' : parent.kind,
    precedingSiblings,
    followingSiblings,
  });
  return parsedBlocks.map((block) => {
    const isContentBlock = block.kind === 'paragraph' || block.kind === 'list-item';
    if (!isContentBlock || newContentKind === block.kind) {
      // No kind conversion needed: a verbatim whole-subtree re-indent keeps
      // every descendant's original indent unit intact (see
      // reindentSubtreeVerbatim's own comment for why this differs from
      // reencodeForDestination's numeric-delta approach here).
      return reindentSubtreeVerbatim(block, indentText);
    }
    return reencodeForDestination(block, newContentKind, indentText);
  });
}

export function insertSubtrees(
  doc: OutlineDoc,
  anchorId: number,
  parsedBlocks: readonly OutlineNode[],
  position: 'before' | 'after',
): OpResult<OpOutput> {
  if (parsedBlocks.length === 0) return reject('empty-selection');
  const anchorPath = findPath(doc, anchorId);
  if (!anchorPath) return reject('node-not-found');
  const parentPath = anchorPath.slice(0, -1);
  const anchorIndex = anchorPath[anchorPath.length - 1]!;
  const parent = parentPath.length === 0 ? 'root' : nodeAt(doc, parentPath)!;
  const siblings = childrenAt(doc, parentPath);

  const containsHeading = (node: OutlineNode): boolean =>
    node.kind === 'heading' || node.children.some(containsHeading);
  if (parsedBlocks.some(containsHeading) && parent !== 'root' && parent.kind !== 'heading') {
    return reject('insertion-not-expressible');
  }
  if (parsedBlocks.some((b) => isAtom(b)) && parent !== 'root' && parent.kind === 'paragraph') {
    return reject('insertion-not-expressible');
  }

  const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1;
  const precedingSiblings = siblings.slice(0, insertIndex);
  const followingSiblings = siblings.slice(insertIndex);
  const reencoded = reencodeBlocksForDestination(doc, parent, precedingSiblings, followingSiblings, parsedBlocks);

  // Gap ownership (design.md D2, mirroring splitNode's own gap-repair):
  // the anchor's trailing gap represents its separation from whatever
  // FOLLOWED it, which is only still true when inserting BEFORE it. When
  // inserting AFTER, that gap now belongs between the pasted run and
  // whatever followed — it moves onto the last inserted block, and the
  // anchor's own gap is stripped so it doesn't leave a spurious blank line
  // before the pasted content. Either way, the block that newly lands
  // adjacent to the anchor (the last one, for both directions) carries no
  // gap of its own — any gap the destination genuinely needs is added by
  // `normalizeBoundaries` in `finalize`, same as for a fresh adjacency.
  const anchor = siblings[anchorIndex]!;
  const lastIdx = reencoded.length - 1;
  let finalReencoded = reencoded;
  let finalAnchor = anchor;
  if (position === 'after') {
    const carriedGap = subtreeFinalNode(anchor).trailingGap;
    finalAnchor = stripFinalGap(anchor);
    finalReencoded = [
      ...reencoded.slice(0, lastIdx),
      setFinalGap(reencoded[lastIdx]!, carriedGap),
    ];
  } else {
    finalReencoded = [...reencoded.slice(0, lastIdx), stripFinalGap(reencoded[lastIdx]!)];
  }

  const surgery = updateSiblings(doc, parentPath, (nodes) => {
    const withAnchor = nodes.map((n, i) => (i === anchorIndex ? finalAnchor : n));
    return renumberOrdered([
      ...withAnchor.slice(0, insertIndex),
      ...finalReencoded,
      ...withAnchor.slice(insertIndex),
    ]);
  });
  return finalize(doc, surgery, finalReencoded[0]!.id);
}
