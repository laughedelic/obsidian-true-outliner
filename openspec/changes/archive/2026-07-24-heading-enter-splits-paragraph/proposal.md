## Why

`docs/research/04-open-questions.md` Q17 records a confirmed, pre-existing gap: Enter
on a heading line ignores the cursor's actual position within the heading's text. It
always inserts one blank line right after the heading, regardless of where the cursor
sits — mid-word, mid-sentence, or at the end. Every other splittable node kind
(paragraph, list item) splits its text at the cursor into two real nodes; headings are
the only kind where Enter is a blind text insertion instead of a structural split. Q17
held this for an explicit decision rather than folding it into `outline-edit-enforcement`,
since it touches the original `outline-keyboard-grammar` design (predates that change)
and the two-regime algebra's heading/content asymmetry is a deliberate, foundational
choice (Q2) that any fix has to respect rather than quietly erode.

This proposal resolves Q17's open half: split a heading's text at the cursor into the
unchanged heading (title truncated at the cursor) plus a new paragraph child carrying
the remainder, mirroring how `splitNode` already treats a paragraph or list-item WITH
children (content-adjacent split, `structural-operations`' "Node split" requirement,
2026-07-21 amendment). Cursor-at-end keeps the same blank-gap-then-materialize shape as
today (a blank separator, cursor on it, real child only once text is typed) but now
reuses the shared gap-widening rule instead of a one-off insertion — which adds one more
blank line than before in that case (see design.md D2's correction). The bulk of the
change is mid-text Enter, previously not handled at all.

## What Changes

- `splitNode` (`src/ops.ts`) accepts `heading` nodes instead of rejecting them with
  `cannot-split`. A heading split always produces a CHILD (never a sibling, regardless
  of whether the heading already has children) — headings can only have other headings
  as siblings (Q2's mixed-containment rule), so a plain-text split remainder has no
  sibling encoding to fall back to.
  - Cursor mid-text: the text after the cursor becomes a new paragraph, inserted as the
    heading's new FIRST child (before any existing children), matching the
    content-adjacent split rule already used for paragraph/list-item parents.
  - Cursor at the heading's end (or trailing-whitespace-only remainder): unchanged from
    today — widens the heading's own trailing gap so the cursor lands on a
    blank-separated line, materializing a real child only once text is typed.
  - Splitting is scored against the title line only; a split attempted on a setext
    heading's underline line (`===`/`---`) is rejected with `cannot-split`, the same as
    an atom interior.
  - **New correctness fix bundled in**: when the split-off remainder's kind resolves to
    `paragraph` and the heading's existing first child is ALSO a paragraph, a separating
    blank line is now inserted between them. Without it the two paragraphs would
    silently merge into one node on re-parse (CommonMark: adjacent non-blank lines are
    one paragraph) — a latent gap in the existing children-branch split logic that was
    unreachable for non-heading parents (their donor/fallback rule never produces
    adjacent paragraph-kind children) but is the common case for headings.
- `src/plugin/grammar.ts`'s `split` case drops the heading special case (the
  `insertionPlan` blind-newline branch) and routes headings through `splitNode` like
  every other kind.
- `outline-keyboard-grammar`'s "Enter splits the node" requirement and
  `structural-operations`' "Node split" requirement are both updated: headings are no
  longer rejected, and the cursor-derived split behavior is specified for headings the
  same way it already is for paragraphs/list-items.

- `mergeNodes` (`src/ops.ts`) no longer discards a heading's own trailing gap when it
  absorbs content. **Found via manual testing of this change, not in the original
  scope**: merging a list item into a heading (Backspace at the item's content-start,
  D10) then splitting back out (Enter) made whatever followed stick directly to the
  heading with no separator — even when the heading originally had a real blank-line
  gap. Root cause predates this change: `mergeNodes` unconditionally took the absorbed
  node's own `trailingGap` for the merged node (correct for ordinary interior merges,
  where "the gap between them" is genuinely consumed), discarding the heading's own gap
  in the process. For a heading specifically, that gap is the heading's own established
  separation from its content, not a property of whichever node happened to be
  absorbed. See design.md D5.

**Not changing**: heading Tab/Shift+Tab (level-shift promote/demote) and the rest of the
two-regime algebra are untouched — this only concerns Enter/split (and now
merge-into-heading), not reparenting or level changes. Whether heading `#` markers
should get direct-edit protection like list markers (D13) stays explicitly out of
scope, per Q17's own framing.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `outline-keyboard-grammar`: "Enter splits the node" requirement changes for the
  heading case — from "always insert an empty child line, cursor position ignored" to
  "split the heading's text at the cursor into the heading (truncated) plus a new
  paragraph child, per the same content-adjacent split rule other kinds already use."
- `structural-operations`: "Node split" requirement changes — `splitNode` no longer
  rejects `heading` nodes with `cannot-split`; a new scenario set documents heading
  split behavior (mid-text, at-end, with existing children, setext underline
  rejection) and the paragraph-adjacency separator fix. "Adjacent-node merge" also
  changes — the requirement's own "consuming `first`'s trailing gap" language is
  amended with a heading-specific carve-out (D5): a heading absorbing content keeps
  whichever of the two gaps (its own, or the absorbed node's) has more blank lines.

## Impact

- `src/ops.ts`: `splitNode`'s initial kind guard, the children-branch condition, and the
  empty-remainder gap-widen branch all relax from `paragraph`/`list-item`-only to
  include `heading`; the children-branch gains the paragraph-adjacency separator fix.
- `src/plugin/grammar.ts`: the heading branch of the `split` case is deleted; headings
  fall through to the existing `splitNode` call already used for every other kind.
  `insertionPlan` stays in place (Shift+Enter/`continue` still uses it).
- Tests: `tests/ops.test.ts` (new heading-split unit + property coverage),
  `tests/grammar.test.ts` (the existing "Enter on a heading opens an empty child line
  below" test is renamed and its expectation updated to assert cursor-derived
  splitting; a new test covers cursor-at-end preserving today's behavior byte-for-byte),
  `tests/closure.test.ts` (heading split re-enters the operation-closure property
  suite), and an e2e regression in the outline-edit-enforcement/outline-keyboard-grammar
  suite for a real-vault-shaped mid-heading Enter.
- No change to `outline-edit-enforcement`'s verdict layer, `classify.ts`, or the
  transaction-filter choke point — this is entirely within the keyboard-grammar →
  structural-operations path Enter already goes through.
