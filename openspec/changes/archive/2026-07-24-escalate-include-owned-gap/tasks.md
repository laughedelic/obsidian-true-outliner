## 1. Escalation math (`src/escalate.ts`)

- [x] 1.1 Rename `subtreeContentEnd` to `subtreeCoverEnd` and change its leaf
      case to include `node.trailingGap` when non-empty (return the last gap
      line, `ch: 0`, instead of the last content line); update its doc
      comment to describe the new gap-inclusive meaning.
- [x] 1.2 Update the module doc comment and `subtreeCoverOf`/`siblingRunCover`
      inline comments that reference "trailing gap lines excluded from the
      visual selection" — that phrase is no longer accurate.
- [x] 1.3 Verify `escalateRange`'s same-node pass-through condition
      (`range.anchor.line < firstGapLine && range.head.line < firstGapLine`)
      is untouched — within-node content-only selections must still skip
      cover computation entirely.
- [x] 1.4 Re-read `coveredSubtreeRoots`'s doc comment (the
      `!posBefore(hi, cover.end)` rationale referencing the gap-line trigger's
      retained extension) and update it to reflect that the cover itself is
      now gap-inclusive, not just retained past a content-only cover.

## 2. Unit tests (`tests/escalate.test.ts`)

- [x] 2.1 Update the gap-line trigger block's expected end positions to the
      full gap extent instead of the dragged-to position.
- [x] 2.2 Add a case for a multi-blank-line trailing gap where the drag stops
      on the first blank line, asserting the selection covers every line of
      the gap.
- [x] 2.3 Update the cross-node scope-resolution scenarios' expected cover
      ends to include the last covered node's owned trailing gap.
- [x] 2.4 Update or add a scenario for "reaching a node's content via a
      cross-node drag is enough to include its gap, no second drag needed."
- [x] 2.5 Review the idempotence/boundary-invariant property tests (containment,
      expand-only) for assumptions baked into the old content-only cover end;
      update generators/assertions as needed so they still exercise the
      right invariants under the new definition. (No changes needed: these
      properties are stated generically enough — e.g. "ends at a line's own
      length" holds for a blank gap line's length 0 just as much as a
      content line's — to hold unchanged under the new cover definition.)
- [x] 2.6 Update the `coveredSubtreeRoots` test block, including "the
      gap-line trigger shape (expand-only retains hi past the cover end)",
      to match the new gap-inclusive cover — some of these cases may
      collapse since expand-only is no longer doing that work. (Retitled to
      "cover end is the node's own gap"; single-blank-line gap
      scenarios were already gap-inclusive by coincidence so assertions
      were unchanged, only wording updated.)
- [x] 2.7 Run `tests/escalate.test.ts` and confirm all cases pass under the
      new definition. (51/51 passing; full suite 290/290 passing;
      `tsc --noEmit` clean.)

## 3. Spec sync

- [x] 3.1 Run the OpenSpec sync/archive flow to merge this change's delta
      spec into `openspec/specs/node-selection-enforcement/spec.md`.

## 4. End-to-end verification

- [x] 4.1 Update `e2e/specs/61-selection-enforcement.e2e.ts`'s gap-line
      trigger scenario(s) to assert the full owned gap is selected. (All
      boundary-crossing/gap-line-trigger scenarios' expected end positions
      updated; typechecks clean under `e2e/tsconfig.json`.)
- [x] 4.2 Add or update an e2e scenario for the cross-node case: drag from
      mid-node-A to mid-node-B and assert B's owned trailing gap is included
      without a further drag. (Added "reaching a node's content via a
      cross-node drag includes its whole owned gap, no second drag needed".)
- [x] 4.3 Real-vault manual pass (matching the style of the two manual passes
      that produced D4's amendments): confirm the one-motion block selection
      feels right, and specifically check a loose list with a multi-blank-line
      gap between items. Manually verified by the user on a live test vault
      (2026-07-24) — looks good, no regressions observed.

## 5. Decoration spot-check (no code change expected)

- [x] 5.1 With outline mode's escalated-selection visual treatment active,
      confirm the block-level selection chrome now visually extends over a
      covered node's owned gap lines, without touching
      `src/plugin/decorations.ts`. Confirmed by the user's live-vault pass
      alongside 4.3 — no `src/plugin/decorations.ts` changes were needed.
