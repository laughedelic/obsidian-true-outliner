# Design

## Context

See proposal.md for the motivation, and `docs/research/lazy-continuation-at-seams` for what each reader does
with a flush line and a blank one.

Today, three mechanisms decide what stands in a seam:

- **`normalizeBoundaries`** (in `finalize`) adds one blank line where our parse would merge two
  blocks. It never touches a seam that already holds one. It is a no-op on any parsed tree, which is
  what lets it run over the whole note.
- **The insertion rule** (`spliceAtIndex`, `scopeSeparation`) copies the separation of the boundary a
  run lands in onto both sides of the run. A same-scope reorder keeps the blank lines with the
  positions.
- **The operations that open a provisional position** (`splitNode`, `insertEmptyBefore`,
  `unwrapListItem`) write the place's blank lines as gap text themselves.

Node ids survive a surgery: every re-encode spreads the node it rewrites. A new node gets a fresh id
from the global counter, and a pasted payload is a separate parse, so all of its ids are new.

## Goals / Non-Goals

**Goals:**
- One rule decides every seam an operation creates outside a list, stated once, whichever mechanism
  wrote the seam.
- A note an operation has not touched stays byte-identical. So does every seam in it the operation did
  not create, and every seam inside a list.

**Non-Goals:**
- Choosing separators by what each reader continues. The rule separates every created seam outside a
  list, and needs no table of line kinds to maintain.
- Deciding separation inside a list. The list's own tightness decides it, as today.

## Decisions

### D1. A seam is created when its two blocks were not adjacent before, following lineage

