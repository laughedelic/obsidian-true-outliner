# A refused command is invisible: the S1 op-sequence flake

Why `70-footer-enforcement`'s structural-operation case failed on CI's mobile matrix and passed
everywhere else, what the failure shape can and cannot mean, and the two properties of the test
that let a refused operation sit in it unnoticed.

The spike this case belongs to is S1 in
[backlinks-footer-spikes.md](backlinks-footer-spikes.md); its veto condition — a
perturbation the transaction filter cannot absorb — is what a genuine failure here would trip.
This note exists so that reading is not reached by default the next time the case goes red.

**Status: the test is fixed, the flake is not reproduced.** Two defects in the case itself were
found and corrected. The CI failure that prompted the pass is unexplained, and deliberately left
that way rather than closed with the most available story.

## What happened

`spike S1 … > does not change caret placement, selection escalation, or structural ops` failed on
run 34387259604, job `mobile (backlinks)`, at the `bufferAfterOps` comparison. The same tree
passed minutes earlier and `main` was green.

Retrieving that log is worth recording, because the obvious route gives the wrong answer. The run
was re-run, and `gh run view --job <id> --log` serves the **latest attempt** whatever job id it is
given — it returns a clean pass. The failing attempt is only reachable directly:

```bash
gh api --allow-escape-sequences repos/<owner>/<repo>/actions/jobs/<attempt-1-job-id>/logs
```

The `[S1] classifications` diagnostics are absent from a failing run, because the buffer
comparison throws before the line that prints them.

## The failure shape, and the one thing it can mean

`measure()` runs indent, outdent, move-up and move-down on the last node of
`Backlinks/Deep chain.md`. The document ends:

```
- kitchen
	- nothing this week
```

The observed buffer had the two siblings swapped against the expected one. Deriving what produces
that narrows the field to a single mechanism.

`- nothing this week` is the **only child** of `- kitchen`, so it has no previous sibling and
`indent-node` is refused — `no-previous-sibling`, surfaced as "Nothing above to indent under."
Measured against a live editor, that command dispatches nothing at all. The sequence that actually
runs is therefore outdent, move-up, move-down, and it does **not** net to the original document:
the expected `bufferAfterOps` is the outdented form, with both nodes at top level.

Against that, the observed buffer is move-up applied and move-down not. `move-node-down` declines
on a node with no next sibling (`no-sibling-below`), and after move-up the node that has none is
`- kitchen`. So the operation read the caret one line off from where move-up left it.

## Why the operand can be stale but the document cannot

`runOp` re-reads `editor.getValue()` and re-parses on every invocation — the fresh-tree guarantee
its own comment names. No structural command can act on a stale document, however late a previous
transaction settles, which rules out the reading that a command was dispatched against a document
that had not caught up.

What the command does read live is the **selection**: the operand comes from
`editor.listSelections()[0]`. That is the only channel through which timing can change the outcome,
and it is the channel the observed buffer points at.

## Finding 1 — a refusal is indistinguishable from success

`runOp` handles a declined operation by raising a `Notice` and returning. The command's
`editorCheckCallback` still returns `true`, because the command *ran*; the operation inside it is
what declined. `executeObsidianCommand` throws only when `executeCommandById` returns falsy, so
`runCommand` resolves normally.

From a spec, a refused structural command and a successful one are the same call with the same
result. Nothing in the harness reports which of the two happened.

## Finding 2 — a differential assertion cannot see a refusal in both halves

The case is deliberately comparative: the same script runs twice, widget off then on, and the two
records are compared. That framing is what makes the assertions survive legitimate policy changes,
and it should stay.

It has one blind spot, and the refused `indent-node` was sitting in it. An operation refused in
**both** halves produces two identical wrong answers, and the comparison passes. The case read as
exercising four operations while exercising three, for as long as it has existed.

## What the measurements say about the widget

Nothing implicates it.

- The CM6 dispatch trace across the four operations is byte-identical with and without the widget.
  Every dispatch originates in `runOp` — the transaction, and the `setCursor` that re-asserts the
  position it already holds. Nothing foreign intrudes on the window.
- The widget's extra `programmatic` transactions that S1 records land elsewhere in `measure()` —
  among the caret probes, the click and the select-all ladder — not among the operations.
- `Backlinks/Deep chain.md` has no backlinks at all. Its footer is the "nothing links to it" case:
  a bare header, with none of the asynchronous per-group fills that make the widget's DOM move.

The reproduction attempts, all against mobile emulation:

