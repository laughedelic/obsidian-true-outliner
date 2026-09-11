# A provisional position's guides: what the extension carries that the typed row does not

**Measured 12 September 2026** at the pure level, against `main` at `c6b1b43`: `planKey` to drive
the keys, `materializeProbe` for what typing at the caret would produce, and `computeLineGuides`
composed the way `factsFor` composes it — the resolved outline for a position that bisects a
node, the buffer's own parse with the position's line handed over for every other one. The
defect was reported from manual testing, where it reproduces with and without a zoom.

## The report

In outline mode, a list whose parent is a PARAGRAPH: `# H` / blank / `para` / blank / `- a` /
`- b`. Enter at the end of `- b` opens an empty item; Enter again removes it and leaves a blank
line with the caret on it — a provisional position standing for a new paragraph, `para`'s sibling
at depth 1. That row's marker is crossed by `para`'s guide. Typing one character makes the node
real, and the guide on that row disappears.

## The reported shape, row by row

Buffer after Enter, Enter: `# H\n\npara\n\n- a\n- b\n\n`, caret at line 6, column 0. The
position bisects nothing. "Open" is what renders today; "typed" is the same buffer with `x` typed
at the caret; "candidate" is the rule measured further down.

| Row | Text | Open | Typed | Candidate |
| --- | --- | --- | --- | --- |
| 0 | `# H` | `[]` | `[]` | `[]` |
| 1 | | `[0]` | `[0]` | `[0]` |
| 2 | `para` | `[0]` | `[0]` | `[0]` |
| 3 | | `[0,1]` | `[0,1]` | `[0,1]` |
| 4 | `- a` | `[0,1]` | `[0,1]` | `[0,1]` |
| 5 | `- b` | `[0,1]` | `[0,1]` | `[0,1]` |
| **6** | *(caret)* | **`[0,1]`** | **`[0]`** | **`[0]`** |
| 7 | | `[]` | `[]` | `[]` |

Every row but the position's agrees. The control — the same keys on `# H` / blank / `- a` /
`- b`, where the list's parent is the heading — renders `[0]` on the position's row in all three
columns: the position stays inside the heading, so the guide it inherits is its own.

## Where it comes from

`computeLineGuides` hands every trailing-gap line the depths of the node the gap FOLLOWS. The
position's row is `- b`'s trailing gap, and `- b`'s strict ancestors are `# H` (depth 0) and
`para` (depth 1). `trimGapTails` then keeps that row whole, because an open position counts as
content for where a guide ends (`guides-end-with-content`, D4). So the row keeps `para`'s guide,
although the node the position stands for is `para`'s sibling, whose only strict ancestor is
`# H`.

The extension was built for the opposite case: a position opened past a subtree's last content
line, inside that subtree, whose marker would otherwise sit below a guide that stopped above it.
There, every guide the gap inherited is one the new node really has. The rule cannot tell that
case from this one, because it never asks which guides the new node has.

The spec prescribes the behaviour. `outline-decorations`' "A provisional position renders as the
node it would become" says WHICH guides extend "still comes from the document as it actually is —
a position adds no depth to a line and removes none". The same requirement says the position's
row renders "at exactly the column that row renders at once its content is really there", and its
scenario "Typing changes nothing this layer contributes" lists the guides among what must not
change as the character lands. The sentence contradicts both.

The upward carry in `trimGapTails` takes the same over-extension onto every blank row between the
position and the last content line above it, since each of those rows keeps what the position's
row carries.

## How far it reaches

Every blank line `materializeProbe` accepts is a position, with the caret at the line's end and
at column 0 (where the two differ), across 3000 `arbMarkdownText` documents and 600 `arbTree`
documents (`tests/generators.ts`, fast-check seed 42). Each position is compared with its typed
counterpart on the rows the extension governs: the position's own row, and the run of blank rows
directly above it. Other rows are left out on purpose. Typing makes the node real, and a real node
legitimately changes the rows around it.

| | `arbMarkdownText` | `arbTree` |
| --- | --- | --- |
| Positions (bisecting / new node) | 1107 (349 / 758) | 23708 (315 / 23393) |
| Bisecting: row equals typed | 349 of 349 | 315 of 315 |
| New node: row equals typed | 625 | 4193 |
| New node: row carries a guide typed does not | 125 | 18933 |
| New node: typed carries a guide the row does not | 8 | 267 |
| New node: blank run above differs from typed | 7 | 2032 |

Both guide tracks are affected. In `arbMarkdownText`, 19 of the 125 over-extended rows are over
on the list track.

The over-extension is not confined to the reported shape. By what the typed row turns out to be:

| Typed row | `arbMarkdownText` | `arbTree` |
| --- | --- | --- |
| A new node's first line, paragraph | 67 | 16030 |
| A new node's first line, heading | 11 | — |
| A continuation line, paragraph | 46 | 2903 |
| A continuation line, list item | 1 | — |

The `arbTree` count is high because that generator's paragraphs own lists and every file it
encodes ends in a blank line. The shortest counterexample it shrinks to, `3 4` / blank / `- E,` /
blank with the caret on the last row, is the reported shape in miniature. The continuation case
is a different road to the same place: `v6` / blank / `- 0'--` with the caret on row 1 at column 0.
Typing there makes a second line of `v6`, and a node's own line never carries that node's guide.
Today, though, the row carries it, because it is the gap before `v6`'s first child.

## A candidate rule, measured

The candidate: the position's row keeps only the depths its typed row carries (the intersection
with what it carries today), and the blank run above it narrows with it through the same upward
carry. On the governed rows it agrees with the typed document for every bisecting position, and
for 750 of 758 and 23126 of 23393 new-node positions.

Every residual goes the same direction: typed carries a depth the candidate does not. There are 9
residual rows in `arbMarkdownText` and 267 in `arbTree`. For each one, the measurement checked
that the missing depth is the depth of the materialized node's parent, and that the parent has no
children in the document. That held in every case, checked one by one, not sampled. The shortest
example is `## d4. ` followed by the blank line the caret sits on.

That residual is the case the requirement keeps on purpose: "A childless heading with an Enter
position below it renders as childless". A guide at the heading's depth is that heading rendered
as a parent. Taking the typed row's guides outright, rather than intersecting with them, would
render the parent that way, so the intersection is the rule. Both its halves are already in the
requirement: the row carries only guides the node it stands for would have, and only guides the
document already has.

## What this does not cover

- **A zoom.** Measured unzoomed only. On `main`, the non-bisecting branch of `factsFor` computes
  guides from the whole note even inside a zoom, and the materialized parse is of the whole note
  too, so the two agree on line numbers. Re-basing positions under a zoom is PR #87's subject.
- **The rendering itself.** Everything here is facts. The rendered check is the e2e case in the
  change that acts on this note.
- **The accent layer.** An accent already renders only at a depth its line carries a guide at
  (`guides-end-with-content`, D5b), so narrowing the guide narrows the accent with it.
