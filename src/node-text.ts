/**
 * How a node NAMES itself: its own text with the block syntax that encodes its
 * place in the tree removed.
 *
 * Core rather than `src/plugin/`, because two surfaces need the same answer and
 * neither is more entitled to own it — the backlinks footer names a reference's
 * row, and zoom names a breadcrumb crumb. `stripBlockPrefix` lived privately in
 * `footer-model.ts` until the second caller appeared; a copy in the second
 * would have been the third marker-stripping function in the codebase, after
 * `ops.ts`'s `contentColumnCh` and `markerPrefixCh`, which answer a different
 * question (where the CARET may sit) and are deliberately not reused here.
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
 * A node's identifying text — its FIRST line stripped of block syntax, falling
 * back to its kind when nothing survives.
 *
 * The first line only: continuation lines are context for reading a node, not
 * for naming it. The fallback exists because a bare `-` or an empty heading is
 * a real thing to have in a document, and a blank crumb is both unreadable and
 * unclickable.
 */
export function nodeLabel(node: OutlineNode): string {
  const text = stripBlockPrefix(node.lines[0] ?? '');
  return text.length > 0 ? text : KIND_LABELS[node.kind];
}
