## Context

Seven places decide where the caret goes after a structural operation (proposal.md's
table), and four specs each state a version of the rule. Every recent review round found
an inconsistency BETWEEN two of them rather than a wrong decision inside any one, which
is what this change treats as the actual defect.

The current shape, as it stands in the code:

- `src/ops.ts` `finalize` returns `OpOutput.cursor` — the operation's subject line, at
  `contentColumnCh`'s notion of content start. `deleteSubtreeGroups` decides which node
  that subject is: `survivorAfter ?? survivorBefore ?? parent`.
- `src/enforce.ts` produces the rewrite path's cursor: a merge's join point,
  `endOfInsertedRun` for a paste, and `deletion.value.cursor` for a structural delete.
- `src/plugin/grammar.ts` `planFromOp` and `src/plugin/main.ts` `resultCursor` each
  implement "indent/outdent use the mapped caret, falling back to the op's own cursor
  when the mapped position is not addressable" — the same rule, written twice.
- `src/plugin/transaction-filter.ts` does two unrelated caret jobs: it applies the
  rewrite's cursor (`buildRewriteSpec`), and it resolves placement for gestures
  (`escalateSelection`, `resolveForeignCursors`), which belongs to `content-space-caret`.
- `src/plugin/history-caret.ts` re-records the cursor for operations history cannot
  recompute, gated by `SEMANTIC_CURSOR_USER_EVENTS` — a hand-derived list of operations.
- `src/caret.ts` answers which positions are addressable. It is not part of the problem
  and is not changed here.

Three facts drive the design, all measured against the current code rather than assumed.

**A node's content start has three definitions.** `contentColumnCh` (ops) swallows an ATX
heading prefix, `contentBoundaryCh` (caret) deliberately does not, and
`select-all-ladder.ts` uses a third hybrid and says so in a comment. Measured: moving
`## Alpha` leaves the caret at `ch 3`, where Home on the same line goes to `ch 0`; on
`- # title` the two boundaries are 4 and 2.

**Node identity does not survive an operation.** `finalize` returns `parse(text)`, a fresh
re-parse with all-new ids. `enforce.ts`'s `deleteAndSplice` works around that by using
`deletion.value.cursor.line` to re-find the surviving neighbour — so the deletion caret is
currently load-bearing as an identity carrier, and changing the convention would silently
change which node a paste or type-over splices against.

**The proposed deletion convention is already shipped for the adjacent case.**
`node-edit-enforcement` requires a merge to land the caret at the join point, "immediately
after the surviving node's own original last line of content." That is the preceding
node's content end. A merge and a delete leave the caret at the same seam; only the merge
says so today.

Measured behaviour of the current deletion cursor, and what the preceding-node convention
would give for the same inputs (throwaway unit probe over `deleteSubtrees` +
`previousNodeInOrder`/`nodeContentEnd`, 2026-07-29):

| Document | Deleted | Today | Proposed |
|---|---|---|---|
| `# Heading` / `middle` / `last paragraph` | `middle` | `{2,0}` on `last paragraph` (the FOLLOWING node) | `{0,9}` at `# Heading`'s end |
| same | `last paragraph` | `{2,0}` on `middle` (the PRECEDING node) | `{2,6}` at `middle`'s end |
| 3-line table / `last paragraph` | the paragraph | `{0,0}` — inside the table | `{2,9}` — still inside the table |
| `first para` / `second para` | `first para` | `{0,0}` on `second para` | no predecessor → same `{0,0}` |
| `# H` / `only child` | the child | `{0,2}` (past `# `) | `{0,3}` at `# H`'s end |
| `# H` / `- a` / `  - a1` / `after` | `after` | `{2,2}` on `- a`'s content start | `{3,6}` at `  - a1`'s end — the visually previous line |

Two things to read off that table. The alternation is real and invisible from the
coordinates alone (rows 1 and 2 produce the same `{2,0}` for opposite reasons). And the
preceding-node convention does NOT fix the table case by itself — both routes end inside
the table, which is why atom avoidance is a separate rule rather than a consequence.

