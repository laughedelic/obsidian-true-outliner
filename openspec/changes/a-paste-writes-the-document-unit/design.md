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
- **Non-goal.** Indent and outdent's conversions (#215), recorded in the proposal's Non-Goals.

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
which is #154's `⏵··bar` in a tab document. A line that does not open with its node's
indentation, a lazy continuation or one the source wrote in another unit, moves with the block
by the root's prefix swap, as `main` moves it, and is kept as it was where it does not open with
that either. Keeping it where it stood while the block moved right left a lazy `> q4` one column
into its item, where it opens a quote. A paragraph continues at any column. Spelling such a line's offset in
spaces moved a `\t> q1` continuation two columns in, where it opened a quote.

A child that is not a list item keeps its offset only while the offset stays short of the
content column of the re-laid list item before it. Past that column, the parse reads it as that
item's child. So it is written at its parent's content column, which is under the parent and
short of every item beside it. The review round found this with a four-space payload in a
two-space document, `- Step 1` / `    - detail` / `    ````, where the fence moved under
`detail`.

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

### D7. A block that would read as another tree keeps its own characters

D1 moves nested items relative to lines that D2 keeps in place. A line that is text only
because it sits four or more columns into its container opens a block once the item above it
moves left. Examples are a lazy `> q3`, or a continuation that starts with `|` or a number. The
review round's fuzzer found such shapes one at a time. `reindentSubtree` states the rule once,
against the parse. It reads the converged block back on its own and compares the result with the
tree it was written as. The root's indentation is cut back to what lies past its last tab stop,
so the root opens a block as it does in place and every later tab reaches the stop it reaches
there. Where they differ, the block is written as `main` wrote
it, through `reindentSubtreeVerbatim`: its characters past its root's prefix are kept. The cost
is one parse of each pasted block.

### D8. A converted block's children are laid out, not moved

`reencodeForDestination`'s conversion branches move a converted node's children by the column its
marker shifted them, in spaces. The paste path now takes only the node's own lines from it, and
lays out the children with `layChildren`. A converted node's content column has changed, so no
child's offset from it is worth keeping. Under a paragraph, the children take the paragraph's
indentation, which is where `chooseIndent` puts a paragraph's list. Under an item, they are laid
out as under any item. The result is read back as in D7, against the tree it was
written as, and the conversion's own lines stand where it would not parse that way. Comparing
against `main`'s conversion instead threw the laid-out block away exactly where `main`'s was
wrong: a paragraph a column or two in whose list sits flush left keeps that list at column zero,
a sibling of the new item. Indent and outdent keep calling the conversion branches directly, which is #215's to change,
because an indent's children are the document's own and a unit could move them.

### D9. A note with no node gives its body to the first paste

A note with no node is all preamble, which is outside the outline, so a paste into it went to
Obsidian untouched. `isEmptyBodyLine` gives jurisdiction over such a note's blank lines past any
frontmatter, and only while the note has no node. A structural paste there is written as the
root's children through `reencodeBlocksForDestination`, so the first paste converges like every
later one. The blank lines above the caret stay above it, and those below it become the run's
trailing gap, which is where Obsidian's own paste leaves them. The frontmatter is never touched,
and plain text, which opens no block, still goes to Obsidian. A note that has nodes keeps its
leading blank lines as preamble, where a paste stays Obsidian's.

## Risks / Trade-offs

- **A document indented two ways** converges on the unit `inferIndentUnit` reads, for a paste
  from inside it as well. The differential finds two such shapes, and each is written in one
  unit after the paste.
- **D7 compares a block read on its own**, not in place, and before the run is renumbered. The
  fuzzer's six residual cases in 20 000 pastes are those two gaps. Five are a renumbering that
  shifts a nested item marked `-⏵` onto another tab stop, which `main` does with no paste
  involved. One is a destination line after the run reaching the re-laid last item
  (`docs/research/paste-indent-convergence.md`).
- **D15's scenario** stays true: a tab subtree pasted into a tab document keeps its tabs at every
  level, because the document's unit is a tab.
