# Proposal

## Why

A pasted or dropped block that the read-back sends to its own characters (#244) can lose a
descendant to the wrong parent: a tab past the root's prefix absorbs the new prefix, and a line
that does not open with the prefix stays behind while the block moves. The requirement's fallback
sentence prescribes that mechanism ("keep its own characters past its root's prefix"), and the
broken output satisfies it literally, while the same requirement's scenarios ("internal relative
structure preserved", "its tree is unchanged") and `moveSubtreesTo`'s "internal relative nesting
preserved exactly" forbid the result. #244 decides between them: the block keeps its tree, each
line moved by the width. Measured in `docs/research/verbatim-reindent-columns`.

## What Changes

- The fallback of "Subtree insertion at a boundary" moves every line by the width its root moved:
  the prefix swap where it lands on that column and puts no space in front of a tab, a shift by the
  width elsewhere, including on lines that do not open with the root's prefix.
- A fenced or HTML block's first line moves the same way; its other lines take its first line's
  change of prefix and keep every byte past it. A quote's, a callout's and a table's lines move
  as any line does.

## Non-goals

- The converged path. `reprefixAtomLines` loses a fence's tab there, and `carryWithRoot` leaves a
  line spelled apart from its root behind; `docs/research/verbatim-reindent-columns`, "Left alone",
  carries both as candidate issues.
- The indent/outdent re-encode ("A moved node is written in one indentation"), which already
  guards its swap.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `structural-operations`: "Subtree insertion at a boundary" — the fallback moves the block whole
  by its root's width instead of keeping its characters past the root's prefix, per atom kind, and
  four scenarios pin it.

## Impact

`reindentSubtreeVerbatim` in `src/ops.ts`; `reprefixLine` in `src/reencode.ts` is exported for
it. Reached from `insertSubtrees` (paste) and `moveSubtreesTo` (drag, cross-scope move).