## Goals / Non-Goals

**Goals:**

- One module answers "given an operation, the document before and after, and the
  pre-operation selection mapped forward: where does the caret go?" Every dispatch site
  calls it; none re-implements it.
- Whether that caret must be RECORDED has its own single owner, at the transaction level.
  Review found these cannot be the same module: recording compares whole SELECTIONS, and
  the placement policy only ever sees one caret and the position it was mapped from, so a
  non-empty pre-operation selection makes the two comparisons disagree.
- The deletion caret gets a stated convention that agrees with merge, with gap ownership,
  and with `resolvePlacement` — and stops alternating between the next and previous node.
- A structural operation stops leaving the caret somewhere that transfers focus out of the
  outline editor, which is what strands undo near tables.
- "Record or not" becomes a property of the DISPATCH, not of the operation, closing the
  known gap where indent/outdent's addressability fallback goes unrecorded.
- One definition of a node's content start for caret purposes, matching the one
  `content-space-caret` already published.

**Non-Goals:**

- Which positions are addressable. `content-space-caret` owns that; `src/caret.ts` is not
  modified by this change.
- Vertical motion, Home/End, and horizontal motion. Settled by `content-space-caret`
  (docs/research/04 Q26/Q27) and not reopened.
- The second-undo limitation. It is a CodeMirror property — the event a second undo reads
  from lives on history's undone branch, which `addSelection` never reaches — and a policy
  layer cannot remove it. It is restated accurately, not re-litigated.
- Undo/redo-restored SELECTIONS. `filter: false` means the escalation filter never sees
  them either, but reshaping a restored selection changes the range the user is about to
  act on. That question stays with `node-selection-extension`.
- `contentColumnCh`'s other callers (`splitNode`'s clamp, `enforce.ts`'s chrome
  recognition, `classify.ts`, `select-all-ladder.ts`). They ask different questions and
  keep their current answers.

## Decisions

### D1: One pure policy module, `src/caret-policy.ts`

A pure module in the established `escalate.ts`/`caret.ts` style: no CodeMirror imports,
unit-testable, with the CM6 adapters reduced to offset arithmetic and fact-gathering.

```ts
export type CaretOp =
  | { kind: 'derived' }                                   // indent, outdent
  | { kind: 'subject' }                                   // move (also the derived fallback)
  | { kind: 'exact' }                                     // split, merge, paste
  | { kind: 'deletion'; removed: readonly number[] };     // structural delete

export interface PlacementFacts {
  readonly before: OutlineDoc;      // pre-operation tree
  readonly after: OutlineDoc;       // the op's result tree (fresh ids — see D2)
  readonly anchor: LinePos;         // OpOutput.anchor, in `after` coordinates
  readonly mapped?: LinePos;        // pre-op selection head mapped forward, when computed
}

export interface CaretPlan {
  readonly caret: LinePos;
  // No `record` flag: see D6 — the recording decision needs whole selections,
  // which this module does not have, so it lives at the transaction level.
}

export function planCaret(op: CaretOp, facts: PlacementFacts): CaretPlan;
```

The dispatch site knows which operation it invoked, so the op descriptor is an argument
rather than something inferred from a `userEvent` string. The four cases are:

- `derived` — `mapped` if `isAddressable(after, mapped)`, else the `subject` rule. This is
  today's `planFromOp`/`resultCursor` behaviour, stated once.
- `subject` — the anchor's line, at that node's content start per D4.
- `exact` — the anchor verbatim; the operation computed an interior position (a join
  point, a split point, the end of an inserted run) that only it knows.
- `deletion` — D3.

A `deletion` landing then passes through D5's atom guard; the other three do not, since
they land on the node the user acted on rather than on a bystander.

**Alternative considered: fold the policy into `ops.ts`.** Rejected — `ops.ts` has no
access to the pre-operation selection or the mapped position, which two of the four cases
need, and the enforcement path composes several ops into one dispatch (`deleteAndSplice`)
where only the outermost caret is the user's.

