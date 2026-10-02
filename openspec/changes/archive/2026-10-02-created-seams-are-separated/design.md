# Design

## Context

See proposal.md for the motivation, and `docs/research/lazy-continuation-at-seams` for what each reader does
with a flush line and a blank one. `docs/research/created-seam-detection` records every way of deciding which
seams an operation owns that was reviewed before this one, what each review found, and a step-back review of the
whole record.

Today, three mechanisms decide what stands in a seam:

- **`normalizeBoundaries`** (in `finalize`) adds one blank line where our parse would merge two blocks. It
  never touches a seam that already holds one.
- **The insertion rule** (`spliceAtIndex`, `scopeSeparation`) copies the separation of the boundary a run
  lands in onto both sides of the run. A same-scope reorder keeps the blank lines with the positions.
- **The operations that open a provisional position** (`splitNode`, `insertEmptyBefore`, `unwrapListItem`,
  `outdentSurgery`'s dissolve) write the place's blank lines as gap text themselves, or leave an empty paragraph
  node where they dissolved an item.

`finalize(oldDoc, surgery, …)` receives both the document before the operation and the surgery. Node ids come
from one counter for the session: every re-encode spreads the node it rewrites, and a new node, a parsed
clipboard's included, gets an id no other node has had.

`normalizeBoundaries` is not quite a no-op on a parsed tree. It separates a list item from a flush quote,
callout or `- - -` first child on any operation anywhere in the note (#255). This change leaves that alone and
states it where the byte-identical claims are made (D10).

## Goals / Non-Goals

**Goals:**
- Every seam at an operation's edit site outside a list is separated, decided the same way for every operation
  that goes through `finalize`, with no per-operation list to keep complete.
- A seam away from the edit site stays byte-identical, and so does every seam inside a list, #255 aside.
- The rule is checked by counting over generated notes, not only by hand-built cases.

**Non-Goals:**
- Deciding separation inside a list, including the insertion's carry at a list's edge (#272).
- Provisional positions: where a place is written, and what abandoning one leaves. They wait on #253.
- Block-id corrections, which are raw edits outside the operations.
- Keeping the user's flush spacing right next to a block an operation rewrote. Reviewed and accepted: the
  outline is for structure, and the edit site is where an operation's own spacing applies.

## Decisions

### D1. The edit site, judged on the outline

A SEAM is the boundary between two blocks: the block whose last line is above it (its UPPER block) and the
block whose first line is below it (its LOWER block).

A block is WRITTEN when it is new, or when what the outline shows of it changed:
- its kind as it will re-parse (`kindAsWritten` at its new margin)
- its content, with indentation, list marker, ordinal number, a heading's level and a block id set aside. The id
  is set aside wherever it is written: attached, trailing the text, or as a line of the block's own, which is
  where `dropLoneId` writes it.

A heading's level is left out because it only decides where the heading sits, and its parent and previous sibling
state that. A relative level would be undefined for a heading at the root, and a level-skip outdent (`# Log` /
`### Monday` to `## Monday`) changes it while the outline stays the same.

An operation's EDIT SITE is every seam where:
- **the lower block was written,** its previous sibling changed, or it has no previous sibling and its parent
  changed;
- **the upper block was written;** or
- **the two blocks were not consecutive before the operation,** so something that stood between them was removed
  or moved away.

Every seam at the edit site that is empty and lies outside a list gains one blank line. Every other seam keeps
the blank lines it had before the operation, and then the parse floor applies, as today.

Keeping them is not a no-op. A reorder keeps blank lines with the POSITIONS of its scope, so moving a block to
the top of a scope hands each position's gap to whatever block now occupies it, and rewrites seams between
blocks that never moved apart. The oracle found this (D11): every seam it saw change away from the edit site was
a move's. The pass restores those seams from the note the operation started from, which also makes a move to a
run's current place a no-op where the surgery put it somewhere the re-parse reads back as the same place.

What that gives, all without a per-operation rule:

| operation | seams at the edit site |
| --- | --- |
| paste, drop, insert | the run's two outer seams, and every seam inside a pasted payload (all its blocks are new) |
| delete | the seam that joins the blocks around the removed run |
| move, including a same-scope reorder | the seams at the run's old and new places; none inside the run, at any depth |
| split, merge, type-over | every seam around the rewritten and new blocks |
| indent, outdent | the seams around every block the op re-parented or converted, and around the block that takes its place |
| heading level shift | the seams around a heading whose section changes; none around the headings below it, and none for a shift that keeps every section |
| lone-id drop | the seam the id line leaves; none around the block that takes the id |

**Why the outline and not the text.** Some operations rewrite text they derive from position rather than from
what the user asked for:

- **Renumbering.** Deleting `1. a` from `1. a` / `2. b` / `3. c` / `para` rewrites `2. c`. Judged on text, the seam
  below the list gains a line, and `para`, which CommonMark and reading mode both draw inside item `c`, leaves the
  item two items away from the deletion.
- **Level shifts.** Tab on `## B` rewrites every heading below it. Judged on text, every seam in the section gains
  a line. Judged on relative level, a root-level `## Budget` shifted under `## Packing` still counts as written.
- **Id drops.** `dropLoneId` rewrites its host's lines. Judged on text, the host's seam with the list below it
  gains the line `misplaced-block-ids` forbids.

Judged on the outline, none of these blocks is written.

**Why a new parent counts only for a first child.** A run of several roots moved to another parent gives each
of them a new parent. The second root's previous sibling is the first, as before, so the seam between them
stays as written. A block's parent is what places it only when it has no previous sibling.

This is the placement grammar's lens read as a law about seams: the layout between blocks whose outline is
unchanged is kept, and the rest is derived (`created-seam-detection`, "A step back").

Alternatives considered: `created-seam-detection` has six, with the review findings against each. This one keeps
what approach 5 got right: nothing is inferred about a seam's history. It judges BLOCKS, whose identity survives
every surgery, instead of listing seams per op, and judges them on the outline, which an op's derived rewrites
leave alone.

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
last line.

Accepted cost: a paragraph written directly under a quote, or under a nested item, stays ambiguous when both are
inside a tight list. Items with different bullet characters (`- a` / `* b`) count as one list here, though
CommonMark reads two; either way a blank line between them would loosen what the user wrote.

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

### D5. Places are left as they are

A PLACE is what a keypress opens for text the user is about to type:
- a provisional position, whose lines are gap text that already fills the seam it stands in
- an empty list item or heading an operation opens: Enter's `- `, the empty heading at a heading's content start,
  and Shift+Enter's empty drafted heading
- the empty paragraph node an operation leaves where it dissolved an item

The pass writes nothing beside a place and judges no seam across one. Every place is therefore written exactly
as today, and its abandonment is unchanged.

Treating an empty item as a block would break that. Enter at the end of `- a` above a flush `> q` opens `- `,
whose seam with `> q` would be separated. A second Enter then dissolves the item into a position in a seam that
already holds a blank line, and leaving it removes the position's line only, so one Enter-and-leave gesture would
add a line to the note. Measured in review.

Where a place is written flush today, typed text can read as a lazy continuation: under a quote, above a
heading's flush first child, and under a list an item has left. Those are the places' own change, which waits on
#253: its review found that no Enter place is ever carried, and that a dissolved place's residue is a node, so
the places half of an earlier draft of this change did not work as written (`created-seam-detection`, 6).

### D6. The edit site is found in `finalize`, by identity

`finalize` indexes `oldDoc` by node id: each block's outline view, its parent, its previous sibling, and the
order of blocks. It walks the surgery's seams, and separates each empty seam at the edit site outside a list that
D4 does not exempt, before the parse floor runs. It needs no second encode: the old view is read from the old
tree.

Parents and previous siblings are read after re-nesting the surgery's headings by level, as the re-parse will.
A heading op rewrites levels only (`headingLevelSurgery`) and leaves the hierarchy to the re-parse, so the
surgery's own tree still has `### B` under `# A` after Tab on `## B`. Judged on that tree, the seam above `### B`
is missed and the seams a shift re-parents are misread.

Identity is sound here because every caller passes the document the surgery was built from, and ids are never
reused:
- **A parsed tree with no surgery,** `finalize(doc, doc, …)`, has nothing written and every pair consecutive, so
  the pass is a no-op by construction.
- **A block from anywhere else,** a clipboard's or a re-parse's, has an id `oldDoc` does not hold, so it can only
  read as new, never as a block it is not.
- **A surgery that renewed the ids of blocks it did not touch** would separate them. No caller does, and the
  oracle's first check (D11) is what would catch one.

An earlier draft bounded the edit site by the changed text region instead, which review showed shifts off the
change when lines repeat, and costs an encode per operation (`created-seam-detection`, 6).

### D7. Gestures of two steps

- **A type-over and a paste onto an empty anchor** run a deletion and an insertion (`deleteAndSplice`).
  - The deletion separates nothing when a splice follows, which it already receives as `spliceFollows`.
  - The insertion's `finalize` compares against the document the deletion produced, with the ids of that
    document's own parse, so only the payload and the seams around it are at the edit site.
  - Typing a character over a selected block therefore separates it from flush neighbours outside a list. That
    is accepted, because the block is new.
- **An Enter over a block selection** (`planOverSelection`) runs a deletion and then the key's op.
  - The deletion separates nothing, as when a splice follows: the place the key opens stands in the join.
  - The place is written as today. Were the join separated first, the place would widen it to three blank lines,
    and two would stay below the text typed there (measured in review).
  - Abandoning the place leaves the join as the deletion wrote it, flush. That is the places change's to settle.

### D8. A group operation has one edit site

The group forms compose surgeries and run one `finalize` against the note before the gesture. Their edit site is
the gesture's: a seam between two selected roots that each single-node step would part and the next rejoin
stays as written.

```
 before     group       one root at a time
┆# X       ┆# X        ┆# X
┆> p       ┆           ┆
┆a         ┆a          ┆a
┆> b       ┆> b        ┆
┆# N       ┆           ┆> b
           ┆> p        ┆
           ┆           ┆> p
           ┆# N        ┆
                       ┆# N
```

`Group forms of indent, outdent and reordering` equals its sequential composition today, blank lines included,
and the group-composition oracle compares `treesEqual`. That equality now holds with blank lines set aside, and
the gesture's blank lines are checked against the rule instead. Running the pass per step would keep the old
equality, and separate seams inside the run that the user moved as one.

### D9. A relocation that gains or loses a blank line is still a relocation

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

### D10. #255 is outside this change's byte-identical claims

The floor's list-item first-child rule already rewrites flush quotes, callouts and `- - -` rules under items on any
operation. The new requirement names it among what the parse requires, and every byte-identical claim this change
makes excludes those seams. The generators of D11 mark those shapes rather than skip them.

### D11. A seam oracle

Every review of this question so far checked a design against cases built by hand, and each found new ones. The
oracle replaces that with counts over generated notes (`created-seam-detection`, "A step back").

- **Notes.** A labelled generator in the manner of `chore/node-placement-grammar`'s sweeps, widened to vary every
  gap: flush, one blank line, two. It includes flush seams the user wrote under quotes, callouts and list items.
- **Operations.** Every structural operation over every applicable node or cover of each note.
- **Checks,** over each result:
  1. A seam between two blocks that are not at the edit site keeps its bytes, #255's shapes aside.
  2. At every seam at the edit site outside a list, CommonMark (`commonmark` as a dev dependency) and reading
     mode's three extra rows agree with our tree: no block is continued into the one above it.
  3. No list turns between tight and loose, #272's carry aside.
  4. No block id attaches to a different block.
  5. No indented code appears.
- **Figures,** recorded in the research note: each check's failures on today's operations before the pass, and
  after it; and the number of seams the pass separated where no reader would have continued them.

The last figure decided one question: whether to separate only the seams some reader could continue. That
narrower rule keeps the blocks this rule judges, and adds a line only where the upper block ends in or inside a
quote, a callout or a list item, and the lower block does not open with an ATX heading, a fence or a list marker
that interrupts a paragraph. Over 400 generated notes it would write 5,674 fewer lines, 59% of what the rule
writes, all where no reader continues the seam.

Declined. The saving is cosmetic: every one of those lines separates two blocks the outline already shows apart.
The narrower rule brings back a table of what each reader continues, which is what approach 1 was dropped for
(`created-seam-detection`), and makes one result's spacing vary by block kind. One blank line between blocks is
also what `mdast-util-to-markdown` and markdownlint write by default.

## Risks / Trade-offs

- **Accepted gaps,** each keeping its content. How often each occurs in real notes is unmeasured
  (`created-seam-detection`, "For another review"):
  - **A single block pasted natively,** which never reaches an operation.
  - **Places written flush,** until the places change.
  - **Block-id corrections,** which can leave a quote flush under a list item.
  - **Shapes inside a tight list,** as in D3.
- **Visible spacing next to edits.** A split, a merge, a type-over and a reorder separate the flush seams around
  the blocks they write, where today they leave them flush. → Accepted in review: changes next to the edit site
  are expected, and seams away from it stay as written. The oracle's count says how many of these no reader
  needed.
- **The view has to be right for every kind.** Tasks, setext headings and ordered runs are where a wrong view
  would write a block the outline never changed, or miss one it did. → The oracle's first check fails on the
  first; unit tests pin each kind.
- **Mixed spacing in a tight note.** Seams at edit sites arrive separated, while the user's own elsewhere stay
  flush. → Accepted in review.
- **Test churn.** Many unit tests pin flush encodings at edit sites (measured while planning), and the e2e specs
  that assert whole buffers change with them. → Each updated expectation is checked against the rule, not
  re-recorded.

## Migration Plan

None. A note changes only at the edit sites of the operations run on it.
