## Why

Where the caret goes after a structural operation is currently decided in seven places,
and they disagree.

| Where | What it decides |
|---|---|
| `src/ops.ts` `finalize` | every op's own cursor — the subject's line, at `contentColumnCh`'s content START |
| `src/ops.ts` `deleteSubtreeGroups` | which node that subject is after a delete — `survivorAfter ?? survivorBefore ?? parent` |
| `src/enforce.ts` | the rewrite path's cursor: a merge's join point, `endOfInsertedRun` for a paste |
| `src/plugin/grammar.ts` `planFromOp` | overrides the op's cursor for indent/outdent (mapped caret), with an addressability fallback |
| `src/plugin/main.ts` `resultCursor` | re-implements that same rule for the palette |
| `src/plugin/transaction-filter.ts` | applies the rewrite cursor, AND resolves placement for gestures the funnel sees — two different questions in one module |
| `src/plugin/history-caret.ts` | re-records the cursor for ops history cannot recompute, keyed on a hand-derived `userEvent` list |

`src/caret.ts` is deliberately not in that list: it answers which positions are
addressable, not which one an operation picks. The four specs that state a placement
rule — `editor-structural-commands`, `outline-keyboard-grammar`,
`minimal-change-dispatch`, `node-edit-enforcement` — carry their own copies of it.

Nothing owns the question, so every answer is local and the seams leak. Measured
consequences, all from real-vault use during `minimal-changesets-for-structural-ops`
(docs/research/04 Q29 and its follow-ons):

- **The caret alternates between the next and previous node after a delete**, because
  `finalize` prefers a following survivor and falls back to a preceding one. Reported as
  feeling arbitrary; it is deliberate, undocumented, and nobody chose it as UX.
- **Deleting a node that follows a table strands undo.** The survivor is the table, so the
  caret lands inside it, Obsidian mounts the nested per-cell editor, and Cmd+Z then goes to
  that cell's empty history. Moving the caret out does not help — the host's own history
  event points back inside. The document cannot be reverted without leaving the note.
- **The palette and keyboard paths carry the same rule twice**, and drifted: the palette
  missed the addressability guard entirely until review caught it. They also differ
  structurally — the palette's cursor must travel in its own transaction to keep
  consecutive commands as separate undo steps — which cost two review rounds to establish
  as harmless. Two implementations of one rule means every question about it has to be
  answered twice.
- **Two capabilities contradicted each other** on the same behaviour until this was noticed
  in review — `editor-structural-commands` mandated content-column placement for every
  command while `outline-keyboard-grammar` had moved to column preservation.
- **The addressability fallback does not survive redo.** Indent/outdent fall back to the
  operation's own cursor when the mapped position would be non-addressable, but that
  fallback is not recorded, so redo recomputes the mapped position and puts the caret back
  on the gap line. Measured, on both dispatch paths. It is the cleanest available evidence
  that keying "record or not" on WHICH OPERATION RAN is the wrong axis — see below.

Two more, found while working this proposal out against the code (2026-07-29, measured
with a throwaway unit probe over `src/ops.ts` and `src/caret.ts`):

- **"A node's content start" has three definitions, and the operations use the one the
  caret spec contradicts.** `ops.ts`'s `contentColumnCh` swallows an ATX heading prefix;
  `caret.ts`'s `contentBoundaryCh` deliberately does not, because `content-space-caret`
  says a heading's `#` is ordinary content; `select-all-ladder.ts` uses a third hybrid
  and documents that it is keeping `contentColumnCh`'s semantics on purpose. Measured:
  moving `## Alpha` leaves the caret at `{line, ch 3}` — past the `## ` — where Home on
  the same line goes to `ch 0`. On `- # title` the two answer 4 and 2. The
  `editor-structural-commands` spec says the caret lands at "its first content column
  (after any list marker)", which for a heading is column 0; the code has never done
  that.
