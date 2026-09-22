# Appearance

In outline mode a note is drawn so that its structure is visible at a glance.

- One indentation grid for every kind of block.
- Guide lines from each parent to its children.
- A marker naming each block's kind.
- A highlight that shows where the caret is in the tree.

All of it is additive: the note's own text, fonts and Obsidian theme are untouched, and every part of it can be tuned from the settings or overridden from a CSS snippet.

<TryOutline>The grid, the guides, the markers and the highlighted path are all drawn on this page in outline view, where the pointer stands in for the caret.</TryOutline>

<Shot name="guides-markers" alt="A note with nested lists, showing guide lines, markers and the caret's lineage" caption="Guides from every parent to its children, a marker per block, and the caret's own guides and marker in the accent colour." />

## The grid

Every node steps right by the same amount per level, whatever its kind.

- A heading at depth two, the paragraph under it and a list item under that all sit on the same three columns, so nesting reads as nesting.
- Wrapped lines hang under their own first line.

**Outline width** sets the size of one step: **Compact**, **Balanced**, **Roomy** or **Wide**.

- The default, **Auto**, picks Compact on a phone or tablet, where width is scarce, and Roomy on a desktop.
- Every step keeps a child's marker clear of its parent's text.
- The same step is used in the [backlinks footer](./backlinks).

## Guide lines

A guide is the vertical line from a parent down past its children.

- Guides are drawn for every level, list levels included.
- They run through blockquotes and beside tables without breaking.
- Obsidian's own indent guides are hidden in outline mode: they sit on columns this grid does not use.

Three settings tune them.

- **Which indentation guides to draw**
	- *Every level*, the default.
	- Only *the levels the cursor is inside*.
	- Only *the levels inside the current node*.
	- *None*.
- **Guide line strength**: *Subtle* (default), *Normal* or *Strong*.
	- The strength is a proportion of the theme's faintest text colour, so it looks right in light and dark themes alike.
- **Hide the outermost guide under a single root** drops that one guide and keeps the rest.
	- When a whole note hangs off one `# Title`, or while zoomed, the outermost guide runs down every line and says nothing.

## Markers

Each block's first line carries a small icon in the gutter that names its kind: heading, paragraph, code, table, callout, quote and so on.

- A heading's marker also names its level, as in *H2*.
	- **Heading marker glyph** draws it with the letter H or with `#`.
	- **Heading level in the marker** puts the digit beside the glyph, sets it as a subscript, or leaves it out.
	- The marker's size and every line's position are the same in all of them.
- List items keep their own bullet, number or checkbox instead.
	- It is restyled to the same weight and colour and moved onto the grid, so a list looks like a list.
- Continuation lines and blank lines never carry a marker.
- Gutter space is reserved whether or not a marker is shown, so nothing shifts when markers appear or disappear.
- Clicking a marker [zooms into that node](./zoom).

**Block marker visibility** limits which nodes get an icon. It is listed under a *Debug:* label while the choice is still being evaluated.

- Every eligible kind.
- Only nodes that have children.
- Only headings and paragraphs.

The setting never affects a list item's native bullet.

## Where the caret is

Two highlights show the caret's place in the tree. Both are paint only, never moving a line.

- **Highlight guides at the cursor's position**
	- Accent the whole guide of every ancestor, the default.
	- Accent only the stretch of each guide that leads down to the caret.
	- Accent nothing.
- **Highlight markers at the cursor's position**
	- Accent the current node's marker, the default.
	- Accent the current node and all its ancestors.
		- Inside a plain list there are no guides to accent, so marking the lineage is the one way to see the caret's depth there.
	- Accent nothing.

## Folding

A folded node keeps its marker and says how much it hides; nothing else appears. See [Folding](./folding).

- The marker is drawn in a solid weight.
- The number of hidden descendants follows the node's text.
- The fold chevron sits on the node's marker, clear of the guides.

## Themes and snippets

The outline reads its colours from the current theme, so any theme works.

- Markers and guides derive from the theme's text colours.
- The caret accent derives from the theme's accent colour.

Every knob above is also a CSS variable, and a snippet's value wins over the settings. The one to know is `--to-decor-unit`, the size of a level: setting it on `body` moves every column in the editor and the footer together.

```css
/* .obsidian/snippets/outline.css */
body {
  --to-decor-unit: 1.25rem;
  --to-guide-color: var(--color-accent);
  --to-guide-width: 2px;
}
```

The full list is in [CSS variables](../reference/css-variables).

## Off, and on again

Switching outline mode off restores stock Obsidian rendering, including Obsidian's own indent guides. Nothing about the appearance is stored in the note.
