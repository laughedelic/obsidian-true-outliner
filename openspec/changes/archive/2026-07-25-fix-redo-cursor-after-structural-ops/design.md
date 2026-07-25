## Context

Every structural operation in this plugin dispatches a CodeMirror transaction that
(a) replaces a whole line region wholesale and (b) carries an explicit, semantically
chosen cursor — the merge join point, the indented node's content start, the split
point. Two call sites produce this shape:

- `src/plugin/keymap.ts` — the outline keyboard grammar (Tab, Shift+Tab, Alt+Up,
  Alt+Down, Enter), dispatching a plan from `src/plugin/grammar.ts`.
- `src/plugin/transaction-filter.ts` — `buildRewriteSpec`, the edit-enforcement
  rewrite path (boundary deletions/merges, structural paste, type-over).

### The confirmed mechanism

CodeMirror's `@codemirror/commands` history computes the cursor that redo restores in
`HistoryState.pop()`:

```js
let selection = event.selectionsAfter[0] ||
  (event.startSelection ? event.startSelection.map(event.changes.invertedDesc, 1) : state.selection)
```

For a document-changing transaction the history field calls `addChanges`, never
`addSelection` — the two are mutually exclusive. So a structural transaction's own
resulting selection is **never** recorded: `selectionsAfter` stays empty, and the value
above falls through to the mapping branch. `event.startSelection` is the *pre*-edit
cursor; mapping it forward through the rewrite's change set with `assoc = 1` collapses
any position inside a replaced range to the **end of the entire inserted block**.

That computed position becomes the redo event's `startSelection`, and redo restores it
verbatim. Our explicit cursor is never consulted.

```
   pre-edit cursor ──map(changes, assoc=1)──▶ end of rewritten region ──▶ what redo restores
                                                      ▲
   join point / content start (what we set) ──────────┘ ignored
```

Because the landing point is the end of the *rewritten region*, the error magnitude
scales with how much the operation rewrote — which is why Q20 saw "more than one wrong
landing shape" and concluded it could not be a single off-by-one. Verified in a
standalone pure-CodeMirror reproduction (no Obsidian, no WebDriver):

| operation | cursor we set | cursor redo restores |
|---|---|---|
| two-paragraph merge | join point, line 0 | the blank line below |
| merge with re-parented children | join point, line 0 | start of the next sibling |
| Tab/indent a node with a child | indented content start | start of the next sibling |

Manually confirmed in a real vault by the user for both the merge and the Tab case.

### Version boundary: this is an upstream regression in CM6 6.10.2

Bisected against the real `@codemirror/commands` package:

| version | redo cursor |
|---|---|
| ≤ 6.10.1 | the op's own cursor — correct |
| ≥ 6.10.2 | end of the rewritten region — the bug |

6.10.2's changelog entry: *"Move the selection to a less surprising place when
undoing, moving the selection, redoing, then undoing again."* That fix added the
`startSelection.map(...)` fallback for a scenario where the old `state.selection`
fallback misbehaved — and in doing so regressed ours, where the op's own cursor is
deliberately NOT the mechanical mapping of the pre-edit one.

Two consequences worth stating plainly:

- **The fix is version-independent.** `selectionsAfter[0]` is preferred by both the
  old and the new `pop()`, so re-asserting the cursor is correct on either — a no-op
  improvement on ≤6.10.1, the actual fix on ≥6.10.2. Confirmed against both.
- **The e2e harness cannot currently reproduce this.** Its Obsidian (1.12.7, the
  newest `wdio-obsidian-service` offers) bundles a CM6 older than 6.10.2. Verified
  directly: with the fix unregistered, the e2e redo scenarios still pass. They are
  forward guards that start biting when Obsidian ships a newer CM6; the executable
  guard today is the unit test, which is why its negative control is load-bearing.

### Why every prior automated reproduction passed

`selectionsAfter[0]` wins over the mapping when it exists, and **any** selection-only
transaction landing between the structural operation and the undo populates it — with
`tr.startState.selection`, i.e. exactly our correct cursor. So a single stray cursor
touch masks the bug completely. This is confirmed both ways in the standalone
reproduction: identical scenario, correct redo with an intervening selection
transaction, wrong redo without one. Any regression test must therefore be built so
nothing can slip a selection transaction in between.

