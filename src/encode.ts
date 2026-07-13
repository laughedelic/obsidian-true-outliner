/**
 * Block tree → markdown: pure span concatenation (design.md D2).
 * Emission order per node: own lines, trailing gap, then children —
 * which reproduces document order because blank-line runs are owned by
 * the node that precedes them.
 */

import type { OutlineDoc, OutlineNode } from './model';

export function encodeLines(doc: OutlineDoc): string[] {
  const out: string[] = [...doc.preamble];
  const emit = (node: OutlineNode): void => {
    out.push(...node.lines);
    out.push(...node.trailingGap);
    for (const child of node.children) emit(child);
  };
  for (const node of doc.children) emit(node);
  return out;
}

export function encode(doc: OutlineDoc): string {
  return encodeLines(doc).join('\n');
}
