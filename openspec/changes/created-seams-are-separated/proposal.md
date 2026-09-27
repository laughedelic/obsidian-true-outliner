# Proposal

## Why

An operation separates two blocks only where our own parse would merge them, and our parse models no
lazy continuation. Every other reader of the note does. So a seam an operation writes flush under a
quote, a callout or a list item reads as one block in reading mode, Live Preview and CommonMark, where
the outline shows two (`docs/research/lazy-continuation-at-seams`). The outline is where a user builds
structure, and the text it writes has to mean that structure in every view of the note.

## What Changes

- **A seam an operation creates outside a list is written with one blank line.** A seam is created
  when its two blocks were not adjacent in the note before the operation. That covers an insertion, a
  paste, a drop, a move, a removal that brings two blocks together, a split's new block, a merge's
  adoption, an outdent that adopts siblings, and the provisional position Enter opens. This replaces
  "the minimum the parse requires" as the rule for those seams, and the kind-as-written rules stay as
  the floor they already are.
- **Inside a list, the list decides.** A seam whose blocks both lie in one list is separated as it is
  today, so tight and loose lists stay what they were. That covers an item and its child blocks, two
  child blocks of one item, an item and the next, and an item and its nested list. Such a seam turns a
  tight list loose in every reader, reading mode's structure included
  (`lazy-continuation-at-seams`, "Measured: loose lists").
- **A seam the user wrote is not touched.** Two blocks adjacent before the operation keep their
  separation as written, however flush. That includes a block that was split, merged or drafted in
  place, whose seam below did not move.
- **A seam is never widened.** One that already holds a blank line keeps what it holds. Only an empty
  seam gains a line, and it gains one.
- **A block id stays on its block,** and a lone id line stays flush above the block below it.
- **A place is separated on both sides** and always adds its own line. Abandoning it removes what it
  added.
- **A move that gains a blank line is still dispatched as a move.**
- **BREAKING (encoding):** operations that wrote a flush seam outside a list write a blank line there
  instead. A note is unchanged until an operation touches it, and then only at the seams that operation
  creates. The heading-first-child convention becomes a case of the rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`:
  - boundary separation takes the created-seam rule, replacing "SHALL NOT widen beyond what the parse
    requires"
  - the heading-first-child convention is folded into the rule
  - the insertion, deletion, move, reorder, split, sibling-heading and position-indentation
    requirements state the rule for the seams they create
- `outline-keyboard-grammar`:
  - a provisional position is separated on both sides
  - Shift+Enter's new sibling heading is separated from the section above it
- `node-edit-enforcement`:
  - a paste and a type-over keep the destination's separation inside a list, and separate every other
    seam they create
  - a deletion separates the seam it leaves
- `document-tree-mapping`: "Minimal re-encoding after tree edits" names a created seam's upper node as
  one the operation touched.
- `structural-history-integration`: abandoning a place removes the separators it added.
- `minimal-change-dispatch`: a relocation that gains a blank line at a created seam is still
  dispatched as a relocation.

## Impact

- `src/ops.ts`:
  - `finalize` and `normalizeBoundaries` learn which seams are created, from the document before the
    operation and the op's lineage
  - `deleteSubtreeGroups` leaves its splice seam alone when a splice follows
  - `splitNode`, `mergeNodes` and `insertSiblingHeading` state their lineage
  - `splitNode`, `insertEmptyBefore` and `unwrapListItem` write their places through the rule
- `src/enforce.ts`: the type-over and empty-anchor paste paths rely on the deletion's `spliceFollows`.
- `src/plugin/grammar.ts`: a dissolving op's stated removal covers the separators its place added.
- `src/plugin/dispatch.ts`: the relocation match sets blank lines aside.
- Tests: many unit tests pin flush encodings for created seams outside lists, and change with the
  rule. The e2e specs that assert whole buffers across a structural edit change with them.

## Non-goals

- **The parser.** It keeps modeling no lazy continuation. What `parse` reads a flush line as, the
  question #261 tracks, is left alone.
- **Seams the user wrote.** Normalizing existing flush seams across a note is not done, on an edit or
  otherwise.
- **Separation inside lists.** The rule never loosens or tightens a list, and does not change how any
  seam inside one is written.
