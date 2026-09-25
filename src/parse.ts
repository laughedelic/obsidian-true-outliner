/**
 * Markdown → block tree. Line-based, block-level only (design.md D1):
 * we segment and derive hierarchy; we never interpret-and-reprint.
 *
 * Dialect: Obsidian's pragmatic block markdown, not strict CommonMark.
 * Known deliberate simplifications (corpus tests guard the consequences):
 * - no lazy continuation lines (a column-0 line after a list item starts a
 *   new top-level paragraph);
 * - indented (4-space) code blocks at top level parse as paragraphs — the
 *   bytes still round-trip, only the node kind differs;
 * - a blockquote is a contiguous run of `>` lines.
 */

import type { ListStyle, NodeKind, OutlineDoc, OutlineNode } from './model';
import { makeNode, walkNodes } from './model';
import { blockIdAttaches, isLoneBlockIdLine, listAttachesTo } from './rules';

export const TAB_WIDTH = 4;

export function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH - (width % TAB_WIDTH);
    else break;
  }
  return width;
}

/**
 * How many leading CHARACTERS of `line` fall inside its first `columns`
 * columns — the string index that splits a line's own structural indentation
 * from everything it holds after it.
 *
 * A character counts only if it fits WHOLE: a tab that would straddle the
 * boundary belongs to what follows, since half a tab is not a position the
 * document has. Stops at the first non-whitespace character, so a line
 * indented less than `columns` gives up its whole run and no more.
 *
 * Characters, not columns, for the reason `parseListMarker` records for its own
 * pair: a tab is one character and one to `TAB_WIDTH` columns, and only the
 * character count is a valid index into the string.
 */
export function indentPrefixCh(line: string, columns: number): number {
  let width = 0;
  let ch = 0;
  for (const c of line) {
    if (c !== ' ' && c !== '\t') break;
    const next = c === '\t' ? width + TAB_WIDTH - (width % TAB_WIDTH) : width + 1;
    if (next > columns) break;
    width = next;
    ch += 1;
  }
  return ch;
}

const isBlank = (line: string): boolean => line.trim() === '';

/**
 * `line` as its CONTAINER sees it: the columns up to `margin` taken off its
 * indentation, and whatever indentation is left spelled in spaces. Only spaces
 * and tabs are indentation, as `indentWidth` counts them.
 *
 * CommonMark measures a block start's `^ {0,3}` from the content column of the
 * list item holding it, not from column 0, so a quote written at a list item's
 * child column opens a quote there. `QUOTE_RE`, `CALLOUT_RE` and `HR_RE` are
 * applied to this view of a line rather than to the raw line; the raw line is
 * what a block keeps.
 */
