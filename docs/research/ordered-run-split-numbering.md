# What a run is once a foreign marker divides one

Issue [#159] reports content changing on disk that nobody touched: pasting a bullet with the
caret at the end of `9. nine` rewrites `10. ten` to `8. ten`. The item was not in the selection,
not in the payload and not adjacent to the caret. It is renumbered because the bullet between it
and `9. nine` ended the run it belonged to, and the run's start was then handed to the fragment
left below.

The issue names two questions and this note answers the second: **should renumbering ever rewrite
a line outside the operation's own span?** Answering it means deciding what a run IS once a
foreign marker divides one. The first question — whether a converted heading should adopt the
listStyle of the run it lands in — is untouched here and stays open.

In the frames below `┆` marks each column's left edge and `┃` the caret.

## The shape, reproduced

Measured against `main` at `0aefdc6`, through `insertSubtrees` directly. `⌘V` with the clipboard
shown.

```
 clipboard    before        main          this change
┆- alpha     ┆- top        ┆- top        ┆- top
┆  - beta    ┆  8. eight   ┆  8. eight   ┆  8. eight
             ┆  9. nine┃   ┆  9. nine    ┆  9. nine
             ┆  10. ten    ┆  - alpha    ┆  - alpha
                           ┆    - beta   ┆    - beta
                           ┆  8. ten     ┆  10. ten
```

A heading payload, which converts to a bullet on the way in, produces the identical result on
both sides — the control that says the defect is the renumbering and not the conversion.

The same shape at the root, consecutive from 1, is the minimal frame:

```
 clipboard    before    main       this change
┆- x         ┆1. a┃    ┆1. a      ┆1. a
             ┆2. b     ┆- x       ┆- x
             ┆3. c     ┆1. b      ┆2. b
                       ┆2. c      ┆3. c
```

Two lines rewritten on `main`, none here.

## Where the rule came from

The behaviour is deliberate, and it is younger than it looks.
`2026-08-24-ordered-run-start-on-arrival` replaced a "lowest number still present" reading with
"the start of the run that the first member present beforehand belonged to", which fixed five
call sites. Its proposal records the split shape as a sixth outcome that changed **without
having been a defect**:

> A reorder that SPLITS a run … now leaves each fragment on the start of the run it came from
> (`1. a` / `2. b` / `- x` / `1. c`, where the minimum-present reading left `3. c`). That is what
> a removal already does to the fragment it leaves behind, so the change is the two shapes
> agreeing rather than a new behavior.

So the split outcome was carried along by a change aimed elsewhere, on the argument that a split
and a removal are one shape. They are not, and the difference is exactly the one the report
turns on: **a removal takes the members that carried the start, and a split takes nothing.**

- After a removal the fragment has no numbering of its own left to stand on, so a start has to
  be recovered from the list as it was.
- After a split the head fragment still holds the start and the tail still holds its own
  numbers. Recovering a start there does not restore anything — it overwrites what is already
  correct.

## What the reader sees

The markers are not only bytes. A fragment cut loose is its own CommonMark list and renders from
its own first number, so rewriting the marker rewrites the rendering with it. Rendered with
`commonmark` 0.31.2, on the root-level frame:

| document | lists emitted |
| --- | --- |
| `1. a` / `2. b` / `3. c` | `<ol>` — reads 1, 2, 3 |
| `main`: `1. a` / `- x` / `1. b` / `2. c` | `<ol>`, `<ol>` — reads 1, then 1, 2 |
| this change: `1. a` / `- x` / `2. b` / `3. c` | `<ol>`, `<ol start="2">` — reads 1, then 2, 3 |

`b` and `c` were numbered 2 and 3 before the paste and read as 2 and 3 after it. On `main` they
read as 1 and 2.

Strict CommonMark does not make a list of the issue's own nested frame at all — `8. eight`
indented under `- top` is a lazy paragraph continuation there, since an ordered item numbered
other than 1 cannot interrupt a paragraph. Obsidian does render it as a nested list, and we have
not measured Obsidian's `start` attribute for the divided frame; the root-level figures above are
what this note rests on.

## The rule

A start is recovered exactly where the fragment's own numbers cannot stand:

1. **The members carrying them are gone** — a removal, including the removal side of an indent or
   an outdent. The fragment is a remainder, and reads the run's own start.
2. **Members from elsewhere have arrived beside them** — a join. One list carries one sequence,
   so whatever start the fragment is handed renumbers the arrivals; there is no reading that
   leaves them alone, and the existing join rule decides it.

Otherwise the fragment keeps its own numbers: its start is the number its earliest surviving
member already carried, counted back over whatever now precedes it in the fragment.

Two refinements were forced by measurement rather than foreseen.

**"Outside the fragment", not "still present".** A reorder WITHIN a run moves its members past one
another and cuts nothing. Reading "an earlier member survived" alone made `1. one` / `2. two` /
`3. three` renumber to `2.` / `3.` / `4.` on a plain swap — three unit tests caught it.

**A fragment that also joins is back under the join rule.** A separator moving in can cut a run
and merge the tail into the run below in one gesture. Handing that fragment its own numbers moves
every absorbed member by one, which rewrites MORE than `main` did. Measured over the labelled
generator before the guard: 20 cases preserved fewer source lines than `main`, all of this shape.

## Differential against `main`

The labelled generator (`tests/group-oracle.ts`, `arbLabeledDoc`), seed 42, 3000 documents, every
node as the operand for each of the four relocating operations. Both `src/ops.ts` versions loaded
side by side and their encoded output compared.

| operation | accepted on both | output differs |
| --- | --- | --- |
| `indent` | 31 463 | 0 |
| `outdent` | 45 800 | 2 597 |
| `moveUp` | 28 632 | 2 497 |
| `moveDown` | 28 632 | 2 497 |

1 603 of the 3 000 documents differ somewhere. `indent` differs nowhere: its arrival lands among
ordered siblings or among none, and neither divides a run.

The direction of every difference was measured, not sampled. Counting how many of the source's
own lines come through the operation verbatim:

| | cases |
| --- | --- |
| this change preserves strictly more than `main` | 7 591 |
| the two preserve the same number | 0 |
| this change preserves fewer | 0 |

Every difference is a marker this change declines to rewrite. The 7 591 is (operation, operand)
pairs rather than documents, and it is the figure that says the change only ever subtracts
rewriting.

## What this does not close

[#159]'s first question. `headingAsListItem` (`src/reencode.ts`) still writes
`{ type: 'bullet', marker: '-' }` unconditionally, so a heading pasted into an ordered run still
lands as a bullet and still divides the run — it now divides it without renumbering anything. Whether
a converted node should instead adopt the destination run's `listStyle`, the way
`encodingKindAtDestination` already makes a reparented node take its encoding from its
neighbours, is a policy question this change deliberately leaves where it found it.

[#159]: https://github.com/laughedelic/obsidian-true-outliner/issues/159