- **The deletion cursor is load-bearing as a node IDENTITY carrier, not only as a
  caret.** `enforce.ts`'s `deleteAndSplice` locates the surviving neighbour in the
  post-deletion tree by reading `deletion.value.cursor.line`, because `finalize`
  re-parses and every node id changes across an operation. So changing the caret
  convention silently changes which node a type-over or paste splices against. That
  coupling is invisible from any of the seven places above, and is the concrete reason
  "where the caret goes" and "where the operation's result is" have to become two
  separate outputs rather than one field read two ways.

The pattern across four review rounds was consistently *an inconsistency between two of
those places*, not a wrong decision inside any one of them. That is the signal this
wants a single owner rather than another local fix.

## What Changes

- **One policy module answers one question**: given an operation, the document before and
  after, and the pre-operation selection — where does the caret go, and is that position
  recoverable by mapping or must it be recorded? Pure, in the established
  `escalate.ts`/`caret.ts` style, with the CM6 adapters reduced to offset arithmetic.
- **The recoverability distinction is decided per DISPATCH, not per operation.** Today
  `classify.ts`'s `SEMANTIC_CURSOR_USER_EVENTS` names the operations whose cursor is a
  CHOICE (move, split, merge, paste, delete) as against those whose cursor is a FUNCTION of
  the pre-op caret (indent, outdent). That axis is *almost* right, and its one failure is
  already measurable: when indent's addressability fallback fires, that particular dispatch
  is choosing a cursor too, and goes unrecorded because its operation is on the "function"
  list.
  The sharper rule is a property of the dispatch, not the operation: **record whenever the
  cursor being dispatched is not what mapping would produce.** It subsumes the current set
  exactly — a choice never equals the mapped value; a derived cursor always does — and
  closes the fallback case for free. See `history-caret.ts`'s module comment for why the
  underlying distinction is real, and why recording is the only channel for the cases that
  need it.
- **An operation's structural result and its caret become two outputs, not one.**
  `OpOutput.cursor` is a fact about where the operation's subject landed, which composing
  code (`deleteAndSplice`) reads as identity across a re-parse; the caret is a decision.
  Conflating them is what makes the deletion convention un-changeable today.
- **The deletion cursor gets a stated convention** instead of an emergent one, replacing
  `survivorAfter ?? survivorBefore ?? parent`. The candidate is the PRECEDING node's
  content end — it matches gap ownership (what `resolvePlacement` already computes for the
  seam), matches where a user resumes typing, and removes the next/previous alternation.
  It is also the convention this codebase has ALREADY shipped and specified for the
  adjacent case: `node-edit-enforcement` requires a merge to land the caret at the join
  point, "immediately after the surviving node's own original last line of content." A
  deletion and a merge leave the caret at the same seam; only one of them currently says
  so.
- **Landing the caret inside a widget-rendered atom becomes a stated concern.** An atom's
  interior IS addressable by `content-space-caret`, so the rule cannot come from
  addressability; it needs its own answer, and it is what strands undo near tables. Note
  the preceding-node convention does NOT fix this on its own — measured, deleting the
  paragraph after a three-line table gives `{0,0}` today and `{2,9}` under the new
  convention, and both are inside the table.
- **One rule, one implementation, applied at every dispatch site** — keyboard grammar,
  palette commands, enforcement rewrites — so the palette cannot drift from the keyboard
  again.

## Capabilities

### New Capabilities

- `caret-placement-policy`: the single decision procedure for a structural operation's
  resulting caret, and the recoverable-vs-recorded classification that follows from it.

### Modified Capabilities

- `structural-operations`: `finalize`'s cursor becomes a stated structural ANCHOR — where
  the operation's subject landed — rather than the caret answer.
- `editor-structural-commands`: its per-operation cursor rules and the palette/keyboard
  difference are restated in terms of the policy rather than duplicated.
- `outline-keyboard-grammar`: same, for the keyboard half.
- `minimal-change-dispatch`: its mapped-cursor-with-addressability-fallback rule is
  restated as the policy's derived-caret case rather than a rule of its own.
