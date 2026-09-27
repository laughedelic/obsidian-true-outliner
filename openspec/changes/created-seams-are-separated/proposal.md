# Proposal

## Why

An operation separates two blocks only where our own parse would merge them, and our parse models no
lazy continuation. Every other reader of the note does. So a seam an operation writes flush under a
quote, a callout or a list item reads as one block in reading mode, Live Preview and CommonMark, where
the outline shows two (`docs/research/lazy-continuation-at-seams`). The outline is where a user builds
structure, and the text it writes has to mean that structure in every view of the note.

## What Changes

- **A seam at an operation's edit site, outside a list, is written with one blank line.** The edit site is every
  seam next to a block the operation wrote, and every seam that joins blocks the operation brought together. A
  block is written when it is new, or its text or kind changed, or it has a new parent or previous sibling.
  That is decided the same way for every structural operation. It covers:
  - the seams around a pasted, dropped or moved run, and every seam inside a pasted payload
  - the seam a deletion leaves
  - the seams around the blocks a split, a merge, a type-over, an indent or an outdent rewrites

  A moved subtree's inner seams are not at the edit site, and neither is any seam away from it. The
  approaches reviewed before this one are recorded in `docs/research/created-seam-detection`.
- **Inside a list, the rule adds nothing.** Whether a list is tight or loose is the user's, and every seam inside
  a list is written as today (`lazy-continuation-at-seams`, "Measured: loose lists"). The seams between a list and
  the blocks above and below it are outside the list.
- **A seam away from the edit site is not touched,** however flush.
- **A seam is never widened.** Only an empty seam gains a line, and it gains one.
- **A blank line never changes what a block is.** A block id stays on its block, a lone id line stays flush above
  the block below it, and no blank line goes above a block indented four columns past its margin, which
  CommonMark would read as code.
- **An Enter place is separated on both sides outside a list,** and always adds its own line. Abandoning a
  dissolved or carried place removes the separators it added. A Shift+Enter place stays adjacent.
- **A move that gains or loses a blank line is still dispatched as a move.**
- **BREAKING (encoding):** operations that wrote a flush seam at their edit site outside a list write a blank line
  there instead. That includes a split's, a merge's and a type-over's outer seams. A note is unchanged away from
  the edit sites of the operations run on it. The heading-first-child convention becomes a case of the rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`:
  - boundary separation takes the edit-site rule, replacing "SHALL NOT widen beyond what the parse requires"
  - the heading-first-child convention is folded into the rule
  - the insertion's indent-unit round trip narrows to the payload's own lines
  - the insertion, deletion, move, merge, split, sibling-heading and position-indentation requirements
    state the rule for the seams they create
- `outline-keyboard-grammar`:
  - an Enter position is separated on both sides
  - a Shift+Enter position stays adjacent
  - Shift+Enter's drafted sibling heading is separated from the section above it, until #258 replaces it
- `node-edit-enforcement`:
  - a paste keeps the destination's separation inside a list, and separates every other seam it creates
  - a type-over keeps the seams at its edges
  - a deletion separates the seam it leaves
- `document-tree-mapping`: "Minimal re-encoding after tree edits" names a created seam's upper node as one
  the operation touched.
- `structural-history-integration`: abandoning a dissolved place leaves its neighbours separated as the rule
  would.
- `minimal-change-dispatch`: a relocation that gains a blank line at a created seam is still dispatched as a
  relocation.

## Impact

- `src/ops.ts`:
  - `finalize` indexes the document it started from by node id, finds the edit site within the changed text, and
    separates its empty seams outside a list before the parse floor runs
  - `deleteSubtreeGroups` separates nothing when a splice follows
  - `splitNode`, `insertEmptyBefore`, `unwrapListItem` and `outdentSurgery` write their places separated on both
    sides outside a list, and a dissolving op records the lines it added so `finalize` can return its abandonment
- `src/plugin/grammar.ts`, `src/plugin/main.ts` and `src/plugin/provisional-cleanup.ts`: a dissolved place's and a
  carried place's abandonment removes the separators added with it.
- `src/plugin/dispatch.ts`: the relocation match sets blank lines aside.
- Tests: many unit tests pin flush encodings at edit sites outside lists, and change with the rule. The e2e specs
  that assert whole buffers across a structural edit change with them.

## Non-goals

- **The parser.** It keeps modeling no lazy continuation. What `parse` reads a flush line as, the question
  #261 tracks, is left alone.
- **Seams the user wrote.** Normalizing existing flush seams across a note is not done, on an edit or
  otherwise.
- **Separation inside lists,** including the insertion's carry at a list's edge, which is #272.
- **#258's heading keys.** This change states the drafted sibling heading's seams as they stand, and #258
  replaces that heading with a paragraph place.
- **#255.** The parse floor already separates a flush quote, callout or rule under a list item on any operation.
  This change leaves it as it is, and its byte-identical claims exclude it.
