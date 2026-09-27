# Proposal

## Why

An operation separates two blocks only where our own parse would merge them, and our parse models
no lazy continuation. Every other reader of the note does, so a seam an operation writes flush under
a quote, a callout or a list item is read by reading mode, Live Preview and CommonMark as one block
where the outline shows two (`docs/research/lazy-continuation-at-seams`). The outline is where a user
builds structure; the text it writes has to mean that structure in every view of the note.

## What Changes

- **A seam an operation creates is written with one blank line.** It is the seam between two blocks
  that were not adjacent in the note before the operation. It covers an insertion, a paste, a drop, a
  move, a removal that brings two blocks together, a split, a merge's adoption, an indent or outdent, and
  the provisional position Enter opens. This replaces "the minimum the parse requires" as the rule for
  created seams. The kind-as-written rules stay as the floor they already are.
- **Between list items the list's own separation stands.** A seam between two sibling list items, or
  between an item and its nested list, keeps the separation of the list it lands in, as the insertion
  rule states today. Tight and loose lists stay what they were.
- **A seam the user wrote is not touched.** Two blocks adjacent before the operation keep the
  separation between them, as written, however flush.
- **A seam is never widened.** One that already holds a blank line keeps what it holds. Only an
  empty seam gains a line, and it gains one.
- **A block id stays on its block.** A block-id line is never separated from the line it names.
- **BREAKING (encoding):**
  - Operations that wrote a flush seam write a blank line there instead. Notes are unchanged until
    an operation touches them, and then only at the seams that operation creates.
  - The heading-first-child convention becomes a case of the rule.
  - The "widens the gap by two" statements become "separated on both sides". That makes a place opened
    under a flush quote, heading or code block, and a place above a flush first child, separated as
    `outline-keyboard-grammar` already says a place is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`:
  - boundary separation takes the created-seam rule, replacing "SHALL NOT widen beyond what the parse requires"
  - the insertion's separation keeps carrying the destination's separation between list items only
  - the heading-first-child convention is folded into the rule
  - the reorder, deletion, split, sibling-heading and unwrap requirements state the rule for the seams they create
- `outline-keyboard-grammar`:
  - a provisional position is blank-separated on both sides, adding only what is missing
  - Shift+Enter's new sibling heading is separated from the section above it
- `node-edit-enforcement`: a paste and a type-over keep the destination's separation between list
  items, and separate every other seam they create.
- `document-tree-mapping`: "Minimal re-encoding after tree edits" names a created seam's upper node
  as one the operation touched.

## Impact

- `src/ops.ts`:
  - `finalize` and `normalizeBoundaries` learn which seams are created, from the document before
    the operation
  - `spliceAtIndex`'s separation-carrying narrows to list-item seams
  - `splitNode`, `insertEmptyBefore`, `unwrapListItem` and `insertSiblingHeading` write their places and seams through the rule
- `src/enforce.ts`: the type-over path composes a deletion and an insertion through two `finalize`
  calls, and has to hand the first call's created seams to the second.
- Tests: many unit tests pin flush encodings for created seams, and change with the rule. The e2e
  specs that assert whole buffers across a structural edit change with them.

## Non-goals

- **The parser.** It keeps modeling no lazy continuation. What `parse` reads a flush line as, the
  question #261 tracks, is left alone.
- **Seams the user wrote.** Normalizing existing flush seams across a note is not done, on an edit or
  otherwise.
- **List tightness.** The rule never loosens or tightens a list.
- **Places' abandonment.** Abandoning a place restores the source byte for byte, as it does now.
