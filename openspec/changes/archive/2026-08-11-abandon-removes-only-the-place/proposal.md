## Why

`structural-history-integration` already names this defect and its fix. Its "Known
limitations of place removal" requirement records that a place opened OVER A BLOCK SELECTION
is not removed cleanly, and states the closure: the PLANNER carrying the exact removal edit,
computed where the intermediate state is still known, instead of the cleanup deriving one.
This change makes that closure.

The limitation is broader than the shape it was found in. `provisional-cleanup.ts` never saw
what the keypress made, so it reconstructs the place from the finished transaction: however
many lines the document grew by, counted forward from the caret, floored at one. That
reconstruction is a proxy for "how many lines did the operation write", and it fails wherever
the proxy and the fact come apart.

Measured against the planner and a real `EditorState` on this change's base — fourteen cases,
seven wrong:

| Press Enter, then move away | leaves | should leave |
|---|---|---|
| block-selected paragraph in `alpha`/`beta`/`gamma` | `alpha␤␤␤gamma␤` | `alpha␤␤gamma␤` |
| block-selected paragraph at the document's end | `alpha␤␤` | `alpha␤` |
| block-selected paragraph between wide gaps | `alpha␤␤␤␤gamma␤` | `alpha␤␤␤gamma␤` |
| at the end of `1. a` in `1. a`/`2. b`/`3. c` | `1. a␤3. b␤4. c␤` | `1. a␤2. b␤3. c␤` |
| at the end of the last node of `alpha␤␤beta␤` | `alpha␤␤beta␤␤` | `alpha␤␤beta␤` |
| at the end of the last node of `alpha␤␤beta` | `alpha␤␤beta␤` | `alpha␤␤beta` |
| at the end of the only node of `thought␤` | `thought␤␤` | `thought␤` |

**Four of the seven need no block selection at all.** The ordered-list row is worse than
debris: the keypress renumbered a run on the way in, the removal deletes a line without
renumbering back, and the user is left with a list reading `1.` `3.` `4.`.

Three assumptions are baked into the reconstruction, and each is a guess about a keypress the
module never saw:

- **The place is as many lines as the transaction grew by.** Over a block selection the
  keypress both removes the selection and opens a position, and the removal cancels part of
  the growth. A provisional position is two lines, the delta reports one, and the floor keeps
  it there.
- **Removing lines is enough.** True only for an operation that added nothing but the place.
  An Enter into an ordered run renumbers the items below it, and the numbers stay renumbered.
- **The span starts on the caret's line and runs forward to a following line break.** At the
  end of a file the layout is `[separator][position]` rather than `[position][separator]`, and
  there is no following break to take. The base branch added a rule for the sub-case where
  that makes the computed range EMPTY, which is why the last row removes a line at all instead
  of nothing. The extent is still short by one, so all three end-of-document rows still leave
  a blank line behind.

Neither of the first two is reachable by a better formula. The information the removal needs —
which bytes this operation wrote, and what stood there before it acted — exists only while the
plan is being composed. What reaches the editor is a MINIMAL DIFF of the whole transformation,
in which a removal and an insertion touching the same lines are one replacement by
construction.

## What Changes

**An operation states how to remove the place it makes.** The transaction plan gains a removal
edit alongside its changes, expressed in the coordinates of the document the plan produces. It
is computed where both states are known — before the operation acted and after — rather than
reconstructed from the result.

**Two forms, one per operation family, because the two mean different things.**

- An operation whose PURPOSE was to open the place — a split, a drafted sibling heading, a
  Shift+Enter continuation — states its own reversal: the diff from its result back to the
  text it acted on. Everything that operation did goes, including any renumbering, and
  everything the same keypress did before it stays. Stating it in bytes is what makes it exact
  without anything having to decide which effects count as part of the place.
- An operation that DISSOLVED a node into a blank line — leaving a list from an empty item by
  unwrap or outdent — states the removal of that line instead. Reversing it would restore the
  `- ` the user pressed Enter to escape. This is today's behavior, stated explicitly instead
  of falling out of a floor of one. Measured: the residue family is correct on the base in
  every case, and this change must keep it that way.

**Where the plan removes a selection first, the removal reverses only the key's own step.**
`planOverSelection` composes two steps in text space; the inner plan's removal edit is already
expressed against the final document and is carried through unchanged. Abandoning then returns
to the intermediate document — the selection stays deleted — which is what the gesture means.

**`provisional-cleanup.ts` stops deriving edits.** The line-delta arithmetic goes, including
the end-of-document branch, which becomes unnecessary rather than needing a second correction.
The module keeps everything genuinely its own: whether the caret is on an empty place, whether
the record is still live, when to fire, where the caret lands afterwards, and the `userEvent`
the removal carries.

**The removal becomes a change SET rather than a single change**, since a reversal may restore
text as well as delete it (ordered markers). The caret it dispatches is mapped through that set
rather than shifted by a single change's length.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `structural-history-integration`: two requirements. "An unused structural keypress has its
  place removed" currently specifies the derivation itself — "delete the place's own line plus
  however many lines the keypress added beyond it" — which is the defective rule written down.
  It is replaced by the exactness contract: the removal is stated by the operation that made
  the place, from the document as that operation found it, never derived from the result. And
  "Known limitations of place removal" recorded two limitations, one of which this change
  closes, so it is replaced by "Known limitation — a redone place cannot be declined again",
  carrying the surviving one through verbatim. The block-selection behaviour it described is
  now specified positively, as a scenario of the requirement above.
- `outline-keyboard-grammar`: the "Provisional positions" requirement describes abandonment as
  cancelling "the keypress that created it", and cross-references a requirement name that no
  longer exists. Under the restated rule it cancels the operation that opened the position, not
  the whole keypress. One paragraph, so the two specs do not disagree about the same gesture.

## Impact

- `src/plugin/grammar.ts`: `TxPlan` gains a removal change set; `planFromOp` and
  `insertionPlan` compute it; each branch of `planKey` states which form applies;
  `planOverSelection` passes the inner plan's through.
- `src/plugin/keymap.ts`: converts the removal edit to document offsets and puts it on the
  dispatched transaction, alongside the `userEvent` it already sets.
- `src/plugin/provisional-cleanup.ts`: `reverseFor` is removed, end-of-document branch
  included; the record holds the stated edit; `cancel` maps its caret through a change set.
- `src/plugin/dispatch.ts`: unchanged — `editsToChanges` is reused for the removal edit, so the
  document's end is handled by the same converter every structural dispatch already uses.
- Tests: `tests/undo-on-abandon.test.ts` for the measured cases with negative controls;
  `tests/grammar.test.ts` for the plan's new field; `e2e/specs/30-keyboard-grammar.e2e.ts` for
  the block-selection abandon and the end-of-document abandon, neither of which is covered.
- No change to the operations layer, the parse, decorations, or enforcement.

## Out of scope

- **A redone place cannot be declined again** — the other recorded limitation. A redo replays
  the changes without the marker carrying the removal edit, so nothing here reaches it, and the
  spec records two attempts at recognising a redo that were measured and reverted. It stays
  open, and its requirement text is carried through unchanged.
- **Which operations may create a place at all.** The recogniser keys on where the caret lands
  and on this plugin's own markers; that is a different question from how much to remove, and
  the spec's reason for keying on the caret rather than the operation is unaffected. Making
  "states a removal edit" the recogniser would admit an outdent that merely moved an
  already-empty item.
- **Multi-cursor.** The grammar declines under multiple cursors, so no place is created and
  nothing to abandon exists.
