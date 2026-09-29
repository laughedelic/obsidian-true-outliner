# Design

## Context

`reindentSubtreeVerbatim` is the only writer of the fallback, reached through `reindentSubtree`.
The mechanism and the sweeps are in `docs/research/verbatim-reindent-columns`.

## Goals / Non-Goals

**Goals:** the fallback keeps the block's tree for every spelling the sweeps generate, and keeps
the bytes past a fence's own indentation on the lines that open with it.

**Non-Goals:** see proposal.md.

## Decisions

- **Route each non-atom line through `reprefixLine`** with the root's prefix, the destination's,
  and the root's width delta. It already carries both guards the indent path uses, and shifts a
  line that does not open with the prefix. Guarding only lines that open with the prefix was
  measured and rejected: it leaves a line spelled apart behind, and breaks blocks where the two
  sets of lines had stayed in step.
- **A fence or an HTML block moves by its first line's prefix.** The first line goes through
  `reprefixLine`; the others take `from → to` of that line's own leading whitespace, byte-exact
  past it. Sending content lines through the guarded swap rewrote a Makefile recipe's tab.
- **A quote, a callout, a table and a rule move line by line** through `reprefixLine`, as
  `reprefixAtomLines` moves them on the converged path. Their leading whitespace is structure; kept
  byte for byte, a tab after the quote's prefix absorbed the move and split the quote.
- **Blank lines stay as they are**, as before: `reprefixLine` would pad a whitespace-only line.
- **No spec change to the indent requirement.** Its guard is the model; the fallback's sentence is
  what gains the columns.

## Risks / Trade-offs

- [A normalized root marker run shifts the block, a fence's content included, before the move]
  → as on `main`: `-\tp` over a fence holding `\techo` writes the recipe's tab as spaces. Folding
  the marker's change into the move is left alone; `docs/research/verbatim-reindent-columns`.
- [An HTML block opens only within three columns with no tab before it] → a move by columns can
  turn a tab-indented `<div>` paragraph into an HTML block or back, where `main` sometimes left the
  line in place by accident; `docs/research/verbatim-reindent-columns`.

- [A shifted line is spelled in spaces after its own whitespace] → only where the swap would land
  elsewhere; the tree is what the fallback exists to keep.
- [Atom content less indented than its fence] → shifted by the width like any line; the fence's
  indentation strips it whole either way.
