## 1. Measure

- [x] 1.1 Run every structural key at the planner level over the trailing shapes the issue names
      and the ones it does not — with and without a following continuation line, with a following
      sibling, under a heading, with children, on a task marker, on a two-digit ordered marker,
      on a tab-indented item, and with no final newline — recording the document and the caret
      each produces
- [x] 1.2 Run the same shapes with an interior place as the control, and an Enter place as the
      other control
- [x] 1.3 Record what the measurement adds to the issue's table in
      `docs/research/decoration-follow-ups`: the moves leave the place on whichever node inherits
      its line, which neither Tab nor Shift+Tab does

## 2. The gate

- [x] 2.1 Split `positionBisectsANode` in `src/plugin/decorate.ts`: `positionJoinsANode` is the
      position's-own-line half, and `positionBisectsANode` is that plus the line-below half
- [x] 2.2 Leave the rendering on `positionBisectsANode` — `materializeProvisional`'s `joins` and
      every consumer of it are untouched
- [x] 2.3 State in both doc comments which caller asks which, and why the half that keeps an
      invented node out of the tree is not the half that moved

## 3. `placeOutline`

- [x] 3.1 Rename `resolvedOutline` to `placeOutline`, take the caret and the recorded place line,
      and resolve only when they agree (design D2)
- [x] 3.2 Gate it on `positionJoinsANode`
- [x] 3.3 Update `src/plugin/grammar.ts`'s two call sites, and the stale references in
      `src/plugin/keymap.ts` and `src/reencode.ts`
- [x] 3.4 Unit tests in `tests/decorate.test.ts`: a trailing place resolves, with and without a
      following sibling; the tree still carries no probe character; the place line and the caret
      must agree. Negative control: restoring the gate to `positionBisectsANode` fails the
      trailing rows, and dropping the place-line test fails the agreement row

## 4. The keyboard path

- [x] 4.1 Move `tests/grammar.test.ts`'s "a TRAILING place loses the caret, and keeps its old
      width" to the fixed rule, across the widths a trailing place's content column takes.
      Negative control: restoring the gate fails every row
- [x] 4.2 Add the move rows the measurement found — the place travels with the node rather than
      staying on its line. Negative control: the same
- [x] 4.3 Restate "leaves an end-of-node position alone" over the PLACE LINE rather than over the
      gate: with no place line the document's own final blank line is untouched, and with one it
      takes the node's new content column. Negative control: dropping the place-line test from
      `placeOutline` fails the first half
- [x] 4.4 Pin the `drop-line` abandon over a trailing place — it removes the CARET's line, so a
      caret that fell back to the item's own first line made abandoning destroy the item.
      Negative control: restoring the gate fails it
- [x] 4.5 E2E in `e2e/specs/30-keyboard-grammar.e2e.ts`: Shift+Enter at the end of an item's last
      line, then Tab — the place holds the item's new continuation indent, the caret is on it,
      and typing there makes the item's own second line. Asserted relative to the indent unit the
      vault supplies, never as an absolute width

## 5. The palette path

- [x] 5.1 `runOp` reads the place line from `provisional-cleanup` and resolves through
      `placeOutline`; the resolved tree feeds the operand, the zoom re-resolution, the operation
      and the caret policy
- [x] 5.2 `resultCursor` reads the RESULT through the place, the same way `planFromOp` does
- [x] 5.3 E2E in `e2e/specs/20-structural-commands.e2e.ts`: the palette's result compared against
      the KEYBOARD's own on the same document, in a document with an inferable indent unit so the
      capability's stated exception is not what is being measured. Negative control: dropping the
      place line from `runOp` fails it
- [x] 5.4 E2E for the other half: with no place open, the palette leaves an authored blank line
      alone

## 6. Artifacts

- [x] 6.1 `outline-keyboard-grammar`'s "Provisional positions" states the end-of-node case and
      the carry-with-the-node rule
- [x] 6.2 `caret-placement-policy` gains the provisional-position requirement it had no scenario
      for
- [x] 6.3 `selection-structural-ops`' "Both entry points" requirement says the outline is shared
      too, with the amendment note
- [x] 6.4 Close both `docs/research/decoration-follow-ups` entries, and park what D4 leaves open
- [x] 6.5 `openspec validate a-trailing-place-moves-with-its-node --strict`
