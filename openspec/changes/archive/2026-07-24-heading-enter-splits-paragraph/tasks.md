## 1. `splitNode` accepts headings

- [x] 1.1 In `src/ops.ts`, relax `splitNode`'s initial kind guard
      (currently `if (node.kind !== 'paragraph' && node.kind !== 'list-item') return
      reject('cannot-split')`) to also accept `node.kind === 'heading'`.
- [x] 1.2 Relax the children-branch guard (`if (node.children.length > 0)`) to
      `if (node.children.length > 0 || node.kind === 'heading')`, so a childless
      heading also routes through content-adjacent-split logic instead of falling
      through to the sibling-split path (headings never split into siblings — see
      design.md D1).
- [x] 1.3 Relax the empty-remainder gap-widen guard (currently
      `node.kind === 'paragraph' && emptyRemainder`) to
      `(node.kind === 'paragraph' || node.kind === 'heading') && emptyRemainder`, so
      cursor-at-end heading splits widen the heading's own `trailingGap` (design.md D2
      — note: this widening is NOT byte-identical to the old behavior, see D2's
      correction recorded during implementation).
- [x] 1.4 Add the setext-underline rejection: when `node.kind === 'heading' &&
      node.setext && lineIndex !== 0`, return `reject('cannot-split')` before any
      other split logic runs (design.md D4).
