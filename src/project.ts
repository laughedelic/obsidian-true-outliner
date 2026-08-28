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
    // Inside a match's subtree: keep everything to the remaining depth, without
    // consulting the predicate again. A descendant that also matches is still
    // just a descendant here; it gets its own entry from its own ancestor walk.
    const children = node.children
      .map((child) => prune(child, matches, depth, keepDescendants - 1))
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

/** True when the projection kept nothing — a normal answer, not an error. */
export function isEmptyProjection(doc: OutlineDoc): boolean {
  return doc.children.length === 0;
}
