# List decoration demo

A paragraph under the heading. Its marker sits in the gutter and its guide
runs straight down from it — this is the column every other kind uses.

## Tab-indented list (the common case)

- top level item
	- nested item
		- deeper item
			- deepest item
		- a deep item with a long line that must wrap: its wrapped rows have to line up under its own text, which is what Obsidian's hanging indent is for
	- back to level two
- a sibling with a long line that should wrap: the wrapped rows must line up under the item text, not under the bullet, and not under the line start

## A blank line inside a list

- first item

- second item, after a blank line
	- its child

## Ordered, and crossing the digit-width boundary

1. first
	1. nested first
		1. nested deeper
9. ninth
10. tenth

## Tasks

- [ ] an open task
	- [x] a done subtask
		- a plain child of a task

## Same depth, different kinds

- list item, depth 1

Paragraph, depth 1.

> quote, depth 1

```js
const codeAtDepth1 = true;
```

Every marker above should sit on one column, and every text start on the next.

## A list under a paragraph (one level deeper, on purpose)

This paragraph owns the list below it, so the item is a level deeper than the
paragraph — the tree model's attachment rule, not a rendering slip.
- child of the paragraph
	- grandchild

## Space indentation, in twos and threes

Obsidian resolves a tab or exactly four spaces into an indent unit and renders
whatever is left over at its literal character width, so these levels used to
walk right a fraction of a level at a time while the guides beside them stayed
evenly spaced. Outline mode states the indentation width from the item's own
depth instead, so every level lands on its column whatever the source is made of
— and whichever way Obsidian's own "Show indentation guides" setting is set.

- two-space level one
  - two-space level two
    - two-space level three
      - two-space level four
        - two-space level five

- three-space level one
   - three-space level two
      - three-space level three

## Fold chevrons

Hovering a parent shows its chevron. A list item's should sit the same distance
from its own marker as this heading's does from the heading icon, clear of the
parent level's guide on the left.

- a parent bullet
	- its child
1. a parent number
	1. its child
- [ ] a parent task
	- [ ] its child

