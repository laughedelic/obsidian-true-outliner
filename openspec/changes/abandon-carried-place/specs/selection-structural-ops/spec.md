## MODIFIED Requirements

### Requirement: Every entry point resolves one operand and one after-state

The keyboard bindings, the command-palette commands and the pointer gesture `node-dragging`
states SHALL resolve their operand and their after-state through this capability's rules and
SHALL NOT re-derive either. Invoked on the same document with the same selection and naming the
same operation, they SHALL produce an identical document and an identical resulting selection.

The gesture is a THIRD entry point rather than a variation of the other two, and it arrives at a
different layer: the keyboard and palette paths run over Obsidian's `Editor`, and the gesture runs
inside an editor extension holding the view. That difference SHALL NOT reach the result. What the
other two get from the shared command funnel — one transaction, one undo step, the caret policy,
the fold carry and the rejection cue — the gesture SHALL get by entering that same funnel, never
by reproducing it beside it.

The OUTLINE they resolve against SHALL be the same one too. Where a provisional position is open
(`outline-keyboard-grammar`), every entry point SHALL resolve it and act on the tree it stands
for. The operand, the zoom-scope check and the caret all read that tree, and an entry point that
reads the raw parse instead gives a different document for the same keypress — which is the
divergence this requirement exists to close, not a detail of one adapter. A drag resolves its
DESTINATION against that same tree, so a seam and a depth name the same place the other two would
act on.

*(Amendment 2026-09-17, `a-trailing-place-moves-with-its-node`: the command path resolved no
position at all, so Shift+Tab from the keymap and the same operation from the palette produced
two different documents on the same buffer. Recorded in
`docs/research/decoration-follow-ups`.)*

ONE existing exception, which this capability does not introduce and cannot close: where an
operation materializes brand-new indentation and the document holds no indentation evidence to
infer from, the keyboard path supplies the editor's live indent unit while the command path
cannot. Obsidian's public `Editor` API exposes no route to CodeMirror's `indentUnit` facet, so
the commands fall back to the two-space default (`src/plugin/main.ts`). The two paths then
differ by that unit alone — the tree, the operand and the resulting selection are the same. It
is stated here rather than left to a code comment, because "the two agree" is otherwise read as
unconditional. The gesture holds the view, so it reads the live unit as the keyboard path does
and falls on the keyboard side of that exception.

A structural operation over a cover SHALL dispatch as ONE transaction forming ONE undo step,
with the same `userEvent` annotation its single-node form carries, so classification,
enforcement and history treat it exactly as they treat the single-node case. Where the
dispatched selection is not what mapping the pre-operation selection forward would produce, it
SHALL be recorded by the existing rule in `caret-placement-policy` — which already compares
whole selections, and therefore needs no separate rule for covers.

#### Scenario: Palette and keyboard agree
- **WHEN** indent is invoked over the same multi-node cover from Tab and from the command
  palette, in a document that already has indentation to infer a unit from
- **THEN** the resulting document and the resulting selection are identical

#### Scenario: Palette and keyboard agree with a position open
- **WHEN** a provisional position is open and indent is invoked from Tab and from the command
  palette, in a document that already has indentation to infer a unit from
- **THEN** both resolve the position, both carry it with the node, and the resulting document
  and caret are identical

#### Scenario: Neither entry point guesses a position
- **WHEN** the caret is on a blank line no structural keypress of ours opened, and indent is
  invoked from either entry point
- **THEN** both act on the node that owns the gap and leave the blank line as it was

#### Scenario: A drag resolves an open position like the other two
- **WHEN** a provisional position is open and a bullet is pressed to start a drag
- **THEN** the pick-up declines the position, as every gesture whose selection leaves an open place
  does (`structural-history-integration`), and that drag does not start — so no drag resolves a
  destination against an open position