- [x] 1.7 (found via user feedback after initial delivery, NOT caught by the
      property suite — `arbTree()` never generates setext headings, so this
      shape had zero generated coverage — design.md D4's correction) Fix a real
      bug in mid-title setext splits: the generic `lowerRest =
      node.lines.slice(lineIndex + 1)` swept the underline into the split-off
      remainder's own lines instead of keeping it with the truncated heading,
      so re-parsing reinterpreted the whole corrupted result as ONE multi-line
      setext heading — silently undoing the split while still passing the
      round-trip property (self-consistent, just semantically wrong). Fixed by
      special-casing `upperLines`/`lowerRest` for setext headings: the
      underline (`node.lines[1]`) is appended to `upperLines`, never to
      `lowerRest`.
- [x] 1.5 Implement the paragraph-adjacency separator fix in the children-branch:
      when `childKind === 'paragraph'` and the existing `node.children[0]?.kind ===
      'paragraph'`, set the new `lower` node's `trailingGap` to `['']` before
      splicing it in (design.md D3). Inline comment added explaining why this is
      unreachable for non-heading parents today.
- [x] 1.6 (found during implementation, not in the original plan — design.md D3b)
      Fix a second latent gap the heading case is the first to reach: a childless
      split node that was also the document's terminal node lost its own trailing
      gap (the file's trailing-newline representation) to the wrong side of the
      split. Fixed by transferring `node`'s original `trailingGap` onto `lower`
      when `node.children.length === 0`, clearing `upper`'s own `trailingGap` to
      `[]` — mirrors the sibling-split path's existing
      `subtreeFinalNode`/`stripFinalGap` treatment for the same reason.
- [x] 1.8 (found via user testing of merge→split sequences, root cause predates
      this change — design.md D5) Fix `mergeNodes`: a heading absorbing content
      (D10's content-adjacent merge) was unconditionally taking the absorbed
      node's own `trailingGap`, discarding the heading's own established gap —
      surfaced when merging a list item into a heading and then splitting back
      out left the heading's original gap gone, with whatever followed stuck
      directly to it. Fixed by taking whichever of `first`'s or `second`'s
      `trailingGap` has more lines when `first.kind === 'heading'`; verified
      against the existing "heading absorbs terminal content" test (unaffected
      — `second`'s gap is still the longer side there) as well as the reported
      scenario (now preserved).

## 2. `splitNode` unit + property coverage

- [x] 2.1 In `tests/split.test.ts`, removed the heading case from
      `'rejects headings, atoms, and out-of-node positions'` (renamed to
      `'rejects atoms and out-of-node positions'`), keeping the atom and
      out-of-node-position assertions.
- [x] 2.2 Added `'splits a childless heading mid-text into the heading plus a new
      paragraph child'`.
- [x] 2.3 Added `'splits a heading with an existing paragraph child, separated by
      a blank line'`, asserting via `parse()` on the re-encoded text (not just
      string equality) that the two paragraphs stay distinct.
- [x] 2.4 Added `'splits a heading with an existing list-item child; remainder
      becomes a matching list item, no separator needed'` — confirms the D3 fix
      doesn't fire when it shouldn't (and confirms the remainder's kind follows
      the existing donor rule, becoming a list item, not a paragraph).
- [x] 2.5 Added `'end-of-heading split widens the gap like the paragraph case,
      cursor blank-separated on both sides'` — asserts the ACTUAL (not originally
      assumed byte-identical) new output, corrected after running the test
      against the real implementation.
- [x] 2.6 Added `'rejects a split on a setext heading's underline line'`.
- [x] 2.7 (reinstated — do NOT skip setext coverage; the initial "redundant
      with ATX" reasoning was wrong, since setext has its own dedicated
      underline-handling code path that ATX doesn't exercise at all, and this
      is exactly the shape that turned out to be broken — see task 1.7) Added
      four explicit setext tests: childless mid-title split, mid-title split
      with an existing paragraph child (exercises D3's separator fix in
      combination with the setext fix), mid-title split with an existing
      list-item child, and end-of-title split (exercises D2's gap-widen path).
      Each asserts the underline stays attached to the heading via `parse()`
      on the re-encoded text, not just string equality.
- [x] 2.8 Ran the full suite including `'property: split closes over the mapping
      at any position'` — passes unmodified at its existing iteration count. Note:
      this property suite does NOT exercise setext headings at all —
      `tests/generators.ts`'s `arbTree()` never generates them (confirmed via
      grep) — which is exactly why task 1.7's bug shipped past it initially;
      the setext coverage in this group is explicit for that reason, not
      generated. Extending `arbTree()` to generate setext headings is a
      reasonable follow-up but out of scope for this change (it's a shared
      generator used by other test suites too).
- [x] 2.9 In `tests/edit-ops.test.ts`, added `'a heading absorbing its first child
      keeps its OWN gap, not the absorbed child's (2026-07-24 fix)'` and `'a
      heading absorbing a TERMINAL child still keeps that child's trailing gap
      (no regression)'` for the D5 `mergeNodes` fix directly. In
      `tests/split.test.ts`, added `'merging a list item into a heading then
      splitting back out preserves the heading's original gap (2026-07-24
      regression)'` — the full end-to-end sequence exactly as reported, each
      op re-locating its target node fresh by cursor line in the freshly
      re-parsed document between steps (mirrors how independent keystrokes
      work in the real editor; node ids are not stable across ops).

## 3. Grammar layer routes headings through `splitNode`

- [x] 3.1 In `src/plugin/grammar.ts`'s `planKey`, deleted the heading special case
      inside the `'split'` case; `node.kind === 'heading'` now falls through to
      the same `planFromOp(lines, splitNode(...), 'input.structure.split')` call
      every other kind uses.
- [x] 3.2 Confirmed `insertionPlan` is still used by the `continue` (Shift+Enter)
      case and is not dead code; updated its doc comment (it no longer mentions
      Enter-on-heading).

## 4. Grammar unit test updates

- [x] 4.1 In `tests/grammar.test.ts`, renamed `'Enter on a heading opens an empty
      child line below'` to `'Enter mid-heading-text splits the title into the
      heading and a new paragraph child'` and updated its expectation.
- [x] 4.2 Added `'Enter at the end of a heading widens the gap; typed text becomes
      a child paragraph'`.
- [x] 4.3 (reinstated) Added `'Enter mid-title of a setext heading splits it,
      underline stays with the heading'` and `'Enter on a setext heading's
      underline line shows the rejection cue, changes nothing'` at the grammar
      layer — this layer is a thin pass-through, but it's the layer real
      keystrokes actually go through, and task 1.7's bug was specifically about
      whether the underline survives the split correctly end to end.

## 5. Spec-facing e2e coverage

- [x] 5.1 In `e2e/specs/30-keyboard-grammar.e2e.ts`, replaced `'Enter on a heading:
      empty line below; typed text becomes a child paragraph'` with two tests:
      mid-text heading Enter through the real CM6 dispatch path, and end-of-heading
      Enter (updated to the actual widened-gap output). Type-checked via
      `npm run build:e2e`; NOT run against real Obsidian this session (see
      Verification below).
- [x] 5.2 Added an e2e case for a setext heading mid-title split through the
      real CM6 dispatch path, confirming the underline stays attached to the
      heading and a new paragraph child appears — this is the one setext shape
      worth a real-dispatch check given task 1.7 was found via live testing,
      not the unit suite. (Skipped, still: a dedicated e2e case for the ATX D3
      separator fix specifically — already covered at the unit level, task 2.3,
      with a `parse()`-based assertion that would catch a silent merge.)

## 6. Spec sync and decision-log closure

- [x] 6.1 No manual action needed — delta specs absorb into main specs at the
      standard archive step.
- [x] 6.2 Updated `docs/research/04-open-questions.md` Q17: marked the heading-Enter
      finding as resolved, pointing at this change, and updated the section's intro
      paragraph (both Q17 findings are now fixed, not pending). Left the D13-adjacent
      "heading marker direct-edit protection" note untouched, per Q17's own framing.

## 7. Verification

- [x] 7.1 Full unit suite green: 306/306 tests (`npm test`), including the
      property-test run at its full iteration count. `tsc --noEmit` (main +
      `e2e`) and `eslint src tests` also clean. (297 after the initial pass;
      +6 for setext coverage, +3 for the D5 `mergeNodes` gap fix.)
- [ ] 7.2 e2e suite against real Obsidian (`npm run test:e2e`) — NOT run this
      session (requires downloading/booting a real Obsidian instance via
      wdio-obsidian-service); the e2e file was updated and type-checks, but
      hasn't been exercised live. Recommended before merging.
- [ ] 7.3 Manual real-vault pass — NOT done this session (needs the user's own
      vault); recommended per the project's standing "measure twice" discipline
      for foundational grammar changes, especially given task 1.6's finding
      (surfaced only once tested against a real fixture) — a good sign the code
      paths are subtle enough to warrant a human look before shipping.
