## 1. Pin the defect before changing anything

- [x] 1.1 Add failing unit cases in `tests/undo-on-abandon.test.ts` that drive the plan through
  a real `EditorState` and apply today's removal, one per measured row in proposal.md — Why:
  a block-selected paragraph mid-document, at the document's end, and between wide gaps; Enter
  at the end of `1. a` in a `1.` `2.` `3.` list; and the three end-of-document shapes (last
  node of a file with and without a trailing line break, and a file with a single node).
  Assert the CURRENT wrong output so the diff shows what changed.
- [x] 1.2 Add the negative-control counterparts that must keep passing unchanged: a
  block-selected pair of list items, a block-selected heading section, Shift+Enter over a block
  selection, an Enter at the end of a list item with a paragraph child, and the caret-path
  mid-document cases. These are the rows measurement showed correct on the base; a fix that
  moves them is a regression.
- [x] 1.3 Pin the RESIDUE family as negative controls across all six measured shapes — unwrap
  as a file's only line and mid-document, outdent at a document's end with and without a
  trailing line break, a nested empty item, and an empty item under a paragraph. All are
  correct on the base and must stay byte-identical.

## 2. The plan states its removal edit

- [x] 2.1 Add the removal field to `TxPlan` in `src/plugin/grammar.ts` — a change set in the
  coordinates of the document the plan produces, optional, absent meaning "no place to
  abandon". Document what it is and, in one sentence, why it cannot be derived downstream.
- [x] 2.2 Give `planFromOp` an explicit per-call form — reversal, residue deletion, or none —
  parallel to the `CaretOp` kind it already takes, so each branch states its own answer rather
  than a shared default deciding for it.
- [x] 2.3 Implement the REVERSAL form: `editsToChanges(newLines, diffLines(newLines, lines))`,
  where `lines` is the text the operation acted on.
- [x] 2.4 Implement the RESIDUE form: a one-line splice at the operation's resulting caret
  line, through the same converter.
- [x] 2.5 Compute the removal in `insertionPlan` (Shift+Enter's continuation) as a reversal, by
  the same rule.
- [x] 2.6 Set the form at every `planKey` branch: `splitNode`, `insertSiblingHeading` and the
  continuation are reversals; `unwrapListItem` and `outdent` are residues — `outdent` in BOTH
  its branches, the ladder's and Shift+Tab's, because they are one operation and the module
  already keys on where the caret landed rather than on which key ran; `indent`, `move-up` and
  `move-down` state none. Anything else would silently narrow which gestures leave an
  abandonable place.
- [x] 2.7 Pass the inner plan's removal through unchanged in both branches of
  `planOverSelection` — the cover branch and the character-range branch — with the one-line
  reason it needs no mapping (design.md D3).
- [x] 2.8 Extend `tests/grammar.test.ts` to assert the field per branch: present with the right
  form where a place can be made, absent where none can, and identical between a composed plan
  and the inner plan it was composed from.

## 3. The cleanup applies what it was given

- [x] 3.1 Define the marker that carries the removal edit on a dispatched transaction, owned by
  `src/plugin/provisional-cleanup.ts` since it owns the concept, and set it from the plan in
  `src/plugin/keymap.ts` where the transaction is built — converting to offsets exactly as
  `plan.changes` is converted.
- [x] 3.2 Replace the record's single reverse change with the carried change set; delete
  `reverseFor` entirely, its last-line guard included — that guard is a correct rule about line
  breaks attached to a wrong extent, and `editsToChanges` covers the same ground (design.md
  D4).
- [x] 3.3 Record a place only when the carried edit is present AND the existing recogniser
  agrees (caret on an empty place of the matching kind, own `userEvent` marker). State in a
  comment that the two answers are independent by contract and that disagreement means no
  cleanup.
- [x] 3.4 Map `cancel`'s target caret through the change set instead of shifting it by one
  change's length; keep the guard that abandons the attempt when the document has moved under
  the record.
- [x] 3.5 Verify `advanceFromEmptyPlace` and `cancelOnDelete` still hold: Enter on a place
  cancels and moves on, Backspace lands at the node above's content end, Delete at the next
  node's content start — now over a place opened across a removed selection too.

## 4. Verify the whole gesture

- [x] 4.1 Turn the group 1 cases green and re-run them with the fix disabled (revert the plan
  field to `undefined` behind a temporary flag) to confirm each fails without it — no test in
  this change is trusted until its negative control fails.
- [x] 4.2 Re-check transaction classification with a removal that RESTORES text rather than
  only deleting lines (the ordered-run case): `input.structure.abandon` must still
  short-circuit the verdict layer, and `tests/classify.test.ts` should say so rather than the
  behavior being assumed.
- [x] 4.3 Assert the history shape end to end: the keypress is one entry, the removal is a
  second, one undo returns to the empty place, a second reaches the pre-keypress document.
- [x] 4.4 Add e2e coverage in `e2e/specs/30-keyboard-grammar.e2e.ts` for the two gestures that
  have none: abandoning a place opened over a block selection, and abandoning a place at the
  end of a document. Both currently leave a stray blank line in the file.
- [x] 4.5 Run the full suite plus `npm run build` and `npm run lint`; run the e2e suite for the
  keyboard-grammar spec.

## 5. Record what was learned

- [x] 5.1 Update `docs/research/15-enter-and-shift-enter-catalogue.md` section C2: the
  block-selection entry's stated symptom ("the paragraph comes back") predates the reverse-edit
  mechanism and no longer reproduces. Replace it with the measured symptom and mark the finding
  fixed, keeping the reasoning about why the minimal diff cannot be taken apart — that is what
  the fix is built on.
- [x] 5.2 Record the two defects the same investigation turned up that the catalogue never
  named: the un-renumbered ordered run, and the end-of-document extent that survives the base's
  last-line guard. Both reach a plain caret with no selection involved.
- [x] 5.3 Leave the redo limitation exactly as it stands, and note beside it that this change
  does not reach it and why.
