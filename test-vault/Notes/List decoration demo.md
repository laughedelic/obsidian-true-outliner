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

## Known limitation: two-space indentation

Obsidian only quantises a tab or exactly four spaces into an indent unit, so
the levels below stay wrong at every setting. This is stock behaviour, visible
with the plugin disabled too.

- two-space level one
  - two-space level two
    - two-space level three
      - two-space level four

