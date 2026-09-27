# Tasks

## 1. Separate the appended renumbering

- [x] 1.1 Write a pure helper that takes a change set's individual changes and the start
  document, sets aside the appended renumberings and rejoins the touching remainder. Unit-test it
  with the measured changes (`docs/research/obsidian-list-renumbering`, "The ranges it appends to
  a user edit"):
  - flat, three-column, tab, `)`, digit-boundary and task lists;
  - the empty-item rows, with the change on the user's own line;
  - the linewise cut, whose changes touch.

  Also test that with nothing set aside it returns what `iterChangedRanges` joins. Negative
  control: a helper that sets nothing aside fails every renumbering case.
- [x] 1.2 Add the changes that must NOT be set aside: a digit deleted inside `13.`, `.` changed
  to `)`, a replacement reaching past the marker's space, the same number written back, a change
  starting before the number, and a transaction of marker rewrites alone. Negative control: a
  recogniser that accepts any change leaving the line an ordered item fails the first three.
- [x] 1.3 Unit-test both gates on the helper's output, classification then verdict. For each
  measured gesture, assert the class and the verdict the user's changes alone receive:
  - the empty-item ⌫ stays `within-node-edit` and passes;
  - an emptied FIRST item's ⌫ ⌫ with siblings is vetoed as a first node;
  - the linewise cut deletes `b` alone.

  Negative control: classifying the unfiltered changes turns the empty-item ⌫ into a
  whole-node deletion.
- [x] 1.4 Read `input.renumber` as no `userEvent`, and unit-test that such a transaction
  classifies `programmatic`. Negative control: without it, the classification is by shape.
- [x] 1.5 Route `collectChangedLineSpans` and `collectEditFacts` in `transaction-filter.ts`
  through the helper. Verify with `npm test`, `npm run lint` and `npm run typecheck`.

## 2. In the app

- [x] 2.1 In `62-outline-edit-enforcement`, cover the `node-edit-enforcement` scenarios, each
  asserting the buffer and the caret:
  - ⇧↓ then ⌫ on `   2. b` in the three-column list, asserting that one undo restores it;
  - ⌫ ⌫ at the end of `2. a` in `1. p` / `2. a` / `3. q`;
  - the tab-indented ⌫ ⌫;
  - the linewise cut;
  - the empty-item ⌫ inside `ab`, which stays native;
  - a `> ` quoted-list control that stays native with Obsidian's numbers.

  Negative control: the first four fail on `main` in narrow mode; verify all pass with
  `npm run test:e2e:narrow -- 62-outline-edit`.
- [x] 2.2 In `80-outline-zoom`, zoomed into `p` in the three-column list, delete `   2. b`: the
  deletion goes through and `2. q` keeps its number. Negative control: it fails on `main`.
- [x] 2.3 In `92-fold-through-edits`, delete a middle item of a three-column nested list whose
  following sibling of the parent is folded with ordered children. The fold stays closed and the
  numbers are the operation's. Negative control: it fails on `main`.

## 3. Close

- [x] 3.1 Run `openspec validate judge-edit-without-obsidian-renumbering --strict`.
