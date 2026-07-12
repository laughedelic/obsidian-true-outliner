/**
 * Line-surgery helpers: re-encode a node (and its subtree) for a new
 * destination. Only the lines that must change are rewritten; everything
 * else is carried verbatim.
 */

import type { OutlineNode } from './model';
import { indentWidth } from './parse';

const LIST_MARKER_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]?)/;

export function markerWidth(node: OutlineNode): number {
  const match = LIST_MARKER_RE.exec(node.lines[0] ?? '');
  return match ? match[2]!.length + 1 : 2;
}

/** The column at which a node's children must be indented. */
export function childBaseCol(parent: OutlineNode | 'root'): number {
  if (parent === 'root' || parent.kind === 'heading') return 0;
  const indent = indentWidth(parent.lines[0] ?? '');
  if (parent.kind === 'list-item') return indent + markerWidth(parent);
  return indent; // paragraph: child lists sit at the paragraph's own indent
}

function shiftLine(line: string, delta: number): string {
  if (line.trim() === '') return line;
  if (delta === 0) return line;
  if (delta > 0) return ' '.repeat(delta) + line;
  // Dedent: remove up to -delta columns of leading whitespace.
  let remaining = -delta;
  let i = 0;
  while (i < line.length && remaining > 0) {
    const ch = line[i];
    if (ch === ' ') remaining -= 1;
    else if (ch === '\t') remaining -= 4;
    else break;
    i++;
  }
  return line.slice(i);
}

export function shiftSubtree(node: OutlineNode, delta: number): OutlineNode {
  if (delta === 0) return node;
  return {
    ...node,
    lines: node.lines.map((line) => shiftLine(line, delta)),
    children: node.children.map((child) => shiftSubtree(child, delta)),
  };
}

/**
 * Re-encode a moved node for its destination: adjust indentation and, for
 * paragraph/list-item nodes, convert to `newKind` when the destination
 * context demands it. Children shift so their base column follows the
 * node's new content column.
 */
export function reencodeForDestination(
  node: OutlineNode,
  newKind: 'paragraph' | 'list-item' | undefined,
  targetIndent: number,
): OutlineNode {
  const currentIndent = indentWidth(node.lines[0] ?? '');

  // Atoms and no-conversion cases: uniform shift.
  if (!newKind || newKind === node.kind) {
    return shiftSubtree(node, targetIndent - currentIndent);
  }

  if (node.kind === 'paragraph' && newKind === 'list-item') {
    const pad = ' '.repeat(targetIndent);
    const contPad = ' '.repeat(targetIndent + 2);
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${pad}- ${line.trimStart()}` : `${contPad}${line.trimStart()}`,
    );
    const oldChildBase = childBaseCol(node);
    const childDelta = targetIndent + 2 - oldChildBase;
    return {
      ...node,
      kind: 'list-item',
      listStyle: { type: 'bullet', marker: '-' },
      lines,
      children: node.children.map((child) => shiftSubtree(child, childDelta)),
    };
  }

  if (node.kind === 'list-item' && newKind === 'paragraph') {
    const pad = ' '.repeat(targetIndent);
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${pad}${line.replace(LIST_MARKER_RE, '')}` : `${pad}${line.trimStart()}`,
    );
    const oldChildBase = childBaseCol(node);
    const childDelta = targetIndent - oldChildBase;
    const result: OutlineNode = {
      ...node,
      kind: 'paragraph',
      lines,
      children: node.children.map((child) => shiftSubtree(child, childDelta)),
    };
    delete (result as { listStyle?: unknown }).listStyle;
    return result;
  }

  return shiftSubtree(node, targetIndent - currentIndent);
}

const ATX_RE = /^( {0,3})(#{1,6})([ \t]*)(.*)$/;

/** All heading nodes in a subtree (including the root node if a heading). */
export function subtreeHeadings(node: OutlineNode): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (n: OutlineNode): void => {
    if (n.kind === 'heading') out.push(n);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * A heading's lines at a new level. Setext headings are rewritten to ATX
 * whenever the level changes (an op-touched line; still lossless).
 */
export function headingWithLevel(node: OutlineNode, level: number): OutlineNode {
  const marker = '#'.repeat(level);
  let lines: string[];
  if (node.setext) {
    const text = (node.lines[0] ?? '').trim();
    lines = [`${marker} ${text}`];
  } else {
    const match = ATX_RE.exec(node.lines[0] ?? '');
    const text = match ? match[4]! : (node.lines[0] ?? '').trim();
    lines = [text === '' ? marker : `${marker} ${text}`];
  }
  const result: OutlineNode = { ...node, level, lines };
  delete (result as { setext?: unknown }).setext;
  return result;
}
