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
 * The heading regime's half of `encodingKindAtDestination`, and it reads its
 * surroundings the same way: the level comes from the destination's own heading
 * SIBLINGS first — nearest preceding, else following — because siblings are
 * what the payload has to sit level with. Only where the scope has no heading
 * sibling to copy does the parent decide, at one past its own level, or 1 at
 * root.
 *
 * Reading the parent alone was wrong wherever a scope SKIPS a level: under an
 * `h1` whose children are `h3`, a payload took `h2` and, being shallower than
 * the siblings it landed among, opened a section that swallowed them. Both
 * readings are defensible there — a heading one past its parent, or one level
 * with what it lands beside — and the sibling one is kept because it never
 * takes in content nobody pointed at. A drop that wants the other reading
 * names a level of its own (`MoveDestination.level`).
 *
 * A level past 6 is the heading regime running out. The caller decides what
 * that means; here it is simply the number the rule produces.
 */
export function destinationHeadingLevel(context: {
  parent: OutlineNode | 'root';
  precedingSiblings: readonly OutlineNode[];
  followingSiblings: readonly OutlineNode[];
}): number | undefined {
  const { parent, precedingSiblings, followingSiblings } = context;
  if (parent !== 'root' && parent.kind !== 'heading') return undefined;
  const donor = (nodes: readonly OutlineNode[]): number | undefined => {
    for (const node of nodes) if (node.kind === 'heading') return node.level;
    return undefined;
  };
  const preceding = donor([...precedingSiblings].reverse());
  if (preceding !== undefined) return preceding;
  const following = donor(followingSiblings);
  if (following !== undefined) return following;
  return parent === 'root' ? 1 : (parent.level ?? 1) + 1;
}
