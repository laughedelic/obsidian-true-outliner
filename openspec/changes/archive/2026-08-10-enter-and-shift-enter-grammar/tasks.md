## 1. The empty-position rule in `splitNode` (design D2)

- [x] 1.1 Add the content-start branch: taken when the clamped split column equals
      `contentColumnCh(line)` AND the position is on the node's first line. Materialize an
      empty preceding sibling where the sibling scope's kind has an empty encoding (list item
      in the original's marker style, ordered runs renumbered; heading at the same level via
      task 4.1); otherwise widen the gap ABOVE by two blank lines. The node's lines, children,
      depth and trailing gap are untouched either way, and the anchor is the INSERTED position
- [x] 1.2 Route the end-of-node case through the destination scope's kind for every node kind,
      removing the `emptyRemainder && childKind === 'paragraph'` fall-through to the sibling
      path. A node with children whose child scope is a paragraph widens its OWN trailing gap
- [x] 1.3 Pin the byte-identity claims that make 1.1 a generalization rather than a new
      behavior (design D2): a childless list item and a top-level paragraph split at their
      content start produce exactly the document they produce today, and only the anchor
      differs. Explicit before/after string assertions — if a document changes, the branch is
      over-reaching
- [x] 1.4 Cover the shapes that DO change: a list item with children (the child stays with the
      original item at its original depth), an ATX heading, a setext heading, and a caret
      inside the `#` marker. Assert the original node is byte-identical, not merely "still a
      heading"
- [x] 1.5 Negative control: disable the branch and confirm 1.4 fails with the demotion the
      catalogue recorded (`- ` parent with the text as its child; `# ` with the title as a
      paragraph child)
- [x] 1.6 Test the end-of-node matrix directly, since it is one rule with four outcomes:
      heading→paragraph child (provisional), heading→list child (real `- `), item→paragraph
      child (provisional, the E10 fix), childless item (real `- `)

## 2. Whitespace and task markers (design D5)

- [x] 2.1 Consume the remainder's leading horizontal whitespace for every kind in `splitNode`,
      not list items only
- [x] 2.2 Re-read every existing expectation in `tests/split.test.ts` and `tests/ops.test.ts`
      rather than running them and assuming silence means unaffected: the paragraph cases split
      AFTER a space today, so they pass either way. Add a deliberate before-the-space case
- [x] 2.3 Carry a task marker to the new item, unchecked, whatever the original's state — one
      addition to the marker-prefix computation. Assert nothing else in the change depends on
      task-ness (design D5: this must not smuggle in the `[ ]`-is-chrome decision)
- [x] 2.4 Apply the same whitespace rule to `insertionPlan`, which becomes a replacement over
      `[pos, pos + ws)`. Update `classify.ts`'s comment, which reasons from "a single-line
      INSERTION", and confirm the classification with a test

## 3. List item unwrap

- [x] 3.1 Add `unwrapListItem(doc, nodeId)`: empty (or unchecked-task-marker-only), childless
      list item; `would-orphan-children` when it has children, `cannot-unwrap` otherwise. The
      result is a position, not a node — node count drops by one, neighbours keep their lines
      verbatim, and the anchor is blank-separated from the content above and below
- [x] 3.2 Unit tests for the three shapes the grammar reaches: an empty item between two items,
      as the document's last node, and as its only node
- [x] 3.3 Add the operation to `tests/closure.test.ts`'s property suite
- [x] 3.4 Property: typing a character at the anchor yields the original tree minus the item
      plus exactly one paragraph, joined to neither neighbour. Asserting the blank-line count
      alone would pass on a layout that still merges

## 4. Sibling headings (design D3)

- [x] 4.1 Add `insertSiblingHeading(doc, nodeId, remainder)`: ATX at the original's level,
      directly after it, remainder removed from the original's title, original's children
      untouched, anchor at the new heading's content start. `cannot-split` for a non-heading
- [x] 4.2 Test the setext case in both directions: the original keeps its underline verbatim,
      the sibling is ATX
- [x] 4.3 Confirm `splitNode`'s heading branch still ALWAYS produces a child for interior
      splits — the restriction is narrowed to the two new entry points, not dropped. A test
      that a mid-title split never yields a sibling is the guard against drift

## 5. Boundary separation and indentation (design D8, D9)

