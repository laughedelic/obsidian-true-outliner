## 1. The predicate

- [ ] 1.1 Add `editEscapes(scope, after, inserted)` to `src/zoom.ts` beside `operandEscapes` and
  `splitEscapes`, implementing design D1's three clauses in D-order (identity first, per the
  short-circuit in Risks); verify with unit tests in `tests/zoom.test.ts` covering one row per
  clause taken from docs/research/24 — B1 for clause 1, G1 for clause 2, R4 for clause 3.
- [ ] 1.2 Add the root-identity helper (design D2) reading `findPath`, and verify a unit test
  distinguishes an unwrapped list root from the child that inherits its line — the negative
  control is replacing the path comparison with `startLine` equality, which must make it fail.
- [ ] 1.3 Add unit tests for the ALLOWED side — an appended last child, a paste spliced inside the
  subtree, a deletion of the cover's own trailing gap line, a merge between two visible nodes,
  typing into the root — and verify each is judged inside; the negative control is dropping the
  after-cover's terminating line break from clause 2, which must make the append cases fail.
- [ ] 1.4 Add the cheap gate of design D5 and verify a unit test asserts it takes the strictly-
  inside exit without consulting the after-document at all (assert the mechanism: pass an
  after-document that would fail the invariant and confirm the verdict is still "inside").

## 2. Refusal on the enforcement path

- [ ] 2.1 Carry the after-`OutlineDoc` on `RewriteVerdict` (design D4) and verify the existing
  `tests/enforce.test.ts` suite still passes unchanged — this task adds a field, it changes no
  verdict.
- [ ] 2.2 Resolve the zoom scope in `transaction-filter.ts`'s boundary-crossing branch and replace
  an escaping verdict with a `would-leave-zoom-scope` veto; verify the veto counter increments and
  the buffer is byte-identical, through the stats snapshot the e2e helpers already read.
- [ ] 2.3 Verify an existing veto keeps its own reason — a first-node zoom root reports the
  first-node cue, not the zoom cue — with a unit test; the negative control is applying the zoom
  check before the verdict rather than after it, which must make the reason change.
- [ ] 2.4 Verify a `pass` verdict is judged too (the trailing-edge merge is a rewrite, but the
  gap-line deletion measured as a pass), with a test that a pass reaching outside is vetoed.

## 3. The exit triggers

- [ ] 3.1 Replace `touchesOutside` in `zoom-state.ts` with the shared predicate through an
  injected resolver (design D6), and verify `tests/zoom-state.test.ts` gains a case where an
  in-scope append at the cover's tail keeps the anchor — the negative control is restoring the
  `toA > bounds.to` comparison, which must make it fail.
- [ ] 3.2 Give trigger 1 the identity check of design D2 in place of `stillRooted`'s "some node
  begins here", and verify the existing `hr`-retarget case in `tests/zoom-state.test.ts` still
  clears while an ordinary in-scope edit still does not.
- [ ] 3.3 Verify a deliberate whole-subtree deletion still succeeds and still exits (design D7)
  with a unit test asserting the predicate says "inside" AND trigger 1a fires — asserting only the
  exit would pass identically if the predicate had wrongly refused first.

## 4. Behaviour in a real Obsidian

- [ ] 4.1 Turn docs/research/24's refusal rows into `e2e/specs/80-outline-zoom.e2e.ts` scenarios —
  Backspace at the root's content start, Delete at the end of the last visible line,
  Mod-Backspace at the root's content start, Backspace at a nested root's content start into its
  hidden parent, an escaping paste, and the unwrap of an emptied list root — asserting for each
  that the buffer is byte-identical, the trail is unchanged, and the cue names the zoomed view.
- [ ] 4.2 Turn the ALLOWED rows into scenarios in the same spec — the appended last child with and
  without a trailing gap in the cover, the in-scope paste, the gap-line deletion, the in-scope
  merge, typing into the root — asserting the edit applied AND the zoom survived. The negative
  control for the whole group is reverting task 3.1, which must make every one of them fail.
- [ ] 4.3 Verify the boundary rows are identical on the mobile config (`--mobile`), since the
  refusal path is keyboard-driven and the cue is a Notice.
- [ ] 4.4 Verify a heading zoom root's trailing edge still reports the inexpressible-merge cue
  rather than the zoom cue, so the accidental protection docs/research/24 records is not silently
  replaced by the new one.

## 5. Budget and close-out

- [ ] 5.1 Measure the enforced-path timings with a zoom active against `node-edit-enforcement`'s
  stated budget, using the stats snapshot the e2e helpers already expose, and record the figures
  in docs/research/24 under a dated section; if the budget is breached, the gate of design D5 is
  where to look first.
- [ ] 5.2 Add a short section to docs/research/24 recording which of its measured rows changed and
  which did not, so the note reads as a before/after rather than only a diagnosis.
- [ ] 5.3 Run the full e2e sweep for the zoom and enforcement groups desktop and mobile, and
  verify `.obsidian-cache/e2e-summary.json` reports no failures.
- [ ] 5.4 Run `openspec validate zoom-edit-confinement --strict`.
