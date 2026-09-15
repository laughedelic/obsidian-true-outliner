## Context

Zoom already does the hard half. `zoom-decorations.ts` builds block-replace decorations from a
state field for the ranges `hiddenOffsetRanges` returns. Those ranges are a conversion today, not
a computation: the mapping core precomputes the at-most-two hidden LINE spans on the scope itself
(`ZoomScope.hidden`, `src/zoom.ts`) as the complement of one visible range — the scope's subtree
cover — and `zoom-offsets.ts` turns them into CM6 offsets.
`docs/research/zoom-hiding-mechanism` measured that mechanism against a real instance and
recorded what held (hiding, boundary arithmetic, chrome on visible lines, `showPanel` in the
markdown view) and what did not (confinement is not free). `docs/research/zoom-editing-boundary`
catalogued editing at the boundary of that one range. The caret is kept inside the scope by two
resolvers `zoom-state.ts` declares and `zoom-scope.ts` fills once at load
(`setVisibleBoundsResolver`, `setChangeEscapesResolver`) — single-slot injection points holding
one function each, not a chain.

The trail is a block widget anchored at the visible range's start, not a CM6 panel.
`zoom-trail.ts` records why: `showPanel` mounts into `.cm-panels-top`, a sibling of
`.cm-scroller`, structurally above the note's title and properties and fixed there, so a panel
can only read as a toolbar. The mechanism itself works in the markdown view — that is what
`zoom-hiding-mechanism` verified — and the trail declined it for what it looks like, a judgement
D5 does not inherit.

Refusals reach the reader through `REJECTION_MESSAGES` in `messages.ts`, one cue per typed
`RejectionReason`, with `would-leave-zoom-scope` the closest precedent for what D3 adds.
`docs/research/refused-commands-in-e2e` records why a refusal is asserted through the notice
recorder rather than through a command's return value.

A filter's visible set is many ranges — every match's own lines plus every ancestor's own lines
— and the rest of this design is what changes when "one range" becomes "a set", and what does
not. The matcher comes from `search-hits-and-footer-content-filter`: `matchNodes(doc, query)` in
`src/search.ts`, answering with the ids of the nodes whose own lines contain the query. The
survey behind the behaviour is `docs/research/search-surfaces`.

The zoom modules this touches have since settled: `zoom-edit-confinement` and
`positions-re-base-with-the-zoom` have both landed on `main`, and this design is written against
what they left. What this change still waits for is the matcher (proposal, Sequencing).

## Goals / Non-Goals

**Goals:**

- Hide by the same mechanism zoom hides, with zoom as the one-range case of it.
- A visible set that survives editing without re-deriving itself from node ids.
- The caret rule without zoom's operation confinement.

**Non-Goals:**

- Confining structural operations. The proposal's non-goal; `docs/research/zoom-hiding-mechanism`
  records what confinement cost zoom, and a filter with several islands would pay it per island.
- Editing hidden content through the filtered view.

## Decisions

### D1. Hidden ranges become the complement of a set of visible spans

The complement moves to where both surfaces can reach it: `hiddenOffsetRanges(doc, visible)`
takes a sorted, merged list of visible line spans and returns the gaps between them as offset
ranges. Zoom passes the one span it always had, its cover. `ZoomScope.hidden` stays as the
mapping core's own statement of the scope's shape, but the decoration path stops reading it, so
one function answers "what is hidden" for both surfaces instead of two that must agree.

The filter passes the union of its visible nodes' OWN lines — not subtree covers, since a match's
children are hidden — merged where adjacent, plus the document preamble. The preamble is the
frontmatter and the blank lines after it (`OutlineDoc.preamble`) and is never a node, so nothing
derived from matches and ancestors would keep it, while the spec requires the properties block to
render. Zoom hides both the preamble and the rendered title deliberately and states that as its
own requirement; a filter is not a re-rooting and does neither.

Which replace spec a gap takes (head or tail, `inclusiveStart`) is decided by where the gap
begins, exactly as today — `from === 0` is the head and every other gap is the tail — because the
rule was about a gap's position and never about there being one gap.

Two conditions in `zoom-decorations.ts` are written against the zoom alone and become conditions
on the union: the builder returns no decorations when `zoomScope` is null, and `ZOOMED_CLASS` —
which is what hides the inline title and the properties block, in `styles/30-zoom.css` — is
applied on the same read. The builder runs when either surface has something to hide; the class
stays with the zoom.

Alternative: leave the complement in the mapping core and have `hiddenOffsetRanges` keep
converting hidden spans, with the filter computing its own. Rejected for keeping two complements
in step.

