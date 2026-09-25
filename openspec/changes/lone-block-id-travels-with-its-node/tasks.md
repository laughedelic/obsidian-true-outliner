# Tasks

## 1. The id in the model

- [x] 1.1 In `src/model.ts`, add the optional `blockId: { gap; line }` field, count it in `ownSpan`,
      compare it in `treesEqual`, and add `lineRole(node, index)` answering `content`, `id-gap`,
      `id` or `gap` (D1, D3). Verify with a unit test in `tests/locate.test.ts` over a node with and
      without an id; negative control: `ownSpan` ignoring `blockId` fails it.
- [x] 1.2 In `src/encode.ts`, emit `lines`, `blockId.gap`, `blockId.line`, `trailingGap`, then the
      children. Verify with a hand-built tree in `tests/roundtrip.test.ts` whose encoding is stated
      in full; negative control: emitting the id after `trailingGap` fails it.

## 2. The parser attaches first-group ids

- [x] 2.1 In `src/rules.ts`, beside `listAttachesTo`, add the strategy function deciding whether a
      lone id attaches to the node before it, from that node, the open list stack, the id's
      indentation, whether a blank line separates them, and whether the next block is another lone
      id (D2).
- [x] 2.2 In `src/parse.ts`, recognise a lone-id paragraph block and, when the strategy attaches it,
      move the previous node's `trailingGap` into `blockId.gap` and the block's gap into the node's
      `trailingGap`. Verify with a test per `document-tree-mapping` scenario in
      `tests/roundtrip.test.ts` (or a new `tests/block-ids.test.ts`), each asserting the tree
      and the byte-identical round trip; negative control: attaching an id after a list at column
      0 fails the "does not attach" scenarios.
- [x] 2.3 Teach `tests/generators.ts` to produce lone ids after every kind, inside and after list
      items, consecutive ids, trailing whitespace and text directly under, and run the round-trip
      and corpus properties over them. Add a corpus note with every research shape to
      `tests/corpus/`. Verify `npm test` passes; negative control: dropping `blockId.gap` from
      encoding fails the property with a shrunk counterexample.

## 3. Every line walker reads `lineRole`

- [x] 3.1 Replace the direct `lines.length` / `trailingGap.length` classification in `src/caret.ts`,
      `src/enforce.ts`, `src/classify.ts`, `src/escalate.ts`, `src/select-all-ladder.ts`,
      `src/plugin/decorate.ts` and `src/plugin/fold-model.ts` with `lineRole` or `ownSpan` (D3).
      Verify with `grep -n "lines.length" src` showing no remaining gap classification, and
      `npm test` passing.
- [x] 3.2 Add caret tests in `tests/caret.test.ts` for the `content-space-caret` scenarios: ArrowDown
      from a table's last row lands on its id, a placement on the id's gap line resolves as a gap,
      typing on the id keeps it attached. Negative control: `lineRole` answering `gap` for the id
      line fails the first.
- [x] 3.3 Add a decorate test in `tests/decorate.test.ts`: the id line is drawn as a continuation
      line of its node at the node's depth, and its gap lines as gap rows. Negative control:
      drawing the id line as a gap row fails it.

## 4. Operations carry the id

- [x] 4.1 In `src/ops.ts` and `src/reencode.ts`, re-indent `blockId.line` wherever a node's lines are
      re-indented or re-encoded, including `reindentSubtreeVerbatim`, `reencodeForDestination` and
      `unwrapListItem`, to the content column for a list item and the node's column otherwise (D4).
- [x] 4.2 `splitNode` keeps `blockId` on the first half; `mergeNodes` keeps the one that exists and
      rejects with `merge-not-expressible` when both carry one (D4).
- [x] 4.3 `needsBlankBetween` asks for a blank line below a non-list-item node with an attached id,
      and treats a list item's id as a paragraph line; `normalizeBoundaries` gives a non-list-item
      node with an id a blank line before its first child (D4).
- [x] 4.4 Add a test per `structural-operations` scenario in `tests/ops.test.ts`: the issue's move
      case with its encoding stated in full, the same table moved by `moveSubtreesTo` as a drag
      moves it, delete, the block selection's cover end, indent into a
      list item, split, and the rejected merge. Negative control: skipping 4.1's re-indent fails the
      indent case with the id detached.
