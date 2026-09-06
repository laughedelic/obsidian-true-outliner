/**
 * Line geometry over a parsed document: the one traversal that pairs each
 * node with its absolute line position, plus the two lookups built on it. A
 * node owns its own lines and its trailing gap; a cursor on a gap line
 * resolves to the node that precedes it. Preamble lines resolve to nothing.
 *
 * Lives in core (not src/plugin/) so pure core consumers — classify.ts's
 * change-range boundary checks, escalate.ts's selection-end resolution —
 * can use it without depending on the plugin layer.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { ownSpan } from './model';

/**
 * Every node in document order, with its own start line and its depth (0 at
 * the top level). Returning `false` from `visit` stops the walk — the lookups
 * below all short-circuit, and a document-length scan per caret keystroke is
 * exactly what this layer cannot afford.
 *
 * The shared home for a walk four other modules had each re-implemented
 * privately: `preamble.length` seeding plus `ownSpan` accumulation IS the
 * document's line layout, and getting it subtly wrong in one copy stays
 * invisible until a note with frontmatter or an unusual gap shows up.
 *
 * A callback rather than a generator on purpose. The generator version read
 * better and measured 19× slower on the `nodeStartLine` path (360-node note,
 * every id looked up: 10ms raw walk, 190ms generator, 19ms callback) — the
 * per-node record plus generator plumbing, on a traversal that runs inside
 * `transaction-classification`'s keystroke budget.
 */
export function forEachNodeWithLine(
  doc: OutlineDoc,
  visit: (node: OutlineNode, startLine: number, depth: number) => boolean | void,
): void {
  let startLine = doc.preamble.length;
  const walk = (nodes: readonly OutlineNode[], depth: number): boolean => {
    for (const node of nodes) {
      if (visit(node, startLine, depth) === false) return false;
      startLine += ownSpan(node);
      if (!walk(node.children, depth + 1)) return false;
    }
    return true;
  };
  walk(doc.children, 0);
}

/** A node's own absolute start line (0-based) in `doc`, by id; -1 when the
 * id is absent — callers decide, rather than a silent line 0. */
export function nodeStartLine(doc: OutlineDoc, id: number): number {
  let found = -1;
  forEachNodeWithLine(doc, (node, startLine) => {
    if (node.id !== id) return;
    found = startLine;
    return false;
  });
  return found;
}

/**
 * The document's total line count: the preamble plus every node's own span.
 *
 * Here rather than in a consumer because it is the same `preamble.length` plus
 * `ownSpan` accumulation `forEachNodeWithLine` walks — the module comment above
 * exists because four modules had each re-implemented that sum privately, and a
 * fifth copy computing the END of it would be the same mistake one step later.
 */
export function documentLineCount(doc: OutlineDoc): number {
  let total = doc.preamble.length;
  forEachNodeWithLine(doc, (node) => {
    total += ownSpan(node);
  });
  return total;
}

export function nodeAtLine(doc: OutlineDoc, line: number): OutlineNode | undefined {
  if (line < doc.preamble.length) return undefined;
  let found: OutlineNode | undefined;
  forEachNodeWithLine(doc, (node, startLine) => {
    // Spans are contiguous and every node owns at least its own first line,
    // so the first span reaching past `line` is the one containing it.
    if (line >= startLine + ownSpan(node)) return;
    found = node;
    return false;
  });
  return found;
}
