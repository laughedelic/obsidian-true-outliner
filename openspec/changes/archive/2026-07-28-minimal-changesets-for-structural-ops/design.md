## Context

Every structural operation (`src/ops.ts`) computes its result as `parse(encode(surgery))`
and diffs old vs. new document with `diffLines` (`src/result.ts`): a single-splice,
whole-*document* prefix/suffix trim that already narrows to one contiguous `Edit` —
`{ fromLine, toLine, insert }` — covering only the differing line range. That `Edit` is
still a **whole-line-range replacement**: `src/plugin/dispatch.ts`'s `editToChange` turns
it into exactly one `EditorChange` spanning `{ from: {fromLine, ch: 0}, to: {toLine, ch:
0} }`, regardless of how much of those lines actually differ. Indenting a node with a
child replaces all 3 lines to add two tab characters; merging two paragraphs replaces
25 characters to remove one line break.

CodeMirror maps cursor/selection positions through a transaction's changes to compute
where they land after undo/redo. A position that falls *inside* a replaced range maps to
one end of the replacement (the exact end depends on associativity and CM6 version — see
`fix-redo-cursor-after-structural-ops`, `docs/research/04-open-questions.md` Q18–Q21) —
never to a semantically meaningful spot inside it. That change landed a workaround:
`src/plugin/history-cursor.ts` re-asserts the operation's own cursor into CM6 history via
a follow-up selection-only transaction, so **redo** restores it. Q21 root-caused why that
workaround structurally cannot reach a *second* undo (the history event it would need to
patch lives on the undone branch, which `addSelection` never writes to) — documented as a
known limitation in `tests/history-cursor.test.ts` and `openspec/specs/
structural-history-integration/spec.md`. Tab has a second, undo-independent symptom for
the same root cause: it has to *state* an explicit resulting cursor (there's nothing
meaningful to map an old position onto inside a full-region rewrite), so it always lands
at the node's content start, discarding the column the user was actually at.

Both symptoms are downstream of the same cause: the change set is wider than the edit.
This change removes the cause instead of extending the workaround.

## Goals / Non-Goals

**Goals:**
- Structural operations dispatch the narrowest character-level change set that produces
  the same resulting document as today's whole-region replacement.
- Indent and outdent stop using the operation's own semantic cursor and instead derive
  it from the pre-operation caret, so Tab preserves the user's column. *(Stated in the
  first draft as "stop stating an explicit cursor, relying on CM6's default mapping";
  implementation showed that default disagrees with what history recomputes on redo, so
  the same mapping is computed and stated explicitly instead — D4.)*
- The redo-cursor workaround (`history-cursor.ts`, its `userEvent`, its classification
  entry) is retired for indent and outdent, whose cursor mapping now reproduces what
  history recomputes. *(Drafted as deleting it outright; a review found that
  over-generalised from indent/outdent to operations that CHOOSE a cursor, where
  reordering lands redo on the wrong node — so it returns, scoped, in D5a.)*
- The documented known limitation (repeated undo/redo diverges at depth two) is closed
  for the mapping-derived operations, and the tests that pinned it as expected behavior
  are replaced by tests requiring correctness at arbitrary depth. *(It persists, by
  deliberate trade, for the operations that choose a cursor — D5a.)*
- The resulting document is byte-identical to what today's whole-region dispatch
  produces, for any structural operation on any document.

**Non-Goals:**
- Operations whose resulting cursor is not recoverable by mapping — move up/down
  (reordering: the old position maps into what is now different content), split, merge,
  paste, and the enforcement-rewrite delete/paste paths — keep stating an explicit
  cursor. Only indent/outdent change in this respect.
- No change to `diffLines`'s contract or to `Edit`'s shape (`fromLine`/`toLine`/`insert`,
  line-granular). The narrowing happens once, at the dispatch choke point, not by
  changing every op or the line-diff itself.
- No change to what document `parse`/`encode` produce, and no change to the tree-surgery
  algebra in `src/ops.ts`/`src/reencode.ts`.
- Not attempting to generalize into a full Myers/LCS diff library. The two-branch
  algorithm below is deliberately narrower, matched to the shapes structural ops actually
  produce.

## Decisions

### D1: Narrowing lives in `src/plugin/dispatch.ts`, at the `Edit → EditorChange` boundary

