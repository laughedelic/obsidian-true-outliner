## Why

Pasting a bullet into the middle of an ordered run rewrites an item below it that was not in the
selection, not in the payload and not adjacent to the caret. Reported as
[#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159), p0, and reproduced
against `main` at `0aefdc6` through `insertSubtrees`:

```
 clipboard    before        main          this change
┆- alpha     ┆- top        ┆- top        ┆- top
┆  - beta    ┆  8. eight   ┆  8. eight   ┆  8. eight
             ┆  9. nine┃   ┆  9. nine    ┆  9. nine
             ┆  10. ten    ┆  - alpha    ┆  - alpha
                           ┆    - beta   ┆    - beta
                           ┆  8. ten     ┆  10. ten
```

`10. ten` becomes `8. ten` because the bullet between it and `9. nine` ended the run it belonged
to, and the run's START NUMBER was then handed to the fragment left below. A heading payload,
which converts to a bullet on the way in, produces the identical result — the control that says
the defect is the renumbering rather than the conversion. The minimal frame is the same shape at
the root: pasting `- x` after `1. a` in `1. a` / `2. b` / `3. c` rewrites two lines where it
should rewrite none.

The rewritten markers are not only bytes on disk. A fragment cut loose is its own CommonMark list
and renders from its own first number: measured with `commonmark` 0.31.2, `main` emits
`<ol>` + `<ol>` for that frame, so `b` and `c` read as 1 and 2 where the reader wrote 2 and 3.

The behaviour is deliberate, and younger than it looks.
`2026-08-24-ordered-run-start-on-arrival` fixed five call sites by recovering a run's start from
the sibling list as it was, and recorded the split outcome as a sixth that changed "without
having been a defect", on the argument that a split and a removal are one shape. They are not,
and the difference is the one this report turns on: **a removal takes the members that carried
the start, and a split takes nothing.** After a removal the fragment has no numbering left to
stand on. After a split the head fragment still holds the start and the tail still holds its own
numbers, so recovering a start there restores nothing and overwrites what is already correct.

`docs/research/ordered-run-split-numbering.md` carries the frames, the rendering figures, and a
differential against `main` over the labelled generator: 7 591 differing (operation, operand)
pairs, every one of which preserves strictly more of the source's own lines than `main` does, and
none of which preserves fewer.

## What Changes

- A run's start is recovered only where the fragment's own numbers cannot stand — because the
  members carrying them are gone (a removal), or because members from another run have arrived
  beside them (a join). A fragment that is neither keeps its own numbers.
- `renumberOrderedAgainst` (src/ops.ts) gains that condition. Every one of its ten call sites
  inherits it; none of them changes.
- `indent`'s behaviour is unchanged everywhere — its arrival lands among ordered siblings or
  among none, and neither divides a run.

## Non-Goals

- **[#159]'s first question.** `headingAsListItem` (src/reencode.ts) still writes
  `{ type: 'bullet', marker: '-' }` unconditionally, so a converted heading still lands as a
  bullet and still divides the run it lands in — it now divides it without renumbering anything.
  Whether a converted node should instead adopt the destination run's `listStyle` is a policy
  question this change leaves where it found it, and the issue stays open on it.
- **No change to what counts as a run.** `orderedRuns` still reads maximal runs of consecutive
  ordered siblings. Only the start handed to each one moves.

[#159]: https://github.com/laughedelic/obsidian-true-outliner/issues/159

## Impact

- Affected specs: `structural-operations` (Ordered-run renumbering).
- Affected code: `src/ops.ts` (`renumberOrderedAgainst`), `tests/ops.test.ts`.
