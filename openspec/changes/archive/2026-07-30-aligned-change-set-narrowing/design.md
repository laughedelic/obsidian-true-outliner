## Context

Moving a paragraph or list item past a table split the table: its header and separator rows
were severed from the body by a blank line. Reported from real-vault use, reproducible in the
e2e harness with a scripted Alt+ArrowUp.

The pure layers are innocent. `moveUp`/`moveDown` produce byte-correct output for every
variant — paragraph, list item, and code block past a table, table past a paragraph, both
directions, and both the raw source form `| a | b |` and the padded form Obsidian's table
widget rewrites the source into. `editsToChanges` agrees with `applyEdits` on all of them.
Instrumenting `cm.dispatch` with a stack-trace-recording monkey-patch (the technique in
`docs/research/04` Q25) placed the corruption INSIDE the outer `EditorState.update`: the
prepared document already contained the blank line before our transaction was applied. So it
is neither an async race with the widget's own reformat nor the nested per-cell `EditorView`
writing back — every traced dispatch had `nested: false`.

What is left is the shape of the change set we hand the host. `diffLines` describes every
operation as ONE contiguous line-range replacement. A swap preserves line count, so
`editToChanges` took its per-line branch and narrowed the reorder into "every line in this
region was edited in place", including a partial character edit inside a live table row:

```
[0,0]-[0,6]  := "| a   | b   |"
[1,0]-[1,0]  := "| --- | --- |"
[2,2]-[2,9]  := "1   | 2"        <- partial interior edit of a table row
[3,0]-[3,13] := ""
[4,0]-[4,13] := "Mover."
```

Obsidian's table extension reconciles that against its mounted widget and rewrites the
document. Whether it corrupts depends on incidental byte alignment between unrelated lines,
which is why the padded form (whose pipes line up) triggers it and other combinations do not.

An earlier fix detected a table sibling in the move direction and coalesced the change set,
threading a move direction into both dispatch sites. It worked and was negative-controlled,
but it keyed on the immediate sibling's KIND: measured, a table nested one level UNDER the
passed-over sibling still produced partial interior edits into its rows. The fix was narrow
along the wrong axis, which is what motivated this design.

## Goals / Non-Goals

**Goals:**

- A change set that DESCRIBES what the operation did, so that any consumer re-deriving state
  from it — the host's widgets, cursor mapping, undo history — reads the truth.
- One rule at the existing choke point, general over node kind, nesting depth, and direction.
- No loss of the minimality the existing requirement already guarantees.
- A regression test that can fail, per `docs/research/04` Q28.

**Non-Goals:**

- Characterising Obsidian's table extension precisely. We know the corruption is synchronous
  and driven by the change set's shape; we deliberately do not depend on knowing which of its
  internal branches fires, because the guarantee we adopt makes it moot.
- Changing `Edit`, `diffLines`, or anything in the pure layers. The archived
  `minimal-changesets-for-structural-ops` design explicitly rejected narrowing inside
  `diffLines`, and that still holds — `Edit` is line-granular by contract and consumed by
  `applyEdits` and the enforcement facts.
- Changing which cursor any operation dispatches, or which operations record into history.

## Decisions

### D1. Align lines before narrowing, rather than detecting the situation that breaks

The narrowing had two branches selected by line-count equality. That equality is a PROXY for
the property the per-line branch actually needs: that old line *i* and new line *i* are the
same line, edited. For an indent that holds. For a reorder it is false — the lines moved, and
diffing them positionally compares unrelated content and finds accidental common prefixes.

So `editToChanges` now aligns first. Lines the edit keeps are matched wherever they end up,
and only the unmatched runs are narrowed — with the SAME two branches, applied per run.
Today's behaviour is the degenerate case where the whole region is one run.

A move consequently comes out as what it is:

```
[0,0]-[2,0] := ""
[5,0]-[5,0] := "\nMover.\n"
```

One of the two rearranged blocks is in no change range at all. Which one is the alignment's
choice, not the gesture's: it anchors whichever block it can chain the furthest, so the block
left standing is the LARGER one. Above, the table out-anchors a one-line mover; give the mover
four lines and the roles swap, and the change set describes the table as what moved. That is
not a defect and it is not what keeps the table whole — whichever block moves, it is removed
and re-inserted whole rather than rewritten in place, and that is the property the widget
needs. Measured both ways against a live widget, plus the nested shape the superseded fix
missed. A change set cannot know which sibling a user gestured at, so a guarantee phrased
about the passed-over block would be one it cannot keep.

