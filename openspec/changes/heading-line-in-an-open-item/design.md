# Design

## Context

`segment` in `src/parse.ts` reads blocks flat and keeps `openItems`, the content columns of the
list items still open at the current line, innermost last; #210 added it so a quote, a callout
and a rule are measured from the item that holds them. A heading never consults it: `ATX_RE` and
`SETEXT_RE` anchor at `^ {0,3}` on the raw line, so a heading line one to three columns in opens
a section and clears `openItems`, and the same line four columns in fails the pattern and falls
through to a paragraph. `docs/research/block-start-margin` ("A heading line inside an open item")
measures both readings, shape by shape.

Three places test a heading line: the ATX branch of `segment`'s main loop; the paragraph loop,
where `startsNewBlock` ends a paragraph at an ATX line and a setext underline (and a `---` the
interruption test stopped at) turns the paragraph into a heading; and `kindAsWritten`, through
`promote` (a paragraph whose first line opens a heading) and `demote` (a heading measured from
column 0 wherever it sits), which the seam rules in `src/ops.ts` and the outline view in
`src/edit-site.ts` ask what a node will re-parse as.

## Goals / Non-Goals

**Goals:**

- One test decides whether a heading line can open a heading: whether any list item is open at
  that line once the items it is not indented into are popped. All three places above ask it.
- Inside an open item, a heading line reads exactly as the same line indented past the opening
  margin already reads, in every adjacency.

**Non-Goals:**

- A new reading for a heading line inside an item. The line falls through to the readings the
  parser already has for text at that column; it is not given a node kind or a rule of its own.

## Decisions

### The test is the open-item stack, not the heading's indentation

The heading line opens a heading only when `openItems` is empty after popping the items the line
is short of; that is `margin === 0` in the main loop, where `margin` is already the innermost
open item's content column. The paragraph loop, which does not pop, asks the same thing of the
OUTERMOST open item: a heading line or an underline short of `openItems[0]` closes every item, and
one at or past it is held by one of them.

The scope comment on #136 names the two alternatives and the case each gets wrong: keyed on the
heading's indentation alone it demotes a heading after a list a column-0 paragraph has closed;
keyed on the node directly above, it misses a heading after an item's paragraph child. The stack
answers both, and it is the stack the quote, callout and rule margin already pops.

### A heading line inside an item falls through to what the column already reads

Inside an open item the ATX branch is skipped and the line goes on through the remaining
branches, so it reads as the same line written four columns in already reads on `main`:

- after a blank line, a paragraph child of the innermost item holding it;
- directly under a paragraph's text, more of that paragraph — the paragraph loop does not stop
  at it, as the item's own-lines loop already does not (#136's case 4, which the maintainer's
  decision lists as already right);
- over a delimiter row, a table, since the table test now runs where the heading test used to
  win.

The alternative was to give a heading line inside an item a node of its own even with no blank
line above it, as CommonMark and Live Preview interrupt a paragraph with a heading. That makes a
paragraph that ends at its own first line, a shape the tree holds nowhere else. `needsBlankBetween`
and `normalizeBoundaries` rest on "two paragraphs with nothing between them are one paragraph",
so every seam rule that meets two adjacent paragraphs would need a third answer, and the item's
own text would still read the other way. The fall-through keeps one reading for one column, and
it is the one the four-space spelling has had since before #210.

### `kindAsWritten` follows the parse

`promote` reports a paragraph whose first line is a heading line as a heading only at margin 0;
`demote` reports a heading written at a margin above 0 as the paragraph (or, with a marker, the
list item) the parse will read it as. The seam rules then choose separators for the node the
document will contain, which is the contract `kindAsWritten` states. A paragraph-to-paragraph
seam that the parse made is never one this changes: the parse produces no such seam without a
blank line, because the paragraph loop no longer stops at a heading line inside an item.

`tailAsWritten` reads a node's later lines by parsing them under a `- x` context at the same
margin, so it follows the new parse with no edit of its own.

## Risks / Trade-offs

- [A document that relies on a two-space heading under a list to open a section changes shape:
  what followed the heading moves back to the root.] → That is the decision's intent, and the
  corpus and `test-vault` contain no such shape (0 of 40 files change, in the note). The text is
  untouched; only the tree read from it differs.
- [Operations that write a heading node at an item's content column, if any can, now produce a
  paragraph on re-parse.] → The grammar converts a heading placed among list items into a list
  item (`structural-operations`, `node-dragging`), and `kindAsWritten` now reports the paragraph,
  so the seam is separated for what the re-parse reads. The three seam tests in
  `tests/edit-ops.test.ts` that construct such a node are rewritten to assert the paragraph.
- [The decorations draw a heading-styled paragraph child.] → Both editing surfaces already style
  the line as a heading, and case 2 (four spaces) already draws this way; `driving-obsidian`
  confirms the painted result before the change is marked ready.
