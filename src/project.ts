/**
 * Pruned tree projection: given a document and a predicate over its nodes, the
 * subset of the tree that leads to the matches.
 *
 * A projection is a **subset operation**, deliberately nothing more. It keeps
 * every matching node, every ancestor of a match, and each match's own
 * descendants down to a caller-chosen depth; it never synthesises, merges,
 * splits or rewrites a node, so a projected node's kind, level, list style,
 * lines and trailing gap are the source node's, unchanged. That is what lets
 * `decorate()` accept a projection with no special-casing at all: the whole
 * point of D-A (change design.md) is one derivation of outline chrome, shared
 * with whatever renders a filtered view of a document.
 *
 * Lineage collapsing lives in `lineage.ts`, NOT here. Keeping them apart means
 * this function's guarantees stay stateable and testable on their own — subset,
 * document order, no synthesis, idempotent — while collapsing stays a
 * presentational regrouping that can change without touching the structure. It
 * is also the half that zoom and filtered search would reuse; the collapsing is
 * not.
 */

import type { OutlineDoc, OutlineNode } from './model';

/** Answers whether a node is one the projection is being taken FOR. */
export type NodePredicate = (node: OutlineNode) => boolean;

export interface ProjectOptions {
  /**
   * How many levels of a match's own descendants to keep. 0 keeps none, 1 keeps
   * immediate children, and so on. Ancestors are always kept in full — a path
   * with a hole in it is not a path.
   */
  readonly descendantDepth: number;
}

/**
 * Rebuilds `node` keeping only the children that lead to a match, plus its own
 * descendants when it is one. Returns `undefined` when nothing under or at this
 * node matched, which is what prunes whole subtrees.
 *
 * `keepDescendants` is threaded down rather than recomputed because a node
 * beneath a match is kept for a different reason than a node above one: the
 * first is content the caller asked to see, the second is context it needs to
 * read it.
 */
function prune(
  node: OutlineNode,
  matches: NodePredicate,
  depth: number,
  keepDescendants: number,
): OutlineNode | undefined {
  if (keepDescendants > 0) {
    // Inside a match's subtree: this node is kept whatever it is. But a node
    // that is ITSELF a match renews the allowance for its own children rather
    // than spending the last of its ancestor's.
    //
    // Without that, `A(match) > B(match) > C` at `descendantDepth: 1` dropped
    // C — B consumed A's final unit — though C is the immediate child of a
    // match, and every match is owed its own level of context.
    const next = matches(node) ? depth : keepDescendants - 1;
    const children = node.children
      .map((child) => prune(child, matches, depth, next))
      .filter((child): child is OutlineNode => child !== undefined);
    return { ...node, children };
  }

  const isMatch = matches(node);
  if (isMatch) {
    const children = node.children
      .map((child) => prune(child, matches, depth, depth))
      .filter((child): child is OutlineNode => child !== undefined);
    return { ...node, children };
  }

  const children = node.children
    .map((child) => prune(child, matches, depth, 0))
    .filter((child): child is OutlineNode => child !== undefined);
  // An ancestor earns its place only by leading somewhere.
  return children.length > 0 ? { ...node, children } : undefined;
}

/**
 * The subset of `doc` that leads to nodes satisfying `matches`.
 *
 * The preamble is dropped: frontmatter is not a node, has no place in the tree,
 * and a projection that carried it would be claiming otherwise.
 */
export function project(
  doc: OutlineDoc,
  matches: NodePredicate,
  options: ProjectOptions = { descendantDepth: 1 },
): OutlineDoc {
  const depth = Math.max(0, options.descendantDepth);
  const children = doc.children
    .map((child) => prune(child, matches, depth, 0))
    .filter((child): child is OutlineNode => child !== undefined);
  return { preamble: [], children };
}

/**
 * A node's own subtree AS a document, re-rooted: the node becomes the only root,
 * at depth 0, with no ancestors and no preamble.
 *
 * The sibling of `project`, not a special case of it, and the difference is the
 * point. A projection deliberately KEEPS every ancestor of a match precisely so
 * that a match's depth in the projection equals its depth in the source; this
 * keeps none, precisely so the subject sits at depth 0 whatever its source depth
 * was. Both are right for their own consumer — backlinks needs the context rows,
 * zoom needs the re-basing — and neither can be expressed as the other with a
 * cleverer predicate.
 *
 * What they share is the contract that makes either useful, and it is stated
 * once for both: a detached tree every pure consumer of a parsed document
 * accepts unchanged, `decorate()` included. Nothing is synthesised, merged,
 * split or rewritten — the subject and its descendants are the source nodes.
 *
 * Because a node's subtree occupies a CONTIGUOUS run of source lines and the
 * result has no preamble, line K of the result is line N + K of the source,
 * where N is the subject's own start line. That constant offset is the whole of
 * the coordinate translation its consumers need.
 */
export function subtreeDocument(node: OutlineNode): OutlineDoc {
  return { preamble: [], children: [node] };
}

/** True when the projection kept nothing — a normal answer, not an error. */
export function isEmptyProjection(doc: OutlineDoc): boolean {
  return doc.children.length === 0;
}
