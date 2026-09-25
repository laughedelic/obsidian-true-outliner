/**
 * Line-surgery helpers: re-encode a node (and its subtree) for a new
 * destination. Only the lines that must change are rewritten; everything
 * else is carried verbatim.
 */

import type { ListStyle, OutlineNode } from './model';
import { isAtom } from './model';
import { indentWidth, parseListMarker, TAB_WIDTH } from './parse';
import { DEFAULT_LIST_STYLE } from './rules';

/** A list style's marker as it is written, without its trailing space. */
function markerText(style: ListStyle): string {
  return style.type === 'bullet' ? style.marker : `${style.number}${style.delimiter}`;
}

/**
 * The columns between a list item's indentation and its content: the marker
 * and the whitespace after it, as the parser measures them, so a child this
 * module writes lands exactly on the column the parser (and Obsidian's
 * reader) require of a child. An earlier reading counted one space whatever
 * the line held, which left every child of `-  a` one column short.
 */
const LIST_MARKER_STRIP_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]*/;

export function markerWidth(node: OutlineNode): number {
  return markerWidthOf(node.lines[0] ?? '');
}

export function markerWidthOf(line: string): number {
  const parsed = parseListMarker(line);
  return parsed ? parsed.contentCol - indentWidth(line) : 2;
}

const MARKER_RUN_RE = /^([ \t]*(?:[-+*]|\d{1,9}[.)]))([ \t]+)/;

/** `-  a` and `-\ta` as `- a`; a line already at one space, and a marker with
 * no whitespace after it at all, come back unchanged. */
