## Context

The zoom scope has one piece of stored state — an anchor position — and everything else is
derived from it by `src/zoom.ts` at the moment it is needed. Two consumers already ask that module
whether something escapes: `grammar.ts` calls `splitEscapes` for the node-splitting keys, and
`main.ts` calls `operandEscapes` for the structural commands. A third consumer, the enforcement
funnel in `transaction-filter.ts`, never asks — and it is the one that decides merges, deletions
and pastes.

Standing in for the missing check is `zoom-state.ts`'s trigger 2, an offset comparison in the
before state. docs/research/26 measures what it does and does not catch, and its "Consequences"
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

An edit is inside the scope when, asked in this order: **(0)** the change removed the root's whole
subtree cover, in which case it is not an escape and nothing further is asked (D7); otherwise
**(1)** the node OWNING the root's own first line holds the position in the tree the root held,
and **(2)** the text outside the root's subtree is byte-identical to what it was before.

Every simpler formulation was tried against docs/research/26's tables and each fails a measured
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

### D2: Clause 1's identity is the tree PATH, not the node id

Node ids are allocated by a global counter and never survive a re-parse, which `zoom.ts`'s
`reresolveZoom` already documents at length; comparing them across a parse boundary silently
answers "different" always. `startLine` is the parse-independent fact the module already leans on,
but it is not identity — after an unwrap a DIFFERENT node begins on the same line, which is
exactly the measured retarget (docs/research/26, R4).

The line is resolved by OWNERSHIP, the way `nodeAtLine` resolves every other line-to-node question
in this codebase, rather than by "which node begins here".

An earlier draft claimed R7 turns on that choice — a Mod-Backspace that empties the root's own line
leaves nothing beginning there — and a negative control run against the real predicate says it does
not. Both readings refuse R7: ownership finds the node ABOVE, at a differing position, and
"begins here" finds nothing at all, which the predicate already treats as a vanished root. The
choice is consistency with the rest of the codebase, not behaviour, and the draft's stronger claim
is withdrawn rather than left standing as a reason nobody can reproduce.

`findPath` already exists and already backs the ancestor trail. The path of the node beginning on
the anchor's line is parse-independent, and it is stable under every in-scope edit: an enforced
edit cannot add or remove a sibling before the root, because those siblings are outside the scope
and clause 2 refuses any change to them. So a differing path means the root was dissolved.

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

A `pass` verdict has no after-document, so the check parses `tr.newDoc`. D5 explains why that is
not the extra cost it looks like, and why no gate stands between it and the invariant.

### D5: There is no sound textual shortcut; the parse cache is what makes the invariant cheap

An earlier draft of this design gated the invariant behind an offset test — skip the clauses when
every changed range lies strictly inside the cover — on the grounds that such an edit cannot reach
hidden text. **That gate is unsound, and the counter-example is an ordinary paste.** Zoomed to
`## Two`, paste `# H1` with a body into the middle of its section. `classify.ts` sees a structural
block sequence and routes it to the paste verdict, so it reaches the check; the splice lands
strictly between the cover's endpoints, so the gate would wave it through; and afterwards a
top-level heading sits inside the section, which ENDS the section there and puts everything below
the splice outside the zoom root's subtree. Clause 2 catches it, because the text outside the
subtree is no longer what it was. The gate never runs clause 2.

Two related shapes are worth naming, because they bound the guarantee rather than break the gate.
Changing a descendant heading's marker from `###` to `#`, and typing one character into an `hr`
(`***`) so it stops parsing as one — `zoom-state.ts` already records the latter as measured — both
change tree membership from a single line. Neither reaches this check, because `classify.ts` reads
them as within-node authoring and no verdict is computed at all — for the marker case that is not
an accident of classification but a stated rule, which `node-edit-enforcement` carries as
"Editing a heading's own marker characters stays ordinary". That is a deliberate limit, and
the `node-edit-enforcement` delta states it: such an edit can narrow what the root's subtree
contains, but it cannot alter content the user cannot see, so the visible range narrows honestly
instead of the document changing behind it. What these two DO establish is that no cheaper textual
shape rescues the gate for the edits that do reach it: **any edit to any line can change that
line's kind, and a change of kind can change tree membership**, so a shortcut that decides
membership without consulting the tree is wrong by construction — which is the mistake D1 exists to
stop repeating.