`editsToChanges`/`editToChange` is already the single choke point every structural
dispatch site goes through: the keyboard grammar (`grammar.ts`), the edit-enforcement
rewrites (`transaction-filter.ts`), and the command-palette ops (`main.ts`). Narrowing
here means every call site gets minimal change sets for free, with no per-site logic to
keep in sync — the same reasoning `structural-history-integration` already used for
*where* the reassertion recording lived (one shared mechanism, not per-site code).

Alternative considered: narrow inside `diffLines` (`result.ts`) instead. Rejected —
`Edit` is a line-granular type consumed by things that legitimately want line
granularity (`applyEdits`, the enforcement layer's `changedLineSpans`/
`deletesLineBoundary` facts, which read *incoming* transactions and are unaffected
either way — see Risks). Narrowing at the `EditorChange` boundary keeps `Edit` as the
stable line-level contract and confines the character-level concern to the one module
that already turns lines into editor positions.

### D2: Two-branch narrowing algorithm, per `Edit`

For one `Edit` (`fromLine`, `toLine`, `insert`) against the buffer snapshot `lines`:

1. **Trim matching whole lines from both ends.** Compare `lines[fromLine..toLine)`
   against `insert` line-by-line from the start, and again from the end, counting how
   many lines are byte-identical. This shrinks the region before any character-level
   work — e.g. an indent whose gap lines don't change indentation drops out here.
2. **Branch on whether the trimmed middle changed the line count:**
   - **Same line count (indent, outdent, and any same-shape op):** diff line-by-line.
     For each remaining line pair, find the common character prefix and suffix and emit
     one `EditorChange` for just the differing middle span; skip the line entirely if
     it's unchanged. This is what turns a 3-line indent replacement into two single-tab
     insertions at two positions — a per-line trim is required here specifically because
     a single whole-region trim would still treat the whole span between the first and
     last changed character as one replacement, which for indent spans everything the
     unrelated middle content between the two tab insertions.
   - **Different line count (merge, split, delete/insert a line):** join the trimmed-
     middle old lines and new lines with `\n` and find the common character prefix/suffix
     across that joined text as a single unit, emitting one `EditorChange`. A merge's
     entire effect is "the line break and its surrounding whitespace disappear" — a
     single character-level splice, not a per-line diff (there's only one line pair
     changing shape, not several lines each changing independently).

This matches the proposal's worked table exactly: merge → one deletion (branch 2),
indent → two single-character insertions (branch 1), outdent → two single-character
deletions (branch 1).

Alternative considered: always do whole-region (branch 2 only) character diffing.
Rejected by the proposal's own finding — sufficient for merge, not for indent, because a
single prefix/suffix trim over multi-line content stops at the *first* and *last*
differing character and can't skip an unchanged run in the middle the way a per-line
pass does.

Alternative considered: a general line-level LCS/Myers diff for step 2 instead of a
fixed two-branch rule. Rejected — the shapes structural ops actually produce are narrow
(add/remove a fixed prefix per line, or change how many lines a fixed span occupies), and
a general diff is more machinery than the shapes justify; the property test (D5) is what
protects correctness, not diff generality.

### D3: `EditorChange`'s cardinality changes from one-per-`Edit` to N-per-`Edit`

`editToChange` (singular return) becomes a function returning `EditorChange[]`;
`editsToChanges` flat-maps across all `Edit`s' expansions instead of mapping 1:1. Multiple
narrower ranges within one `Edit` are always emitted in ascending, non-overlapping
document order (line-by-line, or the single trimmed-middle span), which is what CM6's
`ChangeSpec` array form and the existing `applyChanges` test helper
(`tests/plugin.test.ts`) already expect — no test-harness change needed, it was written
generally from the start.

### D4: Cursor — indent/outdent state an explicit cursor computed by mapping, not by omission

The original plan was for indent/outdent to omit `selection` entirely, relying on CM6's
own default old-selection-through-changes mapping. Implementation testing (see Risks)
found this default disagrees with what `@codemirror/commands`' history redo later
computes for the same transaction whenever the cursor sits exactly at a change boundary —
CM6's own default live-mapping assoc is `-1`, while history's redo restore is hardcoded to
assoc `1` (`event.startSelection.map(event.changes.invertedDesc, 1)`), and the two are
simply different functions that happen to agree everywhere except at a change's exact
edge.