| Configuration | Result |
| --- | --- |
| Narrow runs, saved local layout | 20 runs, 0 failures |
| Op sequence in-session, footer on and off | 160 sequences, 0 failures |
| Full `measure()` body replayed in-session | 12 rounds, 0 diffs |
| Caret polled 0/50/150/400/1000 ms after move-up, widget mounted | 80 samples, 0 drifts |
| Footer repaint forced between move-up and move-down | 0/10 on, 0/10 off |
| Footer alternating under CPU starvation (load average ~46) | 0/40 on, 0/40 off |
| Narrow runs, fresh vault layout | 15 runs, 0 failures in this case |
| Whole `backlinks` group, fresh vault, CI's `max-instances: 4` | 6 runs, 0 failures |

## What changed

The operand moved to the last **flush-left list item**. Both it and the last node end the document,
which is what the case is about, but only the flush-left item has a previous sibling, so all four
operations now apply.

Flush-left is a source-level description, and the distinction is not pedantry. This fixture opens
with a paragraph, and `parse`'s attachment rule makes a list that follows one a child of that
paragraph — `doc.children` holds exactly one node, and `- kitchen` is the paragraph's last child
rather than the document's. Calling it top-level would put the research record at odds with the
model it cites.

That restores an invariant the sequence should always have had, and it is now asserted absolutely
in each half rather than only across them: four operations that undo one another must leave the
document exactly as they found it.

That round trip is necessary but **not sufficient**, and the first version of this fix stopped
there. Refusals can hide behind each other: if `move-node-up` is refused, the operand stays last
among its siblings, so `move-node-down` is refused too (`no-sibling-below`), and a document that
never moved is indistinguishable from one that moved and came back.

An earlier version of this note gave a different example — a refused `indent-node` leaving
`outdent-node` refused as `at-top-level` — which measurement does not support. That reading assumed
a document-root operand; the attachment rule above means the operand's path is two deep, so outdent
would apply and the round trip would in fact have caught it. The general claim holds and the
concrete case above is the one this fixture actually offers.

What closes that is requiring each step to **change** the document: the buffer is captured after
every command, and a step that changed nothing is a step that was refused. Confirmed by putting
the operand back and watching the assertions catch the refused indent by name.

The operand is also placed with `setCursorSettled` rather than `setCursor`. The plain set can be
moved by a later unannotated selection dispatch — the hazard that helper was written for, and one
that resolves differently under mobile emulation than on desktop. Every assertion about where a
caret ends up is still made after the gesture, so settling the start cannot hide a placement bug.

## What is still open

The CI failure itself. The corrections above make the case honest and make a future refusal name
itself, but neither reproduces what CI saw, and neither is offered as its cause.

The leading candidate remains a caret perturbed between two commands, on the evidence that only the
selection can be stale. It is unproven: no asynchronous drift was observed in a quiet session, and
the starved and cold-vault conditions did not produce one either. The runner was slow in a way no
local configuration matched — the same job measured the footer's first paint at 2630ms, against
roughly two locally.

Two smaller threads, recorded so they are not rediscovered:

- **`settle()` can fail structurally, not by timing.** `FOOTER` is scoped to
  `.workspace-leaf.mod-active`, and `settle` treats a missing footer as "not yet settled". When the
  active leaf has no footer the condition can never hold, and the wait spends its whole budget
  before reporting a timeout for something that was never a timing problem. Observed at ~20% in
  narrow runs against a fresh vault, at an identical rate with the budget doubled — which is what
  rules timing out — and not at all across six whole-group runs. The group-mode difference is
  unexplained.

  The footer's stability waits are unreliable on CI's mobile matrix beyond this case, and the
  pattern belongs to the job rather than to any one spec: `mobile (backlinks)` failed on `main` at
  `75-footer-behaviour`'s byte-and-undo case, and on this note's own branch at
  `77-footer-controls`'s narrow-header case — each inside a footer stability wait, and each on a
  spec the other run passed. A red `mobile (backlinks)` is therefore weak evidence about whatever
  change sits under it until the failing case has been read.
- **`test-vault/.obsidian/workspace.json` is untracked and local-only.** A saved layout changes
  which notes are warm when a spec starts, and CI never has one. Local reproduction of anything
  timing-sensitive in this area should delete it first, or it is measuring a different machine
  state than CI.

Follow-ups deferred rather than taken: the remaining `setCursor` calls in `measure()` that precede
a gesture have the same precondition hazard as the one fixed here, and the harness could report a
refused structural command directly instead of leaving specs to infer it from the buffer.
