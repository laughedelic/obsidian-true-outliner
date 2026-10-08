# Proposal

## Why

A heading line written one to three columns into an open list item opens a section of its own:
it closes the list and takes every node after it as its children, while the same line written
four columns in, or after a tab, is a paragraph child of the item. The maintainer decided on
[#136](https://github.com/laughedelic/obsidian-true-outliner/issues/136) that a heading line
inside an open item is that item's paragraph child, styled as a heading, at any indentation. The
specs contradict each other here: "A list item's own lines, and what its children may be" makes
any block at or past the item's content column after a blank line its child, which already asks
for the decided reading, while "A block start inside a list item is measured from the item"
measures a heading from column 0 and has it close every item's margin, which is what the parser
does and every structural operation follows. `docs/research/block-start-margin` ("A heading line inside an open item")
has the shapes, measured on `main` and with a prototype.

## What Changes

- A heading line, ATX or setext, at or past the content column of a list item still open at that
  line is read as text the item holds: a paragraph child after a blank line, more of the text
  above it otherwise, as the same line written four columns in already reads.
- A heading line short of every open item's content column keeps its reading: it is a heading,
  closes the list and opens a section.
- A setext underline inside an open item no longer closes the item's margin.
- The kind a seam judges a written node by (`kindAsWritten`) follows the parse: a heading line
  inside an item is judged a paragraph.
- A drawn case, committed now as `known-failing: #136`, shows the item indented by `⇥` carrying
  the heading line with it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-tree-mapping`: "A block start inside a list item is measured from the item" stops
  measuring a heading from column 0 inside an open item. The sentence that every heading closes
  every list item's margin narrows to headings outside every open item, and two of its scenarios
  change with it.
- `structural-operations`: "Boundary separation is judged on the kind the re-parse will read"
  stops judging a heading at column 0 wherever it sits: inside a list item it is judged as the
  paragraph, or the list item, its line re-parses as.

## Non-goals

- HTML blocks. They stay measured from column 0, tracked in #213.
- The kind a converted list item carrying a `#` run is written as (#277), and outdenting a list
  item that is a heading's direct child (#200). Both sit near this one and decide other questions.
- Rendering. Both editing surfaces already style these lines as headings, and the decorations
  read the tree's kind, so a paragraph child styled as a heading needs nothing new drawn.
- A heading line short of every open item's content column, and one after a list a column-0
  block has closed. Both stay sections, as they are today and as the decision keeps them.

## Impact

- `src/parse.ts`: `segment` (the ATX branch, the paragraph loop's setext underline and its
  interruption test) and `promote`/`demote` behind `kindAsWritten`.
- `tests/roundtrip.test.ts`, `tests/edit-ops.test.ts`: four tests assert the column-0 reading and
  change with it; new parse tests pin the decision's shapes.
- `e2e-tests/cases/document-tree-mapping/`: the repro, its marker removed by the fix.
- `docs/research/block-start-margin.md`: the measurements this rests on.
