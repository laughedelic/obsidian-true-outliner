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
moved by less than the block. What its other lines are depends on the kind. Inside a fence they
are content, and only the fence's own prefix moving keeps the bytes past it; the tab in a
Makefile recipe survives that and no column shift. A quote's, a callout's or a table's leading
whitespace is structure: `  \t> b` under `  > a`, kept byte for byte past `  ` while the block
moves two columns right, puts its `>` four columns past the content column, and the quote ends
at `> a`.

## The sweeps

Measured on `main` at `04879ad`, through `insertSubtrees` and `moveSubtreesTo`, with the probes in
[`prototypes/verbatim-reindent-columns/`](prototypes/verbatim-reindent-columns/README.md). A case
fails when the moved block no longer parses as the tree it had.

| Sweep | Cases | `main` fails | Every line moved by the width |
| --- | --- | --- | --- |
| Plain `- n` / `1. m` | 864 | 270 | 0 |
| With a fence, quote or block id under `1. m` | 1 296 | 405 | 0 |

No case that `main` keeps changes tree under the fix. The sweeps compare trimmed lines and write
a quote's second line in its first line's spelling, so they cannot see the quote case above;
`tests/edit-ops.test.ts` carries it. A sweep of 1 956 pastes by the implementation's review, with
quote and callout continuations spelled apart, found 25 quote and 25 callout cases broken on
`main` and under a byte-exact rule for every atom, and none with fences or tables. Two narrower candidates were measured by the
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
- **The converged path leaves a line spelled apart from its root behind.** `carryWithRoot` carries
  a line that does not open with the root's prefix unmoved, and swaps one that does with neither
  guard. The read-back re-roots only lines opening with the written prefix, so a carried line keeps
  its absolute column and reads as nested on its own while in place it is not: `  - p` / `\tpara`
  pasted after `\t\t- c` in `- a` / `\t- b` / `\t\t- c` writes `\t\t- p` / `\tpara`, and `para`
  leaves `p`, on `main` at `04879ad` and under this fix alike. With a blank line before `para` the
  block takes the verbatim path and lands whole. The review's sweep of 1 956 pastes with no
  fallback trigger broke 109 quote and 320 code or table cases of this shape. Candidate issue, not
  yet filed.
