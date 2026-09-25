## Context

`reencodeBlocksForDestination` is the one re-encode step every insertion runs: a caret paste, a
type-over, the D16 fallback that fills an emptied scope, a move, and the drop preview. A block
that keeps its kind went through `reindentSubtreeVerbatim`, which swapped the root's own
indentation prefix for the destination's on every line of the subtree and kept the rest. A
block that converts goes through `reencodeForDestination`'s conversion branches, and a heading
into a list goes through `reencodeIntoListScope`. `docs/research/paste-indent-convergence.md`
records what each wrote and the differential behind the decisions below.

## Goals / Non-Goals

- **Goal.** A pasted subtree is written in the document's unit at every level, whatever unit the
  clipboard used.
- **Goal.** A subtree the document itself wrote comes back in the same bytes, which is what D15
  protected.
- **Goal.** No verdict and no parsed tree changes. The change is to characters, and to columns
  only where a level's column was the clipboard's rather than the document's.
- **Non-goal.** A conversion's children (#215), recorded in the proposal's Non-Goals.

## Decisions

### D1. A nested list item is written from depth, as an indent writes it

The tree is known by the time a payload is re-encoded, so a list item under a list item takes its
parent's NEW indentation plus one unit, through `reachContentColumn`, the same padding
`destinationIndent` applies under a wide marker. This is the only rule that makes a two-space, a
four-space, a tab and a mixed clipboard converge. A per-level swap from the clipboard's unit to
the document's does not, because a mixed clipboard has no one unit to swap from. Rewriting the
characters while keeping each level's width fails in both directions: a two-space level cannot be
a tab.

### D2. Every other line keeps its offset from its own node

A continuation, or a paragraph or block under a list item, sits at the item's content column,
which is a marker's width past the item and not a unit past it. Writing it a unit past would
move it. So `rewriteOwnLine` keeps the line's offset from its node's old indentation and writes
it after the node's new indentation. The characters after the prefix are kept where they land on
the same column and are spaces, or tabs going into a tab document, and are never kept where the
join would put a space in front of a tab (#203's D3). Anything else gets the offset in spaces,
which is #154's `⏵··bar` in a tab document. A line narrower than its node's indentation is a
lazy continuation. It is carried as it was, since a paragraph continues at any column and moving
it gains nothing.

A paragraph's child list uses the same rule. It attaches by adjacency at any column, and
`chooseIndent` gives it the paragraph's own indentation, so its offset from the paragraph is the
only evidence of where it goes.

### D3. An atom is content, and moves by its first line

Whitespace inside a fenced block is code. Converting a tab there changes a Go snippet or a
Makefile. An atom's lines go through `reprefixLine` from #203: the atom's own prefix is swapped
for its new indentation where the swap lands on the column the move asks for, and every other
line is shifted by the width, keeping its tabs.

### D4. The unit is read under a bullet

Writing levels from depth makes the unit matter on every level, where before it mattered only
for a destination with no sibling to copy. `inferIndentUnit` returned the first indented list
item's whitespace. In a two-space document opening with `1. one` / `   - a`, that is three
spaces, the width that reaches the content column of `1.`. The unit is now the step from a bullet
item to its first indented child, because a bullet's marker is narrower than any unit. Without
such a step, the first indented item's whitespace still answers.

This also changes what an indent reads. The differential behind #203 is unchanged by it (690
rows, no shape there opens with a nested item under a number). In the numbered-first shape, an
indent under a bullet now writes the bullet's content column rather than one column past it.

### D5. A move reads the unit before its removal

`moveSubtreesTo` re-encodes against the tree after the removal. When the moved run held the
document's only nested items, that tree has no evidence, and the editor's setting answered for a
document that had already chosen one. The move now passes the unit read from the original tree
as the fallback. So evidence left after the removal still wins, and the editor's setting answers
only where neither tree has any. `writtenFirst` in `drop-destinations.ts` already reads the
original tree, so the drop preview and the move now agree.

### D6. A heading converted into a list takes the unit too

`reencodeIntoListScope` wrote a converted heading section's levels at the item's content column
in spaces: `⏵- ## H` / `⏵  - b`. It is the same insertion step and the same symptom, so its child
indentation now comes from D1's rule. For a two-space document the bytes are unchanged, since
`- ` is two columns wide.

## Risks / Trade-offs

- **A document indented two ways** converges on the unit `inferIndentUnit` reads, for a paste
  from inside it as well. The differential finds two such shapes, and each is written in one
  unit after the paste.
- **D15's scenario** stays true: a tab subtree pasted into a tab document keeps its tabs at every
  level, because the document's unit is a tab.
