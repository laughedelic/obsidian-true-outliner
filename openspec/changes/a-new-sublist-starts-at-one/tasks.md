## 1. A relocated run starts at one

- [x] 1.1 `renumberOrderedAgainst` (src/ops.ts) takes a `newRun` form, `'own'` by default and
      `'from-one'` for relocations. A run with no member present beforehand starts at `1.` under
      the relocation form, and at its own lowest number otherwise.
- [x] 1.2 Pass the relocation form from indent's arrival, outdent's arrival, outdent's adopted
      siblings, and the splice `moveSubtreesTo` ends in. Paste keeps the default.
- [x] 1.3 Rewrite the helper's doc comment on the no-member case.

## 2. The shapes, by example

- [x] 2.1 `tests/ops.test.ts`: an indent under an item with no ordered children, in tab,
      four-space and two-space units; an indent joining an existing child list; an outdent
      landing where no run is; siblings an outdent adopts; a drag to another level; the paste
      control that keeps its numbers.
- [x] 2.2 Update the cases that pinned the old number: the group indent under a bullet, the
      removal control, and the two grammar caret rows that needed a two-digit marker (now given
      a destination run that keeps it).
- [x] 2.3 e2e `31-tab-indented-vault`: ⇥ on `2. b` in a tab vault gives `⏵1. b`, and ⇧⇥ brings
      the list back.

## 3. Validate

- [x] 3.1 The unit suite, lint and typecheck.
- [x] 3.2 e2e `20-structural-commands`, `30-keyboard-grammar`, `31-tab-indented-vault`,
      `81-node-dragging` in narrow mode; the full sweep runs in CI on the pushed checkpoint.
- [ ] 3.3 Manual testing in Obsidian.
