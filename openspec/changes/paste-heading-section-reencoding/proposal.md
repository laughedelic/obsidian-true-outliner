## Why

Cutting a whole heading section — the heading plus its paragraphs, callouts and nested lists —
and pasting it at an arbitrary depth inside a list produces a mangled result. Reported from
real-vault use on 2026-07-25: the heading becomes a list item and loses its `#` markers, while
the section's other blocks land at inconsistent depths, breaking indentation and not converting
to match the destination.

`node-edit-enforcement` already promises that a structural paste "re-indents to a valid depth
for that scope, preserving the copied content's own relative nesting exactly regardless of the
target's depth relative to the original." For a payload rooted at a heading, that promise has
no implementation behind it, because a heading's depth is carried by its `#` count while a list
item's is carried by indentation. The two regimes were identified as far back as Q2 in
docs/research/04 and the asymmetry was never resolved for the paste path.

This is a re-encoding problem, not a selection problem. It was raised during the discussion that
produced `selection-as-subtree-set`, and confirmed there to be independent of it: the payload is
a sequence of whole subtrees under either selection model, and the difficulty is entirely in how
those subtrees land somewhere with a different encoding regime.

## What Changes

- **A payload whose root is a heading gets a defined encoding when pasted into a list scope**,
  and the whole subtree re-encodes consistently with it rather than each block being handled
  independently. The choice itself is design.md D1 — convert, preserve, or reject — and it is
  deliberately left open here because the options have genuinely different costs and the
  decision wants worked examples.
- **The reverse direction is covered too**: a list-rooted payload pasted into a heading scope,
  which the same asymmetry governs.
- Whatever is chosen, the existing structural-paste guarantee — internal relative nesting
  preserved exactly — SHALL hold for the whole subtree, not only for its root.

## Capabilities

### Modified Capabilities

- `structural-operations`: the context-determined encoding rule is extended to cover a payload
  crossing between the heading regime and the list regime, for the whole subtree rather than the
  root alone.
- `node-edit-enforcement`: the structural-paste requirement gains the cross-regime case its
  current wording assumes is already handled.

## Impact

- `src/ops.ts`: `reencodeForDestination` / `reencodeBlocksForDestination` / `shiftSubtree`.
- `src/encode.ts` where a kind conversion is involved.
- `tests/ops.test.ts`, `tests/closure.test.ts`, and a new e2e paste scenario.
- The blast radius depends on D1: rejection is contained, conversion touches every paste that
  crosses regimes.

## Sequencing

Independent of the selection work. It can land at any point relative to
`selection-as-subtree-set`, `content-space-caret`, `node-selection-extension`, and
`fix-orphan-gap-on-node-deletion`.

One interaction to note: `selection-as-subtree-set` adds root-level normalization for payloads
whose roots came from different depths. That rule and this one compose — normalization decides
what level the roots sit at, this change decides what encoding they take.

## Out of scope

- The two-regime algebra for Tab/Shift+Tab level-shifting, which is settled and unchanged.
- Reopening whether headings should be nodes at all.
