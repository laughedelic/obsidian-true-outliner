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

export function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

function shiftLine(line: string, delta: number): string {
  if (line.trim() === '') return line;
  if (delta === 0) return line;
  const ws = leadingWhitespace(line);
  if (delta > 0) {
    // Insert AFTER existing leading whitespace: spaces before a tab would
    // vanish into the tab stop and corrupt the width arithmetic.
    return ws + ' '.repeat(delta) + line.slice(ws.length);
  }
  // Dedent: remove up to -delta columns of leading whitespace; when a tab
  // overshoots the target column, repair the difference with spaces.
  let remaining = -delta;
  let i = 0;
  while (i < ws.length && remaining > 0) {
    remaining -= ws[i] === '\t' ? 4 : 1;
    i++;
  }
  return (remaining < 0 ? ' '.repeat(-remaining) : '') + line.slice(i);
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
 * Re-encode a moved node for its destination: the node ADOPTS the
 * destination's indentation string verbatim (`indentText` — tabs included,
 * taken from a sibling or parent at the landing site), and for
 * paragraph/list-item nodes converts to `newKind` when the context demands
 * it. Continuations and children shift by the resulting width delta.
 */
export function reencodeForDestination(
  node: OutlineNode,
  newKind: 'paragraph' | 'list-item' | undefined,
  indentText: string,
): OutlineNode {
  const first = node.lines[0] ?? '';
  const currentIndent = indentWidth(first);
  const targetIndent = indentWidth(indentText);
  const delta = targetIndent - currentIndent;

  // Atoms and no-conversion cases: rewrite the first line's leading
  // whitespace exactly; shift the rest by the width delta.
  if (!newKind || newKind === node.kind) {
    const shifted = shiftSubtree(node, delta);
    return {
      ...shifted,
      lines: [
        indentText + (shifted.lines[0] ?? '').slice(leadingWhitespace(shifted.lines[0] ?? '').length),
        ...shifted.lines.slice(1),
      ],
    };
  }

  if (node.kind === 'paragraph' && newKind === 'list-item') {
    const contPad = indentText + '  ';
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${indentText}- ${line.trimStart()}` : `${contPad}${line.trimStart()}`,
    );
    const childDelta = targetIndent + 2 - childBaseCol(node);
    return {
      ...node,
      kind: 'list-item',
      listStyle: { type: 'bullet', marker: '-' },
      lines,
      children: node.children.map((child) => shiftSubtree(child, childDelta)),
    };
  }

  if (node.kind === 'list-item' && newKind === 'paragraph') {
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${indentText}${line.replace(LIST_MARKER_RE, '')}` : `${indentText}${line.trimStart()}`,
    );
    const childDelta = targetIndent - childBaseCol(node);
    const result: OutlineNode = {
      ...node,
      kind: 'paragraph',
      lines,
      children: node.children.map((child) => shiftSubtree(child, childDelta)),
    };
    delete (result as { listStyle?: unknown }).listStyle;
    return result;
  }

  return shiftSubtree(node, delta);
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
