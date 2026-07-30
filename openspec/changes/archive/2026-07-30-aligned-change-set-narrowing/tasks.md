## 1. Reproduce and locate

- [x] 1.1 Add an e2e case that moves a paragraph past a live table with Alt+ArrowDown and asserts the table's rows stay contiguous; confirm it FAILS against the current build.
- [x] 1.2 Instrument `cm.dispatch` with a stack-trace-recording monkey-patch and capture the prepared document, to establish whether the corruption is ours, asynchronous, or the host's — result: synchronous, inside the outer `EditorState.update`, `nested: false`.
- [x] 1.3 Dump the actual `EditorChange[]` for every move variant and confirm the per-line branch emits partial character edits inside table rows.

## 2. Align lines at the narrowing choke point

- [x] 2.1 Add `uniqueAnchors` to `src/plugin/dispatch.ts`: pair lines unique on both sides, chain them by longest increasing subsequence.
- [x] 2.2 Add `alignLines`: trim common leading/trailing lines, split on anchors, recurse into each gap, and emit the unmatched runs in ascending order.
- [x] 2.3 Rewrite `editToChanges` to align first and apply the existing per-line and whole-span branches PER RUN; delete the now-unused `trimCommonEnds`.
- [x] 2.4 Rewrite the module docstring to state what alignment is for — expressing a relocation — rather than only how it narrows.

## 3. Remove the superseded table-specific fix

- [x] 3.1 Delete `src/plugin/table-widget-move.ts` and `tests/table-widget-move.test.ts`.
- [x] 3.2 Drop the `moveDirection` parameter from `addStructuralCommand` and `runOp` in `src/plugin/main.ts`, and re-register `move-node-up`/`move-node-down` without it.
- [x] 3.3 Drop the direction derivation and stabilizer call from `src/plugin/keymap.ts`.
- [x] 3.4 Confirm `resultCursor` now receives the dispatched change set itself, with no second "minimal" copy.

## 4. Pin the guarantee

- [x] 4.1 Add dispatch-shape tests to `tests/plugin.test.ts`: for paragraph-past-table (both directions), list-item-past-table, and a table nested UNDER the passed-over sibling, assert no change begins or ends partway into a table line and no change range covers one.
- [x] 4.2 Pin the exact two-change shape for the reproducing case (one deletion, one insertion).
- [x] 4.3 Negative-control it: restore the pre-alignment narrowing and confirm all five new tests fail; restore the alignment and confirm they pass.
- [x] 4.4 Retarget `tests/history-caret.test.ts`'s negative control to the move direction whose aligned change set still relocates the caret's own lines, and document why the other direction now passes without the recorder.

## 5. Validate

- [x] 5.1 Full unit suite, including the `applyEdits` property tests over generated documents and the `minimal-change-history` undo/redo properties.
- [x] 5.2 `npm run lint`, `npm run build`, `npm run build:e2e`.
- [x] 5.3 All 17 e2e spec files against a real Obsidian, with the vault snapshotted and `scripts/check-vault-drift.mjs` clean afterwards.

## 6. Specify

- [x] 6.1 Write the proposal, the `minimal-change-dispatch` delta (modified narrowing requirement, added relocation requirement), and the `structural-history-integration` delta (corrected recording rationale).
- [x] 6.2 Write the design doc with the alternatives considered and the interaction check against cursor mapping, ordering, undo granularity, and enforcement.
- [x] 6.3 Validate the change with `openspec validate`, then sync the deltas into `openspec/specs/` and archive.
