## Context

The zoom scope has one piece of stored state — an anchor position — and everything else is
derived from it by `src/zoom.ts` at the moment it is needed. Two consumers already ask that module
whether something escapes: `grammar.ts` calls `splitEscapes` for the node-splitting keys, and
`main.ts` calls `operandEscapes` for the structural commands. A third consumer, the enforcement
funnel in `transaction-filter.ts`, never asks — and it is the one that decides merges, deletions
and pastes.

Standing in for the missing check is `zoom-state.ts`'s trigger 2, an offset comparison in the
before state. docs/research/24 measures what it does and does not catch, and its "Consequences"
section is the input to every decision below. Two facts from it shape the whole design:
`touchesOutside` mis-classifies every append at the tail of the scope, and no formulation over
changed POSITIONS — before-state or after-state — survives all the measured rows.

## Goals / Non-Goals

**Goals:**

- One predicate, in `zoom.ts`, that both the refusal and the automatic exit consult, so they
  cannot disagree.
- Keep `enforce.ts` free of zoom. It is the pure verdict layer and the unit suite reaches it
  without CodeMirror or Obsidian; a scope parameter threaded through every verdict shape would be
  the widest possible change for the narrowest possible gain.
- Pay nothing on the common path. A zoom is active for a minority of edits and boundary edits are
  a minority of those.

**Non-Goals:**

- Confining anything the shipped feature already confines correctly — motion, selection, the
  ladder, extension, the structural operands.
- Any change to the hiding decorations, the trail, or re-basing.
- See proposal.md — Non-goals for the scope boundaries this change does not cross.

## Decisions

### D1: The rule is the invariant, not a comparison of positions

An edit is inside the scope when, after the change, (1) the text outside the root's subtree is
byte-identical, (2) everything inserted lies inside the root's new subtree, and (3) the root is
still the same node.

Every simpler formulation was tried against docs/research/24's tables and each fails a measured
row. "Changed positions inside the before-cover" fails X2 — one insertion offset, two structural
answers depending only on the inserted text. "Changed positions inside the after-cover" fails B1 —
the change removes a single line break and a whole hidden node is absorbed by it. Any offset rule
at all fails every tail append unless the cover's end is redefined to include its own terminating
line break, which is the same off-by-one docs/research/23 already had to fix one layer down on
the hiding decorations. Stating the invariant directly costs one string comparison and stops the
recurrence.

Each clause earns its place: (1) alone passes a paste that adds a sibling beside the root without
touching a hidden byte; (2) alone passes a merge that absorbs hidden content; (3) alone passes
both, and is the only clause that catches a Backspace dissolving an emptied list-item root.

*Alternative considered — widen the cover's offset range by one and keep an offset test.* It fixes
the appends and nothing else, and B1 shows the class of defect it cannot reach. Rejected: it would
leave the same rule wrong for a different reason, which is how this defect was introduced.

### D2: Clause (3)'s identity is the tree PATH, not the node id

Node ids are allocated by a global counter and never survive a re-parse, which `zoom.ts`'s
`reresolveZoom` already documents at length; comparing them across a parse boundary silently
answers "different" always. `startLine` is the parse-independent fact the module already leans on,
but it is not identity — after an unwrap a DIFFERENT node begins on the same line, which is
exactly the measured retarget (docs/research/24, R4).

`findPath` already exists and already backs the ancestor trail. The path of the node beginning on
the anchor's line is parse-independent, and it is stable under every in-scope edit: an enforced
edit cannot add or remove a sibling before the root, because those siblings are outside the scope
and clause (1) refuses any change to them. So a differing path means the root was dissolved.

*Alternative considered — compare the root's kind and first line.* The root's own text is editable
while zoomed, so the text half is unusable, and the kind half does not separate an unwrapped list
root from the list item that replaces it. Measured: both are list items.

### D3: The predicate lives in `zoom.ts`; the veto is applied in `transaction-filter.ts`

`zoom.ts` gains one exported function beside `operandEscapes` and `splitEscapes`, taking the
before-scope, the after-document, and the change's inserted ranges. The transaction filter already
resolves the scope for its selection-only branch; it resolves it once more for the
boundary-crossing branch, computes the verdict exactly as it does today, and replaces the verdict
with a `would-leave-zoom-scope` veto when the predicate says the result escapes.