So the invariant runs whenever a zoom is active and a verdict is being computed, and the cost is
answered by the cache rather than by a shortcut. `parsed-doc.ts` is a `WeakMap` keyed on CM6's
immutable `Text`, so parsing `tr.newDoc` here is not an extra parse but an EARLIER one: the very
next transaction reads that same `Text` as its `startState.doc` and takes a cache hit. On the
rewrite path D4 removes even that, because the after-`OutlineDoc` already exists.

`node-edit-enforcement` states a latency budget for the enforced path, and this design spends more
on that path than the rejected gate would have. That makes the measurement an obligation rather
than a nicety, and it appears in tasks as one.

### D6: Trigger 2 consults the same predicate, and stops being the primary answer

The automatic exit keeps its job for changes that never pass enforcement — history transactions,
which CodeMirror dispatches with `filter: false`, sync writes, another pane. It stops firing for
enforced edits for two reasons at once: an escaping one is now refused before it applies, and an
in-scope one is now correctly judged inside. Sharing the predicate is what makes the second true;
leaving `touchesOutside` in place beside it would be two answers to one question.

Trigger 1 gains D2's identity for the same reason, replacing "some node begins at the anchor".

### D7: Deleting the root's subtree deliberately still succeeds and still exits

This needs clause 0, and an earlier draft of this design was wrong to think it did not. That draft
claimed clauses 1 and 2 allow a whole-subtree deletion between them, on the reasoning that the
sibling inheriting the anchor holds the root's old position and that nothing outside the cover
changed. Both halves were checked against the parser and both are false:

| a whole-subtree deletion of `- beta` | what owns the anchor line | clause 1 | clause 2 |
| --- | --- | --- | --- |
| mid-document, `- gamma` follows | `- gamma`, path `[1]` | passes | **fails** — `- gamma` moved from outside the cover to inside it, so the outside text differs |
| the root ENDS the document | `- alpha`, path `[0]` | **fails** | fails |

The second row is the one an earlier review round already flagged. That draft's answer was a "no
node resolves there" arm on the identity clause; measurement shows a node always resolves — the
trailing blank line is owned by the node above it — so the arm never fires.

The cause is common to both rows: clauses 1 and 2 begin by locating the root on its own first
line, and once the root is deleted that line belongs to something else, which is then mistaken for
the root. No refinement of either clause fixes that, because the question they ask has no answer.

Clause 0 asks one that does, about the CHANGE rather than the after-state: did the removed lines
cover the root's whole subtree? `zoom-state.ts`'s trigger 1a already computes exactly this to
decide the exit, so the predicate and the exit agree on the fact by sharing it rather than by each
deriving it.

With clause 0 in front, the predicate says "inside", nothing is refused, and
trigger 1a — the whole old cover mapped away — clears the zoom, exactly as `outline-zoom`
specifies today. This is deliberate and it is the one place the design does NOT follow Logseq,
whose focused root cannot be deleted at all (docs/research/26). An explicit selection of the whole
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
- **Clause 2 needs the after-cover to know where the outside text starts, and the after-cover
  needs the root.** → Hence the stated order: clause 0 answers the case where there is no root to
  find, clause 1 then establishes that the one found is the right one, and only then does clause 2
  have something meaningful to compare against.
- **The invariant now runs on every enforced edit while zoomed, with no shortcut in front of it.**
  → D5 argues the parse is amortised by `parsed-doc.ts`'s cache rather than added, but that is an
  argument and not a measurement; a task measures the enforced path against
  `node-edit-enforcement`'s stated budget with a zoom active, and the budget is what settles it.
- **`RewriteVerdict` grows a field that only one caller reads.** → It is the after-state the
  verdict was computed from; carrying it is cheaper and more honest than re-deriving it.

## Open Questions

- Whether a refused boundary edit should also nudge the view — a brief highlight on the zoom root,
  say — rather than only showing the notice. The refusal is correct either way and the cue path is
  unchanged, so this can be answered after the behaviour has been used against a real vault.
