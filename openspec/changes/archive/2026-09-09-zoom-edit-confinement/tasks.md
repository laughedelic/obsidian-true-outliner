## 1. The predicate

- [x] 1.1 Add `editEscapes` to `src/zoom.ts` beside `operandEscapes` and `splitEscapes`,
  implementing design D1's clauses in the order it states: clause 0 (the change removed the root's
  whole cover) short-circuits to INSIDE, then clause 1 (identity), then clause 2 (the text outside
  the subtree). Verify with unit tests in `tests/zoom.test.ts` covering one row per clause from
  docs/research/zoom-editing-boundary — E2 for clause 0, R4 for clause 1, B1 for clause 2.
- [x] 1.2 Add the root-identity helper (design D2) reading `findPath`, resolving the root's first
  line by OWNERSHIP (`nodeAtLine`), and verify an unwrapped list root is distinguished from the
  child that inherits its line — the negative control is replacing the path comparison with
  `startLine` equality, which must make it fail. Cover R7 (a Mod-Backspace that empties the root's
  line) as a refusal too, but do NOT claim ownership is what refuses it: measured, "begins on the
  line" refuses it as well, by finding no root at all.
- [x] 1.3 Add unit tests for the ALLOWED side — an appended last child, a paste spliced inside the
  subtree, a deletion of the cover's own trailing gap line, a merge between two visible nodes,
  typing into the root — and verify each is judged inside; the negative control is computing
  clause 2's after-cover from the BEFORE parse, which must make the append cases fail.
- [x] 1.4 Verify the invariant has NO offset shortcut in front of it (design D5) with a unit test
  for the reachable counter-example: a structural paste of a top-level heading spliced strictly
  between the cover's endpoints, which leaves the text after the splice outside the root's
  subtree. The negative control is adding back the strictly-inside early return, which must make
  this test pass the edit.
- [x] 1.5 Verify clause 0 on both shapes a whole-subtree deletion takes (design D7): a root with a
  following sibling, where clause 2 would otherwise fail because the sibling moves inside the
  cover, and a root that ENDS the document, where clause 1 would otherwise fail because the
  trailing blank line is owned by the node above. The negative control is removing clause 0, which
  must make BOTH refuse — that is the defect this clause exists for, and one row alone does not
  show it.

## 2. Refusal on the enforcement path

- [x] 2.1 Carry the after-`OutlineDoc` on `RewriteVerdict` (design D4) and verify the existing
  `tests/enforce.test.ts` suite still passes unchanged — this task adds a field, it changes no
  verdict.
- [x] 2.2 Resolve the zoom scope in `transaction-filter.ts`'s boundary-crossing branch and replace
  an escaping verdict with a `would-leave-zoom-scope` veto; verify the veto counter increments and
  the buffer is byte-identical, through the stats snapshot the e2e helpers already read.
- [x] 2.3 Verify an existing veto keeps its own reason — a first-node zoom root reports the
  first-node cue, not the zoom cue — with a unit test; the negative control is applying the zoom
  check before the verdict rather than after it, which must make the reason change. Reaching this
  from the unit suite needed the decision to live outside `transaction-filter.ts`, which imports
  `obsidian`: it is `zoom-enforce.ts`, split for the reason `zoom-state.ts` records for its own.
- [x] 2.4 Verify a `pass` verdict is judged too (the trailing-edge merge is a rewrite, but the
  gap-line deletion measured as a pass), with a test that a pass reaching outside is vetoed. Note
  for the record: no MEASURED gesture produces a pass that escapes — every escaping row in
  docs/research/zoom-editing-boundary is a rewrite — so the test drives the seam directly rather than claiming a
  reachable one, and the path stays because a pass lands in the document unjudged otherwise.

## 3. The exit triggers

- [x] 3.1 Replace `touchesOutside` in `zoom-state.ts` with the shared predicate through an
  injected resolver (design D6), and verify `tests/zoom-state.test.ts` gains a case where an
  in-scope append at the cover's tail keeps the anchor — the negative control is restoring the
  `toA > bounds.to` comparison, which must make it fail.
- [x] 3.2 Give trigger 1 the identity check of design D2 in place of `stillRooted`'s "some node
  begins here", and verify the existing `hr`-retarget case in `tests/zoom-state.test.ts` still
  clears while an ordinary in-scope edit still does not.
- [x] 3.3 Verify a deliberate whole-subtree deletion still succeeds and still exits (design D7)
  with a unit test asserting the predicate says "inside" AND trigger 1a fires — asserting only the
  exit would pass identically if the predicate had wrongly refused first. Verify too that the two
  share one derivation of "the whole cover was removed" rather than computing it twice.

## 4. Behaviour in a real Obsidian

- [x] 4.1 Turn docs/research/zoom-editing-boundary's refusal rows into `e2e/specs/80-outline-zoom.e2e.ts` scenarios —
  Backspace at the root's content start, Delete at the end of the last visible line, Backspace at
  a nested root's content start into its hidden parent, an escaping paste, and the unwrap of an
  emptied list root — asserting for each that the buffer is byte-identical, the trail is
  unchanged, and the cue names the zoomed view. R7 (Mod-Backspace) is NOT among them: measured, it
  is within-node authoring, so no verdict is computed and the refusal never sees it. It gets its
  own scenario asserting the zoom CLEARS rather than retargeting — which is the defect that row
  actually recorded.
- [x] 4.2 Turn the ALLOWED rows into scenarios in the same spec — the appended last child with and
  without a trailing gap in the cover, the in-scope paste, the deletion of the cover's own
  trailing gap line (measured as R6, which today wrongly exits), the in-scope merge, typing into
  the root — asserting the edit applied AND the zoom survived. The negative
  control for the whole group is reverting task 3.1, which must make every one of them fail.
- [x] 4.3 Verify the boundary rows are identical on the mobile config (`--mobile`), since the
  refusal path is keyboard-driven and the cue is a Notice.
- [x] 4.4 Verify a heading zoom root's trailing edge still reports the inexpressible-merge cue
  rather than the zoom cue, so the accidental protection docs/research/zoom-editing-boundary records is not silently
  replaced by the new one.

## 5. Budget and close-out

- [x] 5.1 Measure the enforced-path timings with a zoom active against `node-edit-enforcement`'s
  stated budget, using the stats snapshot the e2e helpers already expose, and record the figures
  in docs/research/zoom-editing-boundary under a dated section. Design D5 removed the shortcut deliberately and
  argues the extra parse is amortised by `parsed-doc.ts`'s cache rather than added; this task is
  what settles that, and a breach is a reason to revisit D4's reach, never to reinstate an unsound
  gate.
- [x] 5.2 Add a short section to docs/research/zoom-editing-boundary recording which of its measured rows changed and
  which did not, so the note reads as a before/after rather than only a diagnosis.
- [x] 5.3 Run the full e2e sweep for the zoom and enforcement groups desktop and mobile, and
  verify `.obsidian-cache/e2e-summary.json` reports no failures. The two are now ONE group: the
  zoom spec's paste rows write the system clipboard, which is the machine-owned resource
  `EXCLUSIVE_GROUPS` serialises, so `80` joins `clipboard` rather than racing it. 63 passing on
  each of desktop and mobile.
- [x] 5.4 Run `openspec validate zoom-edit-confinement --strict`.
