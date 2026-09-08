/**
 * How a node NAMES itself: its own text with the block syntax that encodes its
 * place in the tree removed, and how that text is to be rendered.
 *
 * Core rather than `src/plugin/`, because three surfaces need the same answer
 * and none is more entitled to own it — a backlinks footer row quotes a
 * referencing node, a footer lineage segment names an ancestor, and zoom's
 * breadcrumb names one too. `stripBlockPrefix` lived privately in
 * `footer-model.ts` until the second caller appeared; the per-kind rule above it
 * stayed behind, which is how the trail ended up naming a callout ancestor
 * `[!tip] Field notes` while a footer row of the same node said `Field notes`.
 * Both now come from `nodeContent`.
 *
 * `ops.ts`'s `contentColumnCh` and `markerPrefixCh` answer a different question
 * — where the CARET may sit — and are deliberately not reused here.
 */

import type { NodeKind, OutlineNode } from './model';

/**
 * One line's leading block syntax: quote carets, heading hashes, a list marker
 * with its optional checkbox, an ordered number. Whatever survives is inline.
 *
 * Order matters: a quoted heading is `> # Title`, and a task's checkbox sits
 * after its bullet.
 */
export function stripBlockPrefix(line: string): string {
  return line
    .trim()
    .replace(/^(?:>\s?)+/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-*+]|\d{1,9}[.)])(?:\s+|$)(?:\[[ xX]\](?:\s+|$))?/, '')
    .trim();
}

/** What a node is called when it has no text of its own to be called by. */
const KIND_LABELS: Record<NodeKind, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  'list-item': 'List item',
  code: 'Code block',
  table: 'Table',
  callout: 'Callout',
  quote: 'Quote',
  html: 'HTML block',
  hr: 'Divider',
};

/**
 * How a node's text becomes DOM.
 *
 * - `markdown` — inline markdown, rendered by Obsidian, so links and emphasis
 *   look as they do anywhere else.
 * - `text` — plain text, rendered by nobody. An HTML block's wikilinks are not
 *   resolved by Obsidian, so rendering it as markdown would only pretend to.
 * - `code` — plain text in a monospace run.
 */
export type NodeRender = 'markdown' | 'text' | 'code';

/**
 * What the content rule needs from a reference: which of the node's own lines
 * carries it, and the link as written.
 *
 * Structural on purpose. `PlacedReference` satisfies it, and stating the shape
 * here rather than importing that type is what keeps this module free of
 * `src/plugin/` — a core module that reached into the backlink index would make
 * zoom's breadcrumbs depend on the footer's view model.
 */
export interface ContentRef {
  readonly line?: number | undefined;
  readonly text?: string | undefined;
}

/** A node's text, and how to render it — the whole of D18's per-kind table. */
export interface NodeContent {
  readonly markdown: string;
  readonly render: NodeRender;
  readonly task?: boolean | undefined;
  readonly ordinal?: string | undefined;
  /** The node has lines beyond the ones shown, so what is shown is a shortening
   * rather than the whole of it. Only ever set under `firstLineOnly`: a row that
   * joins every line has omitted nothing. */
  readonly shortened?: boolean | undefined;
}

export interface ContentOptions {
  /**
   * Name the node by its first line rather than quote it whole.
   *
   * Continuation lines are context for READING a node, not for identifying it,
   * so a lineage segment and a breadcrumb take this and a footer row does not.
   * Only `prose` and `html` have a choice to make — every other kind's rule
   * already picks one line out of several.
   */
  readonly firstLineOnly?: boolean;
}

/**
 * The split this switch encodes: `code` and `table` lines are separate RECORDS,
 * so joining them would fabricate a sentence the source does not contain; every
 * other kind's lines are continuations of one thought and join. `callout` needs
 * neither rule — its title names it, and only a reference in the body displaces
 * that.
 *
 * `ref.line` is which of the node's OWN lines carries the reference, counted
 * from its first. Absent for a node that is context rather than a match, and
 * for kinds that do not use it.
 */