### Prior misdiagnosis

Q19 (docs/research/04-open-questions.md) states the redo event's `startSelection` is
"the selection that was active at the moment the undo transaction itself was built —
i.e. `tr.startState.selection` right before undo fires." That is the *last fallback* in
the expression above, reached only when the event has neither `selectionsAfter` nor a
`startSelection`. Reasoning from it led Q19 to conclude our cursor "should" be restored
and to hunt for an external cause (other plugins, mouse-vs-keyboard placement), and led
Q20 to conclude the cause sat outside the change's code paths entirely. Both
conclusions followed correctly from the wrong premise.

## Goals / Non-Goals

**Goals:**

- Redo after any structural operation restores that operation's own cursor.
- One mechanism covering both dispatch sites, with no per-site duplication that can
  drift.
- Undo behavior unchanged; one structural operation remains exactly one undo step.
- No private APIs and no dependence on history internals — the fix uses only documented
  CodeMirror behavior, so it cannot break when `@codemirror/commands` changes its
  internal representation.

**Explicitly NOT achieved (accepted limitation):**

Cursor correctness beyond the first undo/redo pair. `undo → redo → undo` restores a
mechanically mapped position. This is a structural limit of the `selectionsAfter`
channel, discovered during real-vault testing of the implemented fix, and accepted
deliberately rather than papered over — see D5.

**Non-Goals:**

- Changing where structural operations put the cursor in the first place. Notably,
  operations reset the cursor to the node's content start rather than preserving the
  user's column (`ops.ts`'s `finalize` convention, surfaced during this investigation).
  Real and pre-existing, with a blast radius across every operation and its property
  tests — its own decision, recorded in the research log, not bundled here.
- Selection (non-cursor) restoration semantics for redo. Structural operations always
  produce a cursor; ranges are out of scope.
- Anything about the blur/refocus mechanism in `src/plugin/decorations.ts`. It postdates
  all three reports and is not implicated.

## Decisions

### D1: Re-assert the cursor via a selection-only transaction, rather than any other route

Chosen because it is the only mechanism CodeMirror actually documents for this: history
prefers `selectionsAfter[0]`, and the sanctioned way to populate it is a selection-only
transaction following the change. Verified in the standalone reproduction: 3/3 scenarios
correct with it, 0/3 without, and the recorded undo-event count stays at 1.

The re-assertion re-asserts the *same* position — it is a visual no-op. History records
`tr.startState.selection` (the value already in place, i.e. our cursor), not the new
selection, so a same-position transaction records exactly the right thing.

*Alternatives considered:*

- **Emit finer-grained changes so the mechanical mapping lands correctly.** Rejected:
  structural operations move content between regions; there is no change decomposition
  under which mapping a pre-edit cursor yields a semantic post-operation position in
  general.
- **Take over history handling (custom `invertedEffects`, or a bespoke undo stack).**
  Rejected as far out of proportion, and it would put us in the business of maintaining
  undo semantics that Q11 deliberately delegated to CodeMirror.
- **Reach into the history field and patch the recorded event.** Rejected: history
  internals are not public API, and this project's manifest bars that class of fix.

### D2: One shared mechanism, driven off `PLUGIN_OWN_USER_EVENTS`

Both dispatch sites already annotate their transactions with a `userEvent` from the set
`src/classify.ts` enumerates as this plugin's own structural events. That set is
therefore the natural, already-maintained trigger — a transaction that changed the
document and carries one of those events is precisely "a structural operation of ours
that set an explicit cursor."

Deliberately not two independent fixes at the two call sites: this project has twice
shipped a bug where one call site was corrected and a parallel one silently was not
(Q19's `reencodeBlocksForDestination` extraction; D15's split detection gate). Routing
both through one trigger set that already exists makes a third instance impossible by
construction.

*Alternative considered:* a dedicated annotation attached by each dispatch site.
Rejected — it adds a second, parallel notion of "this is our structural transaction"
alongside the userEvent set that already means exactly that, which is the drift risk
this decision exists to avoid.

### D3: Implement as an update listener, deferred by a microtask

