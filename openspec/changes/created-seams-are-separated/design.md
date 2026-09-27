# Design

## Context

See proposal.md for the motivation, and `docs/research/lazy-continuation-at-seams` for what each reader does
with a flush line and a blank one. `docs/research/created-seam-detection` records every way of deciding which
seams an operation owns that was reviewed before this one, and what each review found.

Today, three mechanisms decide what stands in a seam:

- **`normalizeBoundaries`** (in `finalize`) adds one blank line where our parse would merge two blocks. It
  never touches a seam that already holds one.
- **The insertion rule** (`spliceAtIndex`, `scopeSeparation`) copies the separation of the boundary a run
  lands in onto both sides of the run. A same-scope reorder keeps the blank lines with the positions.
- **The operations that open a provisional position** (`splitNode`, `insertEmptyBefore`, `unwrapListItem`,
  `outdentSurgery`'s dissolve) write the place's blank lines as gap text themselves.

`finalize(oldDoc, surgery, …)` receives both the document before the operation and the surgery. Node ids
survive a surgery: every re-encode spreads the node it rewrites, and a new node gets a fresh id.

`normalizeBoundaries` is not quite a no-op on a parsed tree. It separates a list item from a flush quote,
callout or `- - -` first child on any operation anywhere in the note (#255). This change leaves that alone and
states it where the byte-identical claims are made (D9).

## Goals / Non-Goals

**Goals:**
- Every seam at an operation's edit site outside a list is separated, decided the same way for every operation
  that goes through `finalize`, with no per-operation list to keep complete.
- A seam away from the edit site stays byte-identical, and so does every seam inside a list, #255 aside.

**Non-Goals:**
- Deciding separation inside a list, including the insertion's carry at a list's edge (#272).
- Keeping the user's flush spacing right next to a block an operation rewrote. Reviewed and accepted: the
  outline is for structure, and the edit site is where an operation's own spacing applies.

## Decisions

### D1. A seam at the edit site is separated

A SEAM is the boundary between two blocks: the block whose last line is above it (its UPPER block) and the
block whose first line is below it (its LOWER block). An operation's EDIT SITE is every seam where:

- **the lower block was written:** it is new, its text or its kind as written changed, or it has a new parent
  or a new previous sibling;
- **the upper block was written:** it is new, or its text or its kind as written changed; or
- **the two blocks were not consecutive before the operation,** so something that stood between them was
  removed or moved away.

"Text" is compared without indentation, so a run moved to another depth is judged by what it says. A change
of kind that a re-indent causes, such as a quote written past the margin, is caught by the kind comparison.
A block whose own lines, parent and previous sibling are unchanged is not written, even when an ancestor of it
moved. So a moved subtree's inner seams stay as written, and only the seams at its edges are at the edit site.

Every seam at the edit site that is empty and lies outside a list gains one blank line. Every other seam is
left to the parse floor, as today.

What that gives, all without a per-operation rule:

| operation | seams at the edit site |
| --- | --- |
| paste, drop, insert | the run's two outer seams, and every seam inside a pasted payload (all its blocks are new) |
| delete | the seam that joins the blocks around the removed run |
| move, including a same-scope reorder | the seams at the run's old and new places; none inside the run unless it was re-indented into another kind |
| split, merge, type-over | every seam around the rewritten and new blocks |
| indent, outdent | the seams around every block the op re-parented, converted or re-indented into another kind |
| Enter place | the place's own two seams, written by the op (D5) |
| a block-id correction | the seams around the block it rewrote, or the join it left |

Alternatives considered: `created-seam-detection` has five, with the review findings against each. This one
keeps what approach 5 got right: nothing is inferred about a seam's history. It closes 5's gaps by judging
BLOCKS, whose identity survives every surgery, instead of listing seams per op. Approaches 2 and 3 failed by
judging seam pairs through ids, 4 by aligning text, 5 by an enumeration each review found incomplete.

### D2. A payload's own seams are separated

A paste's blocks are all new, so every seam inside a payload is at the edit site, and a flush `> q` over `para`
in the clipboard arrives separated. Confirmed in review.

The indent-unit promise in `Subtree insertion at a boundary` narrows. The payload's own lines come back
byte-identical, and only a seam between its blocks outside a list may gain a blank line. A list item's subtree,
which that requirement's scenario pastes, is inside a list, so it comes back byte-identical as before.

### D3. Inside a list, the rule adds nothing

A LIST is a maximal run of adjacent sibling list items under one parent, judged by kind as written, whatever
their markers. A seam is INSIDE A LIST when its lower block is one of the list's items or lies inside one, and
its upper block lies inside the same list. That covers:
- an item and its child blocks
- two child blocks of one item
- an item's last block and the next item
- an item and its nested list

A blank line at any of these makes the list loose (`lazy-continuation-at-seams`, "Measured: loose lists"), so
the rule does not apply there. The seams between a list and a block outside it are not inside the list, and the
rule separates them: a paragraph or heading directly above the list, and the block directly below the list's
last line. Every seam is judged on its own, so a place whose upper side is inside a list and whose lower side is
not is separated only below.

Accepted cost: a paragraph written directly under a quote, or under a nested item, stays ambiguous when both are
inside a tight list.

### D4. What the rule never does

- **It never widens.** A seam that holds one or more blank lines keeps exactly what it holds.
- **It never separates a block from its block id.**
  - An attached id line is part of its block's encoding, and a separator is written after it.
  - A seam whose upper block is a lone id line, one our parse reads as a node of its own, is not separated,
    since a blank line there attaches it to the block above.
  - The parse floor still wins: above a paragraph, the lone line would join the paragraph's text.
- **It never writes a blank line above a block indented four or more columns past its container's margin,**
  which CommonMark would then read as indented code. The parse floor still applies there. What CommonMark reads
  a flush `para` / `    - a` as is #229.

### D5. Enter places

An Enter place stands for a paragraph the user is about to type, and must parse as a block of its own. The op
that opens it writes the place's own line, and a blank line on each side where that side lacks one and lies
outside a list, so an Enter always changes the document. Inside a list each side keeps today's encoding: a
paragraph under an item already needs the blank line above it, and after a code or table child it needs none.

The ops that leave a place are `splitNode` (including its folded path), `insertEmptyBefore`, `unwrapListItem`,
and `outdentSurgery` when it dissolves an empty item. Today some of these write the place flush outside a list:
- under a quote, a heading or a closing fence
- above a heading's flush first child, where the typed text joins that child in our own parse
- under the item above an unwrapped or outdent-dissolved item, where the typed text reads as a lazy continuation
  of that item

A place's lines are gap lines, not a block, so the edit-site rule never writes beside one. A Shift+Enter place
is ADJACENT to the node above it, and nothing separates it. That includes #258's gapless paragraph place under a
heading.

**Abandoning a place:**
- **An opened place.** Its reversal is a diff back to the text the op acted on, which restores the source byte
  for byte.
- **A dissolved place,** such as leaving a list. The dissolving op records on the surgery which gap lines it
  added beside the place. `finalize` maps them to lines of the result and returns the removal on `OpOutput`,
  as a byte edit: the place's line and those added lines. `provisional-cleanup` applies it later without
  `finalize`.

  What the removal leaves between the neighbours is what the note held around the dissolved item. That is the
  user's, unless it is empty and outside a list: then the dissolve is an edit site, and it holds one blank line.
  Every dissolving path returns it: the Enter ladder, Shift+Tab through `outdentGroups`, and the command path.
  When the dissolved item was itself an opened place, `provisional-cleanup` reverses the carry instead, as today.
- **A carried place.** A place an Enter opened and a Tab or Shift+Tab then carried is abandoned today by
  removing its line only (`drop-line`), which leaves behind the separators the Enter added. That is already
  #253, and this change adds to what is left behind. The carry's abandonment SHALL also remove the separators
  the opening Enter added, which the carry reversal already knows.

### D6. The edit site is found in `finalize`

`finalize` indexes `oldDoc` by node id: each block's text without indentation, its kind as written, its parent,
its previous sibling, and the order of blocks. It walks the surgery's seams, and separates each empty seam at the
edit site outside a list that D4 does not exempt, before the parse floor runs.

**A bound on the damage an unexpected id would do.** A seam counts as at the edit site only if it lies inside, or
at an edge of, the text the operation changed: the region between the longest unchanged prefix and suffix of the old
and new text. A deletion's join sits at such an edge, and a move's seams lie inside the region between its removal
and its insertion. Two things are bounded by it:
- **A surgery built from a fresh parse,** which renews every id. It can then separate nothing outside the lines the
  operation changed.
- **A parsed tree with no surgery,** where nothing changed. The pass is a no-op there.

### D7. Gestures of two steps

- **A type-over and a paste onto an empty anchor** run a deletion and an insertion (`deleteAndSplice`).
  - The deletion separates nothing when a splice follows, which it already receives as `spliceFollows`.
  - The insertion's `finalize` compares against the document the deletion produced, with the ids of that
    document's own parse, so only the payload and the seams around it are at the edit site.
  - Typing a character over a selected block therefore separates it from flush neighbours outside a list. That
    is accepted, because the block is new.
- **An Enter over a block selection** (`planOverSelection`) runs a deletion and then the key's op.
  - The deletion separates its join like any deletion.
  - The place the key then opens adds only the blank line the join lacks.
  - Abandoning that place leaves exactly what the deletion alone wrote.

### D8. A relocation that gains or loses a blank line is still a relocation

`dispatch.ts` recognises a move only when the lines it removes equal the lines it inserts. A blank line the rule
adds breaks that equality, and so does a gap line a cross-scope move takes with its run. The move would then be
dispatched as an in-place rewrite, which `minimal-change-dispatch` forbids.

The match compares the two sides with blank lines set aside, while its test that something was removed still
reads the unfiltered lines. It dispatches the blank lines that differ as insertions or deletions of their own. It
stays a test on the text, as the match is today.

The cases to measure:
- a paragraph moved from another section to directly above a table
- a paragraph moved from another section to directly below a table
- a removal that joins a table and a paragraph, which inserts directly under the table's last row, so the live
  table widget has to be checked there

### D9. #255 is outside this change's byte-identical claims

The floor's list-item first-child rule already rewrites flush quotes, callouts and `- - -` rules under items on any
operation. Every byte-identical claim this change makes excludes those seams. The property test of D6 generates
no such shape.

## Risks / Trade-offs

- **Accepted gaps,** each keeping its content. How often each occurs in real notes is unmeasured
  (`created-seam-detection`, "For another review"):
  - **A single block pasted natively,** which never reaches an operation.
  - **A loose list's dissolved item,** whose abandonment leaves the two blank lines it had around it. The rule
    does not narrow a gap, and this is today's behaviour.
  - **Shapes inside a tight list,** as in D3.
- **Visible spacing next to edits.** A split, a merge, a type-over and a reorder separate the flush seams around
  the blocks they write, where today they leave them flush. → Accepted in review: changes next to the edit site
  are expected, and seams away from it stay as written.
- **Mixed spacing in a tight note.** Seams at edit sites arrive separated, while the user's own elsewhere stay
  flush. → Accepted in review.
- **Test churn.** Many unit tests pin flush encodings at edit sites (measured while planning), and the e2e specs
  that assert whole buffers change with them. → Each updated expectation is checked against the rule, not
  re-recorded.

## Migration Plan

None. A note changes only at the edit sites of the operations run on it.
