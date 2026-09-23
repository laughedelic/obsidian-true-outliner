# What a node becomes where it lands

Every operation that puts a node somewhere new — a drop, a paste, an indent, an outdent — answers
the same question: what does this node become at this destination? The answers were settled one
case at a time as each operation met them, and the node drag (`drag-nodes-with-a-drop-preview`)
was the first surface to show the answer before the write, so its manual passes kept finding
places where two settled answers disagreed. This note records the model those answers share, the
one place the drop and paste now differ on purpose, what a mechanical sweep of the drop found, and
the two routes toward a grammar the operations can share without surprises.

## Where a node can land

A place between two rows offers several columns, and each column names a parent. Drawn as the
outline renders — one indent step per depth — with the columns numbered under the place:

```
┆## A
┆  ### B
┆    P
┆1 2 3 4
```

A heading `## X` dropped here, as the drop writes it: 1 is A's sibling `## X`; 2 is B's sibling
`### X`; 3 is B's child, still a heading, `#### X`; 4 is P's child, written as a list item that
carries its own `#` run as text, `- ## X`.

Position 4 keeps the heading's visual level while nesting it deep; whether a heading written as a
list item keeps its `#` run is open, and a candidate for a setting rather than a rule.

## The principle

A node keeps its kind wherever the destination's parent can hold it, and converts only where it is
forced; where it is forced, the context decides what it becomes. The rules in force, read against
that principle:

| Moved node | Keeps its kind | Forced, and what it becomes |
| --- | --- | --- |
| List item | Everywhere a list item can be written | Right after a paragraph, where the attachment rule would make it that paragraph's child: a paragraph. A task cannot be one, so that destination is refused |
| Paragraph | Wherever a paragraph can be written | Under a list item or a paragraph: a list item |
| Heading | Under a heading or at the top level, at the level of the nearest heading sibling, else one inside the parent | Under a paragraph or a list item: a list item carrying its `#` run |
| Atom (code, table, quote, callout) | Everywhere it can be written | Below a paragraph no encoding exists, so the destination is refused |

A node CREATED at a destination — the first child a split materialises — has no kind to keep and
takes the scope's own.

A run that stays in its own parent is a reorder and keeps its lines, except where, kept as
written, it would re-parse under the sibling it lands after: a heading after a shallower heading
sibling would join that sibling's section, and a list item right after a paragraph would be its
child. Those take the answers a run arriving from elsewhere gets.

## Where the drop and paste differ

One place, on purpose: a heading placed among a heading's list items. Paste writes it as a list
item that joins the list (#190); the drop keeps it a heading, B's child in the drawing above, and
its section takes what follows it, which the preview draws.

The two operations have different information. A drop names a column — a precise position between
two rows and the parent at that depth — so the column says whether "B's child" or "the item's
child" was meant, and both are offered. A paste lands at the caret, whose line is the only signal:
a caret on a list line reads as "into this list", and that is the assumption #190 encodes. A
reader who wants a different parent for a paste opens a provisional node where it should land
(Enter), pastes there, and re-indents. That is the intended route; in practice it is likely more
limited than it sounds, and a paste may still need an alternative of its own.

## What the drop's sweep measured

A property over generated notes — some headings written a level deeper so that notes skip levels,
runs of one to three roots taken the way a cover is — moved each run to every destination the drop
offers and compared the node the preview names as the parent with the node the release lands it
under. Destinations whose parent line is not unique in the note are skipped, since the comparison
is by line.

| State of the drop | Destinations | Landed elsewhere |
| --- | --- | --- |
| Before (levelled columns fixed, [node-drag-and-drop.md](node-drag-and-drop.md) section 6l) | 58,077 | 60: 57 a heading converted to a list item after a paragraph, 3 a heading reordered past a shallower sibling |
| Heading kept a heading where its parent can hold one; reorder re-levelled | 55,005 | 6: a list item reordered to right after a paragraph |
| List item after a paragraph written as a paragraph in a reorder too | 57,066 | 1: taking an atom out from between a paragraph and a list lets the list attach to the paragraph |
| Runs carrying no atom | 192,520 | 0 |
| The committed property, 20,000 notes | — | 1: a cover whose roots have different parents, dropped at its first root's own place, was taken as a no-op there and skipped the kind rule |
| Only a run whose roots share a parent has an own place; the same seed, 20,000 notes | — | 0 |

The atom shape is the removal's rather than the destination's: the run's own removal moves a
neighbour, and nothing the drop draws says so. It is open. The committed property checks the
parent for every run that carries no atom, at 150 notes per run of the suite, so a shape this rare
surfaces over many runs rather than one.

## Two routes toward a shared grammar

The rules above were each settled locally, and a later operation keeps finding the seams between
them. Two routes, complementary rather than alternative.

**A formal grammar.** The model is small enough to write down whole:

- which parent kinds each node kind is admissible under;
- the encoding — how a tree is written as Markdown, and that the parse reads it back;
- each operation as a tree edit, plus ONE conversion function: what a node becomes where its own
  kind is not admissible.

The soundness properties follow: the round trip; every operation produces an admissible tree; the
preview is the release, parent included; a drop and a paste that name the same destination write
the same thing. Most are checkable as properties over the generators the suite already has, so the
proof can be the suite rather than a paper. What the formal work produces is a short, explicit
list: the places where the conversion function has more than one legitimate answer. Those, and
only those, are the genuinely ambiguous cases.

**A choice for the reader.** For that list, and only for it:

- a SETTING where the preference is stable. Whether a heading written as a list item keeps its `#`
  run is one. Logseq's "logical outdenting" is the precedent: an outdented block either moves past
  its parent's siblings or stays in place and takes the following siblings as its children, and
  the reader picks the reading that feels natural;
- a CHOICE in place where it varies per action. For a drop, a modifier held while aiming, with the
  preview showing each answer live, avoids a popup; for a paste, a toggle after the paste, as word
  processors offer for formatting.

## Open

- The removal that moves a neighbour (the sweep's atom shape).
- Whether a heading written as a list item keeps its `#` run (position 4).
- Whether paste should keep #190 or follow the drop, which is the grammar's question rather than
  either operation's.
- Outdent of a list item that is a heading's direct child: #200.
- Whether a list following a paragraph is that paragraph's child at all: Q34 in
  [open-questions.md](open-questions.md), [list-paragraph-mapping.md](list-paragraph-mapping.md),
  discussion #185. Every "right after a paragraph" answer above rests on it.
