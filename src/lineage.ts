/**
 * Lineage collapsing over a projected tree: the presentational half of
 * `project.ts`, kept separate from it on purpose (see that module's header).
 *
 * A projection preserves every ancestor of a match, which is correct and
 * unreadable — a reference four levels down costs four rows of context to show
 * one row of substance. Collapsing folds each run of nodes that neither matches
 * nor branches into a single lineage CHAIN, so the tree splits only where it
 * genuinely diverges. It is the rule IDE file explorers use for unambiguous
 * directory paths, and it applies **recursively to every sub-branch**, not only
 * to the common prefix:
 *
 *     - a                            a › b
 *       - b                            • first mention
 *         - first mention            c › d
 *         - c                          • second mention
 *           - d                      e › f › g
 *             - second mention         • third mention
 *         - e
 *           - f
 *             - g
 *               - third mention
 *
 * A chain absorbs the branch point that terminates it, as its last element —
 * `a › b`, not `a` with `b` below — because the branch is already visible in
 * what sits under the chain, and a row spent restating it buys nothing. A chain
 * terminated by a MATCH does not absorb it: the match is the substance, and
 * demoting it into dim context would be exactly backwards.
 */

import type { NodeKind, OutlineNode } from './model';

/** One rendered row: either a collapsed run of context, or a real node. */
export type LineageRow =
  | {
      readonly type: 'lineage';
      /** Nesting level within the projection, in ancestor steps. */
      readonly depth: number;
      /** In source order, root-most first. Never empty. */
      readonly elements: readonly OutlineNode[];
      /** The first element's kind, so a consumer can mark the chain the same
       * way it marks any node of that kind. */
      readonly kind: NodeKind;
    }
  | {
      readonly type: 'node';
      readonly depth: number;
      readonly node: OutlineNode;
      /** True when this node satisfied the projection's predicate. */
      readonly isMatch: boolean;
    };

/**
 * Flattens a projected tree into rows, collapsing unbranching context runs.
 *
 * `matches` must be the same predicate the projection was taken with: a node's
 * role here is decided by whether it is a match, and asking a different question
 * than the projection did would produce chains that collapse the wrong nodes.
 */
export function collapseLineage(
  nodes: readonly OutlineNode[],
  matches: (node: OutlineNode) => boolean,
): LineageRow[] {
  const rows: LineageRow[] = [];
  emit(nodes, 0);
  return rows;

  function emit(list: readonly OutlineNode[], depth: number): void {
    for (const node of list) {
      if (matches(node)) {
        rows.push({ type: 'node', depth, node, isMatch: true });
        emitDescendants(node.children, depth + 1);
        continue;
      }

      // Walk down while each step is the only way forward and is not itself the
      // substance. `chain` ends at a match's parent, or at a branch point, or at
      // a node with nothing under it.
      const chain: OutlineNode[] = [node];
      let cursor = node;
      while (!matches(cursor) && cursor.children.length === 1) {
        cursor = cursor.children[0]!;
        chain.push(cursor);
      }

      const last = chain[chain.length - 1]!;
      // A terminating match is substance, not context: drop it from the chain
      // and let it render as itself, one level below.
      const elements = matches(last) ? chain.slice(0, -1) : chain;

      if (elements.length > 0) {
        rows.push({
          type: 'lineage',
          depth,
          elements,
          kind: elements[0]!.kind,
        });
      }

      const below = elements.length > 0 ? depth + 1 : depth;
      if (matches(last)) {
        rows.push({ type: 'node', depth: below, node: last, isMatch: true });
        emitDescendants(last.children, below + 1);
      } else {
        // A branch point (or a dead end, which emits nothing). Its children each
        // collapse on their own — this is the recursion the rule turns on.
        emit(last.children, below);
      }
    }
  }

  /** A match's own subtree renders as plain nodes: it is what the reader asked
   * to see, so none of it is context to be collapsed away. */
  function emitDescendants(list: readonly OutlineNode[], depth: number): void {
    for (const node of list) {
      rows.push({ type: 'node', depth, node, isMatch: false });
      emitDescendants(node.children, depth + 1);
    }
  }
}

/** A lineage chain's elements as their first lines — the identifying text.
 * Continuation lines are context for reading a node, not for naming it. */
export function lineageText(row: Extract<LineageRow, { type: 'lineage' }>): string[] {
  return row.elements.map((node) => node.lines[0] ?? '');
}