- [x] 5.1 Separate a heading from a NEW paragraph first child in `splitNode`'s child-scope
      path, where that boundary is created. NOT in `normalizeBoundaries`, which this task
      originally called for: measured, `# H` + `body` parses as a heading with a gap-0
      paragraph child, so a global rule would rewrite boundaries the user wrote on any
      unrelated edit. The list-item rule is safe there only because its gap-0 shape is
      unreachable from the parser (the text is a continuation line instead)
- [x] 5.2 Test both halves: a heading split gains the separator, AND a document containing a
      user-written `# H` + `body` is byte-identical after an operation on an unrelated node.
      The second is the regression the global rule would have caused
- [x] 5.3 Widen `destinationIndent`'s sibling lookup to the first sibling of any kind
- [x] 5.4 Regression-test the measured tree-shape bug: split a list item whose only child is a
      tab-indented atom, with a two-space fallback supplied. The atom must stay a child of the
      ORIGINAL item, not become a grandchild
- [x] 5.5 Run the paste/insertion suites (`tests/edit-ops.test.ts`, `tests/enforce.test.ts`)
      and read the diffs; `destinationIndent` is shared with `insertSubtrees` and
      `reencodeBlocksForDestination`

## 6. Rejection reasons

- [x] 6.1 Add `cannot-unwrap` to `RejectionReason` and `REJECTION_MESSAGES`, with a cue in the
      existing register. NOT `cannot-continue`, which this task originally also called for: it
      was introduced when Shift+Enter on a heading was a rejection, and no requirement uses it
      now that the key creates a sibling heading instead — the thematic-break rejection both
      keys share uses `cannot-split`. Adding it would be an unreachable enum member the
      exhaustive cue table forces a message for
- [x] 6.2 Confirm the exhaustive `Record<RejectionReason, string>` still forces both entries,
      so a missing cue is a type error rather than a runtime `undefined`

## 7. Grammar routing (design D2, D3, D4, D7)

- [x] 7.1 Fix the test order in the `split` case: existing declines, then the empty-item
      ladder, then content start, then ordinary split. An empty item's content start IS its
      end, so the ladder must come first for the overlap to be harmless
- [x] 7.2 Implement the ladder: attempt `outdent`; on ANY rejection attempt `unwrapListItem`;
      surface the second rejection's cue if that also fails. Caret case for the outdent branch
      is `derived`, the same one Tab's outdent uses
