# The placement grammar: where a node can stand, and what it becomes

[node-kind-grammar.md](node-kind-grammar.md) records the model the drop, paste, indent and outdent
share, and proposes two routes toward one grammar: write the model down and check it, then give
the reader a choice where it has more than one answer. This note takes the first route whole and
the second as far as a recommendation. It writes down which parent can hold which kind, states
each operation as a tree edit plus one conversion, measures every operation against that
statement over generated notes and over an exhaustive table of small contexts, and ends with the
list of places where the conversion has more than one legitimate answer and a recommendation for
each. The measurement also found eight places where an operation writes something the grammar
does not admit; those are defects, recorded here with the shapes that reach them.

Every drawing below is the outline as it renders, one indent step per depth, each node's own
Markdown after it. `┆` marks a column's left edge. A number row under a place names the landing
columns there, each number under the depth it lands at. The drawings show structure, not the
caret.

## The grammar

What `parse` admits, read from `src/parse.ts`. Each line constrains the children of one kind of
node:

```
Root        ::= Section(0)
Section(n)  ::= Content* Heading*       all content before the first sub-heading;
                                        sub-heading levels deeper than n, non-increasing
Content     ::= Para | Item | Atom      no Item directly after a Para
Para        ::= para[ Item* ]           a paragraph in a section owns the list after it
Item        ::= item[ (Item | Leaf | Atom)* ]
Leaf        ::= para[ ]                 a paragraph inside a list item holds nothing
Heading(m)  ::= heading_m[ Section(m) ]
Atom        ::= atom[ ]                 code, table, quote, callout, html, hr
```

In words:

- A heading's children are its section, and a section writes its content first and its
  sub-headings after it: content placed after a sub-heading is inside that sub-heading. A deeper
  heading written after a shallower sibling nests into it, so sibling levels never increase.
- A paragraph at section level adopts the list items that follow it — the attachment rule, Q34 in
  [open-questions.md](open-questions.md), explored in
  [list-paragraph-mapping.md](list-paragraph-mapping.md). The rule applies at section level only;
  inside a list item a paragraph holds nothing and a list item after it is its sibling.
- An atom holds nothing, and a paragraph holds only list items, so an atom cannot be a paragraph's
  child.
- A heading, quote, callout, `hr` or `html` block opens only within three columns of the margin
  (`OPENING_MARGIN`). Nested past that inside a list, the same line reads as a paragraph
  ([seams-across-a-re-indent.md](seams-across-a-re-indent.md)); the grammar's kinds are the kinds
  as written, not as intended.

Each rule constrains a sibling list to a regular language over a finite alphabet of child kinds —
`h1` to `h6`, paragraph, list item, atom — so the grammar is a regular hedge grammar and
admissibility is one local check per sibling list. A checker is one walk over the tree.

## An operation is a tree edit plus one conversion

Every operation that moves or inserts a run removes it from one place and inserts it at a parent
and an index, optionally at a heading level the destination names. Where the run's kind is not
admissible there, a conversion decides what it is written as, or refuses it. Today the conversion
is spread over `forcedContentKind`, `nativeContentKind` and `destinationHeadingLevel` in
`src/rules.ts`, `reencodeIntoListScope` in `src/ops.ts`, and `keptHeadingLevel` in
`src/drop-destinations.ts`.

Two effects follow from the encoding rather than from the edit, and both reach nodes outside the
run:

- **Absorption.** A heading placed before content siblings takes them into its section.
- **Adoption.** A paragraph placed right before a section-level list item takes the list.

