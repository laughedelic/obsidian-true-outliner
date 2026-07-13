/**
 * The two PROVISIONAL mapping rules, isolated here so revising them (or
 * making them configurable) is a local change. Decision log:
 * docs/research/04-open-questions.md, Q2 follow-ups #1 and #3.
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
 * are interchangeable encodings of a content node.
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
