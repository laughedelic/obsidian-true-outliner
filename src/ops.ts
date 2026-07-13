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

import type { OutlineDoc, OutlineNode } from './model';
import { findPath, isAtom, nodeAt, updateSiblings } from './model';
import { encode, encodeLines } from './encode';
import { parse, indentWidth } from './parse';
import type { Edit, OpResult } from './result';
import { accept, diffLines, reject } from './result';
import { encodingKindAtDestination } from './rules';
import { childBaseCol, headingWithLevel, markerWidth, reencodeForDestination } from './reencode';

export interface OpOutput {
  readonly doc: OutlineDoc;
  readonly edits: readonly Edit[];
}

const isContent = (node: OutlineNode): boolean =>
  node.kind === 'paragraph' || node.kind === 'list-item';

function childrenAt(doc: OutlineDoc, path: readonly number[]): readonly OutlineNode[] {
  return path.length === 0 ? doc.children : (nodeAt(doc, path)?.children ?? []);
}

function finalize(oldDoc: OutlineDoc, surgery: OutlineDoc): OpResult<OpOutput> {
  const normalized = normalizeBoundaries(surgery);
  const text = encode(normalized);
  return accept({
    doc: parse(text),
    edits: diffLines(encodeLines(oldDoc), text === '' ? [] : text.split('\n')),
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
  return finalize(doc, surgery);
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
  const moved = reencodeForDestination(node, newKind, childBaseCol(target));

  let surgery = updateSiblings(doc, parentPath, (nodes) => {
    const rest = nodes.filter((_, i) => i !== index);
    return renumberOrdered(rest);
  });
  surgery = updateSiblings(surgery, [...parentPath, index - 1], (nodes) =>
    renumberOrdered([...nodes.slice(0, insertIndex), moved, ...nodes.slice(insertIndex)]),
  );
  return finalize(doc, surgery);
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
  const moved = reencodeForDestination(node, newKind, childBaseCol(grandParent ?? 'root'));

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
  return finalize(doc, surgery);
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
    [out[a], out[a + 1]] = [out[a + 1]!, out[a]!];
    return renumberOrdered(out);
  });
  return finalize(doc, surgery);
}

export const moveUp = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, -1);
export const moveDown = (doc: OutlineDoc, nodeId: number): OpResult<OpOutput> =>
  move(doc, nodeId, 1);