- `node-edit-enforcement`: the rewrite path's caret (deletion survivor, merge join point,
  paste landing) comes from the policy; the merge join point is unchanged and becomes the
  general rule rather than a special case.
- `structural-history-integration`: the recorded set is derived per dispatch instead of
  from a hand-maintained `userEvent` list.

## Impact

- `src/ops.ts`, `src/enforce.ts`, `src/plugin/grammar.ts`, `src/plugin/main.ts`,
  `src/plugin/transaction-filter.ts`, `src/plugin/history-caret.ts`, `src/classify.ts`;
  new pure policy module; `src/caret.ts` unchanged (it answers a different question —
  which positions are legal, not which one is chosen).
- E2E cursor expectations in `20-structural-commands`, `30-keyboard-grammar`,
  `62-outline-edit-enforcement`, `64-structural-history-cursor`.
- **BREAKING (in-mode behaviour)**, three user-visible changes: the caret after a delete
  moves to the preceding node's content end rather than the following node's content
  start; a heading's caret after a structural operation lands at column 0 rather than
  after its `#` prefix; and a caret that would land inside a table lands outside it
  instead. Files and off-mode are untouched.

## Context for whoever picks this up

- `docs/research/04-open-questions.md` **Q21** (redo-cursor root cause, the recording
  mechanism and its second-undo cost), **Q29 + follow-ons** (`filter: false` means history
  bypasses the enforcement funnel entirely; mapping vs recording; a selection head is not a
  caret).
- `docs/research/13-selection-follow-ups.md` — the two parked entries this subsumes: the
  next/previous alternation, and deleting after a table stranding undo. Also the older
  "exiting a table's nested editor" entry, which is the same territory.
- The archived `minimal-changesets-for-structural-ops` design.md, **D4** and **D5a** — why
  indent/outdent are mapping-derived and everything else is not. That distinction is the
  load-bearing input to this change and should not be re-derived.
- `src/plugin/history-caret.ts`'s module comment carries the information-theoretic argument
  for why recording is unavoidable (redo replays a `ChangeSet`, not the operation), with a
  worked example. Read before considering any "just make it deterministic" approach.

## Sequencing

**Recommended: land this BEFORE `node-selection-extension`, and independently of
`selection-as-subtree-set`.**

- **Before `node-selection-extension`.** That change's D3 derives its anchor from the
  assumption that the current selection is a well-formed cover, and its risks section
  already records that undo/redo restore selections the escalation filter never sees. The
  same `filter: false` fact drives both; whoever settles it for carets should settle
  whether anything normalizes restored SELECTIONS, which is that change's open question.
- **Independent of `selection-as-subtree-set`.** Gap ownership — what placement resolution
  needs — is unchanged by that change, which alters cover geometry rather than ownership.
  They can proceed in either order or in parallel.
  - One genuine touch point: if `selection-as-subtree-set` lands first, the deletion
    convention should be written against a FOREST of roots at mixed depths rather than a
    sibling run. If this lands first, that generalization is a small follow-up. Neither
    ordering is blocking; the second is slightly cheaper.
- **Independent of `paste-heading-section-reencoding`**, which touches encoding at a paste
  destination, not caret placement.

Suggested overall order: **`caret-placement-policy` → `selection-as-subtree-set` →
`node-selection-extension`**, with `paste-heading-section-reencoding` inserted wherever
convenient. Rationale: this change fixes two live user-facing defects (stranded undo near
tables, the next/previous alternation) and removes duplication that has generated a review
finding in every recent round, so it pays down cost the other two would otherwise inherit.

## Out of scope

- Vertical motion and Home/End, settled by `content-space-caret` (Q26/Q27) and not
  reopened here.
- Which positions are addressable — `content-space-caret` owns that. This change decides
  which addressable position an operation lands on.
- The second-undo limitation itself. It is a CodeMirror property (the event a second undo
  reads from lives on history's undone branch, which `addSelection` never reaches), not
  something a policy layer can remove. It should be stated accurately, not re-litigated.
