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
- a drafted sibling heading ends where the original's section ended

Such an operation passes `finalize` a LINEAGE: the new block, and the old block whose seam below it
takes over. The lookup reads the pair through that lineage. So Enter mid-text in a paragraph written
flush above `# H` leaves that seam as the user wrote it, and a merge leaves the merged node's seam
below as it was.

A seam in the result whose pair, read through lineage, is not in the old set is created.

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

A seam INSIDE A LIST has its lower block inside a list item, or a list item continuing the same list,
and its upper block inside that list. That covers:
- an item's text and its first child block
- two child blocks of one item
- an item's last block and the next item
- an item and its nested list

A blank line at any of these makes the list loose (`lazy-continuation-at-seams`, "Measured: loose
lists"). So the created-seam rule does not apply inside a list, and those seams are separated as they
are today:
- the insertion carries the destination's separation
- a split writes a sibling item flush
- the parse floor adds what the parse requires

The seams between a list and a block outside it are not inside the list: a paragraph or heading
directly above the list, and the block directly below the list's last line. The rule separates those.

Cost, accepted in review: in a tight list, a quote and a paragraph that are children of the same item,
with the paragraph written directly under the quote, stay flush, and reading mode continues the
paragraph into the quote.

### D5. A place is a block, separated on both sides, and never an empty edit

A provisional position stands for the block the user is about to type. Unless its seams lie inside a
list, they are created. The op that opens a place always writes the place's own line. It adds a blank
line on each side of the place only where that seam lacks one, so an Enter always changes the
document. The statements that a place "widens the gap by two" become "is separated on both sides".

This also settles the measured cases where a place sits flush today:
- under a quote, a heading or a closing fence
- above a heading's flush first child, where the typed text joins that child in our own parse
- under an unwrapped item, above a flush block, where the spec scenario already asks for a blank line
  and the code writes none

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
note stays safe. `spliceAtIndex` is unchanged: it keeps carrying the destination's separation, which
decides every seam inside a list. Normalization separates whatever created seam outside a list the
carry left empty. The places in D5 are written by the ops that open them, because those ops know where
the place is.

### D7. A type-over separates the result's seams, not the deletion's

A type-over runs a deletion and an insertion through two `finalize` calls, with a re-parse between them
that renews every id. Per D3, the deletion leaves its splice seam alone. The insertion's seams are all
new to the re-parsed document, so the second call separates those outside a list. A tight list typed
over with list items stays tight, and a type-over that brings a quote above a paragraph separates them.

### D8. A block id stays on its block

An attached block-id line is part of its node's encoding, written before the node's trailing gap. A
separator the rule adds lands in that gap, after the id, never between the block and its id.

A LONE block-id line our parse leaves as a node of its own, one that sits flush above a block, is
different: a blank line below it re-attaches it to the block above and moves every reference to it
(`lazy-continuation-at-seams`, "What follows"). A seam whose upper block is such a line is exempt from
the rule.

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
  the user wrote. → A property test runs every structural op over generated documents and checks that no
  seam whose two blocks' text the op did not touch gains a line.
- **Test churn.** Many unit tests pin flush encodings of created seams (measured while planning), and the
  e2e specs that assert whole buffers change with them. → Each updated expectation is checked against
  the rule, not re-recorded.

## Migration Plan

None. A note changes only where an operation creates a seam in it.
