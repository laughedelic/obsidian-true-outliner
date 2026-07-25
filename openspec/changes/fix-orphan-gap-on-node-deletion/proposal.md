## Why

Deleting a node that is exactly selected leaves its blank line behind. Measured on a real
Obsidian instance (2026-07-25) in an outline-mode note:

| buffer | selection | Backspace result |
| --- | --- | --- |
| `Alpha one.\n\nBravo two.\n\nCharlie three.\n` | Alpha's exact cover, `0:0`→`1:0` | `"\nBravo two.\n\nCharlie three.\n"` |

An orphan blank line is left at the top, and the transaction classifies `within-node-edit`, so
no verdict is computed at all. `node-edit-enforcement`'s "Deleting across boundaries removes
whole subtrees with their gaps" never fires, because a cover that spans one node's content plus
its separator does not look like a boundary crossing to `spanCrossesBoundary`.

The same probe found a second, wider gap: **multi-range deletions are not enforced at all.**
`collectEditFact` returns `undefined` when a transaction has more than one change range, so
`computeVerdict` passes. Deleting two exact covers leaves two orphan blank lines. That is design
D1's stated "conservative bias" in the archived `outline-edit-enforcement` change — deliberate
at the time, and now the thing standing between an escalated selection and a correct deletion.

This matters beyond tidiness: gap ownership is the mechanism the whole selection and edit model
rests on. If selecting a node and deleting it does not take the node's gap, then the model's own
claim — that a gap belongs to the node above it — is not true where users can see it.

## What Changes

- **A deletion whose range exactly covers one or more whole subtrees is recognized as
  structural**, and removes each covered subtree with its owned trailing gap, leaving the
  remaining tree well formed.
- **Multi-range deletions receive verdicts.** The single-change-range restriction in
  `collectEditFact` is lifted for the shapes this change covers, so an escalated multi-range
  selection deletes as a set of structural deletions rather than passing through raw.
- The change decides, and records, **which layer owns the fix** — see design.md D1.

## Capabilities

### Modified Capabilities

- `transaction-classification`: a change span that exactly covers whole subtrees is classified
  as a boundary-crossing edit rather than a within-node edit, and multi-range user edits are no
  longer excluded from verdict computation by construction.
- `node-edit-enforcement`: the structural-deletion requirement is extended to cover the
  exact-cover case (single and multi-range), which its current wording assumes but does not
  reach.

## Impact

- `src/classify.ts`: the span test, or `collectChangedLineSpans`' span derivation in
  `src/plugin/transaction-filter.ts` — D1 decides which.
- `src/plugin/transaction-filter.ts`: `collectEditFact` accepts multi-range edits.
- `src/enforce.ts`: verdict computation over several ranges.
- `tests/enforce.test.ts`, `tests/classify.test.ts`, and a new e2e scenario.

## Sequencing

**Before `selection-as-subtree-set`.** D1's choice of layer determines whether an escalated
cover's end moves to include its gap's newline, which changes the geometry that change builds
on. Settling it on the simpler single-node case first is cheaper than settling it inside a
larger change.

Independent of `content-space-caret` and `paste-heading-section-reencoding`.

## Out of scope

- Any change to gap OWNERSHIP in the parse model. The gap belongs to the node above it; this
  change makes deletion honor that, it does not redefine it.
- The escalation geometry itself, beyond whatever D1 concludes about the cover's end.
