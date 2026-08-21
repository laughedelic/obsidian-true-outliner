/**
 * Line-surgery helpers: re-encode a node (and its subtree) for a new
 * destination. Only the lines that must change are rewritten; everything
 * else is carried verbatim.
 */

import type { OutlineNode } from './model';
import { isAtom } from './model';
import { indentWidth, TAB_WIDTH } from './parse';

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

/**
 * `keepBlank` — leave a whitespace-only line exactly as it is — is for ATOMS,
 * where a blank line is the node's own content: shifting one inside a fenced
 * code block changes the code, and inside a quote or table it invents leading
 * whitespace nobody wrote.
 *
 * A STRUCTURAL node cannot reach that case from a real parse at all: a blank
 * line ENDS a paragraph's, a list item's, or a heading's own lines
 * (`parse.ts`), so a whitespace-only line among them exists in exactly one
 * tree — the one `resolvedOutline` builds for an open PROVISIONAL POSITION,
 * where the blank line is the place itself. That line must move with the node,
 * or an indent leaves the place at the old content column and typing there
 * makes a node somewhere else entirely.
 */
function shiftLine(line: string, delta: number, keepBlank: boolean): string {
  if (keepBlank && line.trim() === '') return line;
  if (delta === 0) return line;
  const ws = leadingWhitespace(line);
  if (delta > 0) {
    // Insert AFTER existing leading whitespace: spaces before a tab would
    // vanish into the tab stop and corrupt the width arithmetic.
    return ws + ' '.repeat(delta) + line.slice(ws.length);
  }
  // Dedent: keep as much of the original indentation as FITS inside the target
  // column, then make up the remainder with spaces. One forward pass, and the
  // result is exactly `target` columns by construction.
  //
  // The column has to be measured as the line is walked rather than counted
  // per character. A tab's width depends on where it starts, so subtracting a
  // flat 4 per tab is wrong the moment anything precedes one: ` \t` is four
  // columns, and dropping the space leaves a tab that re-expands from zero to
  // four again — the line had not moved at all.
  //
  // Keeping a PREFIX rather than dropping one is what makes this a single
  // pass, and it suits a tab-indented vault better besides: dropping from the
  // left destroys whole tabs first, where keeping from the left retains them
  // and spends the odd remainder on spaces. The padding therefore lands AFTER
  // the kept whitespace, never before it — the same reason the indent path
  // above gives, that a space in front of a tab vanishes into the tab stop.
  const target = Math.max(0, indentWidth(line) + delta);
  let width = 0;
  let i = 0;
  while (i < ws.length) {
    const next = ws[i] === '\t' ? width + TAB_WIDTH - (width % TAB_WIDTH) : width + 1;
    if (next > target) break;
    width = next;
    i++;
  }
  return ws.slice(0, i) + ' '.repeat(target - width) + line.slice(ws.length);
}

/**
 * Shift everything a node's CONTENT COLUMN governs — its continuation lines
 * and its whole subtree — while its own first line stays where it is.
 *
 * For a marker that changes WIDTH rather than position: renumbering `9.` to
 * `10.` moves the content column one to the right without moving the line the
 * marker sits on. Measured, the children left behind stop being children —
 * they no longer reach the column, so the re-parse reads them as siblings of
 * the item they belonged to. Narrowing (`10.` to `9.`) strands them one column
 * too deep instead, which keeps the tree but drifts the indentation.
 */
export function shiftBelowMarker(node: OutlineNode, delta: number): OutlineNode {
  if (delta === 0) return node;
  return {
    ...node,
    lines: node.lines.map((line, i) => (i === 0 ? line : shiftLine(line, delta, isAtom(node)))),
    children: node.children.map((child) => shiftSubtree(child, delta)),
  };
}

export function shiftSubtree(node: OutlineNode, delta: number): OutlineNode {
  if (delta === 0) return node;
  return {
    ...node,
    lines: node.lines.map((line) => shiftLine(line, delta, isAtom(node))),
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
