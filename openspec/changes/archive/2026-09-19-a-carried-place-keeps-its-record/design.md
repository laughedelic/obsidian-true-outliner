## Context

`provisional-cleanup.ts` keeps one per-view record of the place this view's last structural
keypress made. The module was written for ONE consumer — the cleanup that removes a place the user
declines — and grew a second when the operation path needed to be told which blank line holds a
place (`a-position-does-not-split-its-node`, D5). The second consumer reads the first consumer's
record through `createdPlaceLine`, and inherits every condition that record carries.

Three of those conditions are right for the cleanup and wrong for the operation path:

- The record is written only for an event in `GAP_PLACE_EVENTS` or `NODE_PLACE_EVENTS`, which
  answer "did this keypress CREATE a place".
- It is written only when the dispatch also stated a removal edit, which only a plan that made a
  place states.
- It is read only while `undoDepth` is unchanged, a backstop against history movement that could
  make a removal undo the user's typing.

None of the three is about whether a line holds a place. Measurements: `docs/research/
decoration-follow-ups`, "The place record is single-shot, so a SECOND structural key mistreats the
place".

## Goals / Non-Goals

**Goals:**

- A place stays known for as long as it is open, not for one keypress.
- The two questions the module answers are separate facts with separate conditions, so neither can
  quietly re-scope the other.
- No change to what the cleanup removes, when, or how.

**Non-Goals:**

- Making the abandon record survive a carrying key.
- Giving a place provenance that survives undo and redo.
- Teaching the palette path to write a record at all.

## Decisions

### D1 — Two records, because there are two facts

The per-view state splits in two. The PLACE record holds one number: the line an open place
occupies. The ABANDON record is today's `CreatedPlace`, unchanged — the removal edit the plan
stated, where the keypress started, and the undo depth at the time.

Writing it as one record with looser conditions was the alternative, and it fails on the abandon
side: the conditions that would have to go are exactly the ones that stop a removal from deleting
something the user meant to keep. An outdent that relocated an already-empty item states a removal
edit and lands the caret on an empty item, and only `NODE_PLACE_EVENTS`' exclusion of `outdent`
keeps that item from being removed out from under the user. A single record cannot be loose enough
for one consumer and tight enough for the other.

The two are written in the same place, from the same transaction, so nothing can drift between
them: the update listener decides both on the same update, and both are dropped by the same
document change.

### D2 — A dispatch CARRIES a place when it started on one and ended on one

The place record is re-established by two kinds of dispatch:

- One that CREATES a place — `recordablePlace`, unchanged. This is what starts a record where
  there was none.
- One of ours that started with the caret on the live place and left the caret on an empty place.
  This is what keeps a record that already exists.

The carry test is stated over the caret rather than over the change set, because the change set
cannot answer it. `editsToChanges` emits line-level replacements, so mapping the place line's own
offset through an indent's change lands at the replaced block's start, not on the place. The caret
can answer it because the plan has already put it there: `planFromOp` reads its result through
`placeOutline` precisely so that a derived caret stays on the place it carried
(`caret-placement-policy`, "A derived caret follows the place it was on").

It is still keyed on this plugin's own `userEvent` values rather than on the shape of the change,
for the reason the module already states: CodeMirror's own Enter runs inside outline mode whenever
the grammar declines, and a rule that recognised a dispatch by its shape recognised that one too.
The carrying events are `input.structure.indent` and `input.structure.outdent` — the structural
keys whose caret stays on the place. `move.structure` is excluded by measurement rather than by
category: `caret-placement-policy` sends a move's caret to the moved node's content start, so a
move leaves no place at the caret for a record to be about.

The "started on the live place" half is what stops the rule from inventing one. Tab from an
ordinary caret cannot mark a blank line as a place, however its caret lands.

### D3 — The place record has no `undoDepth` guard

`undoDepth` changes when a history entry is added or removed. Every such change that touches the
DOCUMENT is already seen: the listener drops both records on `docChanged`, which covers undo and
redo. What is left is history movement that leaves the document alone — a selection-only entry
recorded by `history-caret`, an undo of one — and none of that moves the place.

The guard stays on the abandon record, where it is load-bearing for a different reason: a removal
is an edit, and `input.type` joins into the keypress's own history entry, so a depth that moved
without this module seeing it can mean an entry that now contains the user's work. A place record
issues no edit. Its worst failure is an operation reading a blank line as a place, and only a
document change can produce that — which is the invalidation it keeps.

### D4 — `createdPlaceLine` is renamed to `openPlaceLine`

The name is the defect in miniature: it says "created", the caller means "open", and the
implementation followed the name. Renaming it is what stops the next reader from re-deriving the
same answer. Its two call sites are `keymap.ts` and `main.ts`.

### D5 — The abandon record still does not survive a carrying key

The removal edit is stated in the coordinates of the document the CREATING transaction produced.
A carrying key has since rewritten those lines, so the edit no longer describes them —
`cancel` already refuses it, by a length check it calls belt-and-braces. Carrying the abandon
record would mean re-expressing that edit against the new document on every carrying key, and a
removal that is wrong by a line deletes the user's text rather than a blank one. It stays where it
is, with the parking-lot entry that wants it and the measurement it will need.

## Risks / Trade-offs

- **A place record now outlives the cleanup's own.** After a Tab, the operation path knows the
  place and the cleanup does not, so the two disagree about the same line. That asymmetry is the
  point rather than a cost: they answer different questions, and the cleanup's silence there is
  today's behaviour, unchanged.
- **The carry rule trusts the plan's caret.** If a future operation stopped leaving its caret on
  the place it carried, the record would lapse — the same failure this change fixes, one key
  further along. The e2e sequence is what would catch it, and it is a sequence rather than a
  single press for exactly that reason.
