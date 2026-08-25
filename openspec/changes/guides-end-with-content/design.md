## Context

See proposal.md — Why. The mechanism behind the defect is worth stating precisely, because it
is what makes the fix small.

`computeLineGuides` (src/plugin/decorate.ts) is a per-LINE fact computed in one walk with no
subtree-span bookkeeping: each line is handed the depths of the ancestors above it, and a
node's `trailingGap` lines are handed either the node's own depths (a leaf: "the gap before my
next sibling") or its children's (a node with children: "the gap before my first child"). That
rule is local by construction — it can see the node a gap belongs to and nothing after it — so
it cannot distinguish a gap between two siblings from the gap after the last one. Continuity
at the top of a gap and overshoot at the bottom come from the same decision.

Two other places read the same extent. `computePositionTrail`'s `'full'` branch accents each
ancestor's guide from `ownEnd + 1` to `subtreeEnd`, deliberately "the exact span
`computeLineGuides` gives that depth". And `factsFor` (src/plugin/decorations.ts) supplies the
guides a provisional position's row renders with, today straight from the raw parse.

## Goals / Non-Goals

**Goals:**

- One definition of a guide's extent — first row after the owner's own rows, last content row
  of the owner's subtree — that the base layer, the `full` accent and the provisional position
  all read.
- Keep the property that makes the current code cheap: no per-node subtree spans, no second
  parse, no new cache.
- Leave every content line's depths exactly as they are.

**Non-Goals:**

- Changing where a guide STARTS, or which depths any line carries.
- Collapsing or hiding gap lines (docs/research/12's "Collapsing gap lines" — a separate,
  larger question about the lines themselves rather than about what renders on them).
- Making the base guide layer caret-derived in general. The provisional position is the single,
  already-specified exception, and it extends an extent rather than adding a depth.

## Decisions

### D1: Cut the tail with a bottom-up pass over the facts, not with subtree spans

After the existing walk builds the flat fact array, run it once from the bottom, remembering
the depths of the last CONTENT line seen. Each gap line keeps only the depths that line also
carries; a gap line with no content line below it keeps none.

That is exactly the stated rule, and the argument is short. An ancestor `O` at depth `d` is
active on a gap line `G` when `O` is a strict ancestor of the node `G` belongs to. `O` has
content below `G` precisely when the next content line `N` lies inside `O`'s subtree — subtrees
occupy contiguous runs and the facts are emitted in document order, so if `N` is outside `O`,
everything after `N` is too. And `N` lies inside `O`'s subtree precisely when `d` is one of
`N`'s own depths. So "still has content below" and "the next content line carries this depth"
are the same test, and the pass needs no spans at all.

It also settles what a run of blanks does. Every row in one contiguous run compares against the
same content line, so every row of the run carries the same depths, and several nested subtrees
closing together end their guides on one row rather than in a staircase. Depths part company
only where content separates their subtrees' last lines.

*Alternative considered:* a second walk computing each node's last content line, then clipping
each depth per line against its owner's value. Rejected — it reintroduces exactly the per-node
span bookkeeping the per-line design was chosen to avoid, and needs the owner NODE for each
active depth, which a `LineGuideFact` deliberately does not carry.

### D2: The trim lives inside `computeLineGuides`

Rather than exporting a separate trim a caller could forget, `computeLineGuides` returns
already-trimmed facts. There are three call sites today (two in `docFacts`/`factsFor`, plus
tests), and a fourth added later that skipped the trim would render the defect back.

### D3: "Content" is structural — a node's own line — not "text that is not blank"

The lines being cut are `trailingGap` lines, which the model defines as blank by construction.
Reading the rule textually instead would be wrong twice: a blank line INSIDE an atom (a fenced
code block with an empty line in it) is one of that node's own lines and nothing has ended
there; and `resolvedOutline` restores a provisional row's blank text into the node's own lines,
so a textual test would cut a guide at precisely the row a bisecting position sits on.

### D4: The provisional position extends the extent through an argument, not a different parse

`computeLineGuides` takes the open provisional row (when there is one) and treats it as a
content line in the bottom-up pass. That extends the guide to the position's row and, because
the pass carries the extension upward, to every blank row between it and the last real content
line — the continuity the spec requires.

The alternative — computing guides from `provisional.doc` in `factsFor`'s non-joins branch —
was rejected on the rule that branch exists to enforce: a position that bisected nothing
contributes nothing to any other line, and the materialized parse is a document in which the
node the position stands for already exists. Passing a line number changes the trim and
provably nothing else.

In the joins branch the argument is a no-op — the resolved outline already makes that row one
of a node's own lines — so it can be passed unconditionally rather than gated.

### D5: The trail clips on a new `contentEnd`, and `subtreeEnd` keeps its current meaning

`ChainEntry` gains `contentEnd`: the last own-line of the subtree, filled in on the way back
out of the walk exactly as `subtreeEnd` already is. The `'full'` branch iterates to
`contentEnd`; `'lineage'` is untouched, since a lineage segment always ends on the next rung's
own first line, which is a content line inside the extent by construction.

`subtreeEnd` is deliberately left alone: it is also what resolves a caret parked on a gap line
to the node that owns the gap, so the trail does not blink off while the caret crosses a blank
line. That rule is not what this change is about.

The provisional extension needs no work here. `computeTrail` already computes the trail against
`provisional.doc` when a position is open, and in that document the caret's row is a node's own
line — so `contentEnd` includes it, and the accent ends exactly where the extended guide does.

### D6: No consumer change beyond handing over the provisional line

Every gap line still gets a fact, now possibly with empty depths, so `computeLineGuides` stays
a strict superset of `decorate()`'s line coverage and `isGapLine` keeps its meaning. A gap fact
that trims to empty falls through the `hasOverlay` check `computeDecorations` already applies
and renders no decoration at all — the same path a top-level gap line takes today.

### D7: Both guide tracks are trimmed

`guideDepths` and `listGuideDepths` take the same rule. Once `lists-on-the-outline-grid` puts a
list level on the same grid and renders its guide from the same gradient, a list guide running
past its own last item is the same defect in the same layer.

### D8: The delta is written against the guide requirement as `lists-on-the-outline-grid`
restates it

That change renames and rewrites the guide requirement ("Indentation guides render every
ancestor level, including list levels") and is at its final task, so it archives first and its
text is the one this change edits. If the order turns out otherwise, the delta's `### Requirement:`
header has to be retargeted at the name currently in `openspec/specs/outline-decorations/spec.md` —
the rule it states is unaffected either way. Task 0 checks this before anything else.

## Risks / Trade-offs

- **The delta's MODIFIED header stops matching if the ordering assumption in D8 is wrong** →
  task 0 re-reads the main spec's requirement name and retargets the header. Nothing else in
  the change depends on the ordering.
- **Several guides now stop on one row, which may read as an abrupt shelf in a real vault** →
  this is the rule's own consequence, not an artifact, so the fixtures
  cannot judge it; the real-vault pass is the gate, as it has been for every defect this layer
  has had. If it reads badly the finding goes to docs/research/12 rather than into a hedge here.
- **The guide grows and shrinks as the caret crosses a trailing gap** → bounded to the rows
  between the position and the last content line above it, and it is the same
  "renders as the node it would become" behaviour the position layer already gives indentation
  and markers. Abandoning the position removes the row itself, so nothing is left behind.
- **A gap line's depths now depend on what follows it, so a fact is no longer a purely local
  function of its own node** → the dependency is one extra bottom-up pass over an array the
  walk has already built: no extra parse, no new cache, arrays no longer than the tree depth.
- **The `full` accent and the base guide could drift apart again** → they read one definition
  from one place, and the spec now states the accent's extent AS the guide's rather than
  restating its endpoints.

## Migration Plan

None. This is rendering only — no document text, no settings, no persisted state, nothing to
migrate or roll forward. Reverting the commit restores the previous rendering exactly.
