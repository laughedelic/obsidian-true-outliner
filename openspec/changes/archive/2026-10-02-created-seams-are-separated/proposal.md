# Proposal

## Why

An operation separates two blocks only where our own parse would merge them, and our parse models no
lazy continuation. Every other reader of the note does. So a seam an operation writes flush under a
quote, a callout or a list item reads as one block in reading mode, Live Preview and CommonMark, where
the outline shows two (`docs/research/lazy-continuation-at-seams`). The outline is where a user builds
structure, and the text it writes has to mean that structure in every view of the note.

## What Changes

- **A seam at an operation's edit site, outside a list, is written with one blank line.** The edit site is every
  seam next to a block the operation wrote, and every seam that joins blocks the operation brought together. That
  is decided the same way for every structural operation, on what the outline shows of each block:
    - A block is written when it is new, or when its kind or its content changed. Content sets aside indentation,
    list marker, ordinal number, heading level and block id, so renumbering, a level shift, a re-indent and an id
    attachment write no block.
  - A seam is also at the edit site when its lower block's previous sibling changed, or its parent did where it
    has no previous sibling.

  It covers:
  - the seams around a pasted, dropped or moved run, and every seam inside a pasted payload
  - the seam a deletion leaves
  - the seams around the blocks a split, a merge, a type-over, an indent or an outdent writes or re-parents

  A moved run's inner seams are not at the edit site, and neither is any seam away from it. A group operation has
  one edit site for the whole gesture. The approaches reviewed before this one are recorded in
  `docs/research/created-seam-detection`.
- **Inside a list, the rule adds nothing.** Whether a list is tight or loose is the user's, and every seam inside
  a list is written as today (`lazy-continuation-at-seams`, "Measured: loose lists"). The seams between a list and
  the blocks above and below it are outside the list.
- **A seam away from the edit site is not touched,** however flush.
- **A seam is never widened.** Only an empty seam gains a line, and it gains one.
- **A blank line never changes what a block is.** A block id stays on its block, a lone id line stays flush above
  the block below it, and no blank line goes above a block indented four columns past its margin, which
  CommonMark would read as code.
- **A move that gains or loses a blank line is still dispatched as a move.**
- **A seam oracle checks the rule over generated notes and every operation,** and its figures are recorded before
  and after the rule lands.
- **BREAKING (encoding):** operations that wrote a flush seam at their edit site outside a list write a blank line
  there instead. That includes a split's, a merge's, a type-over's and a reorder's outer seams. A note is unchanged
  away from the edit sites of the operations run on it. The heading-first-child convention becomes a case of the
  rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`:
  - boundary separation takes the edit-site rule, replacing "SHALL NOT widen beyond what the parse requires"
  - the heading-first-child convention is folded into the rule
  - the insertion's indent-unit round trip narrows to the payload's own lines
      - one table states how many blank lines stand at every seam, and every operation inherits it
  - the insertion, deletion, move, reorder and heading-shift requirements point to it where their own wording
    fixed a seam's spacing; an empty heading or item a key opens is a place, written as today
  - closure counts the rule's blank lines among the lines an operation requires
  - the group forms equal their sequential composition with blank lines set aside, and take one edit site for
    the gesture
- `outline-keyboard-grammar`:
    - a setext heading's split remainder is separated from it
- `node-edit-enforcement`:
  - a paste keeps the destination's separation inside a list, and separates every other seam at its edit site
  - a type-over's payload is separated from flush neighbours outside a list
  - a deletion separates the seam it leaves
- `document-tree-mapping`: "Minimal re-encoding after tree edits" names a node whose gap holds a seam at the edit
  site as one the operation touched.
- `minimal-change-dispatch`: a relocation that gains a blank line at the edit site is still dispatched as a
  relocation.

## Impact

- `src/ops.ts`:
  - `finalize` indexes the document it started from by node id, finds the edit site by comparing each block's
    outline, and separates its empty seams outside a list before the parse floor runs
  - `deleteSubtreeGroups` separates nothing when a splice follows
  - `splitNode` loses its own heading-child separator
  - `Surgery`'s equivalence note is restated for blank lines
- `src/plugin/dispatch.ts`: the relocation match sets blank lines aside.
- Tests:
  - a seam oracle over generated notes, with `commonmark` as a dev dependency
  - many unit tests pin flush encodings at edit sites outside lists, and change with the rule
  - the group-composition oracle compares trees with blank lines set aside
  - the e2e specs that assert whole buffers across a structural edit change with them

## Non-goals

- **The parser.** It keeps modeling no lazy continuation. What `parse` reads a flush line as, the question
  #261 tracks, is left alone.
- **Seams the user wrote.** Normalizing existing flush seams across a note is not done, on an edit or
  otherwise.
- **Separation inside lists,** including the insertion's carry at a list's edge, which is #272.
- **Provisional positions.** Where an Enter place is written, and what abandoning it leaves, are a change of their
  own, which waits on #253's decision. This change writes nothing beside a place.
- **Block-id corrections.** They are raw edits built outside the structural operations
  (`src/block-ids.ts`), and write what `misplaced-block-ids` states.
- **Separating only the seams some reader continues.** Measured by the oracle and declined: it would write 5,674
  fewer lines over 400 generated notes, all where no reader continues the seam, at the cost of a per-reader table
  and spacing that varies by kind within one result (design D11).
- **Block ids that change host.** The oracle counts 125 on today's operations with the pass on, fewer than without
  it. What each operation does to an id is its own change, #281.
- **#258's heading keys.** This change states the drafted sibling heading's seams as they stand, and #258
  replaces that heading with a paragraph place.
- **#255.** The parse floor already separates a flush quote, callout or rule under a list item on any operation.
  This change leaves it as it is, and its byte-identical claims exclude it.
