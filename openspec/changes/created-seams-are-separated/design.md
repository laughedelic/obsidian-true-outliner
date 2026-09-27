# Design

## Context

See proposal.md for the motivation, and `docs/research/lazy-continuation-at-seams` for what each reader does
with a flush line.

Today, three mechanisms decide what stands in a seam:

- **`normalizeBoundaries`** (in `finalize`) adds one blank line where our parse would merge two
  blocks, and never touches a seam that already holds one. That it is a no-op on any parsed tree is what
  lets it run over the whole note.
- **The insertion rule** (`spliceAtIndex`, `scopeSeparation`) copies the separation of the boundary a
  run lands in onto both sides of the run, and a same-scope reorder keeps the blank lines with the
  positions.
- **The operations that open a provisional position** (`splitNode`, `insertEmptyBefore`,
  `unwrapListItem`) write the place's blank lines as gap text themselves.

Node ids survive a surgery: every re-encode spreads the node it rewrites, and a new node gets a fresh id
from the global counter. A pasted payload is a separate parse, so all of its ids are new.

## Goals / Non-Goals

**Goals:**
- One rule decides every seam an operation creates, stated once, whichever mechanism wrote the seam.
- A note an operation has not touched is byte-identical, and so is every seam in it the operation did
  not create.

**Non-Goals:**
- Choosing separators by what each reader continues. The rule separates every created seam but list
  items', and needs no table of line kinds to maintain.

## Decisions

### D1. A seam is created when its two blocks were not adjacent before the operation

A seam is a pair: the block whose last line is above it, and the block whose first line is below it.
Adjacency is read from the document before the operation (`finalize`'s `oldDoc`) as the set of such
pairs by node id. It covers both kinds of seam:
- the final descendant of each sibling, paired with the next sibling
- each parent, paired with its first child

A seam in the result whose pair is not in that set is created.

Alternatives considered:
- **By position** (the line offset of the seam). A move carries a seam's blocks elsewhere, and a
  positional reading would call the moved pair created and the vacated one kept.
- **By kind** (separate only what some reader continues lazily). Rejected in review: the rule is simpler
  and admits no reader-by-reader table, and a blank line between blocks never changes our tree
  (`lazy-continuation-at-seams`, "What follows").

### D2. A payload's own seams are created

A paste parses the clipboard on its own, so every seam inside the payload pairs two new ids and is created.
The payload's text is new to this note: its separations come from wherever it was copied, and the rule
is what makes the note unambiguous. A move is the contrast, since its blocks keep their ids: the seams
inside the moved run existed before and are left as written.

Alternative: treat a payload's adjacent roots as already adjacent, keeping the clipboard's own
separation. A flush quote over a paragraph in the clipboard would then arrive flush, and ambiguous.
Confirmed in review, over that alternative. This is where the rule and the user-written exemption
meet at a paste, and the payload's text is the note's new text.

### D3. A seam a removal leaves is created

A delete, a move out or a merge's adoption can bring two blocks together that were not adjacent. Their
pair is new, so the seam is created and separated. The deletion requirement's "the surviving neighbours'
lines are byte-identical" narrows to "except the one blank line a created seam gains".

### D4. The list exemption is between list items only

A seam is exempt when both of its blocks are list items: two siblings, or an item and the first item of
its nested list. The insertion's separation-carrying still decides those seams, so a run lands tight in a
tight list and loose in a loose one. A heading or a paragraph above a list is not exempt: a blank line
there changes neither our tree nor any list's looseness (`lazy-continuation-at-seams`).

For a list whose seams mix tight and loose, the separation carried is the one of the boundary the run
lands in, as today. A reorder keeps its positional gaps between items for the same reason.

### D5. A place is a block, blank-separated on both sides

A provisional position stands for the block the user is about to type, and its seams are created. The ops
that open one write a blank line on each side of the place line, adding only what the seam lacks. The
statements that a place "widens the gap by two" become "is separated on both sides".

This also settles the measured cases where a place sits flush today:
- under a quote, a heading or a closing fence
- above a heading's flush first child, where the typed text joins that child in our own parse
- under an unwrapped item, where the spec scenario already asks for a blank line and the code writes none

Abandoning a place still reverts to the source byte for byte, since the abandon edit is a diff back to
the original text.

### D6. The rule runs in `normalizeBoundaries`, given the old adjacency

`finalize` computes `oldDoc`'s adjacency and hands it to `normalizeBoundaries`. At each seam with an
empty gap, it now asks whether the seam is created and not exempt, before it asks whether the parse
needs a separator. Existing gaps are never widened, as today: the check runs only on an empty seam.

On a parsed tree every pair is old, so the pass stays a no-op there, and running it over the whole note
stays safe. `spliceAtIndex` keeps carrying the destination's separation, and normalization then separates
whatever created seam it left empty. The places in D5 are written by their ops, which know where the place is.

### D7. A type-over hands its created seams across

A type-over runs a deletion and an insertion through two `finalize` calls, with a re-parse between them
that renews every id. The first call separates the seam its deletion created. The second sees that seam
as already separated and leaves it. The seam the insertion creates is new to the re-parsed document, so the
second call sees it as created. No id has to survive the re-parse, and the composition needs no change.
A task verifies this against the type-over tests, and a test pins it.

### D8. A block id is written with its block

A block-id line is part of its node's encoding, written before the node's trailing gap. A separator the
rule adds lands in that gap, after the id, never between the block and its id. The id's own seam
(`blockId.gap`) is not a seam between blocks, and the rule does not read it.

## Risks / Trade-offs

- **Mixed spacing in a tight note.** Seams an operation creates arrive separated, while the user's
  own stay flush. → Accepted in review: the outline is for structure, and the source view stays for
  shaping the text by hand.
- **A relocation that no longer puts back exactly what it took.** `minimal-change-dispatch` dispatches a
  move as a relocation when the lines it removes are the lines it inserts. A created seam's blank line
  breaks that equality. → A task measures a move gaining a line through the dispatch, and the table-widget
  scenarios in that spec.
- **Test churn.** Many unit tests pin flush encodings of created seams (measured while planning), and
  the e2e specs that assert whole buffers change with them. → Each updated expectation is checked
  against the rule, not re-recorded.

## Migration Plan

None. A note changes only where an operation creates a seam in it.