- [x] 4.5 Run the closure, group-oracle and operation property suites over the generators from 2.3
      and fix every counterexample at its root. Verify `npm test` passes; negative control:
      removing 4.3 produces a counterexample with a block joined onto an id or detaching it.
- [x] 4.6 Re-run `docs/research/prototypes/lone-block-id-probe/ops-probe.ts.txt` and record in the
      research note that move, delete and copy keep the id in every first-group shape.

## 5. Detection and corrections, in core

- [x] 5.1 Add `src/block-ids.ts` with `misplacedBlockIds(doc)`: each misplaced line with its line, id
      range, reading and corrections (D5), following `misplaced-block-ids`' table and the order of
      its corrections.
- [x] 5.2 Build each correction's edits and caret: attach (append ` ^id`, delete the id line and the
      blank lines above it), remove, remove trailing whitespace, separate from the line below; omit a
      target that already carries an id.
- [x] 5.3 Add `tests/block-ids.test.ts` covering every research shape: which lines are misplaced,
      their readings, their correction lists in order, and for each correction the text after its
      edit and that the re-parse attaches the id or leaves it misplaced for the stated reason.
      Negative control: offering the lead paragraph for a top-level list fails the "last node only"
      case.

## 6. Outline mode marks, menu and command

- [x] 6.1 Add the mark view plugin (`to-decor-misplaced-id`, titled with the reading) and the
      `misplaced` fact the marker builder turns into the warning glyph with `data-misplaced`, drawn
      at every `markerVisibility` (D6). Add `styles/` part for both.
- [x] 6.2 Add the capture-phase press handler for the mark, opening Obsidian's `Menu` with the
      reading row, the corrections and the removal row at release; turn `MarkPress.zooms` in
      `zoom-click.ts` into what a release in place does, so a glyph carrying `data-misplaced` opens
      the same menu and a press that moves still drags (D6).
- [x] 6.3 Dispatch a correction as one transaction with `userEvent` `input.structure.block-id`, and
      add that value to `classify.ts`'s plugin-own list. Verify with a classify test that the
      event is plugin-own; negative control: removing it from the list fails the test.
- [x] 6.4 Register the command with a `checkCallback` over the caret's line, opening the menu at
      `coordsAtPos`.
- [x] 6.4a Exempt a lone-id paragraph from kind conversion and from the destination's depth in
      `reencodeBlocksForDestination` and `moveSubtreesTo`, writing it under the line above the
      destination at that line's node's column, directly under text and after a blank line under
      any other block (D8); the drop preview draws it there, at one
      depth. Add a test per "A dragged misplaced id lands as a line of the node above it" scenario
      in `tests/ops.test.ts` through `moveSubtreesTo`. Negative control: removing the exemption
      writes `- ^id` and fails the first scenario.
- [ ] 6.5 Add Enter and Backspace handling on an `id` line to the keymap (D7), with a test per
      `outline-keyboard-grammar` scenario in `tests/grammar.test.ts`. Negative control: letting
      Enter inside the id split the line fails the refusal case.
- [x] 6.6 Add `e2e/specs/` coverage beside `57-marker-surplus-space.e2e.ts` for the
      `misplaced-block-ids`, `outline-decorations` and `outline-zoom` scenarios: the mark and the
      glyph appear together and only in outline mode, a press on either opens the menu with the
      rows in order, a correction applies and undoes as one step, the command opens the menu at the
      caret, and a press on the glyph never zooms. Run with
      `npm run test:e2e:narrow -- <spec>` desktop and `--mobile`. A press on the glyph that moves
      drags the paragraph. Negative control: resolving a glyph's release as a zoom fails the
      no-zoom case.
- [ ] 6.7 Move a table with an attached id through the move command in the editor and follow
      `[[Note#^t1]]` afterwards, in an e2e case that asserts the link still lands on the table.
      Negative control: running it on `main` fails.

## 7. Land

- [ ] 7.1 Update `docs/research/lone-block-id.md` with what implementation measured, and hand the
      manual-test steps to the user with drawn examples.
- [ ] 7.2 Run `npm run lint`, `npm test` and `npm run build`, and push a checkpoint for the CI e2e
      sweep.
- [ ] 7.3 Run `openspec validate lone-block-id-travels-with-its-node --strict`.
