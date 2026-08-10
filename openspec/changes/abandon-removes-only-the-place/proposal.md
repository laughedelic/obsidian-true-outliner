## Why

Abandoning an unused structural keypress removes the wrong bytes. `provisional-cleanup.ts`
does not know what the keypress made, so it GUESSES: the place is however many lines the
whole transaction added, counted forward from the caret, floored at one. That guess is a
proxy for "how many lines did the key write", and it stops being a valid proxy the moment
the keypress does anything else — or the moment the place is not laid out the way the proxy
assumes.

Measured against the planner and a real `EditorState`, thirteen cases, five wrong:

| Press Enter, then move away | leaves | should leave |
|---|---|---|
| block-selected paragraph in `alpha`/`beta`/`gamma` | `alpha␤␤␤gamma␤` | `alpha␤␤gamma␤` |
| block-selected paragraph at the document's end | `alpha␤␤` | `alpha␤` |
| block-selected paragraph between wide gaps | `alpha␤␤␤␤gamma␤` | `alpha␤␤␤gamma␤` |
| at the end of `1. a` in `1. a`/`2. b`/`3. c` | `1. a␤3. b␤4. c␤` | `1. a␤2. b␤3. c␤` |
| at the end of the last node of `alpha␤␤beta` | `alpha␤␤beta␤␤` | `alpha␤␤beta` |

Three of the five need no block selection at all, and the fourth removes nothing whatsoever:
in a file with no trailing newline the computed range is empty, so the position simply stays.
The ordered-list row is worse than debris — the keypress renumbered a run, the abandon
deletes a line without renumbering back, and the user is left with a list that starts
`1.` `3.` `4.`.

Two failure modes, one cause:

- **The extent comes from the wrong delta.** Over a block selection the keypress both removes
  the selection and opens a position, and the removal cancels part of the line growth the
  extent is read from. The position is two lines and one line is removed, every time.
- **The span is built by line arithmetic that has no rule for the document's end.** The
  removal takes the newline AFTER the last line of the span; at the end of a file there is
  none, and the clamp that avoids running off the end silently drops a line — or the whole
  edit.

Neither is reachable by a better formula. The information the removal needs — which bytes
this operation wrote, and what stood there before it acted — exists only while the plan is
being composed, and the change set that reaches the editor is a MINIMAL DIFF of the whole
transformation, in which the removal and the insertion are fused into one replacement by
construction. `docs/research/15-enter-and-shift-enter-catalogue.md` (section C2) records the
block-selection half and names this as the fix; it predates the reverse-edit mechanism, so
its stated symptom ("the paragraph comes back") no longer reproduces, and the measurements
above replace it.

## What Changes

**A plan states how to remove the place it opens.** The transaction plan gains an abandon
edit alongside its changes: the edit that removes the empty place this operation left the
caret on, expressed in the coordinates of the document the plan produces. It is computed
where both states are known — before the operation acted and after — rather than
reconstructed from the result.

**Two forms, one per operation family, because the two mean different things.**

- An operation whose PURPOSE was to open the place — a split, a drafted sibling heading, a
  Shift+Enter continuation — states its own reversal: the diff from its result back to the
  text it acted on. Everything that operation did goes, and everything that came before it in
  the same keypress stays. That is what leaves an ordered run renumbered correctly and a
  block selection deleted.
- An operation that DISSOLVED a node into a blank line — leaving a list from an empty item by
  unwrap or outdent — states the removal of that line instead. Reversing it would restore the
  `- ` the user pressed Enter to escape, which is the opposite of abandoning the blank it
  left behind. This is today's rule, stated explicitly instead of falling out of a floor of
  one.

**Where the plan removes a selection first, the abandon reverses only the key's own step.**
`planOverSelection` composes two steps in text space; the inner plan's abandon edit is
already expressed against the final document and is carried through unchanged. Abandoning
then returns to the intermediate document — the selection stays deleted — which is what the
gesture means.

**`provisional-cleanup.ts` stops deriving edits.** The line-delta arithmetic is deleted. The
module keeps everything that is genuinely its own: whether the caret is on an empty place,
whether the record is still live, when to fire, where the caret lands afterwards, and the
`userEvent` the abandon carries.

**The abandon becomes a change SET rather than a single change**, since a reversal may
restore text as well as remove it (ordered markers). The caret it dispatches is mapped
through that set rather than shifted by a single change's length.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `structural-history-integration`: the abandonment requirement is restated and renamed to
  "Abandoning an empty place removes exactly what opened it". It gains the exactness
  contract — the removal is stated by the operation that opened the place, from the document
  as it stood before that operation acted, never derived from the result — and names the two
  forms. Restating it also closes drift its base branch left behind: the requirement still
  describes the mechanism as an UNDO of the keypress that adds NO history entry and returns
  the document byte-for-byte to its state before it, and all three have been false since the
  abandon became its own reversing edit. The last is not only stale but wrong in the case
  this change fixes — over a block selection the document must NOT return to its prior state.
- `outline-keyboard-grammar`: the "Provisional positions" requirement describes abandonment
  as cancelling "the keypress that created it". Under the restated rule it cancels the
  operation that opened the position, not the whole keypress. One paragraph, so the two
  specs do not disagree about the same gesture.

## Impact

- `src/plugin/grammar.ts`: `TxPlan` gains an abandon change set; `planFromOp` and
  `insertionPlan` compute it; each branch of `planKey` states which form applies;
  `planOverSelection` passes the inner plan's through.
- `src/plugin/keymap.ts`: converts the abandon edit to document offsets and puts it on the
  dispatched transaction, alongside the `userEvent` it already sets.
- `src/plugin/provisional-cleanup.ts`: `reverseFor` is removed; the record holds the stated
  edit; `cancel` maps its caret through a change set.
- `src/plugin/dispatch.ts`: unchanged — `editsToChanges` is reused for the abandon edit, so
  the document's end is handled by the same converter every structural dispatch already uses.
- Tests: `tests/undo-on-abandon.test.ts` for the measured cases with negative controls;
  `tests/grammar.test.ts` for the plan's new field; `e2e/specs/30-keyboard-grammar.e2e.ts`
  for the block-selection abandon and the end-of-document abandon, neither of which is
  covered today.
- No change to the operations layer, the parse, decorations, or enforcement.

## Out of scope

- **A redone provisional position cannot be abandoned again** — the other finding recorded
  beside this one. A redo re-applies the changes without the marker that carried the abandon
  edit, so nothing here reaches it, and the catalogue records two attempts at recognising a
  redo that were measured and reverted. It stays open, unchanged.
- **Which operations may create a place at all.** The recogniser keys on this plugin's own
  markers and on where the caret landed; that is a different question from how much to
  remove, and answering it from the plan would need node identity across a re-parse. The
  event lists that answer it are left exactly as they are.
- **Multi-cursor.** The grammar declines under multiple cursors, so no place is created and
  nothing to abandon exists.
