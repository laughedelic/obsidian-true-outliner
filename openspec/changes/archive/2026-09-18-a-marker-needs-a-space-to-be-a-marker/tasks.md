## 1. The rule

- [x] 1.1 Stop `LIST_ITEM_RE` admitting a marker at end of line, leaving the blank-start content
  column for the whitespace-only case it still covers.
- [x] 1.2 Require whitespace in `caret.ts`'s `LIST_PREFIX`, and state in its comment the
  continuation shape the node kind cannot decide.
- [x] 1.3 Unit tests: a bare marker parses as a paragraph and `- ` as an item; `-42` is text at
  every keystroke; a bare marker and the line under it are one paragraph; one inside a list splits
  it; an item's `␣␣-` continuation line keeps its dash. Negative control: restoring the `|$`
  alternation fails them.

## 2. What the rule dissolves

- [x] 2.1 The differential property's pinned case now asserts the paragraph reading — the same
  keypress, the same bytes, a position that belongs to a node. Recorded in the test itself, since
  the shape reads as a defect and is not one.
- [x] 2.2 The catalogue's S12 and the decoration parking lot's entry are closed rather than fixed.

## 3. What survives

- [x] 3.1 Carry the continuation prefix measured in columns, for a tab inside the marker's run.
- [x] 3.2 Unit test with its negative control: `-⇥x` continues at column 4, and the character count
  fails it.

## 4. Landing

- [x] 4.1 E2E: the bare marker renders as a paragraph with its block marker, nothing moves on the
  ambiguous dash, and the space makes it an item.
- [x] 4.2 The e2e groups this touches, green: decorations, keyboard-grammar, structural-commands,
  outline-mode, selection, folding.
- [x] 4.3 `openspec validate a-marker-needs-a-space-to-be-a-marker --strict`