**Alternative considered: infer the op from the `userEvent`.** Rejected — that is the
mechanism this change is removing from `history-caret.ts`. A string set that must be kept
in sync with an enum is the drift this proposal exists to close.

### D2: `OpOutput.cursor` becomes `OpOutput.anchor`, a structural fact

The rename is the load-bearing part, not cosmetics. `anchor` means "where this operation's
subject (or its surviving neighbour) landed in the result tree", and it stays exactly what
`finalize` computes today, including `deleteSubtreeGroups`'s `survivorAfter ??
survivorBefore ?? parent` choice. That keeps `enforce.ts`'s `deleteAndSplice` and
`endOfInsertedRun` working unchanged — they read a structural position across a re-parse,
not a caret — while the caret becomes the policy's answer and is free to differ.

Separating them is what makes the deletion convention changeable at all. Attempting the
convention change without this split rewires which node a paste splices against, with no
test in the suite positioned to notice.

Consequence for the policy: it cannot re-find a node by id in `after`, so its answers are
positional. For a deletion this is provable rather than approximate — see D3.

### D3: The deletion caret is the preceding node's content end

**Rule.** After a structural deletion, the caret lands at the content end of the node that
immediately precedes the deleted region in full document order — `caret.ts`'s
`previousNodeInOrder` of the topmost removed node, which descends into the previous
sibling's deepest last descendant, and is exactly the node that owns the gap at the seam.
When nothing precedes it, the caret lands at the content start of the node that follows;
when neither exists (the document is now empty or preamble-only), at the scope start.

**Why this one.** It agrees with three rules already in the codebase and contradicts none:
`resolvePlacement` resolves the seam's gap line to that same position; a merge is
specified to land at that same position; and it is where a user resumes typing after
removing something. It also removes the alternation, which is the reported complaint.

**Why it can be computed positionally.** The predecessor lies entirely above the topmost
deleted group (`deleteSubtreeGroups` already requires `groups[0]` to be topmost), so its
own lines and its start line are byte-identical in `before` and `after`. The policy can
therefore compute `nodeContentEnd(before, previousNodeInOrder(before, topmost))` and use
the result as an `after` coordinate. Verified over the probe cases above; to be pinned as
a property test rather than left as reasoning (tasks.md).

**Alternative considered: keep preferring the following node.** Rejected — it is the half
of the alternation that disagrees with gap ownership and with merge, and it is the half
that walks the caret INTO the table in the measured case.

**Alternative considered: the seam as a gap position, resolved afterwards by
`resolvePlacement`.** Rejected — it produces the same answer by a longer route, and it
routes a plugin-own dispatch through a resolver whose jurisdiction deliberately excludes
plugin-own transactions (`content-space-caret`'s own requirement). Computing the resolved
position directly keeps the dispatch byte-exact.

### D4: One content-start definition for carets — `caret.ts`'s `contentBoundaryCh`

The policy resolves a `subject` anchor's column with `nodeContentStart`, not
`contentColumnCh`. A heading's `#` prefix is content by `content-space-caret`'s published
rule, so the caret after moving `## Alpha` lands at column 0, not 3; on `- # title` at 2,
not 4.

This also makes `editor-structural-commands`'s existing words true for the first time — it
already says "its first content column (after any list marker)", which for a heading is
column 0.

`contentColumnCh` is NOT removed. `splitNode`'s clamp, `enforce.ts`'s merge recognition
and blank-line test, `classify.ts`, and `select-all-ladder.ts` ask about markers and
chrome, not about where a caret may sit, and `select-all-ladder.ts` already documents its
choice as deliberate. Changing them is out of scope and would be a separate behaviour
change to the selection ladder.

### D5: A structural operation's caret never lands inside a focus-capturing atom

**The problem this solves.** An atom's interior is addressable by spec, so addressability
cannot express this. A table is different from every other atom in one measured way: Live
Preview mounts a separate nested `EditorView` for the cell (`src/plugin/nested-editor.ts`
documents the DOM ancestry, and the plugin's own keymap and filter are gated off inside
it). A caret placed there moves focus into an editor with its own empty undo history,
while the host's history event still points back inside — so the document cannot be
reverted without leaving the note.