export function normalizeMarkerRun(line: string): string {
  const match = MARKER_RUN_RE.exec(line);
  if (!match || match[2] === ' ') return line;
  return `${match[1]} ${line.slice(match[0].length)}`;
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
 * tree — the one `placeOutline` builds for an open PROVISIONAL POSITION,
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

/**
 * Move a line whose indentation OPENS with the node's own first-line
 * indentation by swapping that prefix for the destination's, so the node's
 * lines are indented in the characters its first line is. A column delta alone
 * cannot say which characters to write: `shiftLine` makes up an indent in
 * spaces, and a node indented with a tab came out with a tab on its first line
 * and spaces on every line below it.
 *
 * `columnDelta` is the node's own content column moving — a marker run
 * normalized on the way — and is applied after the swap, so a swapped line
 * keeps the destination's prefix and a line that is not swapped takes the one
 * combined shift it always has.
 *
 * The swap is taken only where it lands on the column the delta asks for. A
 * tab AFTER the prefix re-expands from wherever the new prefix ends, so a swap
 * between prefixes whose widths differ by less than a tab stop moves that line
 * by some other amount. Nor is it taken where it would put a space in front
 * of a tab that had none in front of it before — the arrangement `shiftLine`
 * exists to avoid. There, and on a line that does not open with
 * the prefix at all, `shiftLine` answers as it always has.
 */
function reprefixLine(
  line: string,
  from: string,
  to: string,
  delta: number,
  columnDelta: number,
  keepBlank: boolean,
): string {
  if (keepBlank && line.trim() === '') return line;
  const ws = leadingWhitespace(line);
  if (ws.startsWith(from)) {
    const swapped = to + line.slice(from.length);
    const lands = indentWidth(swapped) === Math.max(0, indentWidth(line) + delta);
    if (lands && !addsTabAfterSpace(from, to, ws.slice(from.length))) {
      return shiftLine(swapped, columnDelta, keepBlank);
    }
  }
  return shiftLine(line, delta + columnDelta, keepBlank);
}

/**
 * Whether writing `to` in place of `from`, ahead of the rest of a line's
 * indentation, puts a space in front of a tab where there was none. Only the
 * join can: the rest is carried over unchanged, and a pair inside `to` is the
 * destination's own, written on the node's first line whatever its other
 * lines take — refusing it there would leave those lines in a different
 * indentation from the first.
 */
function addsTabAfterSpace(from: string, to: string, rest: string): boolean {
  const meets = (prefix: string): boolean => prefix.endsWith(' ') && rest.startsWith('\t');
  return meets(to) && !meets(from);
}

function reprefixSubtree(
  node: OutlineNode,
  from: string,
  to: string,
  delta: number,
  columnDelta: number,
): OutlineNode {
  if (from === to && delta === 0 && columnDelta === 0) return node;
  return {
    ...node,
    lines: node.lines.map((line) => reprefixLine(line, from, to, delta, columnDelta, isAtom(node))),
    children: node.children.map((child) => reprefixSubtree(child, from, to, delta, columnDelta)),
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
  style: ListStyle = DEFAULT_LIST_STYLE,
): OutlineNode {
  const first = node.lines[0] ?? '';
  const currentIndent = indentWidth(first);
  const targetIndent = indentWidth(indentText);
  const delta = targetIndent - currentIndent;

  // Atoms and no-conversion cases: rewrite the first line's leading
  // whitespace exactly; shift the rest by the width delta.
  if (!newKind || newKind === node.kind) {
    // A list item's marker run is rewritten with the line it sits on: `-  a`
    // lands as `- a`. The line is being rewritten anyway, and a run wider than
    // one space is what makes the item's content column hard to see and its
    // children easy to nest one column short. The item's continuation lines
    // and children move with the column, so what was under the item stays
    // under it at the same relative depth.
    const normalized = node.kind === 'list-item' ? normalizeMarkerRun(first) : first;
    const columnDelta = normalized === first ? 0 : markerWidthOf(normalized) - markerWidthOf(first);
    const shifted = reprefixSubtree(node, leadingWhitespace(first), indentText, delta, columnDelta);
    return {
      ...shifted,
      lines: [
        indentText + normalized.slice(leadingWhitespace(normalized).length),
        ...shifted.lines.slice(1),
      ],
    };
  }

  if (node.kind === 'paragraph' && newKind === 'list-item') {
    // The content column is the marker's width plus its one space, so an
    // ordered marker moves it and the continuation lines and children with it.
    const marker = markerText(style);
    const contPad = indentText + ' '.repeat(marker.length + 1);
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${indentText}${marker} ${line.trimStart()}` : `${contPad}${line.trimStart()}`,
    );
    const childDelta = targetIndent + marker.length + 1 - childBaseCol(node);
    return {
      ...node,
      kind: 'list-item',
      listStyle: style,
      lines,
      children: node.children.map((child) => shiftSubtree(child, childDelta)),
    };
  }

  if (node.kind === 'list-item' && newKind === 'paragraph') {
    // The marker goes with the whole whitespace run after it, which is the
    // item's chrome: a paragraph that kept `-  a`'s second space would start
    // with indentation nobody wrote.
    const lines = node.lines.map((line, i) =>
      i === 0 ? `${indentText}${line.replace(LIST_MARKER_STRIP_RE, '')}` : `${indentText}${line.trimStart()}`,
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

/** Markdown's heading depth runs out here: there is no `h7`, so an insertion
 * that would need one is rejected with `at-h6-bound` rather than clamping two
 * of the payload's levels onto one or converting it to content — both lose the
 * tree the insertion exists to preserve. */
export const MAX_HEADING_LEVEL = 6;

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

/**
 * A heading's own line as a list item's TEXT, `#` run included.
 *
 * `- ## Notes` is a list item CONTAINING an h2 in CommonMark rather than an
 * item whose text happens to start with hashes, which is why Obsidian renders
 * it with heading styling and why `contentColumnCh` already counts the run as
 * chrome. Carrying it is what lets the rank survive a move into a list and
 * come back on the way out.
 *
 * Setext is rewritten to ATX first: an underline occupies a second line, and a
 * list item's marker line has nowhere to put one.
 */
function headingContentLine(node: OutlineNode): string {
  const atx = node.setext ? headingWithLevel(node, node.level ?? 1) : node;
  return (atx.lines[0] ?? '').trim();
}

/**
 * A heading encoded as a list item at `indentText` — its own line only; the
 * caller owns the subtree, whose depth is now carried by indentation rather
 * than by the `#` count.
 *
 * `style` is the list the item is joining, which the caller reads off the
 * destination (`destinationListStyle`). Left out, it is the default `-`: the
 * payload's own nested rows take that, having no destination run of their own
 * to sit level with.
 */
export function headingAsListItem(
  node: OutlineNode,
  indentText: string,
  style: ListStyle = DEFAULT_LIST_STYLE,
): OutlineNode {
  const result: OutlineNode = {
    ...node,
    kind: 'list-item',
    listStyle: style,
    lines: [`${indentText}${markerText(style)} ${headingContentLine(node)}`],
  };
  delete (result as { level?: unknown }).level;
  delete (result as { setext?: unknown }).setext;
  return result;
}