function fromMargin(line: string, margin: number): string {
  if (margin === 0) return line;
  const lead = /^[ \t]*/.exec(line)![0].length;
  return ' '.repeat(Math.max(0, indentWidth(line) - margin)) + line.slice(lead);
}

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})/;
const LIST_ITEM_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])([ \t]+)/;
const QUOTE_RE = /^ {0,3}>/;
const CALLOUT_RE = /^ {0,3}>\s*\[!/;
const HR_RE = /^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_DELIM_RE = /^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|?[ \t]*$/;
const HTML_OPEN_RE = /^ {0,3}<[a-zA-Z!/]/;

/**
 * How many columns past its MARGIN a line may sit and still OPEN an `hr`, a
 * `quote`, a `callout`, an `html` block or an ATX heading: `HR_RE`,
 * `QUOTE_RE`, `CALLOUT_RE`, `HTML_OPEN_RE` and `ATX_RE` all anchor at
 * `^ {0,3}`. The margin is the content column of the list item holding the
 * line for the first three, and column 0 for a heading and an HTML block,
 * which `segment` measures from there wherever they sit. Past it the same line
 * opens whatever it opens with no margin of its own — a list item, where the
 * bytes carry a marker — or nothing, and is then read as a paragraph or as a
 * continuation of the paragraph above.
 */
export const OPENING_MARGIN = 3;

/**
 * The kind a node's lines PARSE AS where they now sit, which is not always the
 * kind the tree holds. A re-indent writes those lines at a new column, and the
 * kinds above survive only within `OPENING_MARGIN` of their margin: `margin`,
 * the content column of the list item the node sits in, for a quote, a
 * callout and a rule, and column 0 for a heading and an HTML block.
 *
 * Anything reasoning about what a seam will re-parse as has to ask this rather
 * than read `node.kind`: the two disagree exactly where a re-indent has
 * happened, and a separator chosen for the kind the tree holds is a separator
 * chosen for a node the document will not contain.
 *
 * What a demoted line becomes is read off the line rather than assumed to be a
 * paragraph. `LIST_ITEM_RE` carries no margin, so a rule spelled `- - -` or
 * `* * *` — the spellings whose first characters are a marker and a space — is
 * an `hr` at column 3 and a LIST ITEM at column 4, which claims nothing and
 * needs no separator. `---`, `***` and `___` have no marker to find and are
 * paragraphs there. The other openers cannot arise: `FENCE_OPEN_RE` and a
 * table row have no margin either, so a node whose first line matches one of
 * them is a `code` or a `table` and is never demoted at all.
 *
 * A setext heading is judged on its UNDERLINE, the line that carries its
 * `^ {0,3}`; every other kind on the line that opens it.
 */
export function kindAsWritten(
  node: Pick<OutlineNode, 'kind' | 'lines' | 'setext'>,
  margin = 0,
): NodeKind {
  const kind = node.kind;
  if (kind === 'heading' && node.setext === true) {
    return demote(node.lines[node.lines.length - 1] ?? '', kind, margin);
  }
  if (
    kind !== 'heading' &&
    kind !== 'quote' &&
    kind !== 'callout' &&
    kind !== 'hr' &&
    kind !== 'html'
  ) {
    return kind;
  }
  return demote(node.lines[0] ?? '', kind, margin);
}

function demote(line: string, kind: NodeKind, margin: number): NodeKind {
  // A heading and an HTML block are measured from column 0 wherever they sit.
  if (kind === 'heading' || kind === 'html') margin = 0;
  if (indentWidth(line) - margin <= OPENING_MARGIN) return kind;
  return LIST_ITEM_RE.test(line) ? 'list-item' : 'paragraph';
}

/**
 * The block a node's LAST line belongs to where its lines now sit — what the
 * seam BELOW the node abuts, as `kindAsWritten` is what the seam above it does.
 *
 * The two differ only for a demoted node of more than one line. An `html`
 * block runs to a blank line whatever its lines hold, so past the margin its
 * later lines open whatever they open at their own column: `<div>` over a
 * table is a paragraph and then a TABLE there, and the seam below it has to be
 * the table's. The answer is read from `parse` over the node's own lines rather
 * than from the opening line, since the parse is what decides where one block
 * of them ends and the next begins. A node the margin leaves alone, and a
 * single demoted line, are their own tail. `margin` is `kindAsWritten`'s.
 */
export function tailAsWritten(
  node: Pick<OutlineNode, 'kind' | 'lines' | 'setext'>,
  margin = 0,
): Pick<OutlineNode, 'kind' | 'lines' | 'setext'> {
  const kind = kindAsWritten(node, margin);
  if (kind === node.kind) return node;
  if (node.lines.length <= 1) return { kind, lines: node.lines };
  let tail: OutlineNode | undefined;
  // Read from the margin the node's kind was judged at, so the lines below the
  // opening one are measured as the whole document would measure them.
  const from = node.kind === 'html' || node.kind === 'heading' ? 0 : margin;
  const own = node.lines.map((line) => fromMargin(line, from));
  for (const block of walkNodes(parse(own.join('\n')))) tail = block;
  if (!tail) return { kind, lines: node.lines };
  // The tail's own lines, as the node writes them rather than as the margin
  // sees them: a caller measures columns on them.
  return { ...tail, lines: node.lines.slice(node.lines.length - tail.lines.length) };
}

/**
 * Columns a whitespace run occupies when it starts at `col`, with tabs
 * advancing to the next stop the way `indentWidth` expands leading ones.
 */
function whitespaceWidth(ws: string, col: number): number {
  let width = 0;
  for (const ch of ws) {
    if (ch === '\t') width += TAB_WIDTH - ((col + width) % TAB_WIDTH);
    else width += 1;
  }
  return width;
}

/**
 * A list item's marker, its CONTENT COLUMN, and its content CHARACTER OFFSET.
 *
 * The column is where its text begins, past the marker and the whole
 * whitespace run after it — `-  a` puts its content at column 3, not 2. That
 * column is what nesting is measured against, here and in Obsidian's own
 * reader, so a child written one column short of it is a sibling to Obsidian
 * and, once the list stack pops, its deeper descendants an indented code
 * block (docs/research/list-marker-content-column). A marker with nothing but
 * whitespace after it has no run to measure and takes the one space a child
 * would need.
 *
 * The two diverge whenever a tab sits in the indentation or the marker's own
 * run: a tab is one CHARACTER wide and, per `indentWidth`, one to
 * `TAB_WIDTH` COLUMNS wide depending where it starts — `\t-  b` puts its
 * content at column 7 but character offset 4. `contentCol` answers the
 * nesting question; `contentCh` is the index a caller slicing or highlighting
 * the actual string needs instead, and is never a substitute for the other.
 */
export function parseListMarker(
  line: string,
): { style: ListStyle; contentCol: number; contentCh: number } | undefined {
  const match = LIST_ITEM_RE.exec(line);
  if (!match) return undefined;
  const [, indentText, marker, spacing] = match as unknown as [string, string, string, string];
  const indent = indentWidth(indentText);
  const style: ListStyle =
    marker === '-' || marker === '*' || marker === '+'
      ? { type: 'bullet', marker }
      : {
          type: 'ordered',
          number: parseInt(marker, 10),
          delimiter: marker.endsWith(')') ? ')' : '.',
        };
  const markerEnd = indent + marker.length;
  const markerCh = indentText.length + marker.length;
  // An item that starts blank — nothing, or whitespace only, after the marker —
  // has no run to measure: CommonMark puts its content column one past the
  // marker, and a trailing run would otherwise widen an EMPTY item's column
  // and turn `-  ` followed by `  - b` into two siblings. The character
  // offset mirrors it: one character into the run if the run holds any, the
  // marker's own end if it holds none — never the run's own full length.
  const blankStart = line.length === match[0].length;
  const contentCol = markerEnd + (blankStart ? 1 : Math.max(1, whitespaceWidth(spacing, markerEnd)));
  const contentCh = markerCh + (blankStart ? Math.min(1, spacing.length) : spacing.length);
  return { style, contentCol, contentCh };
}

/** A flat block produced by segmentation, before hierarchy derivation. */
interface Block {
  kind: OutlineNode['kind'];
  indent: number;
  contentCol: number;
  lines: string[];
  gap: string[];
  level?: number;
  setext?: boolean;
  listStyle?: ListStyle;
}

function looksLikeTable(lines: readonly string[], i: number): boolean {
  const line = lines[i];
  const next = lines[i + 1];
  return (
    line !== undefined &&
    next !== undefined &&
    line.includes('|') &&
    !isBlank(line) &&
    TABLE_DELIM_RE.test(next) &&
    next.includes('-')
  );
}

/**
 * Would this line terminate an open paragraph by starting another block?
 * `margin` is the content column of the list item the paragraph sits in.
 *
 * A rule that could also underline the paragraph as a setext heading is read
 * from column 0, as the underline itself is: a heading is a section here, never
 * a block inside a list item, so the margin does not reach it.
 */
function startsNewBlock(lines: readonly string[], i: number, margin: number): boolean {
  const line = lines[i]!;
  const seen = fromMargin(line, margin);
  return (
    ATX_RE.test(line) ||
    FENCE_OPEN_RE.test(line) ||
    LIST_ITEM_RE.test(line) ||
    QUOTE_RE.test(seen) ||
    (HR_RE.test(seen) && (seen === line || !SETEXT_RE.test(seen))) ||
    looksLikeTable(lines, i)
  );
}

function segment(lines: readonly string[], start: number): Block[] {
  const blocks: Block[] = [];
  let preambleGapSink: string[] | undefined;
  let i = start;

  const gapSink = (): string[] => {
    const last = blocks[blocks.length - 1];
    if (last) return last.gap;
    preambleGapSink ??= [];
    return preambleGapSink;
  };

  // Content columns of the list items still open at `i`, innermost last — the
  // same stack `parse` pops when it attaches blocks, kept here so a block start
  // is measured from the item that holds it.
  const openItems: number[] = [];

  while (i < lines.length) {
    const line = lines[i]!;

    // Trailing empty segment from a final newline, and blank lines generally.
    if (isBlank(line) && !(i === lines.length - 1 && line === '' && blocks.length === 0)) {
      gapSink().push(line);
      i++;
      continue;
    }
    if (i === lines.length - 1 && line === '') {
      // Document ends with a newline and no content yet.
      gapSink().push(line);
      i++;
      continue;
    }

    const indent = indentWidth(line);
    while (openItems.length > 0 && indent < openItems[openItems.length - 1]!) openItems.pop();
    const margin = openItems[openItems.length - 1] ?? 0;
    const seen = fromMargin(line, margin);

    // Fenced code block.
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const fenceChars = fence[2]!;
      const closeRe = new RegExp(`^[ \\t]*${fenceChars[0] === '`' ? '`' : '~'}{${fenceChars.length},}[ \\t]*$`);
      const block: Block = { kind: 'code', indent, contentCol: indent, lines: [line], gap: [] };
      i++;
      while (i < lines.length) {
        block.lines.push(lines[i]!);
        if (closeRe.test(lines[i]!)) {
          i++;
          break;
        }
        i++;
      }
      blocks.push(block);
      continue;
    }

    // ATX heading.
    const atx = ATX_RE.exec(line);
    if (atx) {
      openItems.length = 0;
      blocks.push({
        kind: 'heading',
        indent: 0,
        contentCol: 0,
        level: atx[1]!.length,
        lines: [line],
        gap: [],
      });
      i++;
      continue;
    }

    // Blockquote / callout.
    if (QUOTE_RE.test(seen)) {
      const kind = CALLOUT_RE.test(seen) ? 'callout' : 'quote';
      const block: Block = { kind, indent, contentCol: indent, lines: [], gap: [] };
      while (
        i < lines.length &&
        indentWidth(lines[i]!) >= margin &&
        QUOTE_RE.test(fromMargin(lines[i]!, margin))
      ) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
      continue;
    }

    // Thematic break (checked before list: `- - -` etc).
    if (HR_RE.test(seen)) {
      blocks.push({ kind: 'hr', indent, contentCol: indent, lines: [line], gap: [] });
      i++;
      continue;
    }

    // Table.
    if (looksLikeTable(lines, i)) {
      const block: Block = { kind: 'table', indent, contentCol: indent, lines: [], gap: [] };
      while (i < lines.length && !isBlank(lines[i]!) && lines[i]!.includes('|')) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
      continue;
    }

    // List item (marker line + immediate continuation lines).
    const marker = parseListMarker(line);
    if (marker) {
      const block: Block = {
        kind: 'list-item',
        indent,
        contentCol: marker.contentCol,
        listStyle: marker.style,
        lines: [line],
        gap: [],
      };
      i++;
      // Continuation: non-blank lines indented to the content column that do
      // not start a nested block themselves (multiline nodes).
      while (
        i < lines.length &&
        !isBlank(lines[i]!) &&
        indentWidth(lines[i]!) >= marker.contentCol &&
        !LIST_ITEM_RE.test(lines[i]!) &&
        !FENCE_OPEN_RE.test(lines[i]!) &&
        !QUOTE_RE.test(fromMargin(lines[i]!, marker.contentCol)) &&
        !looksLikeTable(lines, i)
      ) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
      openItems.push(marker.contentCol);
      continue;
    }

    // HTML block.
    if (HTML_OPEN_RE.test(line)) {
      const block: Block = { kind: 'html', indent, contentCol: indent, lines: [], gap: [] };
      while (i < lines.length && !isBlank(lines[i]!)) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
      continue;
    }

    // Paragraph (may become a setext heading).
    const block: Block = { kind: 'paragraph', indent, contentCol: indent, lines: [line], gap: [] };
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !startsNewBlock(lines, i, margin)) {
      const underline = SETEXT_RE.exec(lines[i]!);
      if (underline) {
        openItems.length = 0;
        block.kind = 'heading';
        block.level = underline[1]![0] === '=' ? 1 : 2;
        block.setext = true;
        block.lines.push(lines[i]!);
        i++;
        break;
      }
      block.lines.push(lines[i]!);
      i++;
    }
    // A `---` right after a paragraph is a setext h2 even though it also
    // matches HR_RE — handle it here since startsNewBlock stopped the loop.
    if (block.kind === 'paragraph' && i < lines.length && SETEXT_RE.test(lines[i]!) && HR_RE.test(lines[i]!)) {
      openItems.length = 0;
      block.kind = 'heading';
      block.level = 2;
      block.setext = true;
      block.lines.push(lines[i]!);
      i++;
    }
    blocks.push(block);
  }

  if (preambleGapSink) {
    // Blank lines before any block belong to the preamble; caller merges.
    blocks.unshift({
      kind: 'paragraph',
      indent: 0,
      contentCol: 0,
      lines: [],
      gap: preambleGapSink,
      level: -1, // sentinel: preamble-gap pseudo-block, consumed by caller
    });
  }
  return blocks;
}

