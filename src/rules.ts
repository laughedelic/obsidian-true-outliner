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
 * Context-determined encoding: the structural kind a reparented
 * paragraph/list-item node takes at its destination. Pure function of the
 * new surroundings; atoms and headings never pass through here.
 *
 * Note one nuance vs the spec's shorthand: only paragraph/list-item siblings
 * can donate a kind — headings and atoms are skipped when scanning, because
 * \"encode like your neighbor\" only makes sense between the two kinds that
 * are interchangeable encodings of a content node. A heading arriving at a
 * destination takes its LEVEL from `destinationHeadingLevel` below rather than
 * a kind from here; the two are the same rule over the two regimes.
 */
export function encodingKindAtDestination(context: {
  parentKind: NodeKind | 'root';
  precedingSiblings: readonly OutlineNode[];
  followingSiblings: readonly OutlineNode[];
}): 'paragraph' | 'list-item' {
  const donor = (nodes: readonly OutlineNode[]): 'paragraph' | 'list-item' | undefined => {
    for (const node of nodes) {
      if (node.kind === 'paragraph' || node.kind === 'list-item') return node.kind;
    }
    return undefined;
  };
  const preceding = donor([...context.precedingSiblings].reverse());
  if (preceding) return preceding;
  const following = donor(context.followingSiblings);
  if (following) return following;
  return context.parentKind === 'heading' || context.parentKind === 'root'
    ? 'paragraph'
    : 'list-item';
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
 * the siblings it landed among, opened a section that swallowed them.
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
