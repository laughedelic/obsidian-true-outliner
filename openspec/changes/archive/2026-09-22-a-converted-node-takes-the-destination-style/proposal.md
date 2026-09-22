## Why

`headingAsListItem` (`src/reencode.ts`) wrote `{ type: 'bullet', marker: '-' }` unconditionally,
and the paragraph-to-list-item arm of `reencodeForDestination` beside it made the same choice.
A converted node therefore arrived carrying a marker the destination was not using, which ENDS
the list it lands in: CommonMark begins a new list wherever the bullet character changes.

Measured with `commonmark` 0.31.2, pasting `## H` after the `* a` of a `* a` / `* b` / `* c`
scope:

| document | lists rendered | items |
| --- | --- | --- |
| the source | 2 | 4 |
| before this change | **4** | 5 |
| after this change | 2 | 5 |

One list becomes three around the arrival. The same paste into a `-` run never showed it, which
is why [#159](https://github.com/laughedelic/obsidian-true-outliner/issues/159)'s own frames —
which used `-` and ordered runs — carried it only as a one-line aside.

This is the question that issue left open, and `a-split-run-keeps-its-own-numbers` deliberately
left where it found it. Its answer, decided 2026-09-21: **a converted node matches the
destination's list style.**

The rule already exists twice. `encodingKindAtDestination` gives a reparented node the KIND of
its nearest preceding sibling, else its following one; `destinationHeadingLevel` gives it the
LEVEL the same way. The marker is the third regime of one rule, and the only one that was not
reading its surroundings.

## What Changes

- `destinationListStyle` joins the other two in `src/rules.ts`: nearest preceding list-item
  sibling's style, else the nearest following one's, else a `-` bullet. Only list items donate,
  as only paragraphs and list items donate a kind.
- `headingAsListItem` and `reencodeForDestination`'s paragraph arm take that style instead of
  hardcoding `-`. An ordered donor hands over its number and delimiter, so the marker's width —
  and with it the content column the arrival's children are written at — is its neighbours'.
- Every site that converts takes it, not the insert path alone: an indent's arrival, an
  outdent's arrival, and the siblings an outdent adopts. Each already computed
  `encodingKindAtDestination` from the sibling slices the style is read from, so all three pass
  the same context to both rules.
- The style reaches the payload's top level only. Rows below belong to lists the payload brought
  with it.

## Non-Goals

- **An arriving list item is untouched.** It carries a marker its author wrote, and rewriting
  that would be the silent change this rule exists to avoid. So a pasted `- x` still divides a
  `*` run, and `a-split-run-keeps-its-own-numbers` still governs what that does to the numbers.
- **The task marker is not part of a style.** A `- [ ] a` donor donates `-`; a converted heading
  joins the list without becoming a task.

## Impact

- Affected specs: `structural-operations` (Context-determined encoding on reparent).
- Affected code: `src/rules.ts`, `src/reencode.ts`, `src/ops.ts`, `tests/ops.test.ts`,
  `tests/renumbering-contract.test.ts`.
- **Stacked on `a-split-run-keeps-its-own-numbers`** (#189), which it changes the reach of: a
  converted node joining an ordered run no longer DIVIDES it, so the split rule stops applying to
  that gesture. The plain-bullet gesture that rule was written for is untouched.
