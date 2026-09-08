## Context

The enforcement funnel is two gates in series: `classify` decides whether a transaction is
`boundary-crossing-edit` at all, and only then does the verdict layer compute `pass` / `rewrite`
/ `veto`. Backspace at a heading's content start clears neither. The full trace, the neighbouring
shapes that already veto, and the heading content-column measurements are in
[docs/research/25-heading-content-start-backspace.md](../../../docs/research/25-heading-content-start-backspace.md).

Two constraints shape the approach. The marker-space shape is invisible at line granularity — a
one-character deletion inside one line — so it exists as an explicit shape in both gates rather
than falling out of a span comparison. And the two gates are written as a matched pair, a
pairing `isContentStartCh`'s own comment states: if they disagree, the keypress either falls
through to a native edit or arrives at enforcement with nothing to do.

## Goals / Non-Goals

**Goals:**

- The heading marker-space shape reaches the verdict layer and receives the veto the spec states.
- Every shape that behaves today keeps its exact verdict, including the list-item merges the same
  code path serves.
- The two gates stay a matched pair, and the tests say so at both.

**Non-Goals:**

- New rejection reasons, new cue copy, or any change to `ops.ts`. See Decisions.
- Widening past headings. See proposal.md — Non-goals for zoom, setext, heading levels and the
  paragraph indentation column.

## Decisions

**Both gates move together, or neither does.** Widening `classify` alone is not a partial fix —
it is a worse defect. With the verdict layer's own kind gate still closed, the newly-classified
transaction falls past merge recognition into the deletion path, whose cover computation reads a
one-character range as covering the heading's whole subtree; the research note records the
measured result, a section deletion, and a whole-document deletion on the first node. So this
change is two conditions landing in one commit, and the task breakdown keeps the negative
control that proves the pairing: with only the classifier widened, the heading test must fail
loudly rather than pass by a different route.

**Widen by node kind at the existing shape, rather than dropping the kind test.** The gate could
simply stop asking about kind — every kind's content-start column is already computed correctly
by `isContentStartCh`. It is not dropped, because a paragraph's content start is indentation
whitespace rather than a marker, and whether deleting into it carries a merge intent is a
question this change does not open. Admitting `heading` explicitly keeps the widening exactly as
wide as the measurement that justifies it, and leaves the paragraph question visible for whoever
opens it.

The distinction needs a control, and the obvious two do not provide one: measured, a caret
inside a heading's `#` run and an existing list-item merge both behave identically under either
form of the widening, because the first is rejected by the column test whatever the kind and the
second is admitted either way. Only an indented paragraph separates them — `contentColumnCh`
reads its leading whitespace as a content prefix, so a dropped guard turns Backspace at its
content start into a merge. The table is in the research note, and the task list carries that
case as the control.

**Reuse the veto rules already written; add no new ones.** `mergeNodes` already rejects any merge
whose absorbed node is a heading, and the recognizer's existing first-node branch already covers
a heading with no content-space predecessor. The two vetoes that result carry existing reasons
whose cue copy is already truthful for a heading — "These blocks can't be joined into one." and
"Nothing here to join with." — so no message work is needed. This is why the change reaches
`ops.ts` not at all.

**Assert the mechanism, not the buffer.** An unchanged buffer is what a veto produces and also
what a silently-dropped transaction produces. The e2e case asserts the veto counter moves, which
is the only assertion that distinguishes them.

## Risks / Trade-offs

- **A heading's content-start column is computed by shared code, so widening the gate depends on
  that code being right for headings** → measured directly rather than assumed: every heading
  shape resolves exactly one content-start column, and the task item's second column collapses
  because the guard requiring a real list marker before a task marker already exists. The table
  is in the research note.

- **The first-node veto surfaces as `no-following-neighbor`, whose name reads backwards for a
  missing PREDECESSOR** → pre-existing, and its user-facing message is correct either way. Left
  alone: renaming a shared rejection reason is a wider change than this one, and the naming
  question belongs in the parking lot rather than here.

- **`zoom-edit-confinement` carries its own delta for this same capability** → the two deltas
  touch different requirements and different files, so they do not conflict on disk. Whichever
  syncs second re-reads the main spec, which is the ordinary case.
