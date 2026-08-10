## Context

See proposal.md — Why, for the defect and its measurements. What matters here is the shape of
the machinery it lands in.

`decorate-provisional-positions` already computes the tree this change needs.
`materializeProbe(text, line, ch)` inserts one character at the caret and returns the text;
`provisionalAt(state)` parses it and caches the result per `EditorState`, holding both the
caret line's own fact and the whole parsed document. That document is consumed twice today: for
the caret line's fact, and — design D4 of that change — for the position trail, whose per-line
accents it supplies for the WHOLE document, not just the caret's line. So the exception this
change generalizes already exists, with the reasoning for it written down.

Facts reach the rendering through five call sites in `decorations.ts`: the marker pass
(`decorations.ts:776`), the line-decoration pass (`:884`), two escalated-selection-chrome passes
(`:1031`, `:1119`), and `MarginCompensation`'s widget loop (`:1917`). Only the first two merge
the provisional fact today. The two chrome passes are unreachable while a position is open — a
position requires a single empty cursor and a block cover requires a non-empty one — which
leaves three sites that must agree.

The structural keys read their own parse, through `parsedDoc(state.doc)`, and pass it to
`src/ops.ts`. Nothing there knows a position exists.

## Goals / Non-Goals

**Goals:**

- One source of per-line facts while a position is open, shared by every consumer, so a
  widget-rendered displaced line cannot disagree with a plain one.
- A change to the rendering that is provably identity outside the bisected node's own lines,
  so the existing `markerVisibility` guard cannot regress.
- A decision rule for the structural-key half that the measurement pass can apply without
  re-opening the design.

**Non-Goals:**

- Changing what the keypress writes. The buffer, the parser, and the encoder are untouched.
- Removing the leftover blank line a structural key leaves behind when it drops the abandon
  record. Recorded in the parking lot (proposal.md — What Changes).
- Making a gap line reached by a `programmatic` placement behave differently from one our own
  keypress opened. The layer stays derived from document and caret alone (D5 below).

## Decisions

### D1 — The overlay is scoped to the bisected node's own lines, not applied document-wide

The rule is stated over facts, in one place: `factsFor(state)` returns the facts every consumer
should use, and it is the raw `docFacts(state)` unless a position is open. When one is, the
caret's own line takes its resolved fact (unchanged), and the OWN LINES OF THE NODE THAT OWNS
THE POSITION IN THE RESOLVED TREE, below the position, take their resolved facts too. Every
other line keeps the raw fact it has today.

"The position is interior" is exactly "that resolved node has own lines below the position", so
the predicate and the overlay's extent are the same fact, read once.

*Alternative — resolved facts for every line, minus the node the position materializes.* The
more general statement of the same invariant, and the first one drafted: the raw parse and the
resolved parse differ in exactly two ways, one the position destroys and one it invents, so
removing the invented node makes the resolved tree equal to the pre-keypress outline. Rejected
as the implementation, kept as the framing. Removing a node is only clean while it is a leaf,
and the materialized node need not be one: a paragraph materialized inside a list item's scope
can capture a following list through the paragraph-attachment rule, which would reparent lines
the position never touched. D1 needs no such reasoning — it never consults the resolved tree for
a line the position did not displace, so `hasChildren` on a childless heading cannot leak by
construction, and the e2e guard at `52-block-markers-icons.e2e.ts:684` holds without depending
on an argument.

*Alternative — keep the raw parse and carve out `hasChildren`.* Equal on every shape measured,
because that is the only fact the materialized node changes about another node today. Rejected:
it states the exception as a list of fact names, so every per-node fact added later (a fold
state, a child count) silently joins the carve-out or silently breaks it.

**The extent claim is testable, and is tested rather than argued.** A property test over
generated documents asserts that raw and resolved facts differ ONLY on the position's line and
on the resolved node's own lines below it. If a shape violates it, D1's scope is wrong and the
generator will say so — `tests/generators.ts` and `fast-check` are already in the tree for
exactly this kind of claim.

### D2 — Guides are left on the raw document, and that is consistent rather than an omission

`outline-decorations` says a provisional position does not govern its line's guides, and the
same holds for the lines it displaces — no delta is needed, because a bisection provably cannot
change any guide.

A guide is owned by a strict NON-LIST-ITEM ancestor (`computeLineGuides`). For the tail of a
bisected node to acquire an ancestor it did not have, the bisected node must adopt it as a
child, and the parse only does that when the tail's indent reaches the bisected node's content
column — which is the list-item rule. A bisected paragraph's tail becomes a SIBLING, with the
same ancestors it had. So every line a bisection displaces is displaced INTO a list item, and a
list item owns no guide. Measured on the reported shapes and the nested and under-a-heading
variants: `guideDepths` identical before and after in all of them.

