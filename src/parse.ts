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

import type { ListStyle, OutlineDoc, OutlineNode } from './model';
import { makeNode } from './model';
import { listAttachesTo } from './rules';

const TAB_WIDTH = 4;

export function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += TAB_WIDTH - (width % TAB_WIDTH);
    else break;
  }
  return width;
}

const isBlank = (line: string): boolean => line.trim() === '';

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const FENCE_OPEN_RE = /^([ \t]*)(`{3,}|~{3,})/;
const LIST_ITEM_RE = /^([ \t]*)([-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
const QUOTE_RE = /^ {0,3}>/;
const CALLOUT_RE = /^ {0,3}>\s*\[!/;
const HR_RE = /^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_DELIM_RE = /^[ \t]*\|?[ \t:|-]*-[ \t:|-]*\|?[ \t]*$/;
const HTML_OPEN_RE = /^ {0,3}<[a-zA-Z!/]/;

function parseListMarker(line: string): { style: ListStyle; contentCol: number } | undefined {
  const match = LIST_ITEM_RE.exec(line);
  if (!match) return undefined;
  const [, indentText, marker] = match as unknown as [string, string, string];
  const indent = indentWidth(indentText);
  const style: ListStyle =
    marker === '-' || marker === '*' || marker === '+'
      ? { type: 'bullet', marker }
      : {
          type: 'ordered',
          number: parseInt(marker, 10),
          delimiter: marker.endsWith(')') ? ')' : '.',
        };
  // Content column: marker end + one space, in expanded-tab columns.
  const contentCol = indent + marker.length + 1;
  return { style, contentCol };
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

/** Would this line terminate an open paragraph by starting another block? */
function startsNewBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i]!;
  return (
    ATX_RE.test(line) ||
    FENCE_OPEN_RE.test(line) ||
    LIST_ITEM_RE.test(line) ||
    QUOTE_RE.test(line) ||
    HR_RE.test(line) ||
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
    if (QUOTE_RE.test(line)) {
      const kind = CALLOUT_RE.test(line) ? 'callout' : 'quote';
      const block: Block = { kind, indent, contentCol: indent, lines: [], gap: [] };
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
      continue;
    }

    // Thematic break (checked before list: `- - -` etc).
    if (HR_RE.test(line)) {
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
        !QUOTE_RE.test(lines[i]!) &&
        !looksLikeTable(lines, i)
      ) {
        block.lines.push(lines[i]!);
        i++;
      }
      blocks.push(block);
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
    while (i < lines.length && !isBlank(lines[i]!) && !startsNewBlock(lines, i)) {
      const underline = SETEXT_RE.exec(lines[i]!);
      if (underline) {
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
      parent.entry.children.push(entry);
    } else {
      listStack = [];
      container().children.push(entry);
    }
  };

  for (const block of blocks) attach(block);

  return { preamble, children: root.children.map(toNode) };
}
