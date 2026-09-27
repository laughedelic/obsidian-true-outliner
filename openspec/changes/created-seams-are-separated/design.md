# Design

## Context

See proposal.md for the motivation, and `docs/research/lazy-continuation-at-seams` for what each reader does
with a flush line and a blank one. `docs/research/created-seam-detection` records the five ways of telling
which seams an operation created that were reviewed before this one was kept, and what each review found.

Today, three mechanisms decide what stands in a seam:

- **`normalizeBoundaries`** (in `finalize`) adds one blank line where our parse would merge two
  blocks. It never touches a seam that already holds one. It is a no-op on any parsed tree, which is
  what lets it run over the whole note.
- **The insertion rule** (`spliceAtIndex`, `scopeSeparation`) copies the separation of the boundary a
  run lands in onto both sides of the run. A same-scope reorder keeps the blank lines with the
  positions.
- **The operations that open a provisional position** (`splitNode`, `insertEmptyBefore`,
  `unwrapListItem`, `outdentSurgery`'s dissolve) write the place's blank lines as gap text themselves.

The heading-first-child convention is already applied the way this change applies its rule: by the
operation that creates the boundary, never by global normalization.

## Goals / Non-Goals

**Goals:**
- Every seam an operation creates outside a list is separated, with the seams each op creates stated per op.
- A note an operation has not touched stays byte-identical. So does every seam the operation did not create,
  and every seam inside a list.

**Non-Goals:**
- Inferring from the result which seams were created. The four inference designs reviewed each failed on
  some op's own way of rewriting a block (`created-seam-detection`).
- Deciding separation inside a list, including the insertion's carry at a list's edge (#272).

## Decisions

### D1. Each operation marks the seams it creates

An op marks the seams it writes as new boundaries, and `finalize` separates each marked seam that is empty
and lies outside a list. An unmarked seam is left to the parse floor, as today.

| operation | seams it marks |
| --- | --- |
| insert, paste, drop, move to another scope | the run's two outer seams, and every seam inside a pasted payload |
| delete, and the removal half of a move to another scope | the seam that joins the blocks around the removed run |
| split, including a content-start split that materializes an empty item or heading | the new seam between the halves |
| drafted sibling heading (Shift+Enter on a heading, until #258 replaces it) | the new heading's two seams |
| Enter place | both sides of the place (D5) |
| merge, indent, outdent, same-scope reorder, a type-over's outer seams, a lone id's drop | none |

A split's and a merge's outer seams stay the user's, as do a moved run's inner seams and a type-over's outer
seams. The accepted gaps are listed under Risks.

Alternatives considered: `created-seam-detection` has four, with the review findings against each.

### D2. A payload's own seams are marked

A paste parses the clipboard on its own, and its text is new to the note, so every seam inside the payload
is marked. A flush `> q` over `para` in the clipboard arrives separated. Confirmed in review.

The indent-unit promise in `Subtree insertion at a boundary` ("A payload the document itself wrote in that
unit SHALL come back byte-identical") narrows. The payload's own lines come back byte-identical, and only a
seam inside it outside a list may gain a blank line. A list item's subtree, which that requirement's
scenario pastes, is inside a list, so it comes back byte-identical as before.

### D3. Inside a list, the rule adds nothing

A LIST is a maximal run of adjacent sibling list items under one parent, judged by kind as written, whatever
their markers. A seam is INSIDE A LIST when its lower block is one of the list's items or lies inside one,
and its upper block lies inside the same list. That covers:
- an item and its child blocks
- two child blocks of one item
- an item's last block and the next item
- an item and its nested list

A blank line at any of these makes the list loose (`lazy-continuation-at-seams`, "Measured: loose lists"),
so a marked seam inside a list is left as the op and the parse write it. The seams between a list and a
block outside it are not inside the list, and the rule separates them: a paragraph or heading directly
above the list, and the block directly below the list's last line.

Accepted cost: a paragraph written directly under a quote, or under a nested item, stays ambiguous when both
are inside a tight list.

### D4. What the rule never does

- **It never widens.** A marked seam that holds one or more blank lines keeps exactly what it holds.
- **It never separates a block from its block id.**
  - An attached id line is part of its block's encoding, and a separator is written after it.
  - A seam whose upper block is a lone id line that our parse reads as a node of its own is not separated,
    since a blank line there attaches it to the block above.
  - The parse floor still wins: above a paragraph the lone line would join the paragraph's text.
- **It never writes a blank line above a block indented four or more columns past its container's margin.**
  CommonMark reads such a block as indented code once a blank line precedes it. Pasting `para` over
  `    - a` keeps the child list's offset.

### D5. Enter places: separated on both sides outside a list, never an empty edit

An Enter place stands for a paragraph the user is about to type, and must parse as a block of its own. Outside
a list, the op that opens it writes the place's own line and a blank line on each side where that side lacks
one, so an Enter always changes the document. Inside a list, a place keeps today's encoding: a paragraph under
an item already needs the blank line above it, and after a code or table child it needs none, where a blank
line would loosen a tight list.

The ops that leave a place are `splitNode` (including its folded path), `insertEmptyBefore`,
`unwrapListItem`, and `outdentSurgery` when it dissolves an empty item. Today some of these write the place
flush outside a list:
- under a quote, a heading or a closing fence
- above a heading's flush first child, where the typed text joins that child in our own parse
- under the item above an unwrapped or outdent-dissolved item, where the typed text reads as a lazy
  continuation of that item

A Shift+Enter place is ADJACENT to the node above it and is never marked. That includes #258's gapless
paragraph place under a heading, the line where a heading's own block id is typed.

**Abandoning a place:**
- **An opened place.** Its reversal is a diff back to the text the op acted on, which restores the source
  byte for byte.
- **A dissolved place,** such as leaving a list. The dissolving op states its removal as the place's line and
  the blank lines it added beside the place, and it knows how many it added. What is left between the
  neighbours is what the note held around the dissolved item. That is the user's, unless it is empty and
  outside a list: then the dissolve's removal marked it, and it holds one blank line.

The carries' `drop-line` abandonments, which remove a place nothing dissolved, are unchanged. The form a
dissolving op states is its own.

### D6. Marks travel with the surgery into `finalize`

An op records its marks as `(upper block, lower block)` pairs on the surgery, by node id. The block ids are
the op's own, known at the point it writes the seam, so nothing is inferred. `finalize` then:
1. separates each marked pair that is still adjacent and empty
2. skips a pair that lies inside a list, or falls under D4
3. runs the parse floor as today

On a parsed tree nothing is marked, so the pass is a no-op there.

### D7. Gestures of two steps

- **A type-over,** and a paste onto an empty anchor, run a deletion and an insertion (`deleteAndSplice`).
  - The deletion marks nothing when a splice follows, and already receives that fact as `spliceFollows`.
  - The insertion marks only the seams inside its payload, not its outer seams, which stand where the
    replaced run's did.
  - So typing a character over a selected block keeps the user's spacing around it.
- **An Enter over a block selection** (`planOverSelection`) runs a deletion and then the key's op.
  - The deletion marks its join like any deletion.
  - The place the key then opens adds only the blank line the join lacks.
  - Abandoning that place leaves exactly what the deletion alone wrote.

### D8. A relocation that gains a blank line is still a relocation

`dispatch.ts` recognises a move only when the lines it removes equal the lines it inserts. A marked seam's
blank line breaks that equality, and the move would then be dispatched as an in-place rewrite, which
`minimal-change-dispatch` forbids. The match sets blank lines aside and dispatches the added blank lines as
insertions of their own.

The cases to measure:
- a paragraph moved above a table it sat flush under
- a paragraph moved below a table
- a removal that joins a table and a paragraph, which inserts directly under the table's last row, so the
  live table widget has to be checked there

## Risks / Trade-offs

- **Accepted gaps,** each keeping its content, and each rarer than the paste, drag and delete cases the rule
  fixes (`created-seam-detection`, 5):
  - **An indent or outdent that changes a block's kind next to a flush quote.** The seam is not marked.
  - **A block that comes into a list item's context without its lines changing,** after a delete above it.
  - **A same-scope reorder,** which keeps its rule that blank lines stay with the positions.
  - **A loose list's dissolved item,** whose abandonment leaves the two blank lines it had around it. The
    rule does not narrow a gap, and this is today's behaviour.
- **A new op must state its row.** An op that marks nothing leaves every seam to the parse floor, as today. →
  The table lives in the spec, and each op's marks have a test with dropping the mark as the negative control.
- **Mixed spacing in a tight note.** Seams an operation creates arrive separated, while the user's own stay
  flush. → Accepted in review.
- **Test churn.** Many unit tests pin flush encodings of created seams (measured while planning), and the e2e
  specs that assert whole buffers change with them. → Each updated expectation is checked against the rule,
  not re-recorded.

## Migration Plan

None. A note changes only where an operation creates a seam in it.