*Alternatives considered.*

- **Detect a table sibling and coalesce** (the superseded fix). Verified and needed no spec
  change, but host-specific, required threading a direction into two dispatch sites, and was
  keyed on a property — the immediate sibling's kind — that does not determine whether a
  table's rows end up in the change set.
- **Unconditionally emit one contiguous replacement for every move.** Uniform and simple, but
  it relaxes minimality instead of tightening it, and it remounts every widget in the moved
  span rather than leaving the passed-over one alone.
- **Make atoms opaque in the narrowing**: never emit a change strictly inside an atom's line
  span unless the atom's content changed. Conceptually appealing, since atom interiors are
  already opaque in the core model. But it requires the dispatch layer to parse, it addresses
  only the atom case rather than the wrong description underneath it, and a counter-example
  weakens it — moving the TABLE itself also produced a partial interior edit and did not
  corrupt, so "no interior edits into atoms" is not obviously the operative distinction.
- **Have the operation declare its own shape** — a discriminator on `Edit` saying "this region
  was relocated". Honest, but it spreads through `finalize` and every op, and it is
  unnecessary: the information is recoverable from the line content itself.
- **Repair after the fact in the transaction filter; annotate the transaction to hide it from
  the host's handler; blur or unmount the widget first; dispatch in two steps.** Rejected —
  respectively: fighting a foreign extension, private API, timing-fragile, and breaking the
  one-undo-step invariant that `20-structural-commands` pins.

### D2. Anchor only on lines unique to both sides (patience diff), not on any equal line

A general LCS would anchor on blank gap lines, repeated list markers, and identical table
separators, fragmenting a relocated block into many spurious runs and re-introducing exactly
the interior edits this change removes. Patience diff's rule — match only lines that are
unambiguous on BOTH sides, chain them by longest increasing subsequence, then recurse into the
gaps (where a fresh common-prefix/suffix trim extends each match outward) — keeps a moved
block whole and degrades safely: a line that cannot be matched simply falls into a changed
run, where the existing character-level narrowing still trims it. Missing an anchor costs
minimality, never correctness, and the `applyEdits` property test bounds that.

Cost is O(k log k) in the LIS, where k is the number of candidate pairs — lines unique on
both sides — and k is bounded by the lines of one edit region; regions are node-sized.

### D3. Minimality is tightened, not traded away

The concern with touching `minimal-change-dispatch` is that minimality serves cursor mapping,
undo granularity, and history fidelity, so relaxing it would ripple. It is not relaxed. For
the reproducing case the change set goes from 5 changes and ~40 characters to 2 changes and
16, and unchanged lines are now excluded wherever they occur rather than only at the region's
edges. The spec delta therefore ADDS the relocation guarantee and STRENGTHENS the exclusion
rule; the per-line and whole-span branches are stated as before, just scoped per run.

Interactions checked rather than assumed:

- **Cursor mapping** (`mapCursorForward`, indent/outdent only). Usually an indent region has
  no unique unchanged lines to anchor on, so it stays one run and the per-line branch produces
  byte-identical output. Not always, though: shift a subtree whose lines repeat and each line's
  new text IS the next line's old text, so the middle lines come out unique on BOTH sides and
  the region does anchor. That is what the relocation evidence and the whole-run cost fallback
  are for — see the risks below — and what `plugin.test.ts`' repeated-chain regression and the
  property that generalises it cover. The `minimal-change-history` property tests over
  generated trees pass unchanged.
- **Ordering and non-overlap.** Runs are produced in ascending order by construction and never
  overlap, which the existing requirement demands and `mapCursorForward` relies on.
- **Undo granularity.** One transaction on the keyboard path, unchanged. The palette's shape
  DID have to change: its change and its cursor now travel together, with the selection-only
  transaction kept afterwards purely for the undo grouping it was always there to provide.
  Leaving the cursor alone in its own transaction stopped being safe once a move no longer
  rewrites the table it passes — the widget survives, so the window between the two
  transactions became a window in which something reads a new cursor against an old document.
  See `editor-structural-commands`' amendment.
- **Selection and enforcement.** The enforcement rewrite path shares this choke point and
  simply gets better-shaped change sets; its e2e specs pass unchanged.

### D4. The history-caret negative control moves to the direction that still tests it