The fix: compute the SAME assoc-`1` mapping ourselves (`dispatch.ts`'s
`mapCursorForward` — map the pre-op cursor forward through the minimal change set,
landing after inserted text at an exact boundary rather than before it) and dispatch it
as an explicit `selection`, in the same transaction as the changes. This is still not the
op's own semantic cursor choice — it is purely a mechanical function of the old cursor
and the change set, matching design's original intent — it is just computed explicitly
rather than left to an implicit default that turned out to disagree with history's own
convention. `OpOutput.cursor` (the op's own semantic choice) is unused for indent/outdent
specifically; `mapCursorForward` is used instead. `main.ts`'s `indent-node`/`outdent-node`
palette commands do the same (`useMappedCursor` on `runOp`), converting the result back
to `{line, ch}` for `Editor.setCursor` since Obsidian's public API isn't offset-based.

**Move up/down, split, merge, paste, delete-rewrite** keep the op's own explicit cursor
(`OpOutput.cursor`, via `offsetInNewText`). Their resulting cursor is not something
mapping can recover even with minimal changes: move reorders two sibling regions (a
position that was "inside A" maps into whatever now occupies A's old range, which is B,
not A), and merge/split/paste have a specific landing spot (a join point, a split point)
that is a deliberate *choice*, not "where the old cursor happens to end up."

This is the only behavioral change to the grammar/command layer; no other keybinding or
command changes.

### D5: The redo-cursor workaround is deleted outright, not kept as a fallback

`src/plugin/history-cursor.ts` (the `CursorRecorder` ViewPlugin and
`structuralCursorRecorder` extension), its registration in `main.ts`, and its `userEvent`
(`CURSOR_REASSERT_USER_EVENT`, `select.structural`) and classification entry in
`classify.ts` are removed entirely. Once change sets are minimal, mapping is correct in
both directions at any depth for insertions, and for deletions except when the cursor
sits at or inside the deleted span itself (see Risks — a narrow, CM6-inherent residual,
not something a recording mechanism could have closed either). This is a strictly
stronger guarantee than what the recorder ever provided (first redo only, for every
shape) — there is nothing left for it to compensate for in the cases it covers. Keeping
it as a defensive fallback was considered and rejected: it would be dead code whose
trigger condition (`needsCursorRecording`) could silently drift out of sync with reality
with no test able to tell the difference, which is the exact failure mode its own
comments warn about for *other* mechanisms ("this project has shipped that class of bug
twice already").

### D5a: Operations that CHOOSE a cursor keep the recorder; only indent/outdent lose it

Found by a real-vault pass after rebasing onto `content-space-caret`, then sharpened by
review (docs/research/04 Q29 and its follow-ons). D5's reasoning holds for INSERTIONS
only, and over-generalised from them. D4 had already said the rest: move, split, merge,
paste and structural delete choose a cursor that "mapping cannot recover even with
minimal changes." Removing the recorder wholesale contradicted that, in the same design.

**Why mapping cannot recover it.** Redo does not re-run the operation — CodeMirror
replays a recorded `ChangeSet` and derives a cursor from it, with only the changes and
the pre-edit selection available. That is enough for indent/outdent, whose cursor means
"wherever you were, shifted by the splices"; `dispatch.ts`'s `mapCursorForward` computes
exactly what history recomputes, so the two agree by construction. It is not enough for a
move, whose cursor means "follow that node": a splice carries no notion of which content
is which. Demonstrated concretely — the identical document, caret and change set arise
both from moving `- b` above `- a` (caret should follow to offset 2) and from two
ordinary text edits swapping the letters (caret should stay at offset 6); redo answers 6
for both. No function of those inputs can be correct for both, so recording is the only
available channel, not a stylistic preference.

**The enforcement funnel cannot help either.** `@codemirror/commands` dispatches undo/redo
with `filter: false`, and CM6's `resolveTransaction` honours that by skipping
`filterTransaction` entirely — verified against the installed package, not inferred. **No
`EditorState.transactionFilter` observes an undo or a redo.** Any invariant enforced only
there has a hole exactly the shape of history. This is worth carrying beyond this change.

So `src/plugin/history-caret.ts` keeps the re-assertion, scoped by
`SEMANTIC_CURSOR_USER_EVENTS` (the plugin-own set minus indent/outdent, derived rather
than hand-listed so the two cannot drift). Two choices worth stating:

- **Scope is the correction, not the mechanism.** Indent/outdent record nothing and are
  exact in both directions at any depth. Everything else records, and accepts the Q21
  cost: every redo becomes exact, and a second UNDO restores the recorded cursor rather
  than the pre-operation one. Re-measured before choosing — without recording, redo after
  a reordering lands on the wrong node *every single time*, which is plainly worse.
- **`filter: false` on the re-assertion**, so the funnel cannot move the very cursor being
  recorded. That is what the retired `select.structural` plugin-own entry had existed to
  achieve, without a `userEvent` in the taxonomy.

**Interim step, recorded because it explains the history.** Between the wholesale removal
and this scoping, a view-level *caret resolver* ran undo/redo-restored carets through
`resolvePlacement`, guaranteeing an addressable position rather than the right one. It
closed the reported gap-line symptom but could not cover reordering, where the mapped
position is legal and wrong. Once the recorder returned it had nothing left to do —
measured across delete, move, merge and split — and was dropped rather than kept as
unproven machinery in the area of the codebase with the most owners of caret placement.

What this change does NOT settle, all now owned by the `caret-placement-policy` proposal:
the delete op chooses the survivor's content start while gap ownership would give the
preceding node's content end; the keyboard and palette paths implement one rule twice; and
indent/outdent's addressability fallback is not recorded, so a redo recomputes the mapped
position and can put the caret back on a gap line. That last one is the sharpest argument
for deciding "record or not" per DISPATCH rather than per operation — a single operation
can dispatch a derived cursor most of the time and a chosen one when its fallback fires.

(The palette's separate cursor transaction does record, but records the mapped value —
what history would recompute anyway — so it behaves identically to the keyboard path at
every depth. Measured, after an earlier note here claimed otherwise from reasoning alone.)

### D6: Tests — property-based correctness at arbitrary undo/redo depth replaces the pinned-known-limitation tests

`tests/history-cursor.test.ts` is deleted (its `StructuralOp` fixtures hand-author
*whole-region* change specs — the exact shape being eliminated — to exercise the
recorder that's being deleted; nothing in it survives meaningfully). It's replaced by a
new suite that builds real `EditorState`s with the real `@codemirror/commands` `history()`
extension, dispatches an actual `indent`/`outdent` result through the real (now-minimal)
`editsToChanges`, and asserts the cursor is correct after `undo → redo → undo → redo → …`
to a generated depth (property-tested over `arbTree()` + generated op sequences, in the
style already established by `tests/plugin.test.ts`'s edit-dispatch property test) — not
just the first pair. This is what makes "closed, not narrowed" an executable claim rather
than an assertion in a design doc.

`e2e/specs/64-structural-history-cursor.e2e.ts`'s redo scenarios keep asserting correct
end-to-end behavior (they were already asserting the *right* outcome, just for a bug that
couldn't reproduce there — see its own docstring) but its docstring's "forward guard, not
a current one" framing and its last scenario (observing the reassertion transaction
directly, which no longer exists) need updating to match: there is no more workaround to
observe, and correctness no longer depends on the harness's bundled CM6 version, so these
stop being conditional guards and become unconditional ones.

## Risks / Trade-offs

- **[Risk] A residual, CM6-inherent cursor-drift case survives for outdent, on the SECOND
  and later undo/redo cycle, when the cursor sits at or before the specific whitespace
  outdent removes.** Verified against real `EditorState` + `@codemirror/commands`
  `history()`: CM6 collapses any cursor at or inside a *deleted* span to that span's start
  when computing the live result, discarding the distinction between "was exactly at the
  boundary" and "was one character further in" — information no field in CM6's history
  retains. A subsequent undo-of-a-redo can only work from that already-collapsed value,
  and CM6's own hardcoded restore formula for that case lands one character off from where
  the cursor actually started. This is NOT a whole-region-replacement artifact and NOT
  something any change-set width, mapping choice, or recording mechanism we control can
  fix — it reproduces identically regardless of what `selection` we dispatch, because
  CM6's undo/redo restoration for a branch-switched event ignores what we pass and
  recomputes from the collapsed post-op position alone. Indent is a pure insertion and
  never collapses anything — unaffected at any depth, confirmed by property test
  (`tests/minimal-change-history.test.ts`). Outdent is affected only when the cursor sits
  at or before the leading whitespace/marker being removed (never inside the node's actual
  content). Before the updated base, Home could reach the absolute line start immediately
  before Shift+Tab.
  → Mitigation: the independent `content-space-caret` change has now landed (archived at
  `openspec/changes/archive/2026-07-26-content-space-caret`) and makes exactly this cursor
  position unaddressable for user gestures. Its published spec still passes through
  `plugin-own`/`composition` positions, so a narrower window remains (a non-gesture cursor
  placement immediately followed by Shift+Tab with no intervening user motion) — accepted
  as a known, narrow, documented residual rather than engineered around here. Still a
  strict improvement over the prior whole-region behavior (which could
  jump the cursor to an unrelated node, not just one character off within the same line).
- **[Risk] Narrower `EditorChange` ranges change what other CodeMirror extensions and
  Obsidian itself observe as "changed," even though the resulting document is identical.**
  → Mitigation: the byte-identical-document property test (existing, `tests/
  plugin.test.ts`) guards the document; it does not guard *what changed*. This needs a
  real-vault pass on current Obsidian specifically checking decorations,
  Obsidian's own diffing/sync, and any other installed plugin's editor extensions still
  behave — called out explicitly in the proposal's Impact section, not something this
  design can verify from the harness alone.
- **[Risk] The enforcement layer's `changedLineSpans`/`deletesLineBoundary` facts could
  be assumed to derive from our own narrowed dispatches.** → Mitigation: confirmed by
  reading `transaction-filter.ts` — they're computed from the *incoming* transaction
  being classified (i.e., what the user or another source just dispatched), never from
  our own `editsToChanges` output being fed back in. Unaffected by construction, but
  worth stating explicitly since the proposal flagged it as a risk to confirm rather than
  assume.
- **[Risk] EOF/newline boundary handling gets subtler.** The current `editToChange`'s
  special-casing (no trailing newline after the last line; deleting through EOF must also
  consume the preceding newline) existed because a whole-line replacement always has to
  decide how to represent the boundary. Under per-line diffing (D2 branch 1), most lines
  never touch a line terminator at all, which removes the need for that special-casing on
  them — but the line-count-changing branch (D2 branch 2) still splices across line
  breaks and can still land exactly on EOF (e.g. deleting the last node). → Mitigation:
  the existing property test already exercises `indent`/`outdent`/`moveUp`/`moveDown`
  including doc-boundary cases via `arbTree()`; extend it explicitly with merge/split/
  delete-at-EOF shapes rather than trusting the boundary logic is exercised incidentally.
- **[Trade-off] More `EditorChange` entries per operation than before (N small ranges
  instead of 1 large one).** Accepted: this is the entire point, and CM6 change sets are
  designed for this — the existing `applyChanges` test helper already treats multi-range
  `EditorChange[]` as the normal case, not an edge case.

## Migration Plan

No data migration — this is a pure editor-behavior change with no persisted format
affected. Rollout is a single change:

1. Land the narrowing in `dispatch.ts` behind the existing property test (byte-identical
   document), with the whole-region behavior as the thing being replaced, not toggled —
   no flag, per this project's stated preference for changing code over adding
   compatibility shims.
2. Switch indent/outdent's cursor to the EXPLICIT assoc-1 mapping of the pre-operation
   caret (`mapCursorForward`), once narrowing is in place — doing it before narrowing
   lands would reintroduce the original bug on the old wide change sets. Not CM6's
   implicit default, which D4 records disagrees with history's own redo mapping at a
   change boundary.
3. Narrow the reassertion mechanism to the operations that CHOOSE a cursor, last, once
   the new depth-correctness tests are green — so there is never a window where
   redo-cursor correctness has neither the old workaround nor the new root-cause fix.
   Indent and outdent leave it behind entirely; move, split, merge, paste and structural
   delete keep it (D5a).
4. Update `docs/research/04-open-questions.md` Q21's status line once the known
   limitation it documents no longer exists, per this project's convention of recording
   findings against the question that raised them (Q16, Q19 follow this pattern already).

Rollback is a straight revert (no persisted state to reconcile) if the real-vault pass in
Risks surfaces a regression in what another extension observes as changed.

## Open Questions

None outstanding — the proposal and the exploration above resolve the shape of the
narrowing algorithm, the cursor-omission scope, and the test replacement strategy. The
real-vault pass called out in Risks is a required verification step, not an open design
question.
