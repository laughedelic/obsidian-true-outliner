/**
 * The PROVISIONAL mapping rules, isolated here so revising them (or making
 * them configurable) is a local change. Decision log:
 * docs/research/open-questions.md, Q2 follow-ups #1, #3 and its 2026-09-16
 * correction.
 */

import type { NodeKind, OutlineNode } from './model';

/**
 * Attachment rule: does a list item that lands next to `precedingSibling`
 * become that sibling's child instead? (\"A list following a paragraph is
 * that paragraph's children.\")
 */
export function listAttachesTo(precedingSibling: OutlineNode | undefined): boolean {
  return precedingSibling?.kind === 'paragraph';
}

/**
 * The kind a brand-new content node takes at a destination — what a split
 * materialises as a first child, where there is no node whose kind could be
 * kept. It reads the scope: the nearest content sibling's kind, preceding
 * first, then following; with none, a paragraph under a heading or the root
 * and a list item under anything else, since a paragraph's or a list item's
 * children are list items.
 *
 * Only paragraph and list-item siblings donate a kind. Headings and atoms are
 * skipped when scanning, because "encode like your neighbour" only makes sense
 * between the two kinds that are interchangeable encodings of a content node.
 */
export function nativeContentKind(context: {
  parentKind: NodeKind | 'root';
  precedingSiblings: readonly OutlineNode[];
  followingSiblings: readonly OutlineNode[];
}): 'paragraph' | 'list-item' {
  const preceding = contentDonor([...context.precedingSiblings].reverse());
  if (preceding) return preceding;
  const following = contentDonor(context.followingSiblings);
  if (following) return following;
  return context.parentKind === 'heading' || context.parentKind === 'root'
    ? 'paragraph'
    : 'list-item';
}

/**
 * The kind an EXISTING content node must take at a destination, or `undefined`
 * where it keeps its own.
 *
 * A node keeps its kind wherever the destination can hold that kind: a list
 * item under a heading is a list item there too, and the reader who wants a
 * paragraph has outdent for it. Two destinations cannot hold a kind, and only
 * there is a node converted:
 *
 * - A paragraph landing in a LIST scope — under a list item or a paragraph,
 *   whose children are list items, or beside list items — becomes a list item,
 *   since a paragraph written among list items ends the list.
 * - A list item landing right after a paragraph becomes a paragraph, since the
 *   attachment rule (`listAttachesTo`, the reading `parse` takes) would make it
 *   that paragraph's child rather than the sibling the destination names.
 *
 * A heading or an atom is never converted here: headings have the level rule
 * below, and atoms keep their kind everywhere they are allowed at all.
 *
 * The caller decides what a conversion means for a node that cannot survive
 * one — a task's checkbox is a list marker, and a paragraph has none.
 */
export function forcedContentKind(
  context: {
    parentKind: NodeKind | 'root';
    precedingSiblings: readonly OutlineNode[];
    followingSiblings: readonly OutlineNode[];
  },
  kind: NodeKind,
): 'paragraph' | 'list-item' | undefined {
  if (kind !== 'paragraph' && kind !== 'list-item') return undefined;
  if (kind === 'list-item') {
    return listAttachesTo(context.precedingSiblings[context.precedingSiblings.length - 1])
      ? 'paragraph'
      : undefined;
  }
  return nativeContentKind(context) === 'list-item' ? 'list-item' : undefined;
}

function contentDonor(nodes: readonly OutlineNode[]): 'paragraph' | 'list-item' | undefined {
  for (const node of nodes) {
    if (node.kind === 'paragraph' || node.kind === 'list-item') return node.kind;
  }
  return undefined;
}

/**
 * The heading level a payload's root takes at a destination, or `undefined`
 * where a heading cannot be written at all — below a list item or a paragraph,
 * which `parse.ts` never nests one under.
 *
 * The heading regime's half of the encoding rule: one past the parent's own
 * level, or 1 at the root. The siblings do not enter into it. A heading
 * landing among a parent's children is that parent's child, and its level says
 * so, whatever level the siblings happen to sit at — a scope that skips a level
 * (an `h2` whose children are `h5`) is the scope's own irregularity, and a
 * payload written at `h5` to match it took the skip for a rule.
 *
 * A payload written shallower than the siblings that follow it opens a section
 * over them: they become its children on re-parse. That is the heading's own
 * meaning, the insertion rule states it, and the drag preview draws it before
 * the release (`node-dragging`); an earlier reading of this rule copied the
 * siblings' level to avoid it.
 *
 * A level past 6 is the heading regime running out. The caller decides what
 * that means; here it is simply the number the rule produces.
 */
export function destinationHeadingLevel(context: {
  parent: OutlineNode | 'root';
  precedingSiblings: readonly OutlineNode[];
  followingSiblings: readonly OutlineNode[];
}): number | undefined {
  const { parent } = context;
  if (parent !== 'root' && parent.kind !== 'heading') return undefined;
  return parent === 'root' ? 1 : (parent.level ?? 1) + 1;
}
