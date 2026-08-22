## Context

See proposal.md — Why. The short version: both structural entry points read a position, not a
selection.

What already exists, and is the reason this change is mostly wiring rather than new algebra:

- `escalate.ts` turns any range into a forest of whole subtrees (`escalateRange`,
  `forestCoverOf`, `coveredForestOf`).
- `enforce.ts` groups those roots into one contiguous sibling run per parent
  (`groupRootsByParent`, exported precisely so there is one implementation) and its private
  `coverGroupsOf` is the whole operand resolution already written once, for deletion.
- `ops.ts`'s `deleteSubtreeGroups` is the precedent for a group operation: same typed result,
  one minimal edit list, one anchor.
- `grammar.ts` already imports `coveredForestOf` and `groupRootsByParent`, and already has a
  second planning path for a non-empty selection (`planOverSelection`, used by Enter and
  Shift+Enter).
- `record-decision.ts`'s `needsRecording` compares whole `EditorSelection`s, not carets, so a
  dispatched cover flows through history with no change.

Two constraints shape everything below. `minimal-change-dispatch` requires one minimal
character-level change set per operation — so "apply the single-node op four times and dispatch
the diff" is not available. And operations return a freshly re-parsed tree, so node identity
does not survive; anything the caller needs afterward has to be stated in the result.

## Goals / Non-Goals

**Goals:**

- One operand rule, one after-state rule, read by both entry points.
- Group semantics that are provable against the existing single-node algebra rather than
  re-derived, so the per-kind rules stay in exactly one place.
- Every current single-node behaviour byte-identical, including its caret.

**Non-Goals:**

- New per-kind algebra. Heading level-shift and non-heading reparenting are reused verbatim.
- Multi-range structural edits (proposal — Out of scope).
- Any change to escalation geometry, to `caret-policy.ts`'s rules, or to what a selection can
  contain.
- A stored block-selection mode. The operand is read from the selection's shape, the same
  discriminator `node-selection-extension` and the decoration layer already use.

## Decisions

### D1. The group algebra is defined as sequential composition, not re-derived

`indentGroups(doc, groups)` produces the tree that applying `indent` to each covered root in
turn produces. This is the spec's definition, not merely an implementation note, and it buys
three things at once.

It keeps the two-regime algebra in one place. A run mixing a paragraph and a heading needs no
new rule: each root gets its own, exactly as if the user had pressed Tab on each in turn.

It answers the destination question for free. Indenting `[b, c]` whose previous sibling is `a`:
`indent(b)` makes `b` the last child of `a`, which removes `b` from that sibling list — so `c`'s
previous sibling is now `a` itself, and `indent(c)` makes `c` the last child of `a` in turn,
landing it after `b`. The run ends up under `a` in its original order, which is the intended
behaviour — derived from the single-node rule, not stipulated.

And it gives a property test with no hand-written oracle: run the group op, run the loop, assert
the trees are equal. That is the shape this project already trusts (`closure.test.ts`).

*Direction matters for move down only.* Applying `moveDown` in document order over `[a, b]`
swaps `a` past `b` — a member of its own operand. Reverse order gives the run moving past its
own neighbour. Indent, outdent and move up are correct in document order (outdent is
order-independent, checked by hand on `- p / - x / - y / - z`).

*Composition is the right definition for indent and outdent at ANY cover shape, and for the
reorders only within ONE scope.* Measured, not assumed — see D8. The spec states the
restriction on the reorders' operand rather than weakening the composition rule, so the
definition stays one sentence.

*And composition is SUBORDINATE to order preservation, which is a correction to this decision
made during implementation — see D10.* The composition remains how the per-kind algebra is
reused; it is no longer the last word on the result.

*Alternative rejected:* stating fresh multi-root rules per kind. That is a second copy of the
algebra, and the mixed-kind sibling run is exactly where two copies would drift.

### D2. Group forms compose SURGERIES and finalize once

*(Amended during implementation. This decision originally called for a bespoke one-pass surgery
per operation; what was built composes the single-node surgeries instead. The cost of that
choice is measured below and knowingly accepted — see D12.)*

