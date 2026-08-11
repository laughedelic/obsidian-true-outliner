## 1. Pin the defect, and measure the half that is unknown

The rendering half is already measured (proposal.md — Why). The structural-key half is not, and
design D4 makes the measurement the thing that decides the change's size. Do it before touching
any operation.

- [x] 1.1 Add failing tests in `tests/decorate.test.ts` for the reported shapes: with the caret
      on a position opened at the end of the first line of `- foo` / `␣␣bar`, the second line's
      fact is a list-item continuation at the item's own `supplementalDepth`, not a first-line
      paragraph at depth 1. Cover the nested (`⇥`) and under-a-heading variants, and the
      two-line paragraph, where the assertion is the absent first line rather than the depth.
- [x] 1.2 Measure each structural key with a position open, at the planner level where the tree
      is visible: Tab, Shift+Tab, Alt+Up, Alt+Down, Shift+Up / Shift+Down node extension, and
      the select-all ladder, each on a node bisected by an interior position. Record the
      document each produces beside the document the same key produces on the same node with no
      position open.
- [x] 1.3 Apply design D4's rule to each result — defective when the two documents differ in
      anything but the position's own line — and write the table into a `## Findings` section at
      the end of this file, with the measured documents, not a summary of them.
- [x] 1.4 Measure the same for `node-edit-enforcement`'s verdict path: a boundary-crossing edit
      made while a position is open, against the same edit with none. Record whether the verdict
      differs.
- [x] 1.5 If 1.3 or 1.4 finds a defect, add the delta specs the proposal names as candidates
      (`structural-operations`, `node-selection-extension`, `node-edit-enforcement`) for exactly
      what was found, and extend this task list with the work. If they find none, record that as
      the finding — the grammar delta's two operation scenarios then stand as regression guards
      over behavior that is already correct.

## 2. The overlay: one accessor, one gate

Rewritten from the span this group first described. The span was measured wrong twice — see
design D1 and the Findings — and what shipped is a gate: a position that JOINS a node hands the
whole document to the tree it stands for, a position that INVENTS one changes nothing but its
own line.

- [x] 2.1 In `src/plugin/decorate.ts`, add `positionJoinsANode(materializedFacts, line)` beside
      `provisionalFact` / `materializeProbe`: true when the position's own materialized line is
      not a first line, which is the whole of the "did this bisect a node" test (design D1).
- [x] 2.2 Cover it in `tests/decorate.test.ts` for each shape in 1.1, plus the two the gate must
      refuse (Enter's blank-separated position, and the adoption shape `# H` / blank / blank /
      `beta`), the upper half that loses a child, the line an artifact swallows beyond the node,
      and an end-of-node position, where the gate opens and costs nothing.
- [x] 2.3 Add the differential property test design D1 commits to, using `fast-check` and
      `tests/generators.ts`: run the real Shift+Enter over generated documents and assert the
      overlay reproduces, for every line, the facts and guides that line had BEFORE the keypress.
      A second property asserts an inventing position leaves every other line on the raw parse.
      The skip predicate is written inline rather than calling `positionJoinsANode`, so breaking
      the gate cannot make the property vacuous.
- [x] 2.4 In `src/plugin/decorations.ts`, introduce the single `factsFor(state)` accessor: raw
      `docFacts` unless a position is open; the resolved tree's facts AND guides when it joins a
      node; raw facts plus the position's own otherwise. Route the marker pass, the
      line-decoration pass, and `MarginCompensation`'s widget loop through it, deleting the two
      ad-hoc provisional merges. Leave the escalated-selection passes on `docFacts` with a comment
      — a cover and a position cannot coexist.