export function nodeContent(
  node: OutlineNode,
  ref?: ContentRef,
  options: ContentOptions = {},
): NodeContent {
  const refLine = ref?.line;
  const first = options.firstLineOnly === true;
  const task = taskStateOf(node);
  const ordinal = ordinalOf(node);
  const extra = {
    ...(task !== undefined ? { task } : {}),
    ...(ordinal ? { ordinal } : {}),
    ...(first && node.lines.length > 1 ? { shortened: true } : {}),
  };

  switch (node.kind) {
    case 'hr':
      // Nothing to say: the marker is the whole node.
      return { markdown: '', render: 'markdown', ...extra, shortened: false };
    case 'html':
      // Obsidian does not resolve wikilinks inside an HTML block, so rendering
      // one as markdown shows the reader `[[Target]]` and calls it a link. Its
      // TEXT is what the block says; its tags are how it says it, and a footer
      // row is not the place to read markup.
      return { markdown: htmlTextOf(node, first), render: 'text', ...extra };
    case 'code':
      return { markdown: codeLineOf(node, refLine), render: 'code', ...extra };
    case 'table':
      return { markdown: tableTextOf(node, ref), render: 'markdown', ...extra };
    case 'callout':
      return { markdown: calloutTextOf(node, refLine), render: 'markdown', ...extra };
    default:
      return { markdown: proseOf(node, first), render: 'markdown', ...extra };
  }
}

/**
 * A node's identifying text — the same per-kind content every other surface
 * quotes, taken from its first line, falling back to its kind when nothing
 * survives, and marked with an ellipsis when the node has more of its own to
 * say.
 *
 * A label that silently drops continuation lines claims to BE the node's text,
 * and a multi-line paragraph named by its opening clause reads as a complete,
 * oddly abrupt sentence. The ellipsis is the difference between shortening and
 * misquoting.
 *
 * On the node's own line count, not on rendered width: this answers "is there
 * more of this node", which a layout has no opinion about. A label the row
 * cannot fit is the stylesheet's problem and gets its own ellipsis from the
 * browser.
 *
 * The kind fallback exists because a bare `-` or an empty heading is a real
 * thing to have in a document, and a blank crumb is both unreadable and
 * unclickable. It takes no ellipsis: it is a name for the node, not a quotation
 * from it, so there is nothing it could be cutting short.
 */
export function nodeLabel(node: OutlineNode): string {
  const content = segmentContent(node);
  return content.shortened === true ? `${content.markdown}…` : content.markdown;
}

/**
 * What one element of a lineage chain says — a footer lineage segment or a zoom
 * breadcrumb, which are the same thing about different chains.
 *
 * The per-kind rule, first line only, plus the one thing a chain needs that a
 * row does not: a node with nothing to say still has to be nameable, because a
 * blank segment is both unreadable and unclickable. That name is rendered as
 * TEXT, not markdown — it is a name for the node rather than a quotation from
 * it, which is also why it carries no shortening mark.
 */
export function segmentContent(node: OutlineNode): NodeContent {
  const content = nodeContent(node, undefined, { firstLineOnly: true });
  if (content.markdown.length > 0) return content;
  return { ...content, markdown: KIND_LABELS[node.kind], render: 'text', shortened: false };
}

/** The name a node falls back to when it has no text of its own. */
export function kindLabel(kind: NodeKind): string {
  return KIND_LABELS[kind];
}

/** Continuation lines, joined: a paragraph, heading, quote or list item's lines
 * are one thought wrapped, not several records. */
function proseOf(node: OutlineNode, firstLineOnly: boolean): string {
  const lines = firstLineOnly ? node.lines.slice(0, 1) : node.lines;
  return lines.map(stripBlockPrefix).filter((l) => l.length > 0).join(' ');
}

/**
 * `- [x]` — a task's state, or absent when the item is not a task.
 *
 * The trailing whitespace is optional because `- [ ]` with nothing after it is a
 * valid task, and the common one: it is what a just-created todo looks like.
 * Requiring it classified an empty task as a plain list item, which dropped its
 * checkbox and left `[ ]` in the row's own text.
 */
export function taskStateOf(node: OutlineNode): boolean | undefined {
  if (node.kind !== 'list-item') return undefined;
  const m = /^\s*[-*+]\s+\[([ xX])\](?:\s|$)/.exec(node.lines[0] ?? '');
  return m ? m[1] !== ' ' : undefined;
}

/** `10.` — an ordered item's own label, as written. */
export function ordinalOf(node: OutlineNode): string | undefined {
  if (node.kind !== 'list-item') return undefined;
  return /^\s*(\d{1,9}[.)])(?:\s|$)/.exec(node.lines[0] ?? '')?.[1];
}

/** A fence's lines are statements, not a sentence: show the one the reference
 * is on, or the first real line when it is context rather than a match. */
