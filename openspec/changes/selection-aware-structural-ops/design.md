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

*Alternative rejected:* stating fresh multi-root rules per kind. That is a second copy of the
algebra, and the mixed-kind sibling run is exactly where two copies would drift.

### D2. Group forms live in `ops.ts` and emit one edit list

Following `deleteSubtreeGroups`: do the tree surgery in one pass over the groups, then hand the
result to the existing `finalize`, which computes minimal edits by diffing the re-encoded tree
against the original. That is where the minimal-edit guarantee already comes from, so group ops
inherit it rather than restating it.

The one-pass surgery must agree with D1's composition, which is a real obligation and the reason
D1 is a spec requirement rather than a comment. Same-parent bookkeeping is the known trap:
`deleteSubtreeGroups` carries a comment about why two `updateSiblings` calls at one path see
shifted indices. Group indent has the same shape and must move a run in one filtering pass.

*Alternative rejected:* looping the single-node ops for real, re-parsing between steps, and
diffing start to end. It is trivially correct by construction but re-parses n times per keypress
and produces the diff of the whole transformation — acceptable for the tree, not for the change
set, which `minimal-change-dispatch` pins line by line. Worth keeping as the property test's
oracle, which is exactly what D1 makes it.

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
