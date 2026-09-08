## Why

`node-edit-enforcement` states that Backspace at a heading's first character is vetoed with the
rejection cue, because absorbing the heading would destroy its section's anchor. It is not:
the keypress deletes the heading marker's trailing space and leaves a paragraph where a heading
was, with no cue and no verdict computed at all. Measured, with the full funnel trace and the
neighbouring shapes that already behave, in
[docs/research/25-heading-content-start-backspace.md](../../../docs/research/25-heading-content-start-backspace.md).

The consequence is not cosmetic: the demoted heading's section dissolves and its children
re-parent, which is exactly the corruption the enforcement layer exists to prevent. The same
note records why the fix cannot stop at classification — widening the classifier alone routes
the keypress to the deletion path, where a one-character range reads as a whole-subtree cover
and the keypress becomes a section deletion.

## What Changes

- Recognize an ATX heading's marker-space deletion as a content-adjacent merge intent, in both
  gates that decide it: transaction classification and merge recognition. The verdict it then
  reaches is a veto by rules already written — `mergeNodes` refuses to absorb a heading, and a
  heading with no content-space predecessor takes the first-node veto branch.
- State in the spec what "chrome" means at a heading: the marker's trailing space is chrome and
  its deletion carries the merge intent, while a position inside the `#` run is the marker's own
  characters and stays ordinary editing — the same line the spec already draws inside a task
  item's `[ ]`.
- Cover the two vetoes and the marker-editing exclusion with unit tests at both gates, and an
  e2e case asserting the veto counter moves rather than only that the buffer is unchanged.

No breaking changes: every shape that behaves today keeps its exact verdict.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `node-edit-enforcement`: the enumerated merge chrome is broadened from a list marker's
  trailing space to any node marker's trailing space, ATX heading markers included; the
  marker-internals scenario is extended past list items; and the heading veto is stated
  concretely enough to be testable, including the document's first node, where the failure
  mode is a whole-document deletion rather than a demotion.
- `transaction-classification`: the chrome-boundary deletion shape the classifier recognizes is
  broadened the same way, from a list marker's trailing space to any node marker's. Both
  capabilities state this shape — one decides that the transaction crosses a boundary, the
  other what the crossing means — so widening either alone leaves the two contracts
  disagreeing about the same keypress.

## Impact

- `src/classify.ts` — `crossesViaChromeDeletion`'s marker-space shape, and the contract
  documented above it.
- `src/enforce.ts` — `recognizeMergeIntent`'s marker-space branch.
- `tests/classify.test.ts`, `tests/enforce.test.ts` — both gates, plus the negative controls.
- `e2e/specs/` — the enforcement spec covering merges and vetoes.
- No change to `src/ops.ts`: `mergeNodes`, `isContentStartCh`, `contentColumnCh` and
  `markerPrefixCh` already produce the right answers for headings, per the column measurements
  in the research note.

## Non-goals

- **Zoom.** The defect reproduces identically with and without a zoom scope active. This change
  does not touch `outline-zoom` and is deliberately kept out of `zoom-edit-confinement`, which
  carries its own delta for this same capability.
- **Setext headings.** Their text line has no marker, so their content start is column 0 and
  the newline shape that already vetoes covers them. Nothing to add.
- **Heading level editing.** Deleting a `#` from inside a `#` run demotes the heading and is
  left native, as ordinary marker editing.
- **The paragraph indentation column.** An indented paragraph's content start is whitespace,
  not a marker, and whether deleting into it carries a merge intent is a separate question this
  change does not open.
