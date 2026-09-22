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
member already carried, counted back over whatever now precedes it in the fragment. This decides
where a fragment BEGINS and nothing else — the consecutive renumbering still runs from there, so
a source run that was not already consecutive is normalized exactly as it always was.

Four refinements were forced by measurement rather than foreseen.

**"Outside the fragment", not "still present".** A reorder WITHIN a run moves its members past one
another and cuts nothing. Reading "an earlier member survived" alone made `1. one` / `2. two` /
`3. three` renumber to `2.` / `3.` / `4.` on a plain swap — three unit tests caught it.

**A fragment that also joins is back under the join rule.** A separator moving in can cut a run
and merge the tail into the run below in one gesture. Handing that fragment its own numbers moves
every absorbed member by one, which rewrites MORE than `main` did. Measured over the labelled
generator before the guard: 20 cases preserved fewer source lines than `main`, all of this shape.

**Counting back can run out of room, and `0.` is not the answer.** A fragment can be handed more
prepended members than its own number leaves space for:

```
 clipboard    before    kept own      recovered start
┆- x         ┆1. a┃    ┆1. a         ┆1. a
┆5. p        ┆2. b     ┆- x          ┆- x
┆6. q                  ┆0. p         ┆1. p
┆7. r                  ┆1. q         ┆2. q
                       ┆2. r         ┆3. r
                       ┆3. b         ┆4. b
```

`2. b` is rewritten either way — its own numbers do not fit here, which is the recovery's own
condition reached from a third direction. Clamping at `0.` is legal CommonMark and round-trips,
but it writes a number no run in the source was written from and rewrites the same line anyway,
so the recovered start takes it.

**Keeping a fragment's numbers renumbers UPWARD, and the parser has a ceiling.** This is the
direction recovering a start could never produce, and it reaches a hole that predates the change.
`parse.ts` reads an ordered marker as `\d{1,9}`, so a tenth digit is not a list item at all.
Measured, before the guard:

```
 clipboard    before                   without the guard
┆- x         ┆999999998. a┃           ┆999999998. a
             ┆999999999. b            ┆- x
             ┆999999999. c            ┆999999999. b
             ┆            - kid       ┆1000000000. c
                                      ┆   - kid
```

`1000000000. c` re-parses as a **paragraph**; `markerWidthOf` falls back to 2 on the marker it can
no longer read, and the subtree is dragged from column 12 to column 3. `renumberRuns` now leaves
any run whose renumbering would exceed the limit exactly as it stands — its markers parsed
already, so leaving them is what keeps closure.

The hole itself is older than this change: on `main`, `999999999. a` / `999999999. b` with a
`5. z` inserted already writes `1000000001. b` through the unchanged insertion path. What is new
is the route in, and the guard sits in `renumberRuns` so it closes both.

## Differential against `main`

The labelled generator (`tests/group-oracle.ts`, `arbLabeledDoc`), seed 42, 3000 documents, every
node as the operand for each of the four relocating operations and as the paste anchor for five
payload shapes. Both `src/ops.ts` versions loaded side by side and their encoded output compared.

| operation | accepted on both | output differs |
| --- | --- | --- |
| `indent` | 31 463 | 0 |
| `outdent` | 45 800 | 2 597 |
| `moveUp` | 28 632 | 2 497 |
| `moveDown` | 28 632 | 2 497 |
| paste `- x` | 56 355 | 6 517 |
| paste `- x` / `  - y` | 56 355 | 6 517 |
| paste `## H` / `body` | 56 355 | 6 517 |
| paste `3. y` | 56 355 | 0 |
| paste `- x` / `3. y` | 56 355 | 1 212 |

`insertSubtrees` had to be in this table: it is the operation the report is about, and a
differential without it measures around it. The three bullet-led payloads agree exactly, which is
the plain-bullet control again — the conversion changes nothing. A purely ordered payload divides
no run and differs nowhere, as `indent` does for the same reason: its arrival lands among ordered
siblings or among none.

The direction of every difference was measured, not sampled. Counting how many of the source's
own lines come through the operation verbatim:

| | cases |
| --- | --- |
| this change preserves strictly more than `main` | 28 354 |
| the two preserve the same number | 0 |
| this change preserves fewer | 0 |

**That is the corpus, not a property.** On a source whose run is not already consecutive, both
readings normalize it and neither leaves it alone, so which of them preserves more is incidental.
A hand-built frame where `main` preserves more:

```
 clipboard    before          this change      main
┆- x         ┆- t            ┆- t             ┆- t
             ┆  8. e┃        ┆  8. e          ┆  8. e
             ┆  9. n         ┆  - x           ┆  - x
             ┆  9. o         ┆  9. n          ┆  8. n
             ┆     - kid     ┆  10. o         ┆  9. o
                             ┆      - kid     ┆     - kid
```

Five source lines come through on `main`, four here — because the source run reads 8, 9, 9 and is
normalized either way. The consecutive control (`8. e` / `9. n` / `10. o`) reverses it 6 to 3.
`renumbering-contract.test.ts` places the same restriction on its own property, and for the same
reason: on a run already consecutive from its start, a renumbering that normalizes is the
requirement working rather than failing.

## What this does not close, and what answered it

[#159]'s first question was left open here: `headingAsListItem` (`src/reencode.ts`) wrote
`{ type: 'bullet', marker: '-' }` unconditionally, so a heading pasted into an ordered run landed
as a bullet and divided the run — after this change, without renumbering anything.

Answered 2026-09-21, in `a-converted-node-takes-the-destination-style`: a converted node takes
the destination's list style, the way `encodingKindAtDestination` already makes a reparented node
take its encoding from its neighbours. Re-measuring for that decision found the marker was not
cosmetic — a `-` written into a `*` run takes it from one rendered list to three
(`docs/research/destination-list-style`).

That narrows what the rule above reaches. A converted heading now JOINS the ordered run it lands
in, so the items below it shift by one, which is the renumbering requirement working rather than
the defect this note is about. The gesture this note was written for — a plain bullet pasted
into a run — is untouched, because an arriving list item keeps the marker its author wrote and is
therefore still a division rather than a join.

[#159]: https://github.com/laughedelic/obsidian-true-outliner/issues/159
