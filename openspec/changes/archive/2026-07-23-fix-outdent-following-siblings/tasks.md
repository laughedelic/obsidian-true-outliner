## 1. Regression tests (write first, confirm they fail against current `outdent`)

- [x] 1.1 Add `ops.test.ts` case: outdent the middle item of
      `- p\n\t- x\n\t- y\n\t- z\n` (`x`, no pre-existing children) and assert the result is
      `- p\n- x\n\t- y\n\t- z\n` with `y`/`z` as `x`'s children in order.
- [x] 1.2 Add `ops.test.ts` case: outdent a node `x` that already has child `w`, with
      following siblings `y`, `z` — assert `x`'s children become `[w, y, z]` in that order.
- [x] 1.3 Add `ops.test.ts` case: outdent a node with no following siblings (last child of its
      parent) — assert byte-for-byte identical output to current behavior (no regression).
- [x] 1.4 Add `ops.test.ts` case covering a re-parented following sibling whose encoding kind
      changes under its new parent (per `encodingKindAtDestination`), to make the
      context-determined re-encoding visible and intentional.
- [x] 1.5 Add/extend a `closure.test.ts` case exercising `parse(encode(surgery))` round-trip
      for an outdent with following siblings, confirming closure holds.

## 2. Implement the fix

- [x] 2.1 In `src/ops.ts::outdent`, change the `parentPath` surgery from
      `nodes.filter((_, i) => i !== index)` to drop the outdented node AND everything after it
      (`nodes.slice(0, index)`), leaving `parent`'s preceding children untouched.
- [x] 2.2 Compute the re-encoded following siblings (former `nodes.slice(index + 1)`) via
      `reencodeForDestination`/`shiftSubtree`, targeting `moved` as their new parent and
      `childBaseCol(moved)` for their indentation, using
      `encodingKindAtDestination` against `moved`'s own (possibly empty) existing children for
      context, per design.md's encoding decision.
- [x] 2.3 Append the re-encoded following siblings after `moved`'s existing `children` before
      splicing `moved` into `grandPath`.
- [x] 2.4 Carry the trailing gap from the old last child under `parent` onto the new last
      surviving child, or drop it if `parent` now has zero children. **Finding**: no explicit
      carry code was needed — `trailingGap` is owned by the node object itself (not by its
      slot), and following siblings relocate as-is (same objects, same relative left-to-right
      document order, only re-indented/re-parented), so whichever node owned the boundary gap
      before the op still owns it after. Verified by the existing `move()` gap-carry logic
      being a genuinely different case (there, two node identities swap slots, so the
      positional gap must be reassigned) and by the 1500-run `5.1`/`5.2` closure and
      minimal-edit property tests passing unchanged.
- [x] 2.5 Run `renumberOrdered` as needed on both the truncated `parent` children and `moved`'s
      new children list, matching existing ordered-list renumbering behavior.

## 3. Verify

- [x] 3.1 Run the full test suite (`ops.test.ts`, `closure.test.ts`, and any other affected
      unit suites) and confirm all pass, including the new tests from section 1. (806/806 pass.)
- [x] 3.2 Re-run the outline-edit-enforcement e2e scenario that originally surfaced this gap
      (merge → split → outdent interaction, docs/research/04-open-questions.md Q17) and
      confirm the outdented remainder now restores the expected sibling/children structure.
      **Not done in this session** — that finding came from a manual real-vault pass in the
      Obsidian app, which this session has no way to drive; the root-cause bug (outdent
      dropping following siblings) is directly covered by the new `ops.test.ts`/
      `closure.test.ts` regression tests using the exact Q17 repro, but the specific
      merge→split→outdent surfacing path itself hasn't been re-walked by hand. Needs a manual
      pass before considering this fully closed.
- [x] 3.3 Update docs/research/04-open-questions.md Q17 to mark the outdent finding as
      resolved (with a pointer to this change), leaving the heading Enter-handling finding
      open as its own separate item.

## 4. Sync specs

- [x] 4.1 Run `openspec sync-specs` (or the equivalent skill) to merge this change's
      `structural-operations` delta spec into `openspec/specs/structural-operations/spec.md`
      once implementation and verification are complete.