One existing test changed meaning rather than breaking: it asserted that WITHOUT the semantic
cursor recorder, redo lands on the sibling that swapped in. With aligned change sets it now
lands correctly — because for THAT direction the alignment called the user's node the one
that MOVED, so the caret rode the relocated run and mapping followed it.

This is a coincidence, not a new guarantee. A swap has two equally true descriptions and the
alignment picks one from line content alone. Move-DOWN of the first sibling picks the other
way, and there mapping still cannot follow — measured. The control now uses that direction,
so it exercises the branch it claims to, and the spec delta records the reasoning so the
requirement is not read as "mapping works for moves now".

## Risks / Trade-offs

- **A pathological document with no unique lines in the region falls back to the old shape.**
  → Minimality degrades; the relocation guarantee does NOT. Losing every anchor was the one
  case where this shape could still cut into a relocated line, so the guarantee no longer
  rests on anchoring at all: the trimming clamps a change to whole-line bounds whenever the
  line it would cut into both survives the operation and stands where another of the edit's
  lines used to stand. Correctness is bounded independently by the `applyEdits` property test.
  Requires every line in the moved and passed-over spans to be duplicated within the region.
- **A run whose two sides have unequal line counts is now emitted as one trimmed span where the
  whole region previously went per-line.** → Measured on the existing suites as an improvement
  or a wash; the property tests and the pinned worked shapes for indent, outdent, and merge all
  hold unchanged.
- **Anchoring can pair lines across a shift instead of reading it as an edit in place.**
  → Uniqueness on both sides is evidence a line survived, not proof: when an indent shifts a
  subtree whose lines repeat, each line's new text IS the next line's old text, so the middle
  lines come out unique on both sides and the alignment reads an in-place indent as a deletion
  plus an insertion — carrying the caret off the character it was on. Resolved by asking the
  alignment for the evidence a relocation always leaves: a move PUTS BACK WHAT IT TAKES, so
  the lines the reading removes are the lines it inserts, all of them. One line in common is
  not enough — a chain shifted far enough makes its deepest line reappear at the depth above
  — and requiring the whole set to balance is what separates coincidence from a block that
  really went somewhere. An indent balances nothing, so its alignment is not adopted unless it
  also claims fewer characters than editing the region in place. Which
  node a swap calls "moved" remains a choice made from line content, not from the gesture —
  see D4; recording is what makes that immaterial.
- **The host's exact trigger is still uncharacterised.** → The guarantee adopted here is
  phrased about the SHAPE of the description rather than about which block is spared, because
  measurement ruled out the two more obvious phrasings. The pre-fix change set for a four-line
  mover past a three-row table cut into no line at all — every boundary sat on a line edge —
  and still corrupted the document; what it did was replace the table's first row with the
  mover's second line while that row still stood further down. So neither "the passed-over
  block is untouched" (unkeepable — the alignment may anchor the mover instead) nor "no change
  cuts into a surviving line" (insufficient — that change set cuts into none) is the property.
  What is: no change overwrites a whole line that is still standing in the result. Covered by a
  property test over generated trees, and live by e2e regressions from BOTH sides against a
  real Obsidian with a mounted table widget.
- **Performance on very large moved subtrees.** → The alignment is over one edit region's
  lines; the LIS is O(k log k) on the k candidate pairs. Subdivision re-scans each gap, so the
  concern is depth rather than any single pass: measured work per line is flat from 25 to
  40,000 lines under adversarial search, because an anchor at a segment's edge leaves the gap
  beside it empty and a gap that loses no line to its neighbour cannot make an ambiguous line
  unique — single-anchor passes cannot chain. Whole-document rewrites of 40,000 lines narrow
  in tens of milliseconds for repeated, reversed, transposed, and mixed shapes alike.

## Migration Plan

None required — internal narrowing, no persisted data, no public API. The change is a single
commit at the choke point plus the removal of the superseded table-specific fix; reverting
restores the previous behaviour wholesale.

## Open Questions

- Which branch of Obsidian's table extension actually rewrites the document would still take
  instrumentation of its own transaction extender to pin. Not required for this change, and
  worth recording in `docs/research` if it is ever needed for a different symptom.
- Whether other host extensions that own a rendered region (callouts, embeds, the checkbox
  widget) were ever affected by the same in-place description. None has been reported, and the
  guarantee now covers them regardless.
