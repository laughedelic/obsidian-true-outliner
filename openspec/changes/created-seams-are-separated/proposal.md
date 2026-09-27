# Proposal

## Why

An operation separates two blocks only where our own parse would merge them, and our parse models no
lazy continuation. Every other reader of the note does. So a seam an operation writes flush under a
quote, a callout or a list item reads as one block in reading mode, Live Preview and CommonMark, where
the outline shows two (`docs/research/lazy-continuation-at-seams`). The outline is where a user builds
structure, and the text it writes has to mean that structure in every view of the note.

## What Changes

- **A seam an operation creates outside a list is written with one blank line.** Each operation states the
  seams it creates, and separates them:
  - an insertion, paste, drop or move to another scope: the run's two outer seams, and the seams inside a
    pasted payload
  - a deletion: the seam that joins the blocks around the removed run
  - a split: the new seam between the halves
  - an Enter place: both of its sides

  A same-scope reorder and a lone id's drop create none. A merge, an indent or outdent, and a type-over's outer
  seams create none unless the op changes the kind of the block at that seam, which it then marks. Only
  structural operations mark seams: a single block pasted natively is outside the rule. This replaces "the minimum the parse requires" as the rule for those seams, and the kind-as-written
  rules stay as the floor they already are. The approaches reviewed before this one are recorded in
  `docs/research/created-seam-detection`.
- **Inside a list, the rule adds nothing.** Whether a list is tight or loose is the user's, and every seam
  inside a list is written as today (`lazy-continuation-at-seams`, "Measured: loose lists"). The seams
  between a list and the blocks above and below it are outside the list.
- **A seam the user wrote is not touched.** No operation marks it, so it keeps its separation as written,
  however flush.
- **A seam is never widened.** Only an empty seam gains a line, and it gains one.
- **A block id stays on its block,** and a lone id line stays flush above the block below it. No blank line
  is written above a block indented four columns past its margin, which CommonMark would read as code.
- **An Enter place is separated on both sides outside a list** and always adds its own line. Abandoning a
  dissolved place leaves the neighbours as the note held them, or separated where that was empty outside a
  list. A Shift+Enter place stays adjacent.
- **A move that gains a blank line is still dispatched as a move.**
- **BREAKING (encoding):** operations that wrote a flush created seam outside a list write a blank line
  there instead. A note is unchanged until an operation touches it, and then only at the seams that
  operation creates. The heading-first-child convention becomes a case of the rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`:
  - boundary separation takes the created-seam rule, replacing "SHALL NOT widen beyond what the parse
    requires"
  - the heading-first-child convention is folded into the rule
  - the insertion's indent-unit round trip narrows to the payload's own lines
  - the insertion, deletion, move, reorder, split, sibling-heading and position-indentation requirements
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
  - each op records the seams it creates on the surgery
  - `finalize` separates the marked seams that are empty and outside a list
  - `deleteSubtreeGroups` marks nothing when a splice follows
  - `splitNode`, `insertEmptyBefore`, `unwrapListItem` and `outdentSurgery` write their places separated
    on both sides outside a list
- `src/enforce.ts`: a type-over's insertion marks only its payload's inner seams.
- `src/plugin/grammar.ts` and `src/plugin/main.ts`: a dissolving op states its own removal, covering the
  separators it added.
- `src/plugin/dispatch.ts`: the relocation match sets blank lines aside.
- Tests: many unit tests pin flush encodings of created seams outside lists, and change with the rule. The e2e
  specs that assert whole buffers across a structural edit change with them.

## Non-goals

- **The parser.** It keeps modeling no lazy continuation. What `parse` reads a flush line as, the question
  #261 tracks, is left alone.
- **Seams the user wrote.** Normalizing existing flush seams across a note is not done, on an edit or
  otherwise.
- **Separation inside lists,** including the insertion's carry at a list's edge, which is #272.
- **#258's heading keys.** This change states the drafted sibling heading's seams as they stand, and #258
  replaces that heading with a paragraph place.
