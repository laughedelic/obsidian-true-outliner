/**
 * The PROVISIONAL mapping rules, isolated here so revising them (or making
 * them configurable) is a local change. Decision log:
 * docs/research/open-questions.md, Q2 follow-ups #1, #3 and its 2026-09-16
 * correction.
 */

import type { ListStyle, NodeKind, OutlineNode } from './model';

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

/** What a converted node writes where its destination has no list to copy. */
export const DEFAULT_LIST_STYLE: ListStyle = { type: 'bullet', marker: '-' };

/**
 * Context-determined list style: the marker a node CONVERTED into a list item
 * takes at its destination. The third regime of the same rule as
 * `nativeContentKind` and `destinationHeadingLevel`, read the same way
 * — nearest preceding list-item sibling, else nearest following, else the
 * default — because a marker is what a row has to sit level with.
 *
 * A converted node that writes `-` into a run of `*` ends that run: CommonMark
 * starts a new list wherever the bullet character changes, so one list becomes
 * three around the arrival. Into an ordered run it does the same, and the
 * ordinal sequence the reader is following stops and resumes. Neither is
 * anything the person pasting asked for.
 *
 * An ordered donor hands over its own NUMBER as well as its delimiter. The
 * number is provisional — the renumbering pass owns what each member of a run
 * finally reads — but it has to be the donor's rather than a fixed `1.`, so
 * that the marker's WIDTH is already the width of its neighbours and the
 * arrival's own children are laid out at the column they will keep.
 *
 * Only list items donate, as only paragraphs and list items donate a kind: a
 * heading or an atom standing between the arrival and the run says nothing
 * about which list the arrival joins.
 */
export function destinationListStyle(context: {
  precedingSiblings: readonly OutlineNode[];
  followingSiblings: readonly OutlineNode[];
}): ListStyle {
  const donor = (nodes: readonly OutlineNode[]): ListStyle | undefined => {
    for (const node of nodes) if (node.kind === 'list-item' && node.listStyle) return node.listStyle;
    return undefined;
  };
  return (
    donor([...context.precedingSiblings].reverse()) ??
    donor(context.followingSiblings) ??
    DEFAULT_LIST_STYLE
  );
}

/**
 * Whether a run that stays in its scope, kept as written, would re-parse under
 * the sibling it lands after: a list item set right after a paragraph is that
 * paragraph's child. A move takes such a run as an insertion instead, which
 * writes the item as the paragraph's sibling or refuses a task there, and the
 * drop's preview asks the same question.
 */
export function reorderReparents(
  roots: readonly OutlineNode[],
  after: OutlineNode | undefined,
): boolean {
  return roots[0]?.kind === 'list-item' && listAttachesTo(after);
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
 * The heading regime's half of `nativeContentKind`, and it reads its
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
  // The nearest sibling that expresses a regime decides which one the payload
  // lands in. A heading donates its level, as it always did. A LIST ITEM ends
  // the scan instead of being skipped: a heading-bearing scope whose rows at
  // the insertion point are list items is a list at that point, whatever the
  // parent is, and a payload landing between two of them belongs to their run.
  //
  // Scanning for headings alone read the SCOPE where the kind rule reads the
  // NEIGHBOURS, and the two disagreed wherever a list sits under a heading —
  // the commonest shape there is. Measured, a section pasted into `1.` / `9.` /
  // `10.` under an `h2` stayed a heading and split the run.
  //
  // Paragraphs and atoms stay transparent. A heading beside a paragraph in a
  // heading scope is the shape "same depth, different kinds" already covers,
  // and nothing measured says it wants to change.
  const donor = (nodes: readonly OutlineNode[]): number | 'list' | undefined => {
    for (const node of nodes) {
      if (node.kind === 'heading') return node.level;
      if (node.kind === 'list-item') return 'list';
    }
    return undefined;
  };
  const preceding = donor([...precedingSiblings].reverse());
  if (preceding !== undefined) return preceding === 'list' ? undefined : preceding;
  const following = donor(followingSiblings);
  if (following !== undefined) return following === 'list' ? undefined : following;
  return parent === 'root' ? 1 : (parent.level ?? 1) + 1;
}