The spike (task 1.1) confirms on a real instance that many gaps hold the same boundary properties
`docs/research/zoom-hiding-mechanism` measured for two, in particular that a visible line between
two gaps keeps its chrome and the trailing-gap rule.

### D2. The match set is positions mapped through changes, not node ids

Node ids are per parse and not stable across edits, so a frozen set of ids is not a frozen set
of anything. `matchNodes` answers in ids and the filter spends them immediately: at the parse
that produced them each id resolves to its node's start offset, and the field stores those
anchors. They map through every transaction's changes, the way the zoom anchor is mapped. On each
state the visible set is derived: parse, take the node containing each anchor, add its ancestors.
An anchor whose node is edited away maps to wherever the edit put it and keeps that node visible;
an anchor deleted with its node is dropped.

Mapping alone does not make a NEW node visible. A node created beside a match contains no anchor,
so the derivation would hide it under the caret that just made it. The rule is therefore explicit
rather than incidental: a transaction that splits a visible node, or creates a sibling or child
from one, adds an anchor for the node it created. The spike's second half (task 1.2) walks
`docs/research/zoom-editing-boundary`'s gesture catalogue under a frozen anchor set and records,
row by row, which gestures that rule has to cover and which map cleanly.

What stays derived rather than frozen is the ancestor half: the MATCHES are fixed, and the path
to each one is recomputed from the current parse, so indenting a visible match under a different
parent makes that parent visible. That is what keeps a match's path honest as the document moves,
and the spec states it as part of the frozen-set requirement rather than leaving it to be read
off the implementation.

Alternative: re-run the query on every change, Workflowy-style. Rejected: a node vanishing under
the caret as it is edited is the hazard `docs/research/search-surfaces` names, and Org's rule —
drop the filter on the first edit — throws away the reader's place for the same reason.

### D3. The caret rule teaches zoom's resolver a set, and a selection never spans a gap

`setVisibleBoundsResolver` holds ONE function, installed at load by `zoom-scope.ts`, so the
filter does not register a second: that resolver learns to intersect. It answers the zoom's
bounds as it does today, and when a filter is active narrows the answer to the visible span
holding the anchor; the placement that clamps into the zoom scope clamps into the nearest visible
span in the direction of travel. One function rather than a chain, so the two answers cannot
disagree — and the intersection in D4 puts them in the same span regardless.

A caret is a point and can be moved, so it is redirected. A SELECTION spanning a gap cannot be
drawn truthfully — it would cover nodes the reader cannot see and hand them to Copy and Delete —
so it is refused instead: a gesture that would extend a selection past the last visible line of
its island leaves the selection as it was and raises a notice, through a new `RejectionReason`
beside `would-leave-zoom-scope`. Progressive Select All escalates within the island and stops
there on the same rule. The way to act on the whole document is to clear the filter, which is one
keystroke and leaves the reader looking at what they are about to change.

This is the conservative reading, taken because the question is genuinely open and a refusal can
become an allowance later without invalidating anything built on it. It is scoped to the
SELECTION: an operation on one visible node still acts on the document whole, so moving a node
past a hidden sibling moves it past that sibling, and moving a visible node carries its hidden
children. Only a range that would span a gap is refused.

The notice fires once per gesture, not once per key repeat — a held Shift+Down at an island's
edge says it once.

The change-escapes resolver is NOT taught about the filter: an edit landing in hidden content is
allowed (proposal, non-goal), and only the caret is redirected afterwards.

### D4. Composition with zoom is intersection

The query runs over the SOURCE document and its matches are intersected with the zoom scope's
cover, rather than running over `scope.document`. The re-rooted document is a second line space —
`scope.startLine` is the constant offset back to the source, and re-basing positions across it is
what `positions-re-base-with-the-zoom` existed to fix — and the anchors need source offsets
either way. Matching the whole note and dropping what falls outside the cover costs one pass over
nodes the reader cannot see and keeps the filter in one line space.

The visible set is then the intersection of the filter's spans with the scope's cover, and the
decorations builder takes that intersection as its visible spans. Zooming while filtered
re-decides the match set over the new scope — the query is kept and the anchors recomputed,
because the scope changed which matches count. Clearing the filter leaves the zoom field
untouched.

### D5. The panel is a CM6 top panel

`showPanel` with `top: true`, the mechanism `docs/research/zoom-hiding-mechanism` verified in the
markdown view. It holds the query field, which takes focus, a match count, the no-matches message
and a close control. Escape in the field closes the panel; the command toggles it. The field is
not the editor, so the keyboard grammar does not see its keys.