This keeps `enforce.ts` pure and keeps the rule in the module that owns the scope's geometry — the
same shape the structural layer already uses, so "one judgement, two callers" holds by
construction rather than by review.

*Alternative considered — thread a scope through `computeVerdictForRanges`.* Every verdict shape
would grow a parameter it mostly ignores, and the pure unit suite would need a scope fixture for
tests that have nothing to do with zoom.

### D4: The after-document reaches the check without a second parse where it can

A rewrite verdict is produced from an `OpOutput` that already holds the after-`OutlineDoc`;
`RewriteVerdict` currently drops it and keeps only the line edits. Carrying it on the verdict is a
one-field addition and removes the only unavoidable re-parse on the rewrite path.

A `pass` verdict has no after-document, so the check parses `tr.newDoc` — but only after the cheap
gate in D5 says the edit is near an edge, which a pass verdict at an edge is by definition rare.

### D5: A cheap gate keeps the invariant off the common path

Before any of D1's clauses run: if every changed range lies STRICTLY inside the cover's offsets —
touching neither endpoint — and the change inserts nothing at either endpoint, the edit cannot
alter hidden text, cannot insert outside, and cannot dissolve the root's own first line. Typing,
mid-node editing and merges between two visible nodes all take this exit with two integer
comparisons.

`node-edit-enforcement` states a latency budget for the enforced path, so this is a measurement
obligation, not an optimisation preference — it appears in tasks as one.

### D6: Trigger 2 consults the same predicate, and stops being the primary answer

The automatic exit keeps its job for changes that never pass enforcement — history transactions,
which CodeMirror dispatches with `filter: false`, sync writes, another pane. It stops firing for
enforced edits for two reasons at once: an escaping one is now refused before it applies, and an
in-scope one is now correctly judged inside. Sharing the predicate is what makes the second true;
leaving `touchesOutside` in place beside it would be two answers to one question.

Trigger 1 gains D2's identity for the same reason, replacing "some node begins at the anchor".

### D7: Deleting the root's subtree deliberately still succeeds and still exits

Clause (1) is satisfied when a whole-subtree deletion removes only the root's own lines, clause
(2) has nothing to check, and clause (3) is satisfied because the node that inherits the anchor
holds the root's old position in the tree. So the predicate says "inside", nothing is refused, and
trigger 1a — the whole old cover mapped away — clears the zoom, exactly as `outline-zoom`
specifies today. This is deliberate and it is the one place the design does NOT follow Logseq,
whose focused root cannot be deleted at all (docs/research/24). An explicit selection of the whole
subtree is an unambiguous request; a Backspace on an emptied line is not.

### D8: No new rejection reason

`would-leave-zoom-scope` already exists, is already surfaced by `REJECTION_MESSAGES`, and already
means precisely this. A second reason would say the same thing in a second voice and would make
the e2e assertions depend on which layer refused, which is the coupling this change exists to
remove.

## Risks / Trade-offs

- **A false refusal is worse than a false exit.** Today's failure mode loses the zoom; the new one
  would refuse an edit the user is entitled to make. → The measured catalogue becomes assertions
  in `80-outline-zoom`, with the ALLOWED rows asserted as forcefully as the refused ones — the
  in-scope append, the in-scope paste, the gap-line deletion, the in-scope merge, and typing into
  the root all have their own scenarios in the delta specs.
- **The invariant is stated over text, so a change that rewrites hidden text to identical bytes
  reads as no change.** → Accepted: a change that leaves every hidden byte where it was has not
  moved anything out of the subtree, which is the guarantee the scope makes.
- **Clause (1) needs the after-cover to know where the hidden text starts, and the after-cover
  needs the root, and the root needs clause (3).** → Evaluate (3) first and let it short-circuit;
  a dissolved root is refused before the text comparison has anything to compare against.
- **The extra parse on the pass path could breach the enforced-path budget.** → D5's gate, plus a
  measurement task against `node-edit-enforcement`'s stated budget with the zoom active.
- **`RewriteVerdict` grows a field that only one caller reads.** → It is the after-state the
  verdict was computed from; carrying it is cheaper and more honest than re-deriving it.

## Open Questions

- Whether a refused boundary edit should also nudge the view — a brief highlight on the zoom root,
  say — rather than only showing the notice. The refusal is correct either way and the cue path is
  unchanged, so this can be answered after the behaviour has been used against a real vault.