There are two conversion functions in the system, not one. The explicit one writes the run; the
implicit one is the re-parse `finalize` runs on what was written. Wherever the two disagree, the
tree the operation built is not the tree the note holds, and the difference is either an effect
the operation declares (the drop's preview draws absorbed rows) or a defect. The suite's closure
property (`tests/closure.test.ts`, 5.1) compares the result with the parse of its own encoding,
but the result it is handed is already that parse, so it holds for any surgery and cannot see a
disagreement. What can see one is an expectation stated per node: where the operation says each
node lands, compared with where it does.

## How we measured

Three probes, kept in [prototypes/node-placement-sweep/](prototypes/node-placement-sweep/):

- **A labelled generator.** Every node carries a unique label, so it can be followed across the
  re-parse. Over `tests/generators.ts`'s `arbTree` it adds a paragraph inside a list item, tasks,
  ordered and `*` items, a list item carrying a `#` run, every atom kind in sections and in list
  items, root-level `h1` sections, and sub-headings one or two levels deeper than their parent.
  `arbTree` generates none of the first four, and the drop's committed agreement property runs on
  it, which is why the defects below did not surface there.
- **Sweeps.** 150 generated notes, seed 42. Every labelled node was dragged, as a single-root run,
  to every destination `dropSeams` offers: 341,585 destinations. For each, every labelled node's
  parent after the release was compared with the one the preview names: the run under the
  candidate's parent, each absorbed row under the run, every other node where it was. Where the
  run left its scope and the drop named no level, the same payload was pasted at the same parent
  and index in the note with the run removed. Then the run was moved back to its original parent
  and index. Separately, every labelled node was indented, outdented, moved up and moved down, and
  a copy of each of the first twelve subtrees was pasted with the caret on every node, at the place
  the paste layer's own rule (`pasteAnchor` in `src/enforce.ts`) resolves.
- **An exhaustive context table.** Twenty-five small destinations — a heading's children after and
  between each kind of sibling, a paragraph's list, a list item's children after each kind of
  child, a paragraph inside a list item — each crossed with six moved kinds: paragraph, list item,
  task, `h3`, a list item carrying `###`, and a code block. For each pair every plausible writing
  of the node was written at the place by hand and re-parsed: `h1` to `h6`, a paragraph, a list
  item with and without the `#` run, a task, the atom. A writing is admissible when the node lands
  under the parent the place names and no other node moves; admissible with absorption when the
  only nodes that move go under it. The table also records what the drop and the paste write
  there.

## What the sweeps found

Of the 341,585 drop destinations, 299,240 land every labelled node where the preview says. The
rest, by the shape that moves a node the preview did not account for (a destination can show more
than one):

| Shape | Destinations | Section |
| --- | --- | --- |
| The run lands under another node than the preview's | 16,897 | D1, D3 |
| A row the run absorbs lands under the run's last node, not the run | 15,295 | A6 |
| A descendant of the run falls out of it | 7,983 | D2 |
| A row below the run lands under a node outside the run | 1,901 | A6 |
| The run's removal re-parents a neighbour | 859 | A9, #206 |
| The run adopts a list after it, undrawn | 297 | D5 |
| A node is lost, merged into its neighbour | 176 | D2 |

What the run was written as: its own kind at 253,220 destinations, a paragraph written as a list
item at 54,502, a heading written as a list item at 17,156, and a list item written as a paragraph
— the attachment rule's forced conversion — at 16,707.

The other operations, over the same 150 notes:

| Operation | Accepted | Every node where named | Differs |
| --- | --- | --- | --- |
| Indent | 1,315 | 1,156 | 124 land under another node (D3), 36 lose a descendant (D2), 3 take in what follows (D1) |
| Outdent | 2,271 | 1,730 | 267 land under another node (D7, D1), 358 scatter the siblings they adopt (D7, D2), 152 lose a descendant (D2), 47 take in what follows (D1) |
| Move up, move down | 3,689 | 3,662 | 27 re-parent a neighbour (A9) |
| Paste | 41,483 | 40,738 | 431 absorb by design, 263 land under another node (D1, D8), 183 absorbed rows reach the payload's last node (A6), 36 adopt a list (D5) |

Where the drop and the paste name the same destination — the run leaves its scope and the drop
names no level of its own — they wrote the same node under the same parent at all 231,084
destinations compared. The one place they differ is the one
[node-kind-grammar.md](node-kind-grammar.md) records as deliberate: at 1,088 destinations the drop
keeps a heading a heading among a heading's list items and the paste writes it as a list item
(A1 below).

Moving the run back to its original parent and index restored the note's tree at 212,499 of
338,119 destinations. The largest classes that did not: a paragraph that had become a list item
(42,190), absorption (22,759), a heading that had become a list item carrying its `#` run
(16,251), and a list item that had become a paragraph (10,739). A conversion into a list item is
never undone on the way back, because a list item keeps its kind wherever it can stand; A5 below
is the one conversion whose way back is written into the node.

## Defects: where the explicit conversion writes what the grammar does not admit

Eight shapes, each an operation accepting a destination and writing a node the re-parse reads
differently. None is a question of preference; each has one admissible answer or a refusal. Each
is proposed as an issue rather than fixed here.

**D1. A list item carrying a `#` run, converted to a paragraph, is written as a heading.** The
conversion strips the list marker and leaves `### H`, which is a heading line. Reached wherever a
list item is forced to a paragraph: dropped or pasted right after a section-level paragraph, or
after a paragraph inside a list item (D6), or outdented into a paragraph's list. At section level
the heading takes what follows it into its section; inside a list the line leaves the list for the
top level. 1,464 drop destinations, 184 of the paste measurements, and the outdent cases above.

```
 before     drop H after P, under x
┆- x       ┆- x
┆  P       ┆  P
┆- ### H   ┆### H
```

**D2. A list item converted to a paragraph strands every child that is not a list item.** A
paragraph holds only list items, so the item's code blocks, quotes and paragraph children fall out
to the parent's level, and every list item after the first of them follows, since the atom now
separates it from the paragraph. 7,983 drop destinations lose a descendant this way. Where a
stranded line merges with a neighbour the node is lost, at 176: nearly all a quote nested past the
opening margin, which reads as a paragraph there and runs into the converted paragraph's own line.
One of them is a paragraph run merged into its neighbour, which this pass did not examine. The same
fall-out happens to a paragraph that owns a list when it lands under a list item beside a paragraph
child, where it keeps its kind and its list items become the item's.

```
 before          drop x right after P
┆P              ┆P
┆```c```        ┆x
┆- x            ┆```code```
┆  ```code```   ┆- y
┆  - y          ┆```c```
```

**D3. A paragraph inside a list item is offered as a parent.** The grammar gives it no children.
The drop offers the column one level inside it, the preview names it, and the run lands under the
enclosing list item instead; indent accepts it as a target and writes nothing, where a refusal
would say why. 15,433 drop destinations and all 124 indent cases.

```
 place    drop y at 2    ⇥ on y, with y after P under x
┆- x     ┆- x           ┆- x
┆  P     ┆  P           ┆  P
┆    2   ┆  - y         ┆  - y
┆- y
```

**D4. The preview draws absorbed rows one level inside the run; the release puts them under the
run's last node.** Recorded as an ambiguity, A6 below, because deciding where the rows should go is
the choice; that the preview and the release disagree is the defect.

**D5. A paragraph written right before a section-level list adopts it, and nothing says so.** The
kind rule reads its donor across atoms, so a paragraph arriving between an atom and a list, with
another paragraph before the atom, keeps its kind and takes the list. The same adoption follows a
reorder: the drop's in-scope path and move up and down refuse a list item landing after a
paragraph, but not a paragraph landing before a list item. 297 drop destinations and 36 pastes.

```
 before       drop Q between the code and y
┆## A        ┆## A
┆  P         ┆  P
┆  ```c```   ┆  ```c```
┆  - y       ┆  Q
             ┆    - y
```

**D6. The kind rule applies the attachment rule inside a list item, where the parse does not.**
`forcedContentKind` converts a list item whose preceding sibling is a paragraph, whatever the
parent. Under a list item that paragraph adopts nothing, so the conversion is not forced: a list
item dropped there becomes a paragraph for no reason, and a task is refused a destination it could
take as it is.

```
 place    drop y at 1
┆- x     ┆- x
┆  P     ┆  P
┆  1     ┆  y
┆- y
```

**D7. Outdent takes an atom out of a paragraph's list.** An atom cannot be a paragraph's child, so
outdenting one from a list item whose parent is a section-level paragraph lands it a level further
out than the operation names, and the siblings it should adopt, which an atom cannot hold, land at
section level.

```
 before         ⇧⇥ on the code
┆P             ┆P
┆  - x         ┆  - x
┆    ```c```   ┆```c```
┆    - y       ┆- y
```

**D8. A heading pasted after a paragraph that follows a list becomes that paragraph's child.** The
level rule treats paragraphs as transparent, finds the list item beyond, and converts the heading
to a list item, which is then written right after the paragraph. The drop settled the same shape by
keeping a dragged heading a heading ([node-kind-grammar.md](node-kind-grammar.md), the 57
destinations of its first sweep); the paste still has it.

```
 before    paste ### H, caret on P
┆## A     ┆## A
┆  - x    ┆  - x
┆  P      ┆  P
          ┆    - ### H
```

## The answer sets, measured

The context table, grouped and reduced to the rows where keeping the kind and joining the
neighbours disagree, or where the code's answer is not admissible; the full table of 150 pairs is
in the probe's README. "Clean" writings land under the named parent and move nothing; "absorbing"
ones take what follows.

| Place | Moved | Clean | Absorbing | Drop writes | Paste writes |
| --- | --- | --- | --- | --- | --- |
| a heading's children, after the last list item | `h3` | `h3`–`h6`, `- ### H`, `- H` | — | `h3` | `- ### H` |
| a heading's children, before or between list items | `h3` | `- ### H`, `- H` | `h3`–`h6` | `h3`, absorbing | `- ### H` |
| a heading's children, before a paragraph | `h3` | `- ### H`, `- H` | `h3`–`h6` | `h3`, absorbing | `h3`, absorbing |
| a heading's children, after a paragraph, an atom, and before a list item | paragraph | list item | paragraph | paragraph, absorbing | paragraph, absorbing |
| a heading's children, after a list item | paragraph | paragraph, list item | — | list item | list item |
| a heading's children, after an atom, or alone | list item carrying `###` | `- ### H`, `h3`, `h4` | — | `- ### H` | `- ### H` |
| a heading's children, after a paragraph | list item carrying `###` | `h3`, `h4` | — | `### H`, its level from its own run (D1) | the same |
| a heading's children, after a sub-heading that skips to `h5` | `h3` | `h3`, `h4`, `h5` | — | `h5` | `h5` |
| a list item's children, except after a paragraph child | paragraph | paragraph, list item | — | list item | list item |
| a list item's children, after a paragraph child | list item | list item, paragraph | — | paragraph (D6) | paragraph (D6) |
| a list item's children, after a paragraph child | list item carrying `###` | `- ### H` | — | `### H`, leaves the list (D1) | the same |
| a list item's children, after a paragraph child | task | task | — | not offered (D6) | refused (D6) |
| a paragraph inside a list item | anything | — | — | offered, lands under the item (D3) | not reachable |
| a heading's children, after a sub-heading | any content | — | — | not offered | lands in the sub-heading's section |

The last row is the insertion API rather than the paste: `insertSubtrees` accepts content after a
heading sibling, which the paste's caret rule never names and the drop filters out.

## The ambiguous cases

A case is ambiguous where the table has more than one clean writing, or only absorbing ones beside
a clean one. Read against the rules in force, every such row is a place where two readings are
both admissible and disagree:

- **keep the kind** — the node is written as what it is wherever the destination can hold it;
- **join the neighbours** — the node is written in the regime of the rows around the insertion
  point: among list items a list item, among paragraphs and headings a paragraph or a heading.

The operations do not choose between them the same way. For a paragraph both join; for a list item
both keep; for a heading among list items the drop keeps and the paste joins; for a list item
carrying a `#` run both keep, except where D1 converts it by accident.

The recommendations below follow one principle, which the settled answers already mostly obey:
**a mark an author wrote is kept, the unmarked kind joins its neighbours, and a node takes in its
neighbours only where the operation draws that before the write.** A list marker, a checkbox and a
`#` run are marks; a paragraph is the unmarked encoding of a content node. A conversion the
destination forces may drop the one mark it has to — a list item's marker, after a paragraph — and
is refused where it would drop a second. What follows is each case, with the answers the table
admits and a recommendation.

### A1. A heading placed among a heading's list items

```
 place
┆## A
┆  - x
┆0 1 2
┆  - y
```

```
 drop at 0    drop at 1    drop at 2      paste, caret on x
┆## A        ┆## A        ┆## A          ┆## A
┆  - x       ┆  - x       ┆  - x         ┆  - x
┆## H        ┆  ### H     ┆    - ### H   ┆  - ### H
┆  - y       ┆    - y     ┆  - y         ┆  - y
```

At 1 the drop keeps the heading, which takes `- y`; the paste, whose caret names no column, writes
it as a list item that joins the list (#190). Both are clean or declared. The drop's preview draws
the absorption; the paste has nothing to draw it with, and the absorption is what #190 removed.

**Recommendation: keep the split, and give the drop the other answer in place.** The principle
that separates them is that absorption is acceptable where it is drawn. A modifier held while
aiming would switch the drop from keeping the kind to joining the neighbours, the preview drawing
whichever is active. The paste keeps #190; a toggle after the paste is the in-place alternative if
this case turns out to matter in use, and is not recommended ahead of that.

### A2. A paragraph placed among list items, where a paragraph can stand

```
 place
┆## A
┆  - x
┆  - y
┆  1 2
```

```
 drop Q at 1    drop Q at 2    keeping the kind at 1
┆## A          ┆## A          ┆## A
┆  - x         ┆  - x         ┆  - x
┆  - y         ┆  - y         ┆  - y
┆  - Q         ┆    - Q       ┆  Q
```

At 1 a paragraph is admissible after the list; under a list item it is admissible as a paragraph
child. Both operations write a list item. [node-kind-grammar.md](node-kind-grammar.md)'s table
says a paragraph keeps its kind "wherever a paragraph can be written"; the code joins the list
here, and the table should say so.

**Recommendation: a rule — join the neighbours, for both operations.** A paragraph carries no
mark of its own: it is the unmarked encoding of a content node. The list marker, the checkbox and
the `#` run are marks an author wrote, and those are kept; the paragraph takes the kind of the
rows it lands among. That is the reading `nativeContentKind` already encodes, and it matches the
drop's settled answer for list items (keep, section 6h of
[node-drag-and-drop.md](node-drag-and-drop.md)). The modifier from A1, where built, offers the
paragraph.

### A3. The level of a heading in a scope that skips levels

```
 place
┆## A
┆  ##### S
┆    P
┆  1
```

`h3`, `h4` and `h5` are all clean at 1. The sibling reading writes `h5`; the parent reading `h3`.
Settled in section 6h of [node-drag-and-drop.md](node-drag-and-drop.md) for the sibling reading,
which never takes in rows nobody pointed at, and the drop offers the shallower levels as columns
of their own. **Recommendation: a rule, as it stands.**

### A4. A heading placed under content: does it keep its `#` run?

```
 run       dropped under x, today    without the # run
┆## H     ┆## A                     ┆## A
┆  text   ┆  - x                    ┆  - x
          ┆    - ## H               ┆    - H
          ┆      - text             ┆      - text
```

Both are clean. `- ## H` is a list item containing a heading in CommonMark, rendered with heading
styling; `- H` is a plain item. The preference is a reader's and does not change per action.
**Recommendation: a setting, on by default** — keeping the run is what A5 depends on.

### A5. A list item carrying a `#` run, placed where a heading can stand

```
 place
┆# A
┆  ```c```
┆  1
┆  ## B
┆    - ### H
```

```
 drop at 1, today    the heading it carries
┆# A                ┆# A
┆  ```c```          ┆  ```c```
┆  - ### H          ┆  ### H
┆  ## B             ┆  ## B
```

Both are clean. `headingAsListItem` keeps the run so that "the rank survive[s] a move into a list
and come[s] back on the way out", but no path brings it back except D1's accident. The cost shows
in the round trip: a section dragged into a list and back is a list.

```
 before      H dropped under x    and dropped back under B
┆## A       ┆## A                ┆## A
┆  - x      ┆  - x               ┆  - x
┆## B       ┆    - ### H         ┆## B
┆  ### H    ┆      - text        ┆  - ### H
┆    text   ┆## B                ┆    - text
```

**Recommendation: a rule — it stays a list item, and D1's forced case is refused, as a task's is;
the drop's modifier offers the heading.** A list item was written as a bullet, whatever follows its
marker, and keeping the kind is the drop's default everywhere else. A conversion that cannot keep
a node's marks — a task's checkbox, a `#` run that would turn a paragraph into a heading — is
refused rather than written. The heading answer is then one modifier away, drawn before release,
which is where a conversion that absorbs belongs.

### A6. Where the rows a heading absorbs go

```
 place     run     preview draws    release writes
┆# A      ┆## H   ┆# A             ┆# A
┆  - a1   ┆  P    ┆  - a1          ┆  - a1
┆  1              ┆  ## H          ┆  ## H
┆  - a2           ┆    P           ┆    P
                  ┆    - a2        ┆      - a2
```

```
 place    run        preview draws    release writes
┆# A     ┆## H      ┆# A             ┆# A
┆  P1    ┆  ### S   ┆  P1            ┆  P1
┆  1                ┆  ## H          ┆  ## H
┆  P2               ┆    ### S       ┆    ### S
                    ┆    P2          ┆      P2
```

Absorbed rows keep their own lines, so they re-parse against whatever the run's own section ends
with: its last sub-heading's section, the list its trailing paragraph adopts, the children of its
trailing list item. At a heading's levelled column inside a list — written between a list item and
its children — the rows keep an indentation that belonged to the list they were cut from, and an
indented quote among them re-reads as a paragraph. 15,295 drop destinations send absorbed rows
under the run's last node and 1,901 under a node outside the run. 13,768 of those are levelled
columns inside a list, 2,226 levelled columns elsewhere, and 1,202 the plain and kept-heading
columns.

The legitimate answers: the rows join the run's trailing edge, as written; the rows become the
run's direct children, which needs them re-encoded, and is not always expressible — content cannot
precede the run's own sub-headings without reordering them, and list items cannot follow the run's
trailing paragraph as siblings while the attachment rule holds.

**Recommendation: a rule — the rows go where the text puts them, and the preview reads that from
the release.** The preview already takes the run's own first line from the re-encode the release
applies; the absorbed rows' depths should come from the same place, the re-parse of the written
result, so the preview is the release by construction. Levelled columns inside a list item's
subtree should not be offered: the rows below them belong to that list, and what they become there
is not a heading's section.

### A7. Outdent of a heading's direct child (#200)

```
 before    ⇧⇥ on b, today    #200's reading 1
┆# Top    ┆refused          ┆# Top
┆  - a                      ┆  - a
┆  - b                      ┆  b
```

The grammar has no position one level out: content after a heading's section is inside the next
section. The answers are a refusal and a change of kind in place.

**Recommendation: a rule — #200's reading 1**, with the refusals A5 names: a task, a list item
carrying a `#` run, and a list item with a child that a paragraph cannot hold (D2) are refused.
The list items following `b` become its children by the attachment rule, which is outdent's own
reading anyway: the node adopts the siblings after it. A paragraph directly under a heading has
no outer form and stays refused.

### A8. Direct or logical outdenting

```
 before    ⇧⇥ on b, today    logical outdenting
┆- a      ┆- a              ┆- a
┆  - b    ┆- b              ┆  - c
┆  - c    ┆  - c            ┆- b
```

Outdent keeps the node where it is on screen and hands it its following siblings (direct, Logseq's
default); logical outdenting moves it past them and leaves them with the parent. Both are clean for
list items and paragraphs. A heading's level change is positional and always direct. This is a
choice about the tree edit, not the kind, and the preference is stable. **Recommendation: a
setting**, with Logseq's "logical outdenting" as the precedent; not urgent.

### A9. A neighbour the attachment rule moves

```
 before       drop Q between the code and y    move P down
┆## A        ┆## A                            ┆## A
┆  P         ┆  P                             ┆  ```c```
┆  ```c```   ┆  ```c```                       ┆  P
┆  - y       ┆  Q                             ┆    - y
             ┆    - y
```

Two sides of one rule. A paragraph arriving right before a section-level list adopts it (D5); a
removal that takes an atom out from between a paragraph and a list lets the paragraph adopt it
(#206, 859 drop destinations and all 27 reorder cases). In the table, the clean answer on the
arrival side is a list item.

**Recommendation: on the arrival side, a rule — a paragraph whose next section-level sibling
would be a list item is written as a list item**, which is the join-the-neighbours answer A2
already gives, read on the following side too; the reorder guard asks the same question of the
node after the pair. On the removal side the choice #206 lists stays open; drawing the re-parented
neighbour is the answer that rewrites nothing nobody moved. Both sides vanish under Q34's readings
C and D, as do D2, D5 and D6 and A6's trailing-paragraph case: every forced conversion of a list
item into a paragraph is the attachment rule's, 16,707 of the 341,585 drop destinations.

### A10. An arriving list item's marker, in a run of another type

```
 before    drop - n between x and y
┆## A     ┆## A
┆  1. x   ┆  1. x
┆  2. y   ┆  - n
┆  3. z   ┆  2. y
          ┆  3. z
```

An arrival keeps its own marker and divides the run; a converted node takes the run's
([destination-list-style.md](destination-list-style.md)). Keeping the marker is keeping the kind;
taking the run's is joining the neighbours. **Recommendation: a rule, as #190 settled it, and the
drop's modifier switches the marker with the kind.**

## The recommendations together

| Case | Kind of answer | Recommendation |
| --- | --- | --- |
| A1 heading among list items | in place | drop keeps the heading, a modifier joins the list; paste joins |
| A2 paragraph among list items | rule | join the list, for both |
| A3 level where the scope skips | rule | the sibling reading, as settled |
| A4 heading under content keeps its `#` run | setting | on by default |
| A5 list item carrying a `#` run where a heading can stand | rule, with the modifier | stays a list item; refused where forced to a paragraph |
| A6 where absorbed rows go | rule | where the text puts them, drawn from the release; no levelled columns inside lists |
| A7 outdent of a heading's direct child | rule | kind change in place (#200 reading 1), with A5's refusals |
| A8 direct or logical outdenting | setting | direct by default |
| A9 a neighbour the attachment rule moves | rule | arrival writes a list item; removal as #206 decides |
| A10 an arriving marker | rule, with the modifier | keep it |

The in-place choice is one modifier with one meaning — the reading the default did not take — rather
than a modifier per case: it joins the neighbours where the drop keeps the kind (A1, A5, A10) and
keeps the kind where the drop joins (A2). It applies to the drop only, because only the drop draws
its answer before the write. A choice made after the drop, with the write held until the reader
picks, would cost an interaction at every ambiguous place, where the modifier costs one only when
the reader wants the other answer; a toggle after a paste stays the paste's candidate, since a paste
has no preview to hold the modifier against.

## Properties for the suite

Each is stated with what it would have caught; the figures are the sweeps above.

1. **The parse's output is admissible.** A grammar checker, one walk, run over `arbMarkdownText`.
   It changes when the grammar does — under Q34's readings C and D it loses the attachment rule —
   and it is the oracle the rest compare against.
2. **Every operation lands every node where it says.** Labelled notes; for each accepted
   operation, every node's parent after it equals the operation's own statement: the run under the
   named parent, its descendants where they were, every bystander where it was unless the
   operation declares it absorbed. This is the observable form of the closure the `Surgery`
   docstring claims and 5.1 cannot check. It catches D1 to D8 and #206.
3. **The preview is the release, whole.** The drop's agreement property extended from the run's
   root to the absorbed rows and their depths, and to runs carrying an atom. Catches A6's
   disagreement.
4. **A drop and a paste naming the same destination write the same thing.** Held at every
   destination compared; the one declared exception is A1.
5. **A move and its reverse restore the note, where nothing converted or absorbed.** Pins which
   conversions are reversible; with A5's rule the heading's round trip joins them.
6. **Conservation over the labelled generator.** 5.5's node count, run where quotes and paragraphs
   nest inside list items; catches D2's lost node, which the current generator cannot build.
7. **The context table as a unit test.** Twenty-five places by six kinds, bounded and exhaustive:
   the admissible writings and the chosen one per cell. It is the grammar's local rule written as
   data, and the place a changed recommendation shows up as a changed row.

The generator for 2 to 6 is `arbTree` plus labels and the shapes it lacks: paragraphs inside list
items, tasks, ordered and `*` items, list items carrying a `#` run, every atom kind at every depth,
and skipped heading levels. Each property's negative control is the defect it names: reverting the
fix must make it fail.

## Formalizing the grammar further

Whether the grammar is worth stating in a proof assistant, as a regular tree language with a
repair function, as a lens between text and tree, or checked with a model finder, is a separate
survey and not taken up here. What this note uses of that space is the part the suite can run — a
local admissibility check, a bounded exhaustive table and properties over generated notes.

## Open

- The defects D1 to D8, each proposed as an issue.
- The modifier's key and the preview's drawing of both readings: a design for the drag, not
  measured here.
- Whether paste needs an in-place alternative for A1: a question for use, not for measurement.
- Q34, which removes D2, D5, D6, A9 and part of A6 whichever of its leaf readings is taken.