- [x] 2.5 Negative control: force the gate shut (today's behaviour) and confirm the failures are
      the measured ones — nine tests, both properties among them — then restore it.
- [x] 2.6 Negative control the other way: force the gate open for every position and confirm the
      invented-node property fails, which is the unit-level twin of the childless-heading e2e
      guard (`e2e/specs/52-block-markers-icons.e2e.ts:684`). Three tests fail; restore it. The
      e2e itself runs in 5.5.

## 3. Live coverage

- [ ] 3.1 Extend `e2e/specs/50-decorations.e2e.ts`: open an interior position on a two-line list
      item and assert the second line's rendered box and computed `margin-left` are what they
      were the instant before the keypress, measured against the same line in the same note
      before Shift+Enter rather than against a hardcoded pixel value.
- [ ] 3.2 Repeat under a heading, where the item carries a nonzero `supplementalDepth`, so the
      assertion distinguishes "kept its own margin" from "lost all margin".
- [ ] 3.3 Extend `e2e/specs/52-block-markers-icons.e2e.ts`: the displaced line carries no marker
      while the position is open, and the two-line paragraph's second line likewise gains none.
- [ ] 3.4 Assert the typing transition live: type one character on an interior position and
      confirm no line's box moves, which is the spec's "Typing changes nothing this layer
      contributes" scenario extended to the displaced lines.
- [ ] 3.5 Confirm `e2e/specs/53-decoration-contracts.e2e.ts` still holds with an interior
      position open — no transaction, no cursor movement, no history entry from the rendering.
- [ ] 3.6 Pure-list invariant: with an interior position open in a list that has no non-list
      ancestor, every line's rendered position is identical to outline-mode-off.

## 4. What the measurement found

Six consumers, one cause: each reads `parse(text)` / `parsedDoc(state.doc)` and gets the bisected
tree. One resolved tree, threaded to all of them, is the fix (design D4).

- [ ] 4.1 In `src/plugin/decorate.ts`, add the tree half of the resolved outline beside the facts
      half from 2.1: the parse of the probe with the position's own line restored to the BUFFER's
      text, so the tree's structure is the resolved one while every line it holds is a real line
      of the document. Operations rewrite `node.lines`, so a tree carrying the probe character
      would write that character into the document.
- [ ] 4.2 Cover the patched tree in `tests/decorate.test.ts`: the bisected node's own lines are
      the buffer's own (no probe character anywhere in the tree), the node's line span includes
      the position, and `encode` of the patched tree round-trips to the buffer's text.
- [ ] 4.3 In `src/plugin/grammar.ts`, use the resolved tree for the `indent` / `outdent` /
      `move-up` / `move-down` branches' targeting, keeping the raw parse for the gates that decide
      whether the key is declined at all. Declining is load-bearing: `split` and `continue` decline
      on a gap line today, and the resolved tree would make the position one of the node's own
      lines, so Enter on a position would start splitting instead of advancing past it
      (`advanceFromEmptyPlace`). That gate stays on the raw parse.
- [ ] 4.4 Cover the four keys in `tests/grammar.test.ts` against the documents the Findings table
      records, asserting the open result equals the plain result plus the position's line — and,
      for `indent` and `outdent`, that typing at the position still continues the same node.
- [ ] 4.5 In `src/plugin/keymap.ts`, give the node-extension and select-all handlers the resolved
      tree the same way, so a press covers the whole node rather than the part above the position.
- [ ] 4.6 Cover both in `tests/select-extend.test.ts` and `tests/select-all-ladder.test.ts` with
      the Findings' C and D shapes for extension and all four for the ladder.
- [ ] 4.7 Negative control for each of 4.3 and 4.5: revert the fix locally, confirm the new tests
      fail with the exact documents and ranges the Findings recorded, restore it.
- [ ] 4.8 Add live coverage in `e2e/specs/30-keyboard-grammar.e2e.ts` for the gesture a real user
      reaches this through, at minimum Shift+Enter then Tab, plus Shift+Enter then Mod-A.

## 5. Close the loop

- [ ] 5.1 Add the interior position to `docs/research/15-enter-and-shift-enter-catalogue.md`
      under C2 ("The result SHALL re-parse as one (multiline) node"), beside S10 — same
      mechanism, measured at a node's middle rather than its end, with the node counts and the
      displacement table from the proposal.
- [ ] 5.2 Record the leftover blank line in `docs/research/12-decoration-follow-ups.md`: any
      document change drops the abandon record, so a structural key pressed on a position leaves
      it in the file and the node split on disk. Include that it is byte-identical to stock and
      what closing it would cost.
- [ ] 5.3 Note in the same file's "A non-list-item child of a list item is indented twice" entry
      that this change removes the transient way into that shape while the deliberate one — text
      the user themselves indented under an item, blank-separated — stays open and unchanged.
- [ ] 5.4 Record design D5's known edge there too: a blank line the user authored inside what
      would otherwise be one node renders its following line as a continuation while a caret is
      parked on it, reachable only by a programmatic placement, and closing it means giving up
      the document-and-caret-alone derivation.
- [ ] 5.5 Run `npm run build`, `npm test`, `npm run lint`, and `npm run test:e2e`; confirm the
      full suite is green.
- [ ] 5.6 Re-diff this change's `outline-keyboard-grammar` delta against the main spec before
      archiving, so nothing another change amended in the meantime is dropped by the restatement.
      `abandon-removes-only-the-place` archived on 2026-08-11 and its wording is already carried
      through; the check is for whatever lands next.

## Findings

Measured 2026-08-11 at the planner level (`planKey`, `extendSelection`, `nextRung`,
`computeVerdict`), against these four documents. `open` is the same document with an interior
position written by Shift+Enter; the caret is on the position for the grammar keys and on the
node's own first line for the selection ones, which is the caret a user selecting the node has.

```
A  plain "- one␤- foo␤  bar␤"                open "- one␤- foo␤  ␤  bar␤"
B  plain "- top␤⇥- foo␤⇥  bar␤- next␤"       open "- top␤⇥- foo␤⇥  ␤⇥  bar␤- next␤"
C  plain "# H␤␤alpha␤beta␤␤# I␤"             open "# H␤␤alpha␤␤beta␤␤# I␤"
D  plain "# H␤␤first␤␤alpha␤beta␤"           open "# H␤␤first␤␤alpha␤␤beta␤"
```

**Six of the seven consumers are defective.** Only `outdent` on a list item produces both the
right document and a position still usable as one.

| Consumer | Case | With no position | With one open | Verdict |
|---|---|---|---|---|
| `indent` | A | `- one␤  - foo␤    bar␤` | `- one␤  - foo␤  ␤    bar␤` | document same, **position detached** |
| `indent` | D | `# H␤␤first␤␤- alpha␤  beta␤` | `# H␤␤first␤␤- alpha␤␤beta␤` | **defective** — indents half the node |
| `outdent` | B | `- top␤- foo␤  bar␤- next␤` | `- top␤- foo␤⇥  ␤  bar␤- next␤` | document same, position misaligned |
| `move-up` | A | `- foo␤  bar␤- one␤` | `- foo␤  ␤  bar␤- one␤` | same |
| `move-up` | D | `# H␤␤alpha␤beta␤␤first␤` | `# H␤␤alpha␤␤first␤␤beta␤` | **defective** — the halves straddle `first` |
| `move-down` | C | *declines: nothing below* | `# H␤␤beta␤␤alpha␤␤# I␤` | **defective** — swaps the halves |
| `move-down` | D | *declines: nothing below* | `# H␤␤first␤␤beta␤␤alpha␤` | **defective** |
| extend by node | A, B | item + owned gap | item + owned gap, one line longer | same |
| extend by node | C, D | covers both lines | covers only the line above the position | **defective** |
| select-all rung 1 | A | `["- foo","  bar"]` | `["- foo"]` | **defective** |
| select-all rung 1 | B | `["⇥- foo","⇥  bar"]` | `["⇥- foo"]` | **defective** |
| select-all rung 1 | C | `["alpha","beta"]` | `["alpha"]` | **defective** |
| select-all rung 1 | D | `["alpha","beta"]` | `["alpha"]` | **defective** |

Three things the table shows that reading could not.

- **A list bisection hides the defect a paragraph bisection exposes.** In A and B the artifact is
  a CHILD of the bisected item, so a subtree operation carries it along and a subtree cover
  contains it. In C and D it is a SIBLING, so the operation moves half a node past the other half
  and the cover stops at the position. The one case traced before the measurement (Tab on A) was
  the case that hides it.
- **Select-all's first rung is defective everywhere**, list and paragraph alike, because that rung
  is the node's OWN lines rather than its subtree — exactly what a bisection halves.
- **`indent` and `outdent` produce the right document and leave the position behind.** Neither
  re-indents the position's own line, because it is not one of the node's own lines in the raw
  parse. After A's indent the position holds `␣␣` while the item's content column moved to 4, so
  typing there no longer continues the item — it makes a paragraph child of `- one` instead.
  Design D4's rule ("differ in anything but the position's own line") scores this "same" and it is
  not: that line's own CONTENT decides what typing there produces. The rule is amended below.

**`node-edit-enforcement`: not defective, and not reachable.** While the caret is a lone empty
cursor on a position, no boundary-crossing edit can start from it — Backspace and Delete are
intercepted by `cancelOnDelete`, and typing one character is a single-line insert. An edit that
does reach the verdict layer has either a selection or a caret elsewhere, and by then the position
is not open: either the abandon removed it, or the split in the buffer is a real document state
the verdict layer should judge as it finds it. A `computeVerdict` probe was run over case A's
bisection and both sides returned a structural-deletion rewrite, but the `EditFact` constructed for
it is not a faithful Backspace, so the conclusion rests on the reachability argument and on
`node-edit-enforcement`'s own "told apart by whether a structural keypress of ours created the
position" rule, not on that number. **No delta.**

**Amendment to design D4's decision rule.** "Defective when the two documents differ in anything
but the position's own line" is too weak: it passes an operation that leaves the position's line
behind at the wrong indentation, which changes what typing there produces. The rule is now: an
operation is defective when the two documents differ in anything but the PRESENCE of the
position's line, OR when the position stops standing for a continuation of the same node. Both
halves are satisfied by the same fix — the resolved tree includes the position's line among the
node's own lines, so an operation that rewrites those lines rewrites it too.

**Deltas this adds** (task 1.5): `node-selection-extension` and `progressive-select-all`. Not
`structural-operations`, which the proposal named as a candidate: every requirement there is
about what an operation does to a GIVEN tree, and none of them changes — `indent` and `moveUp`
are correct functions handed the wrong argument. The wrongness is the caller's, and the
`outline-keyboard-grammar` delta already states it for the keys. The two selection capabilities
are different: their requirements are written as user-visible promises ("extends by exactly one
node per press", "climbs a node-aware ladder"), and a press that covers half a node breaks the
promise as stated, so each gets a scenario of its own. The select-all defect belongs to
`progressive-select-all` rather than `node-selection-extension`, which the proposal named — the
ladder's first rung is that capability's, not the extension's.
