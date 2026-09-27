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
  `unwrapListItem`, `outdentSurgery`'s dissolve) write the place's blank lines as gap text themselves.

`src/plugin/dispatch.ts` already aligns an operation's old and new lines (`alignLines`, anchored on
lines unique to both sides), so that a moved block is dispatched as a move.

## Goals / Non-Goals

**Goals:**
- One rule decides every seam an operation creates outside a list, stated once, and decided from
  the text before and after the operation, whichever op produced it.
- A note an operation has not touched stays byte-identical. So does every seam the operation did not
  create, and every seam inside a list.

**Non-Goals:**
- Choosing separators by what each reader continues. The rule separates every created seam outside a
  list, and needs no table of line kinds to maintain.
- Deciding separation inside a list, including the insertion's carry at a list's edge (#272).
- Tracking block identity. Three rounds of review found a hole in each identity-based design:
  node-id pairs, then lineage for the ops that replace a block, then a kind clause on top.

## Decisions

### D1. A seam is created where the operation INSERTED text, not where it rewrote it

The text before and after the operation is aligned line by line, with the alignment dispatch uses.
The alignment leaves three kinds of region: lines matched on both sides, lines only removed, and
lines only inserted. A run of removed lines directly followed by inserted lines is a REPLACEMENT.

A SEAM is the boundary between two blocks in the result: the last content line of the block above
it, and the first content line of the block below it. Each seam falls into one case:

- **Both lines matched.** The seam is the user's when the two old lines were consecutive content lines
  in the old text, with only blank lines between them. Otherwise, something was removed or inserted
  between them, and the seam is created.
- **At the edge of a replacement.** One line is matched, and the other is the first or last line of a
  replacement directly next to it. The seam stands where the old seam at that edge stood, so it is the
  user's, unless the kind as written of the block at that edge changed.
- **Anywhere else.** The seam is created: inside a replacement, or at the edge of a pure insertion.

Where the blank lines between the two blocks are themselves inserted, the seam is created too.

What that gives:

| operation | seams created |
| --- | --- |
| paste, drop, insert | the two seams around the new run, and every seam inside it |
| delete | the seam that joins the blocks around the removed run |
| move | the seams at the run's old place and at its new one; none inside the run |
| Enter mid-text, merge | the new seam between the halves; the seams at the rewritten block's outer edges stay the user's |
| type-over | the seams inside the payload; its outer edges stay the user's unless the kind at an edge changed |
| an indent turning `p` above a flush `> q` into `- p` | the `- p` / `> q` seam, by the kind clause |

Alternatives considered:
- **By node id, with lineage and a kind clause.** Rejected after three reviews. Every op that rewrites
  a block needed its own exception, and each review found the next broken one: the type-over's
  lineage could not be built, and the kind clause broke the drafted heading.
- **By the single contiguous splice `diffLines` returns.** A move's removal and insertion would become
  one region, and every seam between them would count as created.

### D2. A payload's own seams are created

A paste's lines are inserted, so every seam inside the payload is created, and a flush `> q` over
`para` in the clipboard arrives separated. Confirmed in review.

The indent-unit promise in `Subtree insertion at a boundary` ("A payload the document itself wrote in
that unit SHALL come back byte-identical") narrows. The payload's own lines come back byte-identical,
and only a created seam between its blocks may gain a blank line. A list item's subtree, which that
requirement's scenario pastes, is inside a list, so it comes back byte-identical as before.

### D3. Inside a list, the rule adds nothing

A LIST is a maximal run of adjacent sibling list items under one parent, judged by kind as written,
whatever their markers. A seam is INSIDE A LIST when its lower block is one of the list's items or lies
inside one, and its upper block lies inside the same list. That covers an item and its child blocks,
two child blocks of one item, an item's last block and the next item, and an item and its nested list.

A blank line at any of these makes the list loose (`lazy-continuation-at-seams`, "Measured: loose
lists"), so the rule does not apply there. Those seams are written as today, by the insertion's carry,
a split, and the parse floor.

The seams between a list and a block outside it are not inside the list, and the rule separates them.
That means a paragraph or heading directly above the list, and the block directly below the list's last
line.

Accepted cost: a paragraph written directly under a quote, or under a nested item, stays ambiguous when
both are inside a tight list. The carry's own defect at a list's edge is #272.

### D4. The rule adds one blank line, only to an empty seam, and never where it would break a block id

A created seam outside a list SHALL gain one blank line when it holds none. A seam that holds one or
more blank lines keeps exactly what it holds.

Block ids:
- **An attached block-id line** is part of its block's encoding, so a separator is written after it,
  never between the block and its id.
- **A lone block-id line** our parse reads as a node of its own sits flush above a block. A seam whose
  upper block is such a line is exempt, since a blank line below it would attach it to the block above.
- **The parse floor wins.** Above a paragraph the lone line would join the paragraph's text, so a blank
  line is required there, as today.

### D5. A place is separated on both sides, and never an empty edit; a Shift+Enter place is adjacent

An Enter place stands for a paragraph the user is about to type, and must parse as a block of its own. So
it is separated on both sides wherever it sits, inside a list too, since a paragraph in a list item needs a
blank line above it anyway. The op that opens it always writes the place's own line, and adds a blank line
on each side only where that side lacks one, so an Enter always changes the document.

The ops that leave a place are `splitNode` (including its folded path), `insertEmptyBefore`,
`unwrapListItem`, and `outdentSurgery` when it dissolves an empty item. Today some of these write the place
flush:
- under a quote, a heading or a closing fence
- above a heading's flush first child
- under the item above an unwrapped or outdent-dissolved item

Places sit in gap lines, and the rule only adds to an empty seam, so it never touches a place. That also
leaves a Shift+Enter place ADJACENT to the node above it, as `outline-keyboard-grammar` requires. That
includes #258's gapless paragraph place under a heading, the line where a heading's own block id is typed.

Abandoning a place:
- **An operation that opened a place.** Its reversal is a diff back to the text it acted on, and restores
  the source byte for byte.
- **An operation that dissolved a node,** such as leaving a list. Its stated removal deletes the place's
  line together with the blank lines the op added beside it. The gap left between the neighbours is then
  set to:
  - one blank line where the seam lies outside a list, since the dissolve created it
  - inside a list, the larger of the two gaps the dissolved item had around it

  So a loose list stays loose and a tight one tight. The removal is built where every dissolving path
  builds it (`abandonEdit`, used by both the keyboard grammar and the command path in `main.ts`).

### D6. The rule runs in `finalize`, over one gesture's text

`finalize` encodes the surgery, aligns the result with the document it started from, finds the created,
empty seams outside a list, adds their blank lines to the tree's gaps, and encodes again. On a parsed tree
nothing is inserted, so the pass is a no-op there. The alignment moves from `dispatch.ts` into a module both
use.

A gesture that runs two `finalize` calls is judged once, against the text before the gesture. That covers
a type-over, and a paste onto an empty anchor (`deleteAndSplice`):
- the deletion adds no separators when a splice follows, and already receives that fact as `spliceFollows`
- the insertion's `finalize` aligns against the text the gesture started from

So a type-over is a replacement, and typing a character over a selected block keeps the user's spacing
around it.

### D7. A relocation that gains a blank line is still a relocation

`dispatch.ts` recognises a move only when the lines it removes equal the lines it inserts. A created
seam's blank line breaks that equality, and the move would then be dispatched as an in-place rewrite,
which `minimal-change-dispatch` forbids. The match sets blank lines aside and dispatches the added blank
lines as insertions of their own. The cases to measure are a paragraph moved above a table it sat flush
under, one moved below a table, and a removal that joins a table and a paragraph. That last one inserts
directly under the table's last row, and the live table widget has to be checked there.

## Risks / Trade-offs

- **Mixed spacing in a tight note.** Seams an operation creates arrive separated, while the user's own
  stay flush. → Accepted in review: the outline is for structure, and the source view stays for shaping
  the text by hand.
- **Alignment ambiguity.** Where a region repeats its lines, the alignment can match a line other than the
  one the op moved, and classify a seam differently. → The rule only ever adds one blank line to an empty
  seam, so a misread costs at most an extra separator, never a lost node. A property test checks that the
  pass is a no-op on parsed documents and never widens.
- **Test churn.** Many unit tests pin flush encodings of created seams (measured while planning), and the
  e2e specs that assert whole buffers change with them. → Each updated expectation is checked against the
  rule, not re-recorded.

## Migration Plan

None. A note changes only where an operation creates a seam in it.