**Rule.** The policy takes a set of FOCUS-CAPTURING node kinds — kinds whose interior the
host renders as a widget with its own editor. Today that set is `{ table }`, on the
evidence in `nested-editor.ts`; it is a stated policy input so a second kind can be added
with its own measurement rather than by guesswork. When a BYSTANDER landing (today, the
`deletion` case — the scope note below explains why `subject` is excluded)
computed above falls inside a focus-capturing node, the policy tries, in order: the
following node's content start, then the nearest non-capturing node walking backward in
document order, then the nearest walking forward. If every candidate is capturing, the
original position stands and the residual is documented rather than hidden.

**Scope: bystander landings only.** This rule applies where the caret lands on a node the
user did not act on — the survivor after a deletion, the neighbour after a merge. It does
NOT apply when the operation's own subject is the capturing node (moving a table). That
case has a different and unmeasured failure mode, and is filed as an Open Question rather
than pre-decided here.

**Alternative considered: forbid every atom interior.** Rejected — code blocks, quotes and
callouts are ordinary editable text in Live Preview, and landing in one after an operation
is correct. The problem is the nested editor, not atomicity.

**Alternative considered: fix it at the CM6 layer by refusing focus.** Rejected — mounting
the cell editor is the host's behaviour on caret placement, reached through public
rendering, and there is no public API to decline it.

### D6: Recording is decided per dispatch, and derived rather than declared

**Rule.** Record the dispatched cursor into history whenever it is NOT what mapping would
produce. `record-decision.ts`'s `needsRecording(tr)` is the sole owner, deciding from the
transaction itself. The pure policy deliberately does NOT restate it: a caret-vs-mapped
comparison is not equivalent to a selection-vs-selection one for a non-empty pre-operation
selection, and two answers to one question is what this change exists to remove.

This preserves what `SEMANTIC_CURSOR_USER_EVENTS` existed for — redo is exact wherever the
list made it exact — and closes the open gap for free: when indent's addressability
fallback fires, that dispatch is choosing a cursor, and gets recorded even though its
operation is on the "derived" side.

It is NOT set-equal to the old list, and should not be described as such. It records
strictly fewer transactions, because a chosen position sometimes coincides with the mapped
one: splitting `- alpha beta` before `beta` inserts `\n- ` at the caret, and assoc=1 maps
that caret onto the new item's content start — the split's own anchor (measured, both
offset 11). The list recorded that anyway; recording it changes nothing and costs
second-undo precision, so skipping it is the rule working.

**Mechanism: derive it, do not thread it.** `SemanticCursorRecorder` already observes every
update. For a plugin-own, document-changing transaction it can ask CodeMirror the question
directly:

```ts
const wouldBe = tr.startState.selection.map(tr.changes, 1);
if (!wouldBe.eq(tr.newSelection)) record();
```

`assoc = 1` is not a choice here: it is the assoc `@codemirror/commands` hardcodes in its
redo restore (`event.startSelection.map(event.changes.invertedDesc, 1)`), which is the
function this comparison must be against. So the test is literally "is the dispatched
selection what redo would recompute?", asked of CM6's own mapping.

The gate stays `isPluginOwnUserEvent` (plus outline mode and the nested-editor check), so
foreign transactions are never examined. `SEMANTIC_CURSOR_USER_EVENTS` and
`hasSemanticCursor` are removed from `classify.ts`.

**Alternative considered: a CM6 annotation set by each dispatch site.** Explicit, but it
reintroduces exactly what this change removes — a fact each dispatch site must remember to
carry, with the enforcement rewrite path (which rebuilds the transaction wholesale) the
most likely to forget it. Deriving cannot drift.

**Alternative considered: keep the userEvent list and add a suffix when the fallback
fires.** Rejected — it encodes a per-dispatch fact in a per-operation channel, which is
the original mistake in a new spelling.

