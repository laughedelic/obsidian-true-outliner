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
not. The matcher comes from `search-hits-and-footer-content-filter`, now implemented in
`src/search.ts`: `matchesText` holds the grammar and nothing else does, `matchNodes(doc, query)`
answers with the ids of the nodes whose own lines — verbatim, joined, markers and indentation
included — contain the query, and `matchRanges(text, query)` gives every occurrence in a string
as half-open ranges. That module states that the GRAMMAR is shared and the CORPUS is not: each
surface decides which text a query is answered against, and `matchNodes` is the one it names for
an in-note filter. The survey behind the behaviour is `docs/research/search-surfaces`.

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
children are hidden — merged where adjacent. Nothing else: an earlier reading added the document
preamble so the properties block would keep rendering, and the spike measured that the span
decides nothing there. The title and the properties block are siblings of the content rather than
document lines, so no line range reaches them; what hides them under a zoom is `ZOOMED_CLASS`,
which a filter does not carry. Passing the preamble only keeps the blank line after the
frontmatter rendered above the first match (`docs/research/outline-filter-spike`).

Which replace spec a gap takes (head or tail, `inclusiveStart`) is decided by where the gap
begins, exactly as today — `from === 0` is the head and every other gap is the tail — because the
rule was about a gap's position and never about there being one gap.

Two conditions in `zoom-decorations.ts` are written against the zoom alone, and only one of them
becomes a condition on the union: the builder returns no decorations when `zoomScope` is null, and
now runs when either surface has something to hide. `ZOOMED_CLASS` — which is what hides the
inline title and the properties block, in `styles/30-zoom.css` — is read from the zoom alone and
stays there. That is the whole of why a filtered note keeps its title and properties.

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

`matchesText` trims its query and an empty one matches everything, so `matchNodes` with a query
below the threshold answers with every id in the document. The filter does not lean on that: below
the threshold it holds no anchors at all and the hiding builder is inactive, rather than freezing
one anchor per node and mapping thousands of them through every transaction. The threshold counts
the TRIMMED query, for the same reason — the matcher trims, so a two-character query of one
character and a space is a one-character query.

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

A `Decoration.mark` per occurrence in visible nodes, cut with `matchRanges` so the editor and the
footer agree on what an occurrence is by construction rather than by two implementations staying
in step. The decoration is declared `{ tagName: 'mark', class: 'to-match' }`, so both surfaces put
the same element with the same class in the DOM and the shared rule is one rule rather than two
that look alike.

That rule is `.to-backlinks-content mark.to-match` as
`search-hits-and-footer-content-filter` wrote it, scoped to the footer's row content. Moving it to
`styles/10-editor.css` is a DE-SCOPING, not a relocation, and its five declarations hold up under
it: the border radius, the accent wash and the text colour are the treatment both surfaces want,
and `padding: 0` with `font-weight: inherit` are resets against whatever a theme gives a bare
`<mark>` — which the editor's mark inherits too, being one. So all five move, the selector loses
both scopes, and the footer's rendering is verified unchanged rather than assumed (task 4.3). The
class is what keeps our mark distinguishable from an author's `==highlight==`, which renders as a
bare `<mark>` on both surfaces; that reason holds in the editor exactly as the footer's comment
states it.

The marks are recomputed per state from the mapped anchors, and occurrences are found in the
node's current text, so a mark follows an edit and disappears when the text no longer contains the
query — the mark reports the text, the anchor reports the membership. A query that matches nothing
leaves both alone (D8).

### D7. Gates

Outline mode for the command, through `addZoomCommand`'s shape in `main.ts`, which reads
`isOutlineMode` in an `editorCheckCallback` so the palette does not offer it elsewhere; and
not-nested for the extension, through the `nestedEditorField` check `zoom-scope.ts` already
applies, so a nested cell editor never filters. Per editor view, never persisted: the field lives
in the editor state.

### D8. A query that matches nothing keeps the last view, and the field says so

A query that matches nothing does not replace the anchors: the field keeps the set it has and
only the query text changes. The view therefore holds the last answer it had rather than moving,
which is D2's principle — nothing moves under the reader — applied to the one case where the
reader is still typing. Below the two-character threshold, and before any query has matched in
this panel, the note renders whole; that is the state before a filter, not an answer to one.

Rendering the note whole on a miss instead would expand a long note on every mistyped character
and collapse it again on the backspace that fixes it. Hiding everything would be honest about the
query and useless about the note, and it makes the reader lose their place to a typo. A debounce
answers neither: the footer declined one on measured grounds rather than taste
(`search-hits-and-footer-content-filter`, non-goals), and a delay makes the view lag the query
rather than hold a stated earlier answer to it.

The cost is that the view answers the query that produced it rather than the one in the field, so
the field has to say so and cannot be subtle about it. What the panel shows is therefore part of
this decision, not a detail below it: the message that the query matches nothing, and a treatment
on the query itself — the characters that took it past its last match, or the field as a whole,
in an error colour. Which of those reads best is settled with the rest of the panel's styling in
task 4.3.

The marks belong to the query that produced the view, not to the one in the field (D6), for the
same reason: the view is that query's answer and is marked as its answer.

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
- [The view can answer a query the field no longer holds] → the price of D8, and the reason the
  field's own treatment of a miss is part of that decision rather than styling under it; the
  manual pass (5.3) reports whether the signal carries.
- [A query can match source the editor is not showing] → `matchNodes` answers against a node's
  own lines verbatim, so a marker, its indentation, or a link's target inside `[[Target|alias]]`
  all count, while Live Preview renders the alias and hides the syntax on every line but the
  caret's. `search-hits-and-footer-content-filter` recorded the footer's version of this gap and
  handed it to a manual pass; the editor's is wider in what it matches and narrower in what it
  hides, since moving the caret onto the line reveals the source and the mark with it. The spike
  measures what a mark over hidden syntax actually draws (task 1.1).
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
- How the query field signals that it matches nothing (D8) — the characters past the last match
  in an error colour, the whole field, or something else. The spec requires the signal; task 4.3
  settles its treatment with the rest of the panel's styling.
- Whether a selection should be allowed to span a gap after all (D3). Refusing it is deliberately
  the smaller commitment, taken before the surface has been used; the manual pass (5.3) records
  how often the refusal is met and what the reader wanted instead, and a later change can widen
  it without unpicking anything.
- Whether the palette's narrowed scope should become a list view of this filter's visible set
  (`docs/research/search-surfaces`, open question 4). Neither change depends on the answer.
