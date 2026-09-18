/**
 * A node's OWN indentation: the leading characters each of its lines repeats to
 * stay inside the block its ancestor opened.
 *
 * One definition, because two layers need the same answer and a disagreement
 * between them is a caret standing where nothing is drawn. The decoration layer
 * hides these characters (`decorations.ts`), since they restate a depth the
 * depth rules already state — issue #117's two columns for one tree level — and
 * the caret layer treats them as chrome (`caret.ts`), since a position among
 * characters that are not drawn is not a position a reader can see.
 *
 * What a line carries BEYOND its node's own indentation belongs to neither: it
 * renders as itself and the caret walks it one character at a time, which is
 * what a line indented deeper than its node means.
 */

import type { OutlineDoc, OutlineNode } from './model';
import { ownSpan } from './model';
import { indentPrefixCh, indentWidth } from './parse';

/**
 * How many of `lineText`'s leading characters are the node's own indentation.
 *
 * Only under a LIST ITEM, and only for a node that is not one itself. A child of
 * an item is written to the item's own content column, which is the column the
 * depth rules already state; everywhere else the whitespace states something of
 * its own — under a heading it is insignificant to Markdown, and at the top
 * level it is the only thing saying a four-space line is an indented code block.
 *
 * Measured from the node's FIRST line, so a line indented deeper than its node
 * keeps the difference, and in COLUMNS rather than characters, so a tab is
 * taken whole or not at all.
 */
export function ownIndentCh(
  node: OutlineNode,
  lineText: string,
  underListItem: boolean,
): number {
  if (!underListItem || node.kind === 'list-item') return 0;
  return indentPrefixCh(lineText, indentWidth(node.lines[0] ?? ''));
}

/**
 * The same number for one absolute line of a document, 0 where the line has no
 * own indentation to hide — a preamble line, a gap line, a list item's own
 * line, or any line outside a list.
 *
 * Its own walk rather than `locate.ts`'s, which reports a node's depth but not
 * whether a LIST ITEM is among its ancestors, and that is the question here.
 */
export function ownIndentAt(doc: OutlineDoc, line: number): number {
  let start = doc.preamble.length;
  let found = 0;
  const walk = (nodes: readonly OutlineNode[], underListItem: boolean): boolean => {
    for (const node of nodes) {
      if (line < start) return false; // behind the walk: a gap line, or the preamble
      if (line < start + node.lines.length) {
        found = ownIndentCh(node, node.lines[line - start]!, underListItem);
        return false;
      }
      start += ownSpan(node);
      if (!walk(node.children, underListItem || node.kind === 'list-item')) return false;
    }
    return true;
  };
  walk(doc.children, false);
  return found;
}
