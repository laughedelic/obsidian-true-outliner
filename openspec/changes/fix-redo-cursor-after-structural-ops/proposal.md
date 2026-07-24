## Why

Redo after any structural operation puts the cursor in the wrong place — reported three
times across manual passes (docs/research/04-open-questions.md Q18, Q19, Q20) and twice
carried forward unfixed because the mechanism was misdiagnosed. The root cause is now
confirmed by a standalone pure-CodeMirror reproduction and by manual verification in a
real vault: CodeMirror's history never records the semantically-chosen cursor our
structural transactions carry, so redo falls back to a mechanical position mapping that
collapses to the end of the whole rewritten region.

Q19's write-up of the CodeMirror mechanism is factually wrong and actively misled two
follow-up investigations; correcting it is part of this change.

## What Changes

- **Structural transactions teach history their own resulting cursor.** After a
  structural transaction commits, a selection-only transaction re-asserts the same
  cursor, which is what CodeMirror's history records as the operation's "selection
  after". Redo then restores it instead of computing one.
- **One shared mechanism for both dispatch sites.** The outline keyboard grammar
  (`src/plugin/keymap.ts`) and the edit-enforcement rewrite path
  (`src/plugin/transaction-filter.ts`) both produce structural transactions and both
  have the bug; they get one common mechanism rather than two parallel fixes. This
  project has twice been bitten by one correct call site and one silently stale
  duplicate (Q19's own `reencodeBlocksForDestination` finding, and D15's detection-gate
  split) — this avoids a third.
- **The re-assertion is recognized as plugin-own**, so it classifies `plugin-own` and is
  passed through untouched rather than being run through selection escalation and
  marker-transparent cursor clamping.
- **Regression coverage** at the level that would actually have caught this: an
  automated check that the wrong-landing shape reproduces without the fix and does not
  with it, deliberately constructed so that no intervening selection transaction can
  mask it (that masking is exactly why every prior automated repro passed).
- **Research log corrected**: Q19's mechanism description is replaced with the verified
  one, and Q20's "carried forward as its own investigation" entry is resolved.
- **Known limitation, accepted and documented**: this fixes the FIRST redo after an
  operation. `undo → redo → undo` still lands on a mechanically mapped position — a
  structural limit of the mechanism, not an implementation gap (the event a second undo
  reads from lives on the history's undone branch, which no selection transaction can
  reach). Pinned by a test so it is executable, not just prose.
- **Not in scope, recorded only**: (a) structural operations reset the cursor to the
  node's content start even without any undo/redo involved (`ops.ts`'s `finalize` cursor
  convention); (b) emitting minimal character-level ChangeSets instead of whole-region
  replacements, which would fix the limitation above AND (a) together. Both belong to a
  follow-up change against `editsToChanges`.
- **E2E harness now prefers the current Obsidian beta** when available, falling back to
  latest. Automated and manual testing were running different CM6 versions, which is a
  direct cause of this bug looking unreproducible for three rounds.

## Capabilities

### New Capabilities

- `structural-history-integration`: how this plugin's structural transactions integrate
  with CodeMirror's undo/redo history — what undo restores, what redo restores, how the
  operation's own resulting cursor is made known to history, and the invariant that a
  structural operation remains exactly one undo step.

### Modified Capabilities

- `transaction-classification`: the plugin-own `userEvent` set gains the cursor
  re-assertion event, so the re-assertion transaction is classified `plugin-own` and
  passed through rather than escalated/clamped.

## Impact

- **Code**: `src/plugin/transaction-filter.ts` (new update listener alongside the
  existing veto cue), `src/plugin/keymap.ts` (structural dispatches routed through the
  shared mechanism), `src/classify.ts` (`PLUGIN_OWN_USER_EVENTS`).
- **Behavior**: redo after indent, outdent, move up/down, Enter-split, boundary
  deletions/merges, structural paste, and type-over now restores the operation's own
  cursor. Undo behavior is unchanged (it already restored the pre-edit cursor
  correctly). Undo step count per operation is unchanged (verified: one).
- **Docs**: `docs/research/04-open-questions.md` (Q19 correction, Q20 resolution).
- **Dependencies**: none added. The mechanism uses documented CodeMirror behavior only —
  no private APIs, no history-internals access.
