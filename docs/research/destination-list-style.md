# The marker a converted node is written with

A node converted into a list item on its way to a destination — a heading landing in a list
scope, a paragraph taking a list item's encoding — was written with a literal `-`.
`headingAsListItem` (`src/reencode.ts`) hardcoded `{ type: 'bullet', marker: '-' }`, and the
paragraph-to-list-item arm of `reencodeForDestination` beside it made the same choice.

That marker is not cosmetic. CommonMark begins a new list wherever the bullet character changes,
so an arrival carrying the wrong one does not join the list it lands in — it ends it.

In the frames below `┆` marks each column's left edge and `┃` the caret.

## What it costs

**Case 1: a heading pasted into a `*` run.** ⌘V with the clipboard shown.

```
 clipboard    before    before fix   after fix
┆## H        ┆- top    ┆- top       ┆- top
             ┆  * a┃   ┆  * a       ┆  * a
             ┆  * b    ┆  - ## H    ┆  * ## H
             ┆  * c    ┆  * b       ┆  * b
                       ┆  * c       ┆  * c
```

Rendered with `commonmark` 0.31.2:

| document | lists rendered | items |
| --- | --- | --- |
| the source | 2 | 4 |
| before the fix | **4** | 5 |
| after the fix | 2 | 5 |

The outer `- top` list accounts for one in every row; the inner `* a` / `* b` / `* c` list is
what goes from one list to three. `+` behaves identically.

Into a `-` run the counts never move, because the marker already matched — which is why
[#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159)'s own frames, drawn
with `-` and ordered runs, carried this only as a one-line aside.

These are `commonmark`'s counts, and Obsidian's renderer is not `commonmark`. A manual pass in
the real app exercised the ordered-run half of this and found two defects — one fixed here, one
filed as [#192](https://github.com/laughedelic/obsidian-true-outliner/issues/192) — but it did
not compare the two renderers on where a list BREAKS. That comparison stays unmeasured, and the
`*`-run argument above is the part it would bear on.

## The rule it was missing

Two rules already read the destination's surroundings for a reparented node, both in
`src/rules.ts`:

| what it decides | function | donor |
| --- | --- | --- |
| the block KIND | `encodingKindAtDestination` | nearest preceding paragraph/list-item sibling, else following, else the parent |
| the heading LEVEL | `destinationHeadingLevel` | nearest preceding heading sibling, else following, else the parent |
| the list STYLE | *(nothing)* | — |

The marker is the third regime of one rule, and the only one that was not reading its
surroundings. `destinationListStyle` now sits beside the other two and reads its donor the same
way: nearest preceding list-item sibling, else nearest following, else `-`.

Only list items donate, exactly as only paragraphs and list items donate a kind — a heading or an
atom standing between the arrival and the run says nothing about which list the arrival joins.

## Measured shapes

Every row is `insertSubtrees` with the payload shown, and every result re-parses to the tree the
surgery built.

| destination | payload | result |
| --- | --- | --- |
| `* a` / `* b` / `* c` | `## H` | `* ## H` — one list |
| `+ a` / `+ b` | `## H` | `+ ## H` |
| `- a` / `- b` | `## H` | `- ## H`, unchanged |
| `8.` / `9.` / `10.` | `## H` + body | `10. ## H`, body at column 6, `10. ten` → `11.` |
| `8.` / `9.` | a plain paragraph | `9. plain para`, `9. nine` → `10.` |
| `1)` / `2)` | `## H` | `2) ## H` — the delimiter travels too |
| `1.` / `2.` | `## H` + `### H2` | `2. ## H` with `- ### H2` as its child |
| `- [ ] a` / `- [ ] b` | `## H` | `- ## H` — the marker, not the checkbox |
| `* a` / `* b` | `- x` | `- x` — an arrival is not a conversion |
| a list scope with no list item | `## H` | `- ## H` — the default |

Two of those are the rule's edges rather than its body.

**An ordered donor hands over its NUMBER.** What each member of a run finally reads belongs to
the renumbering pass, so the arrival's number is provisional either way. It still cannot be a
fixed `1.`: `reencodeIntoListScope` computes each child's indent from its parent's marker WIDTH
before any renumbering runs, so a `1.` arriving into a run of `10.` would lay its children out a
column short and the re-parse would hand them back as siblings.

**An arriving list item keeps its own marker**, which `reencodeIntoListScope` already did on the
stated ground that "an ordered payload does not silently become bullets". The same reasoning
holds in reverse — the marker is the author's. So what divides a run and what joins it now turns
on whether the arrival brought a marker of its own.

## Where it applies

A paste is not the only way to reparent a node, and the same `-` was written at every site that
converts one. Measured before the change, with `⇥` on a top-level paragraph:

```
 before          actual       expected
┆* parent       ┆* parent    ┆* parent
┆  * existing   ┆  * existing┆  * existing
┆plain┃         ┆  - plain   ┆  * plain
```

The same held for an outdent's arrival and for the siblings an outdent adopts. None of those
sites converts anything new — `encodingKindAtDestination` already made each node a list item at
its destination — so what widened is which marker the existing conversion writes.

| gesture | destination | result |
| --- | --- | --- |
| indent | `* parent` / `* existing` | `* plain` |
| indent | `8. existing` | `9. plain` — takes the next number |
| indent | no list at the destination | `- plain` |
| outdent arrival | a `*` scope | `* para` |
| outdent arrival | an `8.` scope | `9. para` |

Each of those sites already built the sibling slices `encodingKindAtDestination` reads; both
rules now take one named context, so they cannot drift onto different surroundings.

## Which regime the payload lands in

The rule above decides the marker once the payload is going to be a list item. A manual pass
found the prior question was broken in the same way: WHICH REGIME it lands in was read from the
scope, where the kind is read from the neighbours.

`destinationHeadingLevel` scanned for heading siblings and skipped everything else, so a
heading-bearing scope whose rows are list items — a list under its own heading — kept the heading
regime. Measured in the real editor, a section pasted at the end of `9. ninth` in a `1.` / `9.` /
`10.` run under an `h2` opened an `h3` between two rows of the run; among `- one` / `- two` /
`- three` under an `h1` it also swallowed `- three` into itself, a node never copied and never
pointed at.

A list item now ends that scan, so the nearest sibling expressing a regime decides:

| nearest sibling | regime | result |
| --- | --- | --- |
| a heading | heading | stays a heading at the sibling's level, unchanged |
| a list item | list | converts and joins the run |
| a paragraph or atom | transparent | scan continues past it |
| none | the parent | unchanged |

The cost: a section pasted at the END of a list under a heading joins the list rather than
opening a section after it. The nearest sibling is a list item either way, so that is the rule
applied evenly rather than an exception; appending a genuine section means putting the caret
below the list.

## What it changes below it

A converted heading pasted into an ordered run used to divide it, which is the gesture
`docs/research/ordered-run-split-numbering` measured. It now joins the run instead, so the items
below shift by one — the renumbering requirement working, not the defect that note is about. The
plain-bullet gesture that note was written for is untouched, since a pasted bullet is an arrival
rather than a conversion.

That interaction also narrowed the paste property in `renumbering-contract.test.ts`. It asserted
that a payload carrying no ordered item rewrites no ordered marker; a heading payload carries
none and now becomes one, so it no longer belongs in that property's payload set. Replacing it
with `* y` keeps the premise true and the reach the same — measured across seeds, 2573 and 2626
accepted cases with 1742 and 1777 carrying an ordered marker below the anchor, against 2561–2617
and 1671–1761 before.
