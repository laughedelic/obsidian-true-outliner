## 1. Pin the defect before changing anything

- [ ] 1.1 Re-read `enter-and-shift-enter-grammar`'s `structural-history-integration` delta and
  confirm the requirement text this change's MODIFIED block was copied from has not moved on
  the base branch; re-copy it if it has (design.md, Risks).
- [ ] 1.2 Add failing unit cases in `tests/undo-on-abandon.test.ts` that drive the plan through
  a real `EditorState` and apply today's abandon, one per measured row in proposal.md — Why:
  a block-selected paragraph mid-document, at the document's end, and between wide gaps; Enter
  at the end of `1. a` in a `1.` `2.` `3.` list; Enter at the end of the last node of a file
  with no trailing newline. Assert the CURRENT wrong output so the diff shows what changed.
- [ ] 1.3 Add the negative-control counterparts that must keep passing unchanged: a
  block-selected pair of list items, a block-selected heading section, Shift+Enter over a block
  selection, and every caret-path case already covered. These are the rows measurement showed
  correct today; a fix that moves them is a regression.
- [ ] 1.4 Confirm the residue family's own end-of-document case: leaving a list from an empty
  `- ` that is the last line of a file with no trailing newline removes nothing today.

## 2. The plan states its abandon edit

- [ ] 2.1 Add the abandon field to `TxPlan` in `src/plugin/grammar.ts` — a change set in the
  coordinates of the document the plan produces, optional, absent meaning "no place to
  abandon". Document what it is and, in one sentence, why it cannot be derived downstream.
- [ ] 2.2 Give `planFromOp` an explicit per-call form — reversal, residue removal, or none —
  parallel to the `CaretOp` kind it already takes, so each branch states its own answer rather
  than a shared default deciding for it.
- [ ] 2.3 Implement the REVERSAL form: `editsToChanges(newLines, diffLines(newLines, lines))`,
  where `lines` is the text the operation acted on.
- [ ] 2.4 Implement the RESIDUE form: a one-line splice at the operation's resulting caret
  line, through the same converter.
- [ ] 2.5 Compute the abandon in `insertionPlan` (Shift+Enter's continuation) as a reversal, by
  the same rule.
- [ ] 2.6 Set the form at every `planKey` branch: `splitNode`, `insertSiblingHeading` and the
  continuation are reversals; `unwrapListItem` and `outdent` are residues — `outdent` in BOTH
  its branches, the ladder's and Shift+Tab's, because they are one operation and the module
  already keys on where the caret landed rather than on which key ran; `indent`, `move-up` and
  `move-down` state none. Anything else would silently narrow which gestures leave an
  abandonable place.
- [ ] 2.7 Pass the inner plan's abandon through unchanged in both branches of
  `planOverSelection` — the cover branch and the character-range branch — with the one-line
  reason it needs no mapping (design.md D3).
- [ ] 2.8 Extend `tests/grammar.test.ts` to assert the field per branch: present with the right
  form where a place can be opened, absent where none can, and identical between a composed
  plan and the inner plan it was composed from.

## 3. The cleanup applies what it was given

- [ ] 3.1 Define the marker that carries the abandon edit on a dispatched transaction, owned by
  `src/plugin/provisional-cleanup.ts` since it owns the concept, and set it from the plan in
  `src/plugin/keymap.ts` where the transaction is built — converting to offsets exactly as
  `plan.changes` is converted.
- [ ] 3.2 Replace the record's single reverse change with the carried change set; delete
  `reverseFor` and its line-delta arithmetic entirely.
- [ ] 3.3 Record a place only when the carried edit is present AND the existing recogniser
  agrees (own `userEvent` marker, caret on an empty place of the matching kind). State in a
  comment that the two answers are independent and that disagreement means no cleanup.
- [ ] 3.4 Map `cancel`'s target caret through the change set instead of shifting it by one
  change's length; keep the guard that abandons the attempt when the document has moved under
  the record.
- [ ] 3.5 Verify `advanceFromEmptyPlace` and `cancelOnDelete` still hold: Enter on a place
  cancels and moves on, Backspace lands at the node above's content end, Delete at the next
  node's content start — now over a place opened across a removed selection too.

## 4. Verify the whole gesture

- [ ] 4.1 Turn the group 1 cases green and re-run them with the fix disabled (restore
  `reverseFor` behind a temporary flag, or revert the plan field to `undefined`) to confirm
  each fails without it — no test in this change is trusted until its negative control fails.
- [ ] 4.2 Re-check transaction classification with an abandon that RESTORES text rather than
  only removing lines (the ordered-run case): `input.structure.abandon` must still
  short-circuit the verdict layer, and `tests/classify.test.ts` should say so rather than the
  behavior being assumed.
- [ ] 4.3 Assert the history shape end to end: the keypress is one entry, the abandon is a
  second, one undo returns to the abandoned place, a second reaches the pre-keypress document.
- [ ] 4.4 Add e2e coverage in `e2e/specs/30-keyboard-grammar.e2e.ts` for the two gestures that
  have none: abandoning a position opened over a block selection, and abandoning a position at
  the end of a document. Both currently leave a stray blank line in the file.
- [ ] 4.5 Run the full suite plus `npm run build` and `npm run lint`; run the e2e suite for the
  keyboard-grammar spec.

## 5. Record what was learned

- [ ] 5.1 Update `docs/research/15-enter-and-shift-enter-catalogue.md` section C2: the
  block-selection entry's stated symptom ("the paragraph comes back") predates the reverse-edit
  mechanism and no longer reproduces. Replace it with the measured symptom and mark the finding
  fixed, keeping the reasoning about why the minimal diff cannot be taken apart — that is what
  the fix is built on.
- [ ] 5.2 Record the two defects the same investigation turned up that the catalogue never
  named: the end-of-document span and the un-renumbered ordered run. Both reach a plain caret
  with no selection involved.
- [ ] 5.3 Leave the redo entry exactly as it stands, and note beside it that this change does
  not reach it and why.
