## 1. Escalation math (`src/escalate.ts`)

- [ ] 1.1 Rename `subtreeContentEnd` to `subtreeCoverEnd` and change its leaf
      case to include `node.trailingGap` when non-empty (return the last gap
      line, `ch: 0`, instead of the last content line); update its doc
      comment to describe the new gap-inclusive meaning.
- [ ] 1.2 Update the module doc comment and `subtreeCoverOf`/`siblingRunCover`
      inline comments that reference "trailing gap lines excluded from the
      visual selection" — that phrase is no longer accurate.
- [ ] 1.3 Verify `escalateRange`'s same-node pass-through condition
      (`range.anchor.line < firstGapLine && range.head.line < firstGapLine`)
      is untouched — within-node content-only selections must still skip
      cover computation entirely.
- [ ] 1.4 Re-read `coveredSubtreeRoots`'s doc comment (the
      `!posBefore(hi, cover.end)` rationale referencing the gap-line trigger's
      retained extension) and update it to reflect that the cover itself is
      now gap-inclusive, not just retained past a content-only cover.

## 2. Unit tests (`tests/escalate.test.ts`)

- [ ] 2.1 Update the gap-line trigger block's expected end positions to the
      full gap extent instead of the dragged-to position.
- [ ] 2.2 Add a case for a multi-blank-line trailing gap where the drag stops
      on the first blank line, asserting the selection covers every line of
      the gap.
- [ ] 2.3 Update the cross-node scope-resolution scenarios' expected cover
      ends to include the last covered node's owned trailing gap.
- [ ] 2.4 Update or add a scenario for "reaching a node's content via a
      cross-node drag is enough to include its gap, no second drag needed."
- [ ] 2.5 Review the idempotence/boundary-invariant property tests (containment,
      expand-only) for assumptions baked into the old content-only cover end;
      update generators/assertions as needed so they still exercise the
      right invariants under the new definition.
- [ ] 2.6 Update the `coveredSubtreeRoots` test block, including "the
      gap-line trigger shape (expand-only retains hi past the cover end)",
      to match the new gap-inclusive cover — some of these cases may
      collapse since expand-only is no longer doing that work.
- [ ] 2.7 Run `tests/escalate.test.ts` and confirm all cases pass under the
      new definition.

## 3. Spec sync

- [ ] 3.1 Run the OpenSpec sync/archive flow to merge this change's delta
      spec into `openspec/specs/node-selection-enforcement/spec.md`.

## 4. End-to-end verification

- [ ] 4.1 Update `e2e/specs/61-selection-enforcement.e2e.ts`'s gap-line
      trigger scenario(s) to assert the full owned gap is selected.
- [ ] 4.2 Add or update an e2e scenario for the cross-node case: drag from
      mid-node-A to mid-node-B and assert B's owned trailing gap is included
      without a further drag.
- [ ] 4.3 Real-vault manual pass (matching the style of the two manual passes
      that produced D4's amendments): confirm the one-motion block selection
      feels right, and specifically check a loose list with a multi-blank-line
      gap between items.

## 5. Decoration spot-check (no code change expected)

- [ ] 5.1 With outline mode's escalated-selection visual treatment active,
      confirm the block-level selection chrome now visually extends over a
      covered node's owned gap lines, without touching
      `src/plugin/decorations.ts`. If it does not extend correctly, that's a
      signal `coveredSubtreeRoots` isn't propagating the new cover as
      expected — investigate `src/escalate.ts` before touching decorations.