The trail declined this mechanism because a panel reads as a toolbar and a breadcrumb saying
where the reader is must sit where the reader is. A query field is a control OVER the view rather
than part of it, which is what a toolbar is for, and Obsidian's own in-file find reads exactly
that way. Being fixed above the scroller is what the filter wants for a second reason: the field
stays reachable while a long sparse tree is scrolled, where a block widget would scroll out of
sight.

It mounts above the title and the properties block, which the filter keeps rendering (D1), so the
three read top to bottom as control, note, filtered content.

### D6. Matches are mark decorations from the same field

A `Decoration.mark` per occurrence in visible nodes, carrying the `to-match` class
`search-hits-and-footer-content-filter` gives the footer's marks, so one stylesheet rule covers
both surfaces. The two surfaces emit different elements for it — the footer wraps rendered text
in `<mark>`, a mark decoration produces a `<span>` — so the shared rule is written on the class
alone and never on the element. A rule two surfaces share belongs in `styles/10-editor.css`, so
the `to-match` rule moves there out of the footer's part once that change has landed; the move
also takes the rule earlier in cascade order, ahead of the footer's part rather than inside it.

Recomputed per state from the mapped anchors; occurrences are found in the node's current text,
so a mark follows an edit and disappears when the text no longer contains the query — the mark
reports the text, the anchor reports the membership.

### D7. Gates

Outline mode for the command, through `addZoomCommand`'s shape in `main.ts`, which reads
`isOutlineMode` in an `editorCheckCallback` so the palette does not offer it elsewhere; and
not-nested for the extension, through the `nestedEditorField` check `zoom-scope.ts` already
applies, so a nested cell editor never filters. Per editor view, never persisted: the field lives
in the editor state.

### D8. A query that matches nothing hides everything

Nothing matches, so nothing is visible: the content collapses entirely and the panel says so.
Rendering the note whole instead would mean the view expands on every mistyped character and
collapses again on the backspace that fixes it, which is the opposite of what a filter is for,
and it makes "nothing hidden" mean two different things — below the threshold and above it with
no hits.

The empty view is not an empty editor. The preamble D1 always keeps means the title and the
properties block still render, the footer still renders after the content, and the query field
holds focus, so there is somewhere to look, somewhere to type, and no caret to place in a
document with no visible line. Below the two-character threshold the note renders whole, which is
the state before a filter has been asked for rather than the answer to one.

Alternative: hold the last set that matched. Rejected for showing a view that does not answer the
query in the field, on a surface whose whole promise is that it does.

## Risks / Trade-offs

- [Many replace decorations in a long note] → the count is bounded by the number of visible
  spans plus one, and a long note under a narrow query has few; the spike measures a
  thousand-line note with fifty matches.
- [An anchor mapped into a neighbouring node after a delete makes the wrong node visible] →
  covered by the gesture catalogue in the spike; the fallback is to drop an anchor whose
  mapped position is no longer inside a node with the same start line, and accept the loss.
- [`zoom-scope.ts` grows a filter import to intersect in its resolver] → the alternative is a
  second resolver slot and a composition order to keep right, which is the shape D3 rejects; the
  import is one way and the module already owns every gate the filter needs.
- [The step from the second character to the third collapses a whole note] → the threshold and
  D8 meet at a cliff: one character hides nothing, two that miss hide everything. Measured in the
  manual pass (5.3), where a longer threshold or a short settle before the first hide is the
  lever if it reads badly.
- [A refused selection is a notice the reader did not ask for] → fired once per gesture and
  worded as the zoom's refusals are; `docs/research/refused-commands-in-e2e` records why the e2e
  assertion reads the notice recorder rather than the command's return.
- [The folding work on `main` changes what a hidden child can look like] → a match's
  hidden children may borrow the fold control the editor now draws rather than being hidden
  plainly, which is a rendering choice the spec leaves open.

## Open Questions

- Whether a hidden child of a match should show a fold count or nothing, now that the folding
  change has landed. Rendering only; the spec's "hidden unless it matches" holds either way, and
  task 4.3 decides it from a mockup.
- Whether a selection should be allowed to span a gap after all (D3). Refusing it is deliberately
  the smaller commitment, taken before the surface has been used; the manual pass (5.3) records
  how often the refusal is met and what the reader wanted instead, and a later change can widen
  it without unpicking anything.
- Whether the palette's narrowed scope should become a list view of this filter's visible set
  (`docs/research/search-surfaces`, open question 4). Neither change depends on the answer.
