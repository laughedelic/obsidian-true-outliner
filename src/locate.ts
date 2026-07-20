/**
 * Cursor-line → node resolution over a parsed document. A node owns its own
 * lines and its trailing gap; a cursor on a gap line resolves to the node
 * that precedes it. Preamble lines resolve to nothing.
 *
 * Lives in core (not src/plugin/) so pure core consumers — classify.ts's
 * change-range boundary checks, escalate.ts's selection-end resolution —
 * can use it without depending on the plugin layer. src/plugin/locate.ts
 * re-exports this for its existing CM6-adapter consumers.
 */

import type { OutlineDoc, OutlineNode } from './model';

export function nodeAtLine(doc: OutlineDoc, line: number): OutlineNode | undefined {
  let current = doc.preamble.length;
  if (line < current) return undefined;
  let found: OutlineNode | undefined;
  const walk = (node: OutlineNode): void => {
    if (found) return;
    const end = current + node.lines.length + node.trailingGap.length;
    if (line < end) {
      found = node;
      // Descend no further: children come after this node's own span.
      return;
    }
    current = end;
    node.children.forEach(walk);
  };
  doc.children.forEach(walk);
  return found;
}
