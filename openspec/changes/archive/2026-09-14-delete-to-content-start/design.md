## Context

The key is unbound by the plugin today and reaches CodeMirror's `deleteLineBoundaryBackward`,
whose range classification cannot distinguish from a whole-line selection. The measured
shapes, the two branches they take, and why the classifier is the wrong place are in
[docs/research/delete-to-content-start.md](../../../docs/research/delete-to-content-start.md).
`makeHomeEndHandler` in `keymap.ts` already computes the column this deletion should stop at.

## Goals / Non-Goals

**Goals:**

- The deletion stops where Home stops, plus a task marker, and never at column 0.
- The two entry points — the key on macOS, the command everywhere — run one handler.

**Non-Goals:**

- Any change to the enforcement funnel or to what Backspace does.

## Decisions

**A pure planner in `caret-policy.ts`, a thin handler in `keymap.ts`.** The planner takes
the parsed document and the caret and answers `delete` with a start, `backspace`, or `null`;
the handler dispatches. The alternative — computing inside the handler like Home does — would
leave the column rule testable only end to end.

**Past the task marker, unlike Home.** Home lands before the checkbox because the checkbox is
addressable; a deletion that stopped there would take the checkbox with the text. The planner
adds `taskMarkerLength` to the caret's own boundary, the same composition `pastTaskMarker`
uses for a caret an operation places.

**At the content start, run Backspace.** `deleteCharBackward` from `@codemirror/commands`
produces the one-character deletion the content-start rules recognize, so the merge, the
veto and marker editing all come from rules already written. Declining instead would let the
stock binding delete the marker, which is the R7 demotion the research note records.

**Cancel a provisional position first.** Backspace on a place a keypress just created cancels
it; the handler runs the same cancel before planning, so the two keys agree there.

**`mac` only, plus a command.** CodeMirror binds Mod-Backspace on macOS alone; on Windows and
Linux Ctrl-Backspace is word deletion, which a `key:` binding would take. The command is the
same handler, falling back to CodeMirror's line-boundary deletion where the handler declines,
so it behaves as the key wherever it is invoked — and it is the route the Linux e2e runner
has to the rule.

## Risks / Trade-offs

- **A `userEvent` of `delete.backward` on a multi-character range** → matches what
  `deleteBy` itself emits for this key; the filter classifies the range within-node from its
  facts, not from the event.
- **The command's check returns true whenever outline mode is on, even where the handler
  declines** → the fallback runs then, so invoking it always does what the key would.