### D7: The palette keeps two transactions; only the RULE is shared

`main.ts`'s `resultCursor` is deleted and the palette calls the policy, but the palette
keeps applying its change and its cursor as two `Editor` calls. That structure is not
duplication — it is what keeps consecutive palette commands as separate undo steps, since
`Editor.transaction` carries no `userEvent` and CodeMirror joins adjacent `userEvent`-less
changes into one history event. It cost two review rounds to establish as harmless
(`editor-structural-commands` records why), and this change does not reopen it.

One consequence to state rather than rediscover: the palette's second transaction records
the cursor unconditionally, so for the palette D6's test is moot. It records the mapped
value for derived cases, which is what history would recompute anyway, so the two entry
points still behave identically at every depth.

### D8: `transaction-filter.ts` keeps placement resolution; only the rewrite caret moves

The filter's two caret jobs are separated rather than unified. `buildRewriteSpec`'s cursor
comes from the policy (it is an operation dispatch). `escalateSelection` and
`resolveForeignCursors` keep calling `resolvePlacement`/`resolveMarkerPlacement`
unchanged: they answer "a gesture produced a position with no direction — what is the
nearest legal one", which is `content-space-caret`'s question, with its own carefully
scoped jurisdiction over programmatic transactions. Merging them would widen that
jurisdiction as a side effect, which was tried during `content-space-caret` and reverted
(docs/research/13, the table-exit entry).

### D9: Tests — one invariant asserted at the dispatch sites, plus negative controls

Three layers, in the project's established style:

1. **Pure unit tests for `caret-policy.ts`**: each branch, the deletion convention's
   fallbacks, and the atom guard's candidate ladder. The recording predicate is tested
   separately in `tests/history-caret.test.ts`, against a real `Transaction`.
2. **A property test over generated trees**: every caret this plugin dispatches is
   addressable, and no dispatched caret lies inside a focus-capturing node when the
   landing is a bystander. This generalises the invariant docs/research/04 Q29 says is
   "cheap to assert at each dispatch site and expensive to discover from a real vault."
3. **A CM6-level equality test**: `mapCursorForward(...)` equals `tr.changes.mapPos(head,
   1)` over generated documents and operations. D6's derivation assumes those two agree;
   if they ever disagree, indent silently starts recording and inherits a cost it does not
   have today. This assumption is currently only prose in `minimal-change-dispatch`.

Every new regression test is negative-controlled — disable the fix, confirm the test
fails — before it is trusted. This project has shipped tests that could not fail three
times (docs/research/04 Q21, Q27, Q28), and the failure mode here is the same shape: the
transaction filter can produce a correct-looking caret whether or not the policy ran.
Where an outcome alone cannot distinguish them, assert the mechanism — the plugin already
exposes `stats` and `motionCounts` for exactly this.

### D10: What deliberately does not change

`src/caret.ts`, `src/escalate.ts`, the addressable-position set, motion, the selection
ladder, and `contentColumnCh`'s non-caret callers. Naming these keeps the diff honest: the
change is a re-owning of one decision, not a rewrite of caret handling.

## Risks / Trade-offs

**The deletion convention is a user-visible behaviour change with no migration.** → It is
the point of the change, not a side effect, and it is stated as BREAKING (in-mode) in the
proposal. Mitigated by matching the already-shipped merge behaviour, so the two adjacent
gestures agree instead of diverging. E2E expectations in `20-structural-commands`,
`62-outline-edit-enforcement` and `64-structural-history-cursor` are updated as part of
the change, not after it.

**`deleteAndSplice` reads the deletion cursor as a node identity.** → D2's anchor/caret
split keeps that read intact by construction. The risk is a partial implementation that
changes the convention before the split lands; tasks.md orders the split first, and a
paste-after-type-over test pins it.

**D6's derivation depends on `mapCursorForward` agreeing with CM6's `mapPos(_, 1)`.** →
Currently prose in `minimal-change-dispatch`. D9's third test layer turns it into an
executable claim. If they ever disagree, the failure is conservative — an extra recording,
costing indent the second-undo precision it has today — not a wrong caret.

