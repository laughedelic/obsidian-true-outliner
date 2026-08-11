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

### D1 — A gate, not a line span: when a position joins a node, the whole document is resolved

`factsFor(state)` returns the facts and guides every consumer should use. It is the raw
`docFacts(state)` unless a provisional position is open, and then one question decides
everything: does the position JOIN an existing node, or does it stand for a NEW one?

- **Joins** (its own materialized line is not a first line) — the position BISECTED a node, so
  the raw parse of the buffer is wrong, and the tree the position stands for supplies the whole
  document: every fact, every guide.
- **Stands for a new node** — nothing but its own line changes, which is exactly today's
  behaviour: raw facts everywhere, plus the position's own.

*This started as a line span and was wrong three times.* Each attempt was killed by the
differential property test below, in this order, and the sequence is the argument for the gate:

1. *The tail lines below the position.* Wrong: the tail TAKES the node's child with it.
   `␣␣continuation` / `code inside` / `- item` — the item attaches to the paragraph by the
   attachment rule, and once bisected it attaches to the lower half, so the UPPER half's
   `hasChildren` flips and its marker disappears under `markerVisibility: 'with-children'`.
2. *The bisected node's own lines, both sides.* Wrong: the artifact can swallow a line beyond
   the node. `- item` / `⇥tab lead` / `plain text` — bisected, `⇥tab lead` becomes a paragraph,
   and a paragraph absorbs the following line, so `plain text` stops being a node of its own.
3. *Those, plus the node's subtree.* Not attempted. By then the pattern was clear: every
   difference between the two parses is the bisection's doing, and enumerating them is a losing
   game against a parser with attachment rules, lazy paragraph continuation, and list stacks.

The gate is what must not be widened, and it is narrow for two measured reasons. An Enter
position below a childless heading makes that heading a parent in the resolved tree, so its
marker would blink on; and `# H` / blank / blank / `beta` materializes a paragraph that ADOPTS
`beta` as its continuation, stripping the marker `beta` really has. Both are the invented node
rendering as though it existed, which `outline-decorations` forbids. Reading the gate off the
position's own materialized `isFirstLine` separates the two directions exactly.

**The claim is tested, not argued.** A property test runs the real Shift+Enter over generated
documents and asserts that the overlay reproduces, for every line, the facts that line had
BEFORE the keypress — the invariant as `outline-decorations` states it, checked against the only
document that can settle it. A second property asserts that an inventing position leaves every
other line on the raw parse. Both have negative controls: closing the gate fails nine tests,
widening it fails three. The property's own skip predicate is written inline rather than calling
`positionJoinsANode`, so breaking the gate cannot make the property vacuous.

### D2 — Guides ride the same gate

An earlier draft of this design argued that a bisection provably could not move a guide: a guide
is owned by a strict non-list-item ancestor, only a list item adopts a bisected tail as a child,
and list items own no guide. The argument was sound about acquiring an ancestor and blind to
LOSING one. `####### seven` / `<div>` / `- item`: the item attaches to the paragraph; bisect the
paragraph and its tail becomes an html block, which a list does not attach to, so the item drops
to the top level and its guide column blinks out — on a line the keypress never touched.

So guides come from the same tree as the facts, under the same gate. The rule this replaces —
"the line's GUIDES are not among them, and continue to come from the document as it actually is"
— was written for the CARET's own line, where it still holds and is unchanged; it was never a
statement about the rest of the document, and the delta says so now.

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
PRESENCE of the position's line, or when the position stops standing for a continuation of the
same node. Anything defective is fixed in this change.

*(Amended after the measurement ran. The rule first read "differ in anything but the position's
own line", which passes an operation that leaves that line behind at its old indentation — and
`indent` does exactly that: after `- one`/`- foo`/`  bar` is indented, the position still holds
two spaces while the item's content column has moved to four, so typing there makes a paragraph
child of `- one` instead of continuing the item. The document is identical and the position is
ruined. Both halves of the amended rule are satisfied by the same fix.)*

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
- **The `outline-keyboard-grammar` delta must restate the current requirement** →
  `abandon-removes-only-the-place` amended the same one and was archived on 2026-08-11, so the
  main spec already carries its wording and this change's delta is written on top of it. The
  ordering risk this recorded is settled; what remains is the ordinary one, that a third change
  amending the same requirement before this lands would need the same check.
