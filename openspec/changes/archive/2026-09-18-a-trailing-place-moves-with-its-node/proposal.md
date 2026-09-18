## Why

A provisional position at the END of a node's lines — what Shift+Enter at the end of its last
line opens, the ordinary way to start a continuation — survives no structural key. Issue #130,
measured in `docs/research/decoration-follow-ups` ("A structural key leaves the caret off a
TRAILING place, and leaves the place its old width") and pinned as measured in
`tests/grammar.test.ts`.

Two things go wrong on every key. The place keeps the width it had while the node's content
column moves, so typing there makes a CHILD of the node instead of continuing it — the outcome
`placeOutline`'s own doc comment names as the reason the interior case reads the resolved tree.
And the caret lands on the moved node's content start rather than on the place, because
`caret-policy` refuses a trailing gap as a caret target.

`positionBisectsANode` is the gate, and it requires a line of the node's to remain BELOW the
place, so a trailing place never resolves. The exclusion is deliberate and states its reason:
`indent` re-emits a node's lines, so resolving the document's own final blank line would write
trailing whitespace at the end of the file. What is stated nowhere is that a real place pays the
same price.

Re-measuring for this change found the moves worse than the two keys the issue tabulates. Their
caret is right — `caret-placement-policy` sends a move to its subject's content start — but the
place's LINE does not travel with the node, so the node that inherits the line inherits the
place: measured, move-up on `- a` / `- foo` / `␣␣` gives `- foo` / `- a` / `␣␣`, parking the
place under a node the user never touched.

Two things belong with the fix rather than after it, both named in the issue:

- **Spec text.** `outline-keyboard-grammar`'s "Provisional positions" covers only the interior
  case, and `caret-placement-policy` has no provisional-position scenario at all.
- **The palette path.** `main.ts`'s `runOp` passes no place line, so the command palette and any
  custom hotkey resolve no place at all and disagree with the keymap on the same document,
  interior places included (`docs/research/decoration-follow-ups`, "The palette path does not
  resolve a place at all"). Keyboard and palette agreeing is what `selection-structural-ops`
  exists to hold, so it is closed here rather than left as a second divergence.

## What Changes

- **A place at a node's END resolves for the operation path.** The gate splits: the half that
  asks about the place's own line becomes `positionJoinsANode`, which the operations ask; the
  half that also demands a line below stays as `positionBisectsANode`, which the rendering asks
  and which keeps the document's own final blank line out of the operations' reach. Design D1.
- **The place-line test moves inside `placeOutline`** (formerly `resolvedOutline`), which now
  takes the caret and the recorded place line and resolves only when they agree, so no entry
  point can hold its own version of it. Design D2.
- **The palette resolves a place through that same function**, closing the entry-point
  divergence. Design D3.
- **No change to what a MOVE's caret does**: a move is `caret-placement-policy`'s subject case
  and stays one. What changes is that the place travels with the node. Design D5.
- **An Enter place still does not resolve.** Its materialized line is a first line, so the tree
  it stands for would contain a node that does not exist yet — the half of the gate that must
  not be widened. Recorded as a residual rather than closed. Design D4.

## Capabilities

### Modified Capabilities

- `outline-keyboard-grammar`: "Provisional positions" states the rule for a position at a node's
  END, not only for an interior one, and states that a structural key carries the place with the
  node it moves.
- `caret-placement-policy`: gains the provisional-position case it had no scenario for — where a
  derived caret lands when the mapped position is a place.
- `selection-structural-ops`: "Both entry points resolve one operand and one after-state" says
  that the outline both entry points resolve includes an open place.

## Impact

- `src/plugin/decorate.ts`: the gate splits; `resolvedOutline` becomes `placeOutline` and takes
  the place line.
- `src/plugin/grammar.ts`: two call sites.
- `src/plugin/main.ts`: `runOp` and `resultCursor` read the place.
- `tests/decorate.test.ts`, `tests/grammar.test.ts`: the pinned trailing rows move on purpose.
- `e2e/specs/30-keyboard-grammar.e2e.ts`, `e2e/specs/20-structural-commands.e2e.ts`.
- `docs/research/decoration-follow-ups`: both entries close.

## Out of scope

- **An Enter place's own indentation.** It stands for a NEW node, and where that node belongs is
  not something the raw tree encodes. Left in the parking lot with what it does today.
- **Node-granular selection and the select-all ladder over a place.** Both read the raw parse and
  are measurably wrong there, and both are blocked on provenance that outlives the per-view
  record, not on this gate (`docs/research/decoration-follow-ups`, and `keymap.ts`'s own note).
- **The place record being single-shot.** `createdPlaceLine` reads a record only a keypress that
  CREATES a place re-establishes, and `indent` is in neither event list, so a Tab that carried a
  place along leaves none behind and the next structural keypress sees an ordinary blank line.
  This change is in the GRAMMAR and reaches the app only as far as the place line does, so the
  record fix is what makes it visible past the first keypress — a change of its own, stated in
  `docs/research/decoration-follow-ups` ("The place record is single-shot"). The palette's own
  half of it is recorded there too: `runOp` states no `abandon` edit, so it writes no record even
  for a key the event lists name.
- **Reopening D5.** The rendering keeps deriving from document and caret alone.