function codeLineOf(node: OutlineNode, refLine: number | undefined): string {
  const isFence = (l: string): boolean => /^\s*(?:```|~~~)/.test(l);
  const at = refLine !== undefined ? node.lines[refLine] : undefined;
  if (at !== undefined && !isFence(at)) return at.trim();
  return (node.lines.find((l) => !isFence(l) && l.trim().length > 0) ?? '').trim();
}

/**
 * One tag, or one comment.
 *
 * The quoted-string alternatives are what keep a tag's own `>` from ending it:
 * `<div title="1 > 0">` is one tag, and matching to the first `>` left the rest
 * of the attribute in the row as text. Requiring a letter after `<` leaves a
 * stray `<` in prose alone, which matching `<[^>]*>` did not.
 *
 * A tokenizer would be the thorough answer and is not available here: this
 * module is pure so it can be tested without a DOM, and a dependency is a large
 * price for the preview line of a footer row.
 */
const HTML_TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;

/**
 * An HTML block's visible text: tags removed, entities left to the DOM.
 *
 * A wikilink inside one is reduced to the text it would have shown. Obsidian
 * does not resolve it, so rendering it as a link would lie — but showing the
 * reader `[[Target]]` with its brackets is not the alternative, it is just
 * source code in a row that holds no other source code.
 */
function htmlTextOf(node: OutlineNode, firstLineOnly: boolean): string {
  const lines = firstLineOnly ? node.lines.slice(0, 1) : node.lines;
  return lines
    .join(' ')
    .replace(HTML_TAG, ' ')
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
      (alias ?? target).trim(),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|?\s*$/;

/**
 * The single CELL the reference sits in.
 *
 * An earlier version showed the header row alongside the reference's own row,
 * on the reasoning that a bare value needs its column name. Seen in place it was
 * the noisiest row in the footer: two rows of pipe-separated fields to say that
 * one cell mentions the note. A cell is the smallest thing that can hold a
 * reference, and quoting it is the same promise every other kind's row makes.
 *
 * Found by the reference's own text, not by position, because a row can hold
 * more than one link and only one of them is the reason this row exists.
 */
function tableTextOf(node: OutlineNode, ref: ContentRef | undefined): string {
  // Unescaped delimiters only. A table cell writes an aliased link as
  // `[[Target\\|alias]]`, because a bare pipe there WOULD be a column break —
  // so splitting on every pipe cut that cell in two, left no cell containing the
  // reference's own text, and fell through to displaying the first cell instead.
  // The escape is a table-syntax artefact, so it comes back out of the cell text.
  const cellsOf = (line: string): string[] =>
    line
      .replace(/^\s*\|/, '')
      .replace(/(?<!\\)\|\s*$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, '|').trim());

  const at = ref?.line !== undefined ? node.lines[ref.line] : undefined;
  const row = at !== undefined && !TABLE_SEPARATOR.test(at) ? at : node.lines[0];
  if (row === undefined) return '';

  const cells = cellsOf(row);
  const hit = ref?.text ? cells.find((c) => c.includes(ref.text as string)) : undefined;
  // No reference to place — a table shown as CONTEXT — so its first cell names
  // it, the way a first line names every other kind.
  return hit ?? cells.find((c) => c.length > 0) ?? '';
}

/**
 * A callout's title, with its `[!type]` token dropped — the marker already says
 * callout, so the token would be the kind said a second time. A reference in the
 * BODY shows that body line instead, since the title is not where it is.
 */
function calloutTextOf(node: OutlineNode, refLine: number | undefined): string {
  if (refLine !== undefined && refLine > 0) {
    const body = node.lines[refLine];
    if (body !== undefined) return stripBlockPrefix(body);
  }
  // Through the closing bracket, not a guessed alphabet. `parse.ts` classifies
  // ANY `> [!…` line as a callout (CALLOUT_RE), so restricting the identifier to
  // letters and hyphens here left `[!type_2]` or `[!step1]` classified as a
  // callout and its token leaking into the row — the kind said twice, which is
  // exactly what dropping the token is for.
  const title = stripBlockPrefix(node.lines[0] ?? '').replace(/^\[![^\]]*\][-+]?\s*/, '').trim();
  // An untitled callout has only its type; its first body line names it instead.
  if (title.length > 0) return title;
  return stripBlockPrefix(node.lines[1] ?? '');
}
