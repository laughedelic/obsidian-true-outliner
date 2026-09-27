# Tasks

## 1. Set aside the appended renumbering

- [ ] 1.1 In `tests/enforce.test.ts`, add `computeVerdictForRanges` cases built from the measured
  ranges (`docs/research/obsidian-list-renumbering`, "The ranges it appends to a user edit"): the
  flat, three-column, tab, `)` and digit-boundary lists, each with the line deletion and with the
  marker-space Backspace on the emptied item. Each expects the rewrite the user's range alone
  receives from `computeVerdict`. Negative control: on `main` every case is `pass`.
- [ ] 1.2 Add the cases that must NOT be set aside: a range deleting one digit of `13.`, a range
  changing `.` to `)`, a range whose replacement changes text past the marker's space, and a
  transaction made of marker rewrites alone. Each keeps today's verdict. Negative control: a
  recogniser that accepts any change leaving the line an ordered item fails the first three.
- [ ] 1.3 Add a unit test that the measured appended ranges, classified alone, give no
  `boundary-crossing-edit`, so setting them aside changes no class. Negative control: a span
  crossing a line break in the fixture fails it.
- [ ] 1.4 Implement the recogniser and the setting-aside in `computeVerdictForRanges`
  (`src/enforce.ts`); verify 1.1-1.3 pass with `npm test`, and `npm run lint` and
  `npm run typecheck` are clean.

## 2. In the app

- [ ] 2.1 In `e2e-tests/specs/62-outline-edit-enforcement.e2e.ts`, add the two
  `node-edit-enforcement` scenarios: ⇧↓ then ⌫ on `   2. b` in the three-column list, and ⌫ ⌫ at
  the end of `2. a` in `1. p` / `2. a` / `3. q`, asserting the buffer, the caret, and that one
  undo restores the note. Negative control: both fail on `main` in narrow mode (recorded in the
  PR); verify both pass with `npm run test:e2e:narrow -- 62-outline-edit`.
- [ ] 2.2 Add the tab-indented ⌫ ⌫ case and a `> ` quoted-list control that stays native with
  Obsidian's numbers; verify in narrow mode.

## 3. Close

- [ ] 3.1 Run `openspec validate judge-edit-without-obsidian-renumbering --strict`.