Each single-node operation is split into a SURGERY (tree → tree) and a `finalize`. The group
forms apply the surgery to each covered root in turn and call `finalize` once, which computes
minimal edits by diffing the re-encoded tree against the original. That is where the minimal-edit
guarantee already comes from, so group forms inherit it rather than restating it.

Composing surgeries rather than whole OPERATIONS is what keeps this affordable: a whole-operation
composition re-encodes, diffs and re-parses per root, measured at 1.24 ms per step on a 2000-line
note — 12.45 ms for a ten-node run, with `parse` alone accounting for 0.96 ms of each step.
Composing surgeries pays for one `finalize` however many roots there are.

That the two are EQUIVALENT is not assumed: every operation guarantees closure, so the re-parse a
whole-operation composition performs between steps is the identity. The property suite checks it
against an oracle that really does re-parse between steps — and that check is what found the
places where closure does not actually hold (D10, D11).

*Alternative rejected:* a bespoke one-pass surgery per operation, splicing a whole run in two
`updateSiblings` calls. Faster (see D12), but it is a second implementation of the per-kind
algebra, and D1 exists precisely because two copies drift. Reuse first, optimise on evidence.

### D12. The per-root cost is accepted for now, and this is what fixing it takes

Raised in review (PR #50) and measured rather than argued. `applyGroups` runs one full surgery
per root; each does a linear `findPath` and rebuilds the sibling spine, so a k-root operand on an
n-node note is Θ(k·n).

Measured, group outdent on a ~2000-line note:

| roots | time |
|---|---|
| 2 | 1.7 ms |
| 10 | 2.3 ms |
| 50 | 7.0 ms |
| 200 | 15.4 ms |

Fine at the selection sizes real editing produces, and past the 8 ms p95 this project holds
keystroke paths to once a selection gets large. Mod+A followed by Shift+Tab on a list-heavy note
reaches k=200. No stated budget formally governs this path — the existing ones are
`transaction-classification`'s (≤1 ms median, ≤8 ms p95) and `node-edit-enforcement`'s (≤3 ms
median, ≤8 ms p95) — so this is a quality limit rather than a spec violation, which is why it is
recorded rather than treated as blocking.

**When to revisit:** a real report of lag on a large selection, or any change that makes big
covers routine.

**What the fix is.** For a SINGLE group — every root sharing one parent, which is the common
shape and the only one the reorders accept — splice the whole run at once instead of per root:
remove `[lo..hi]` from the parent's children in one `updateSiblings`, re-encode the roots, and
insert them at the destination in one more. Two tree rebuilds instead of 2k, and no repeated
`findPath`.

**What makes it safe to do later.** The property suite added here compares each group form
against the sequential-composition oracle over generated documents, and asserts the
order-preservation invariant directly. An optimisation that changes the result fails those
immediately, which is the whole reason D1 states the composition as the specification.

**The traps, so they are not rediscovered.** Same-parent bookkeeping: `deleteSubtreeGroups`
documents why two `updateSiblings` calls at one path see indices already shifted by the first.
And the destination context is per root and CUMULATIVE — `encodingKindAtDestination` and
`destinationIndent` are evaluated against the destination's children as they stand, so a one-pass
version must thread a growing children array rather than compute all roots against the original.
`outdentSurgery` already models exactly that for its re-parented following siblings; copy that
shape rather than inventing one.

### D3. The result states a subject span; the caller recomputes the cover from it

Node identity does not survive an operation. Rather than returning ids into a fresh tree (which
invites callers to hold them across another operation) or having the caller re-derive which
nodes moved (which is guesswork), the result states a line range: from the first subject's start
line through the last subject's cover end, in the result document.

That range is already an exact cover, so the dispatch layer converts it to offsets and dispatches
it as-is. No escalation, no second geometry.

This extends `OpOutput` alongside the existing `anchor` rather than replacing it. The anchor is
load-bearing elsewhere — `enforce.ts`'s delete-then-splice locates the surviving neighbour by it
— and it answers a different question: where a caret would go, not which nodes moved.

*Contiguity was the assumption this rested on, and task 1.1 measured it before anything was
built on it.* It holds for indent and outdent at any cover shape, and fails for the reorders
across scopes — which is what D8 restricts. With that restriction the span is one range by
construction, so the after-state rule needs no runtime contiguity check and no multi-range
fallback.

### D4. The after-state is keyed on whether the operand WAS a cover

Not on how many roots it had. A single-root cover (one Shift+ArrowDown) keeps its cover; a
character range inside one node keeps its caret. The rule is "preserve the kind of selection the
user had", which is one sentence and reads correctly in both directions.

Keying on root count instead would mean a single-root cover collapses to a caret while a
two-root cover does not — the user's selection surviving or not depending on how far they
extended it, which is the arbitrary shape this change exists to remove.

Keying on cover-ness also keeps every existing test honest: today's Tab-with-a-text-selection
behaviour is unchanged, and today's Tab-on-a-block-cover behaviour (a caret on a gap line, the
regression `caret-policy.ts`'s fallback exists to catch) simply stops arising.

### D5. Operand resolution is one function, promoted out of `enforce.ts`

`coverGroupsOf` is private there. It does exactly what the operand rule needs: escalate the
range, resolve start and end nodes, return `undefined` for out-of-jurisdiction, group by parent.
Export it (or move it beside `groupRootsByParent`) and call it from the grammar and the command
path. The deletion path keeps using the same function.

The alternative — a second resolution in `grammar.ts` — is the failure mode this codebase has
hit repeatedly (`caret-placement-policy` exists because one question had seven answers). One
resolution also means a cover reached by any gesture is operated on identically, which is what
the spec's provenance-independence requirement asserts.

### D6. The palette path reads `listSelections()`, and declines under multi-cursor

`runOp` currently reads `editor.getCursor()`. Obsidian's public `Editor` exposes
`listSelections()`, which gives the ranges without touching CM6 internals — so the command path
can resolve the same operand as the keymap and gate on range count in its `editorCheckCallback`,
making the command unavailable rather than silently acting on one range.

The known asymmetry stays: the command path cannot read the `indentUnit` facet through the
public API, so brand-new indentation falls back to document inference there. Documented already
in `main.ts`; unchanged by this work.

### D7. Rejection reports the first failing step, in application order

Atomic rejection needs one reason to show. Taking the first failure in the order the composition
applies means the message names the root the user would think of first — for move down, that is
the last root in document order, which is the one adjacent to the obstacle. The existing
`REJECTION_MESSAGES` table is reused with no new entries; `empty-selection` already exists for
the empty-forest case.

### D8. The reorders take a single sibling run; indent and outdent take any forest

Task 1.1 ran first, as its own gate, and returned a split answer.

**Measured** over generated documents (labelled nodes, the sequential composition applied, then
the result's roots checked against the forest cover spanning them; 20 000 runs per operation,
re-run on post-#51 code with ordered markers included):

| operation | multi-parent cover, accepted | roots left adjacent |
|---|---|---|
| indent | 3723 | 3723 |
| outdent | 2577 | 2577 |
| move up | 3100 | **0** |
| move down | 0 of 8141 | — (never accepted) |

The reorder failure is not a contiguity technicality, it is the gesture meaning something else.
Each group moves within its own scope, so on

    L0
    - L1
      - L2
      - L3   <- covered
      - L4   <- covered

    L5       <- covered

move up sends `L5` to the top of the document while `L3`/`L4` shuffle inside `L1`. Nothing
about that is a weaker version of "move these three up".

So the moves reject a multi-parent operand with `cannot-reorder-across-scopes`, checkable up
front from the group count. Move DOWN is restricted on the same rule despite never being
observed to tear: its last root is its scope's last child, so the multi-parent case is
essentially always rejected already, and one rule beats two that differ by which one the
generator happened to reach.

*Alternatives rejected.* Normalizing a mixed-depth cover up to its shallowest common scope
moves more than the user selected — the surprise is worse than the rejection. Allowing a
multi-range after-state breaks the discriminator `node-selection-extension` and the decoration
layer both read (one range is a block selection, several are multi-cursor), which is a much
larger change than this one. Rejecting post-hoc on a computed contiguity check makes the
contract a property of the result rather than a precondition, and costs a full surgery pass to
discover a rejection.

### D9. A pre-existing indent bug was in the way, and is fixed separately

`destinationIndent` returned `parentIndent + inferIndentUnit(doc)` for a list-item parent,
which ignores the parent's MARKER WIDTH. Indenting `- b` under `1. a` emitted `  - b` while
`1. a`'s content column is 3, so `finalize`'s re-parse left `b` a top-level sibling: the
operation reported success, edited the document, consumed an undo step, and changed nothing
structurally.

It surfaced here because it made indent look like it violated contiguity — 37 apparent failures
that vanished entirely once ordered markers were excluded from the generator, which is how it
was identified rather than guessed at. Re-measured after #51 merged, with ordered markers back
IN: indent tears zero times in 3723 accepted multi-parent covers. That is the confirmation the
exclusion could only stand in for.

Worth recording for anyone extending the property suite: `closure.test.ts` cannot catch this
class of bug at all. `finalize` returns `doc: parse(text)`, so `treesEqual(result.doc,
parse(encode(result.doc)))` is true by construction. A test that catches it has to assert the
SUBJECT's resulting parent or depth.

Fixed on its own branch (PR #51, `fix(ops): an indent has to reach the destination's content
column`). This change REBASES on it and assumes it fixed; the group property tests would
otherwise fail for a reason that has nothing to do with them.

### D10. Order preservation outranks the composition

D1 defined a group result AS the sequential composition. Implementing it showed that
definition is wrong in a specific, measurable way, and the spec now states order preservation
first with the composition subordinate to it.

A composition moves one root at a time, and an intermediate tree need not be REPRESENTABLE.
Markdown cannot encode a list item as a paragraph's following sibling, so `finalize`'s re-parse
between two steps is not a formality — it reshapes the document under the steps that have not
run yet.

Measured on `- L0` / `L1` / `L2`, moving the run `[L1, L2]` up:

| | result |
|---|---|
| whole run at once | `L1` / `L2` / `- L0` — the run keeps its order |
| one root at a time | `L2` / `L1` / `- L0` — the run is REVERSED |

Step one swaps `L1` above `- L0`, whose encoding re-parses with `- L0` as L1's own child; step
two then finds L2's previous sibling to be `L1` and swaps past it.

**Every** disagreement between the implementation and the composition has this shape: 49 of 49,
always with the composition losing the run's order and the implementation keeping it, never the
reverse. `indent` and `outdent` agree everywhere measured (2469 and 2062 accepted cases, zero
divergences); only the reorders are affected.

So the group forms are not an approximation of the composition — they are better defined than
it. The property that compares them takes order preservation as a PRECONDITION, and the
invariant that actually matters is asserted directly on the implementation at every cover shape.

*Alternative rejected:* reproducing the composition faithfully by re-parsing between steps. It
is what the original D1 asked for, and it would ship reversed runs — a gesture doing something
no user asked for — at 12.45 ms for a ten-node run on top.

### D11. A second bug of PR #51's class, deferred deliberately

`moveDown` lands its subject one level deeper when it moves past a paragraph that owns list
children: the item is absorbed into that paragraph's list rather than becoming its sibling.
Measured at 68 of 2440 accepted single-node cases; `indent`, `outdent` and `moveUp` are clean
at zero under the same check.

Deferred rather than fixed here, having checked rather than assumed that it is separable:

- It does not cause the composition divergence above — all 49 disagreements are order-related,
  and both sides hit this bug equally.
- It does not break this change's invariants. The subject span is computed on the normalized
  tree, which shares its TEXT (and so its line geometry) with the re-parse, and an absorbed
  node's subtree cover is still an exact cover — of a node that ended up nested.
- It is on `main` today, so a group `moveDown` inherits exactly the symptom a single one has.

Fixing it changes single-node `moveDown` behaviour that existing unit and e2e expectations
encode, which is its own blast radius and wants its own review. The property guards here are
deliberately loose (skip rate < 5%, compared > 1000) so they survive that fix landing rather
than pinning today's numbers.

Worth recording for whoever picks it up: `closure.test.ts` is structurally blind to this whole
class. It compares `result.value.doc` against `parse(encode(result.value.doc))`, and `finalize`
built that doc BY re-parsing — so the assertion is true by construction. The net that catches
it asserts the subject's DEPTH against what the operation promises: indent +1, outdent -1,
reorders 0.

## Risks / Trade-offs

- **The one-pass surgery silently disagrees with the composition** → D1 makes the composition
  the spec, and the property test compares group result against the naive loop over generated
  documents. This is the single highest-value test in the change; write it before the fast path.
- **Non-contiguous results break the one-range after-state** (D3) → measured first, as task 1.1,
  and the failing case is excluded by D8's restriction rather than handled. The property test
  stays in the suite over the restricted operand, so a later widening of what the reorders
  accept fails it rather than shipping a scattered selection.
- **`cannot-reorder-across-scopes` is a rejection users can reach** with two Shift+Arrow presses
  and one Mod+Shift+Arrow → it is the honest answer for a gesture with no single meaning, and
  the cue names it. If real use finds it obstructive, the thread to pull is the scope-crossing
  move in Open Questions, which would give the reorders somewhere to put a root that runs out
  of siblings.
- **A group op's minimal edits regress to whole-region rewrites** → `minimal-change-dispatch`'s
  existing assertions cover single-node ops; the group cases need their own, especially "a node
  between two groups is byte-identical". A non-minimal change set is not just inefficient here:
  it rewrites nodes the operation did not touch, which is how the table-widget class of bug
  appears.
- **Ordered-run renumbering compounds across a group** → renumbering is stated over a sibling
  list's final membership, so one pass over the final tree is correct and repeated per-step
  renumbering is not. Another reason the surgery is one pass (D2), and a scenario worth adding
  to `tests/ops.test.ts` directly.
- **A cover whose roots include an atom** (a table) → atoms already move as opaque units and the
  group form changes nothing about that. The focus-capturing guard in `caret-policy.ts` is not
  reached at all when the after-state is a cover, which is a small improvement rather than a
  risk: a selection does not mount a nested cell editor the way a caret does.
- **Behaviour change for users who relied on head-targeting** → indenting one node out of a
  visible multi-node selection is not a behaviour anyone relies on deliberately. No migration.

## Migration Plan

None. No data, settings, or file format is involved; the change is behavioural and lands in one
release. Rollback is reverting the change — the group forms are additive in `ops.ts` and the two
dispatch sites are the only behavioural switches.

## Open Questions

- **Whether Alt+Arrow (or any key) should bind move up/down in the outline keymap now that the
  grammar plans them over a cover.** Deliberately unchanged here: the current answer (command +
  default hotkey) is a decided design point in `editor-structural-commands`, and re-opening it is
  a keymap question, not a selection one. The grammar keeps implementing the moves as planned
  keys either way.
- **Moving a node into its parent's SIBLING — out of one scope and into the next at the same
  depth.** Raised while reviewing this change and deliberately left out of it. Today a move
  rejects when the node runs out of siblings; the request is that it should instead cross into
  the neighbouring scope, for a single node and for a run alike. It is a change to what a MOVE
  means for one node — `structural-operations` currently defines the reorders as a permutation
  within one sibling list — and it is reachable with a bare caret and no selection at all, which
  is the tell that it is not this change's question. It needs its own destination rule (first
  child or last?), its own encoding rule when the destination scope's kind differs, and it
  interacts with the ordered-run renumbering contract on TWO sibling lists rather than one.
  Worth designing AFTER this change lands, so it inherits the group operand rather than
  building a second one; and it is the natural way to make `cannot-reorder-across-scopes` rarer.
- **Whether an operation that rejects should say WHICH root it rejected on.** The cue currently
  names the reason only. A message naming the node is a message-table change with its own UX
  question, and it does not affect the specs, the approach, or the tasks.