The task list verifies this rather than trusting it, as part of the same differential test D1
uses.

### D3 — One accessor, three call sites, no second merge

The marker pass and the line pass each merge the provisional fact themselves today, in slightly
different ways (`decorations.ts:776` sorts a concatenated array; `:884` looks up by line
number). Both are replaced by `factsFor(state)`, and `MarginCompensation` (`:1917`) is switched
to it too — a displaced line that Obsidian renders as a widget takes the same overlay as a plain
one, which is the rule `decorate-widget-rendered-lines` already established for every other
fact.

This is the `docFacts` consolidation again, one layer up, and for the same reason: three
consumers deriving the same thing independently is how they come to disagree. The escalated-
selection passes are deliberately left reading `docFacts` directly — a cover and a position
cannot coexist, and routing them through the overlay would imply a case that cannot happen.

### D4 — The structural-key half is decided by measurement, against a stated rule

Which operations misbehave is not known, and cannot be settled by reading: the one case traced
(Tab on an interior position) produced a correct document, and it did so because indent rewrites
a whole subtree and the artifact child happened to be inside it. The measurement pass
(tasks.md — Findings) runs each structural key with a position open, at the planner level where
the tree is visible, and records the document each produces beside the document the same key
produces with no position open.

The decision rule: an operation is DEFECTIVE when those two documents differ in anything but the
position's own line. Anything defective is fixed in this change.

The mechanism, if one is needed, is to give the grammar the RESOLVED tree for its targeting
decisions while it keeps expressing edits against the buffer's own lines. Line numbers align
exactly — the probe adds a character, never a line — so a node's line span in the resolved tree
addresses the same lines in the buffer, with the position's line included in the bisected node's
span. That inclusion is a feature for the operations that rewrite a node's lines: an indent that
re-indents the position's line along with the rest keeps the position aligned with the node it
belongs to, which is what the caret should follow.

*Alternative — abandon the position, then act.* Cancelling the place first would give every
operation the pre-keypress outline with no tree threading at all, reusing machinery that already
exists (`cancelOnDelete`, `advanceFromEmptyPlace`). Rejected outright: Enter-then-Tab is the
canonical outliner gesture for "new node, one level in", and abandoning on a structural key
destroys it.

*Alternative — special-case each operation.* Rejected for the reason the grammar keeps its rules
in `ops.ts`: a per-key copy of "which lines are really this node's" drifts from the parse.

### D5 — The trigger stays "the caret is on a line with no node content"

Unchanged from `decorate-provisional-positions` D5, and re-affirmed rather than assumed: the
overlay is a function of document plus caret, with no view state and no record of which key ran.
A gap line reached by a `programmatic` placement gets the same treatment as one our keypress
opened, which for the bisection case is the right answer anyway — a caret parked in the middle
of what the user sees as one node should not make that node look like two.

The one place this reading costs something is a blank line the user AUTHORED inside what would
otherwise be one node — `alpha`, blank, `beta` with the caret on the blank line, where the
resolved tree merges all three into one paragraph and D1 would render `beta` as a continuation
line, dropping its marker. Reachable only by a programmatic placement: `content-space-caret`
redirects a click on a blank line to the node above and keeps every motion in content space. It
is recorded as a known edge in tasks.md rather than guarded against, because guarding it means
reading the created-place record and giving up D5.

## Risks / Trade-offs

- **The overlay's extent claim is wrong for some unmeasured shape** → The differential property
  test in D1 is the guard, and it runs over generated documents rather than the shapes already
  known. A violation fails the suite instead of shipping as a rendering that moves a line the
  position never touched.
- **`markerVisibility: 'with-children'` regresses on the childless-heading neighbour** → D1
  never reads the resolved tree for that line, so the existing e2e test is a real negative
  control: it fails if the overlay is ever widened to the whole document. The task list keeps it
  and adds the inverse control for the bisection case.
- **The measurement pass finds several defective operations and the change grows** → Accepted
  deliberately (proposal.md — What Changes). The measurement is the first task, so its result is
  known before any operation code is touched, and the artifacts are updated with the deltas it
  turns out to need rather than guessed at now.
- **A position left behind by a structural key still splits the node on disk** → Out of scope
  and recorded. It is byte-identical to stock Obsidian, and the rendering fix makes it
  invisible only while the caret rests there — a deliberate limit, not an oversight.
- **Two pending changes touch `outline-keyboard-grammar`** → `abandon-removes-only-the-place` is
  complete but unarchived, and this change's delta restates its version of the requirement. It
  must be synced or archived first; the delta says so in a comment at the top.