- [x] 7.3 Test the ladder as a SEQUENCE, not three independent cases: from a doubly-nested
      item, Enter at its end then Enter, Enter, Enter walks out one level per press and finally
      leaves the list, re-parsing between presses exactly as the editor does (ids are not
      stable across ops — `tests/split.test.ts`'s 2026-07-24 regression test is the pattern)
- [x] 7.4 Test the empty-item-with-children rejection, and the empty-TASK-item case, which must
      take the ladder rather than splitting
- [x] 7.5 Route Shift+Enter on a heading — ATX, setext title, setext underline — to
      `insertSiblingHeading`. Assert the key is CONSUMED
- [x] 7.6 Clamp `continue`'s insertion point to the node's content column, and prefix a
      paragraph's continuation with that paragraph's own leading whitespace
- [x] 7.7 Test that an indented paragraph's continuation re-parses as ONE node AND that its
      second line starts at the paragraph's own column — the node count alone passes today, via
      lazy continuation, which is the bug
- [x] 7.8 Reject both keys on a thematic break with `cannot-split`; leave every other atom
      declining. Test that the `hr` is byte-identical afterwards, since the point is that the
      stock newline never runs
- [x] 7.9 Selection handling (design D7): remove the selection as the Backspace gesture does,
      then apply the key at the resulting caret. One code path for a character range and for a
      block selection
- [x] 7.10 Decline both keys under multiple cursors, and test that every range survives — the
      current behavior discards secondaries with no document change to undo

## 8. Provisional positions (design D1)

- [x] 8.1 No implementation. Test the property the whole design rests on: at the end of the
      same top-level paragraph, Enter and Shift+Enter produce DIFFERENT documents, and typing
      the same character into each yields a new node in one and a continuation line in the
      other. This is the test that would have caught the withdrawn minimal-gap design
- [x] 8.2 Test that each producer leaves the node count unchanged and the caret on a line
      separated as its kind requires — blank-separated for Enter, adjacent for Shift+Enter
- [x] 8.3 Test that a second press with the caret on a provisional position declines to stock
      for both keys

## 9. Undo-on-abandon (design D6)

- [x] 9.1 Pin the dependency FIRST, before building on it: a test asserting that a transaction
      carrying `input.structure.split` never joins the preceding history entry. Negative
      control — rename the event to an `input.type.*` value in the fixture and the test must
      fail, or it is asserting nothing
- [x] 9.2 Add the per-view transient record of the undo depth at which a provisional position
      or empty node was created. No document data; losing it degrades to leaving the empty
      place
- [x] 9.3 Implement the cleanup: on a gesture that moves the caret off such a place with
      nothing typed there, and only when the depth still matches, undo the creating keypress
      and re-place the caret at the gesture's target mapped through the inverted change
- [x] 9.4 Test all four guards independently — caret was on a created place, nothing was typed,
      the depth still matches, and the gesture actually left the place. Each guard failing must
      mean "do nothing", verified by a document assertion, not by absence of an error
- [x] 9.4a Cover the guard's other reachable caller explicitly: a caret left on a gap line by a
      PROGRAMMATIC placement (`content-space-caret` leaves those uncorrected — a workspace
      restore, a search jump). Backspace there must stay native, because no keypress of ours is
      behind it. Found in review: the enforcement delta originally claimed a provisional
      position was the only gap-line caret in outline mode, which that capability contradicts
- [x] 9.5 Test the typed-then-abandoned case explicitly: type on the position, delete what was
      typed, then leave. History is no longer at the same depth, so nothing is undone and the
      empty place remains — the case a naive "is it empty now?" check gets wrong
- [x] 9.6 Route Backspace and Delete on a provisional position through the same cancel: the
      document returns to its pre-keypress bytes, with the caret at the node above's content
      end for Backspace and the node below's content start for Delete. Test that the gap is
      NOT merely narrowed by one line and that the neighbouring nodes are not merged — both
      are what the native reading produces, and both are wrong
- [x] 9.7 Test that cancel and merge AGREE on a real empty node: Backspace at the content
      start of an empty `- ` created by Enter yields the same document and caret whether the
      cancel path or the existing merge rule handles it. That agreement is what makes the
      rule safe to state uniformly (design D6)
- [x] 9.8 Confirm `structural-history-integration`'s existing guarantees still hold: one undo
      step per structural operation, and redo restoring an operation's own cursor
      (`tests/history-caret.test.ts`, `tests/minimal-change-history.test.ts`)

## 10. Specs that document rather than change behavior

- [x] 10.1 `document-tree-mapping`: add parse tests for the blank-line distinction (a
      continuation line vs a paragraph child) and for an indented atom being a child either
      way. The rule exists in `parse.ts` and has never been tested at the spec's level
- [x] 10.2 `content-space-caret` and `node-edit-enforcement`: no code change. Confirm by test
      that the caret is left on a provisional position (not resolved away), and that a later
      gesture onto that same line IS resolved like any other gap line

## 11. Live verification

- [x] 11.1 E2E: the empty-item ladder in a real vault
      (`e2e/specs/30-keyboard-grammar.e2e.ts`) — Enter at an item's end, then repeated Enters
      walking out to prose
- [x] 11.2 E2E: Enter at a content start on a heading and on a parent item — the title and the
      text stay put and the caret is in the new empty node above
- [x] 11.3 E2E: Shift+Enter drafting `## ` siblings down a document
- [x] 11.4 E2E: undo-on-abandon — press Enter at a paragraph's end, click elsewhere, and
      confirm the file is byte-identical to before the Enter and Ctrl+Z undoes whatever
      preceded it
- [x] 11.5 Manual real-vault pass over the catalogue's cases. DONE by the author across
      several rounds, and it was the highest-yield verification of the change: it found the
      Shift+Enter-then-Enter extra gap, three separate block-selection defects, the
      widening-on-repeated-Enter, the block-selection abandon restoring its selection, the
      redo soft-lock, and — the subtlest — that leaving a list left a blank line behind ONLY
      when the list sat under a paragraph, which is what showed the recorder was keyed on the
      wrong thing. Findings and their dispositions are recorded in
      `docs/research/15-enter-and-shift-enter-catalogue.md`; the catalogue itself stays a
      PRE-change record rather than being rewritten