A seam is a pair: the block whose last line is above it, and the block whose first line is below it.
Adjacency is read from the document before the operation (`finalize`'s `oldDoc`), as the set of such
pairs by node id. It covers:
- the final descendant of each sibling, paired with the next sibling
- each parent, paired with its first child

A pair counts as the same whichever relation it has, so an indent that turns `b`, the sibling after
`a`, into `a`'s first child creates no seam.

Some operations replace a block without moving the seam below it:
- a split's lower half takes the original's last line
- a merge's survivor takes the second node's last line
- a drafted sibling heading, or a folded split's new block, ends where the original's section ended

Such an operation passes `finalize` a LINEAGE: the new block, and the old block that was directly
above the seam it takes over. That is the original for a split, the second node for a merge, and the
final descendant of the original's section for a drafted heading or a folded split. The lookup
substitutes the lineage on the seam's UPPER side only: a merge's survivor keeps the first node's
id, so the seam above it is read as it always was.

So Enter mid-text in a paragraph written flush above `# H` leaves that seam as the user wrote it, and
a merge leaves the merged node's seam below as it was.

A TYPE-OVER's replacement takes over the replaced run's seams the same way:
- its first block takes the seam above the run
- its last block takes the seam below the run

Typing a character over a selected paragraph therefore leaves the user's spacing around it as it was.

A seam is also created when a re-encode changes the kind, as written, of either of its blocks. An indent
that turns `p2`, written directly above `> q`, into `- p2` changes what that seam means to every reader,
though both blocks keep their ids.

A seam in the result is created when its pair, read through lineage, is not in the old set, or when
either block's kind as written changed.

Alternatives considered:
- **By node id alone.** Rejected in review: a split, a merge or a drafted heading would count the
  unmoved seam below it as created, and would separate a seam the user wrote.
- **By position** (the line offset of the seam). A move carries a seam's blocks elsewhere, so a
  positional reading would call the moved pair created and the vacated one kept.
- **By kind** (separate only what some reader continues lazily). Rejected in review: the rule is
  simpler and admits no reader-by-reader table.

### D2. A payload's own seams are created

A paste parses the clipboard on its own, so every seam inside the payload pairs two new ids and is
created. The payload's text is new to this note. Its separations come from wherever it was copied,
and the rule is what makes the note unambiguous. A move is the contrast: its blocks keep their ids,
so the seams inside the moved run existed before and are left as written.

Confirmed in review. The alternative was to treat a payload's adjacent roots as already adjacent,
keeping the clipboard's own separation, so a flush quote over a paragraph would arrive flush and
ambiguous.

### D3. A seam a removal leaves is created

A delete, a move out, or a merge's adoption can bring two blocks together that were not adjacent.
Their pair is new, so the seam is created, and it is separated unless it lies inside a list.

When a splice will fill the place a removal leaves, as in a type-over or a paste onto an empty
anchor, the removal SHALL NOT separate that seam. It is not a seam of the result: the payload goes
there, and the insertion's own seams decide. `deleteSubtreeGroups` already receives that fact as
`spliceFollows`.

### D4. Inside a list, the list decides

A LIST is a maximal run of adjacent sibling list items under one parent, judged by kind as written
(`kindAsWritten`), whatever their markers. A seam INSIDE A LIST has its lower block inside one of the
list's items, or is the list's next item, and its upper block inside that list. That covers:
- an item's text and its first child block
- two child blocks of one item
- an item's last block and the next item
- an item and its nested list

A blank line at any of these makes the list loose (`lazy-continuation-at-seams`, "Measured: loose
lists"). So the created-seam rule does not apply inside a list. A seam inside a list that an operation creates
takes THE LIST'S OWN SEPARATION instead. That separation is read from a seam between two of the list's
items that the operation did not create, or is none for a list with no such seam.

That corrects the insertion's carry where it crosses the list's edge. Pasting `- x` after `- b` in
`- a` / `- b` / blank / `para` copies the list's exit gap onto the new in-list seam today, and loosens
the list. Under this rule, the run's last block takes that exit gap, and the seam between `- b` and
`- x` takes the list's own separation, which is none. A split still writes a sibling item flush, which
is a tight list's separation. The parse floor adds what the parse requires.

The seams between a list and a block outside it are not inside the list: a paragraph or heading
directly above the list, and the block directly below the list's last line. The rule separates those.

Cost, accepted in review: in a tight list, a quote and a paragraph that are children of the same item,
with the paragraph written directly under the quote, stay flush, and reading mode continues the
paragraph into the quote.

### D5. A place is a block, separated on both sides, and never an empty edit

A provisional position stands for a paragraph the user is about to type. It must parse as a block of
its own, so it is separated on both sides wherever it sits, inside a list too. A paragraph inside a
list item already needs a blank line above it. The op that opens a place always writes the place's
own line, and adds a blank line on each side only where that seam lacks one, so an Enter always
changes the document. Every op that leaves a place is covered:
- `splitNode`'s end-of-node and content-start positions, and its folded path
- `insertEmptyBefore`
- `unwrapListItem`
- `outdentSurgery` when it dissolves an empty item into an empty paragraph The statements that a place "widens the gap by two" become "is separated on both sides".

This also settles the measured cases where a place sits flush today:
- under a quote, a heading or a closing fence
- above a heading's flush first child, where the typed text joins that child in our own parse
- under an unwrapped item, where the spec scenario already asks for a blank line from the item above
  and the code writes none
- under the list an outdent-dissolve leaves, where the typed text would read as a lazy continuation of
  the item above

Abandonment removes the place together with the blank lines it added:
- **An operation that opened the place.** Its reversal is a diff back to the text it acted on, which
  already covers them.
- **An operation that dissolved a node,** such as leaving a list. Its stated removal covers the place's
  line and the separators it added. It leaves the seam between the place's neighbours as the rule
  writes that seam without a place: one blank line outside a list, and none inside it.

### D6. The rule runs in `normalizeBoundaries`, given the old adjacency

`finalize` computes `oldDoc`'s adjacency and hands it to `normalizeBoundaries`, along with the
operation's lineage. At each empty seam outside a list, the pass now asks whether the seam is created
before it asks whether the parse needs a separator. Existing gaps are never widened: the check runs
only on an empty seam.

On a parsed tree every pair is old, so the pass stays a no-op there, and running it over the whole
note stays safe. `spliceAtIndex` keeps carrying the destination's separation, with one correction
(D4): where a run lands at a list's edge, the list's exit gap goes to the seam that leaves the list,
and a created seam inside the list takes the list's own separation. Normalization separates whatever
created seam outside a list the carry left empty. The places in D5 are written by the ops that open them, because those ops know where
the place is.

### D7. A type-over keeps the seams of what it replaced

A type-over runs a deletion and an insertion through two `finalize` calls, with a re-parse between them
that renews every id. Per D3, the deletion leaves its splice seam alone. The insertion's `finalize`
receives the type-over's lineage (D1), stated against the re-parsed document: the payload's first block
takes the seam above the replaced run, and its last block takes the seam below it.

So typing over a selected paragraph leaves the spacing around it as the user wrote it. A type-over of
list items in a tight list stays tight. A payload whose first or last block is of another kind than
what it replaced, such as a quote replacing a paragraph above another paragraph, changes that seam's
kind and is separated. The seams inside the payload are created, as for any paste (D2).

### D8. A block id stays on its block

An attached block-id line is part of its node's encoding, written before the node's trailing gap. A
separator the rule adds lands in that gap, after the id, never between the block and its id.

A LONE block-id line our parse leaves as a node of its own, one that sits flush above a block, is
different: a blank line below it re-attaches it to the block above and moves every reference to it
(`lazy-continuation-at-seams`, "What follows"). A seam whose upper block is such a line is exempt from
the rule. The parse floor still wins: above a paragraph, the line would join the paragraph's text,
so a blank line is required there and the id attaches, as it does today.

### D9. A relocation that gains a blank line is still a relocation

`dispatch.ts` recognises a move only when the lines it removes equal the lines it inserts. A created
seam's blank line breaks that equality, and the move would then be dispatched as an in-place rewrite,
which is what `minimal-change-dispatch` forbids. The narrowing SHALL match the moved block with blank
lines set aside, and dispatch the blank lines a created seam gains as insertions of their own.

## Risks / Trade-offs

- **Mixed spacing in a tight note.** Seams an operation creates arrive separated, while the user's own
  stay flush. → Accepted in review: the outline is for structure, and the source view stays for shaping
  the text by hand.
- **One ambiguous shape stays inside tight lists** (D4). → Accepted in review, over loosening the list.
- **Lineage has to be stated by every op that replaces a block.** An op that forgets it separates a seam
  the user wrote. → A test per such op (a split mid-text and at the end, a folded split, a merge, a
  drafted heading after a section, a type-over), each with dropping its lineage as the negative control.
- **Test churn.** Many unit tests pin flush encodings of created seams (measured while planning), and the
  e2e specs that assert whole buffers change with them. → Each updated expectation is checked against
  the rule, not re-recorded.

## Migration Plan

None. A note changes only where an operation creates a seam in it.
