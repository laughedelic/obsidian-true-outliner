# Verbatim re-indent columns

Why a pasted or dropped block written through the verbatim re-indent could lose a descendant to
the wrong parent, and what moving every line by the root's width fixes. Filed as #244.

## The mechanism

`insertSubtrees` and `moveSubtreesTo` write a block in the document's unit first, and fall back to
the block's own characters past its root's prefix when the converged lines would parse as a
different tree ([`paste-indent-convergence.md`](paste-indent-convergence.md)). That fallback
swapped the root's prefix for the destination's on every line opening with it, and left every
other line where it stood. Two things break the block's columns there:

- **A tab past the prefix.** The swap writes the new prefix in front of the line's own tab. A tab
  runs to the next stop from wherever the prefix ends, so `  ` in front of `\t1. m` moves the line
  by nothing, and a space in front of a tab vanishes into it. The indent path met the same shape
  and guards it ([`indent-unit-on-every-line.md`](indent-unit-on-every-line.md)).
- **A line that does not open with the root's prefix.** It stayed where it was while the rest of
  the block moved, so any line below it that did open with the prefix moved away from it.

An atom's own first line is a line like any other: a fence written after a tab under `1. m`
moved by less than the block. The lines inside an atom are content, and only the fence's own
prefix moving keeps the bytes past it; the tab in a Makefile recipe survives that and no column
shift.

## The sweeps

Measured on `main` at `04879ad`, through `insertSubtrees` and `moveSubtreesTo`, with the probes in
[`prototypes/verbatim-reindent-columns/`](prototypes/verbatim-reindent-columns/README.md). A case
fails when the moved block no longer parses as the tree it had.

| Sweep | Cases | `main` fails | Every line moved by the width |
| --- | --- | --- | --- |
| Plain `- n` / `1. m` | 864 | 270 | 0 |
| With a fence, quote or block id under `1. m` | 1 296 | 405 | 0 |

No case that `main` keeps changes tree under the fix. Two narrower candidates were measured by the
plan's review against the same sweeps and set aside:

- **Guarding the swap only on lines that open with the root's prefix** still failed 595 cases of
  the combined 2 160, and broke 15 that `main` keeps by accident: the lines left in place and the
  lines swapped had stayed in step.
- **Sending an atom's content lines through the guarded swap** rewrote the whitespace inside a
  fenced block. `  \techo` in a fence at column 2, moved two columns right, came out
  `  \t  echo`, and the recipe's tab is gone once the fence's indentation is stripped.

## Left alone

- **The converged path loses a fence's tab the same way.** `reprefixAtomLines` shifts an atom's
  content line by the width wherever the guarded swap is refused: `- p` / `  ```make` / `  all:` /
  `  \techo` / `  ```` pasted after `  1. b` in `- a` / `  1. b` writes `  \t  echo`, on `main` at
  `04879ad`. Candidate issue, not yet filed.
- **`carryWithRoot` swaps unguarded.** A lazy or continuation line on the converged path takes the
  root's prefix swap with neither guard. The read-back sends any block whose tree changes to the
  verbatim path, so only such a line's column can drift. Candidate issue, not yet filed.