interface MutableNode {
  node: OutlineNode;
  children: MutableNode[];
  /** Whether a list item is among the node's ancestors. */
  inListItem?: boolean;
  /** A list item's content column. */
  contentCol?: number;
}

function toNode(m: MutableNode): OutlineNode {
  return { ...m.node, children: m.children.map(toNode) };
}

export function parse(md: string): OutlineDoc {
  // ''.split('\n') is [''] — one phantom line; the empty document has none.
  const lines = md === '' ? [] : md.split('\n');
  const preamble: string[] = [];
  let start = 0;

  // YAML frontmatter preamble.
  if (lines[0] !== undefined && /^---[ \t]*$/.test(lines[0])) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(---|\.\.\.)[ \t]*$/.test(lines[i]!)) {
        for (let k = 0; k <= i; k++) preamble.push(lines[k]!);
        start = i + 1;
        break;
      }
    }
  }

  const blocks = segment(lines, start);

  // Fold a leading preamble-gap pseudo-block into the preamble.
  if (blocks[0]?.level === -1) {
    preamble.push(...blocks[0].gap);
    blocks.shift();
  }

  const root: MutableNode = {
    node: makeNode({ kind: 'paragraph', lines: [] }), // never emitted
    children: [],
  };

  /** Heading scope stack: root plus open headings. */
  const headingStack: { entry: MutableNode; level: number }[] = [
    { entry: root, level: 0 },
  ];
  /**
   * Open list-item stack within the current container. A `paragraphRoot`
   * entry is a paragraph currently collecting list children via the
   * attachment rule — only list items may attach to it.
   */
  let listStack: {
    entry: MutableNode;
    contentCol: number;
    indent: number;
    paragraphRoot?: boolean;
  }[] = [];

  const container = (): MutableNode => headingStack[headingStack.length - 1]!.entry;

  /** The node attached last: the one whose own lines end right above the
   * next block, and the only node a lone block id can attach to. */
  let lastAttached: MutableNode | undefined;

  /** Makes a lone block id part of the node attached just before it. The
   * blank lines between them move from that node's trailing gap to the id's
   * own, and the id's trailing gap becomes the node's. */
  const attachBlockId = (block: Block, next: Block | undefined): boolean => {
    if (block.kind !== 'paragraph' || block.lines.length !== 1) return false;
    const line = block.lines[0]!;
    if (!isLoneBlockIdLine(line)) return false;
    const nextIsLoneId =
      next !== undefined && next.kind === 'paragraph' && next.lines.length === 1 && isLoneBlockIdLine(next.lines[0]!);
    const host = lastAttached;
    const hostView = host && {
      node: host.node,
      inListItem: host.inListItem === true,
      contentCol: host.contentCol ?? 0,
    };
    if (!blockIdAttaches(hostView, block.indent, nextIsLoneId)) return false;
    host!.node = {
      ...host!.node,
      blockId: { gap: host!.node.trailingGap, line },
      trailingGap: block.gap,
    };
    return true;
  };

  const attach = (block: Block): void => {
    const node = makeNode({
      kind: block.kind,
      ...(block.level !== undefined && block.kind === 'heading' ? { level: block.level } : {}),
      ...(block.setext ? { setext: true } : {}),
      ...(block.listStyle ? { listStyle: block.listStyle } : {}),
      lines: block.lines,
      trailingGap: block.gap,
    });
    const entry: MutableNode = { node, children: [] };
    lastAttached = entry;

    if (block.kind === 'heading') {
      listStack = [];
      while (headingStack.length > 1 && headingStack[headingStack.length - 1]!.level >= block.level!) {
        headingStack.pop();
      }
      container().children.push(entry);
      headingStack.push({ entry, level: block.level! });
      return;
    }

    // Pop list items this block is not indented into.
    while (listStack.length > 0 && block.indent < listStack[listStack.length - 1]!.contentCol) {
      listStack.pop();
    }

    if (block.kind === 'list-item') {
      const parent = listStack[listStack.length - 1];
      if (parent) {
        parent.entry.children.push(entry);
      } else {
        // Section level: the (provisional) attachment rule may hand the item
        // to an immediately preceding paragraph sibling.
        const siblings = container().children;
        const prev = siblings[siblings.length - 1];
        if (prev && listAttachesTo(prev.node)) {
          prev.children.push(entry);
          // Root the list stack at the paragraph's content column so later
          // sibling items keep attaching there.
          listStack = [
            { entry: prev, contentCol: block.indent, indent: block.indent, paragraphRoot: true },
          ];
        } else {
          siblings.push(entry);
        }
      }
      entry.inListItem = listStack.some((open) => !open.paragraphRoot);
      entry.contentCol = block.contentCol;
      listStack.push({ entry, contentCol: block.contentCol, indent: block.indent });
      return;
    }

    // Non-list block: child of the innermost open list item it is indented
    // into, else a section-level sibling (which closes any open list).
    // Paragraph-root entries only accept list items, never other blocks.
    while (listStack.length > 0 && listStack[listStack.length - 1]!.paragraphRoot) {
      listStack.pop();
    }
    const parent = listStack[listStack.length - 1];
    if (parent && block.indent >= parent.contentCol) {
      entry.inListItem = true;
      parent.entry.children.push(entry);
    } else {
      listStack = [];
      container().children.push(entry);
    }
  };

  blocks.forEach((block, i) => {
    if (!attachBlockId(block, blocks[i + 1])) attach(block);
  });

  return { preamble, children: root.children.map(toNode) };
}