The rewrite path builds its transaction *inside* the transaction filter, which must stay
side-effect-free (design's D6, the same split the existing veto cue uses). So the
re-assertion is dispatched from an `EditorView.updateListener` registered alongside that
veto cue, not from the filter.

Dispatching synchronously from an update listener throws — CodeMirror forbids re-entrant
updates. Deferral is by microtask rather than `setTimeout`, because a microtask is
guaranteed to drain before the next user input event (a separate task) can be handled.
A `setTimeout` would leave a real window in which a fast undo lands before the
re-assertion, reintroducing the bug intermittently — the exact failure mode being fixed.

### D4: The re-assertion carries a plugin-own `userEvent`

Without it, a selection-only transaction runs through selection escalation and
marker-transparent cursor clamping, which could move the very cursor being re-asserted.
Classifying it `plugin-own` (checked before `selection-only` in `classify`) passes it
through untouched. This is the same short-circuit our rewrites already rely on to avoid
being handed back to the verdict layer a second time.

### D5: Accept the first-redo-only limit here; fix it properly with minimal ChangeSets later

Real-vault testing of the implemented fix found the cursor still jumps on
`undo → redo → undo`. Tracing the history state shows why, and shows it is not
fixable within this approach:

```
op       done=[E1]   E1.startSelection=pre   selectionsAfter=[opCursor]   <- our recording
undo 1   restores pre       ✓   undone=[E2]  E2.startSelection=opCursor, selectionsAfter=[]
redo 1   restores opCursor  ✓   done=[E3]    E3.startSelection = E2.selectionsAfter[0]
                                                                ?? map(...)   -> mapped
undo 2   restores E3.startSelection = the mapped position        ✗
```

`E3`'s restore position is computed at redo time from `E2`, which lives on the **undone**
branch — and the history's `addSelection` only ever writes to the **done** branch. No
selection transaction this mechanism can dispatch is able to reach `E2`. Verified
against the real package: merge and indent both land at the end of the rewritten region
on the second undo.

**The proper fix is to stop emitting whole-region replacements.** If a structural op's
changes are minimal (character-level), the mapped position IS the semantically correct
one, in both directions, at any depth — and no recording mechanism is needed at all.
Verified standalone across four-step undo/redo/undo/redo cycles:

| op | current change | minimal change | all cycles |
|---|---|---|---|
| merge | replace `[0,25)` | `delete [11,13)` | correct |
| indent | replace `[0,37)` | `insert "\t" @8`, `insert "\t" @16` | correct |
| outdent | replace whole region | `delete [8,9)`, `delete [17,18)` | correct |

(Per-line trimming is required — a single whole-region prefix/suffix trim is minimal
enough for the merge but not for indent, which changes leading whitespace on several
lines at once.)

That work belongs against `editsToChanges` (`src/plugin/dispatch.ts`), shared by the
grammar, the enforcement rewrites, and the palette commands — a wider blast radius than
this change, and one that also subsumes the separate "structural ops reset the cursor to
content start" question (with minimal changes, simply not setting an explicit cursor for
indent/outdent preserves the user's column naturally). Deliberately deferred to its own
change rather than expanded into this one; this change ships the first-redo fix, which
is a strict improvement, with the remaining gap documented and pinned by a test.

## Risks / Trade-offs

- **An extra transaction per structural operation** → It is selection-only and
  same-position: no document change, no visible cursor movement, no new undo step
  (verified: the recorded event count stays 1). Cost is one transaction dispatch on an
  already-interactive code path, well inside the existing latency budget.
- **The trigger set could fall out of sync if a future structural dispatch uses a
  `userEvent` outside `PLUGIN_OWN_USER_EVENTS`** → That set is already load-bearing for
  classification, so an omission there is already a bug with visible consequences; this
  change adds a second reason to keep it correct rather than a new thing to remember.
  Called out explicitly in the spec.
- **Microtask deferral assumes the update cycle has unwound by the time it runs** →
  True by construction (the update is synchronous within the current task), and the
  re-assertion is a no-op if state has moved on in the meantime, so a violated
  assumption degrades to "no fix applied," never to a wrong cursor.
- **Regression coverage can silently self-mask.** A test that touches the cursor between
  the operation and the undo passes regardless of whether the bug exists — precisely how
  this escaped three times → The regression test must assert the negative case too:
  that it genuinely reproduces the wrong landing when the mechanism is disabled.