**The heading content-start change touches an unstated behaviour many tests may encode.**
→ Measured before deciding: the caret at `ch 3` after moving `## Alpha` is not asserted
anywhere in the unit suite, and the one e2e cursor assertion in `20-structural-commands`
is about a list item's column. The task list still starts by running the full suite to
find any implicit dependency rather than assuming.

**The focus-capturing set is a host-behaviour list inside a pure module.** → Stated as a
policy input with its evidence (`nested-editor.ts`), defaulting to `{ table }`, so adding
a kind requires a measurement rather than a guess. The pure module stays testable because
the set is data, not a DOM query.

**Atom avoidance can move the caret further than a user expects** — deleting between two
tables walks past one of them. → Bounded by the candidate ladder's stated order, and the
alternative (landing in a table) is the measured undo-stranding defect. The residual case
where every candidate is capturing is documented rather than silently handled.

**One more module in the area of the codebase with the most owners of caret placement.**
→ Net negative count: `resultCursor` is deleted, `planFromOp`'s branch collapses,
`hasSemanticCursor`/`SEMANTIC_CURSOR_USER_EVENTS` are removed, and `deleteSubtreeGroups`
stops choosing a caret. The precedent for keeping unproven machinery out of this area is
the caret resolver dropped in `minimal-changesets-for-structural-ops` (D5a).

## Migration Plan

No data or file migration — the change is in-mode editor behaviour only; markdown files
and off-mode editing are byte-identical throughout.

Sequenced so each step is independently revertable:

1. **Split anchor from caret** (D2) with no behaviour change: rename `OpOutput.cursor` →
   `anchor`, leave every consumer reading the same values. The suite must stay green with
   no expectation edits; if it does not, the split is wrong.
2. **Introduce `caret-policy.ts`** and route the existing rules through it unchanged — the
   grammar, the palette and the rewrite path call `planCaret` and get today's answers. Still
   no behaviour change, still green.
3. **Switch the recording decision** to D6's derivation, remove
   `SEMANTIC_CURSOR_USER_EVENTS`. Behaviour changes only for the previously-unrecorded
   fallback case, which is the known defect.
4. **Adopt the deletion convention** (D3) and update the e2e expectations it changes.
5. **Add the atom guard** (D5) and the content-start unification (D4), each with its own
   tests.

Rollback: steps 3–5 are each a small revert against a stable base; steps 1–2 leave the
codebase strictly better organised even if the later steps are abandoned.

## Open Questions

**A structural operation whose SUBJECT is a focus-capturing atom.** Moving a table places
the caret inside it, which by the same mechanism as the delete case should mount the cell
editor and take focus — and would then break a repeat Alt+Up, since the plugin's keymap is
gated off inside a nested editor. That is a prediction from `nested-editor.ts`'s documented
behaviour, not a measurement; it needs a real-vault or e2e check. If it reproduces, the
answer is not obvious: "caret follows the moved node" and "never enter a nested editor" are
in direct conflict, and resolving it likely needs node identity to live somewhere other
than the caret — which is the modal block-selection state `docs/research/13` parks for the
selection track. Filed rather than pre-decided; D5 is deliberately scoped to bystander
landings so this change does not depend on the answer.

**Whether `html` (and any other widget-rendered kind) belongs in the focus-capturing set.**
`nested-editor.ts` says a table cell is "the only case found so far". Adding a kind should
follow the same evidence standard — a measured nested `EditorView`, not a plausible one.

**Whether anything should normalize undo/redo-restored selections.** The same `filter:
false` fact that motivates recording means the escalation filter never sees a restored
selection either. Out of scope here (Non-Goals), and cross-referenced from
`node-selection-extension`, whose stateless walk depends on the answer.

**Whether `contentColumnCh` should eventually be retired in favour of two named
boundaries.** This change stops the caret from using it but leaves four other callers.
Worth revisiting once the selection track settles, not while it is in motion.
