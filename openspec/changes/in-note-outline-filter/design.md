## Context

Zoom already does the hard half. `zoom-decorations.ts` builds block-replace decorations from a
state field for the ranges `hiddenOffsetRanges(doc, scope)` returns, which are the complement of
one visible range — the scope's subtree cover. `docs/research/23` measured that mechanism
against a real instance and recorded what held (hiding, boundary arithmetic, chrome on visible
lines, `showPanel` in the markdown view) and what did not (confinement is not free).
`docs/research/26` catalogued editing at the boundary of that one range. The caret is kept
inside the scope by the resolvers `zoom-state.ts` exposes (`setVisibleBoundsResolver`,
`setChangeEscapesResolver`), and the panel the trail lives in is a CodeMirror panel.

A filter's visible set is many ranges — every match's own lines plus every ancestor's own lines
— and the rest of this design is what changes when "one range" becomes "a set", and what does
not. The matcher comes from `search-hits-and-footer-content-filter`; the survey behind the
behaviour is `docs/research/31`.

The zoom modules this touches are being edited by two branches in flight
(`feat/zoom-boundary-edits`, `fix/positions-re-base-with-the-zoom`), which is why this change
waits for them (proposal, Sequencing).

## Goals / Non-Goals

**Goals:**

- Hide by the same mechanism zoom hides, with zoom as the one-range case of it.
- A visible set that survives editing without re-deriving itself from node ids.
- The caret rule without zoom's operation confinement.

**Non-Goals:**

- Confining structural operations. The proposal's non-goal; `docs/research/23` records what
  confinement cost zoom, and a filter with several islands would pay it per island.
- Editing hidden content through the filtered view.

## Decisions

### D1. Hidden ranges become the complement of a set of visible spans

`hiddenOffsetRanges` takes a sorted list of visible line spans rather than one scope and returns
their gaps; zoom passes the one span it always did, so its decorations, boundary arithmetic and
tests are unchanged. The filter passes the union of its visible nodes' OWN lines — not subtree
covers, since a match's children are hidden — merged where adjacent. Which replace spec a gap
takes (head or tail, `inclusiveStart`) is decided by where the gap begins, exactly as today,
because the rule was about a gap's position and never about there being one gap.

The spike (task 1.1) confirms on a real instance that many gaps hold the same boundary
properties `docs/research/23` measured for two, in particular that a visible line between two
gaps keeps its chrome and the trailing-gap rule.

### D2. The match set is positions mapped through changes, not node ids

Node ids are per parse and not stable across edits, so a frozen set of ids is not a frozen set
of anything. The filter state field stores one anchor offset per match — the match node's start
— and maps them through every transaction's changes, the way the zoom anchor is mapped. On each
state the visible set is derived: parse, take the node containing each anchor, add its
ancestors. An anchor whose node is edited away maps to wherever the edit put it and keeps that
node visible; an anchor deleted with its node is dropped.

This gives the spec's "fixed when the query runs" for free: nothing re-matches until the query
changes, and a node created from a visible node — a split, a new sibling from Enter — is visible
because the caret rule keeps the caret on visible lines and the new node's start is where the
caret was. The spike's second half (task 1.2) walks `docs/research/26`'s gesture catalogue under
a filter and records which rows need an anchor added rather than mapped.

Alternative: re-run the query on every change, Workflowy-style. Rejected: a node vanishing
under the caret as it is edited is the hazard `docs/research/31` names, and Org's rule — drop
the filter on the first edit — throws away the reader's place for the same reason.

### D3. The caret rule reuses zoom's resolvers, with a set

`zoom-state.ts`'s visible-bounds resolver answers "where may the caret be" for one span; the
filter registers the same kind of resolver over its set, and the placement that clamps into the
zoom scope clamps into the nearest visible span in the direction of travel instead. The
change-escapes resolver is NOT registered for the filter: an edit landing in hidden content is
allowed (proposal, non-goal), and only the caret is redirected afterwards.

### D4. Composition with zoom is intersection

The filter's query runs over the zoom scope's subtree when one is active, and the visible set is
the intersection of the filter's spans with the scope's span; the decorations builder takes the
intersection as its visible spans. Zooming while filtered re-runs the query over the new scope
(the query is kept; the anchors are recomputed, since the scope changed what "the document"
means). Clearing the filter leaves the zoom field untouched.

### D5. The panel is a CodeMirror panel above the trail

`showPanel` with `top: true`, the mechanism `docs/research/23` verified in the markdown view.
The query field, a match count, the no-matches message and a close control. Escape in the field
closes the panel; the command toggles it. The field is not the editor, so the keyboard grammar
does not see its keys.

### D6. Matches are mark decorations from the same field

A `Decoration.mark` per occurrence in visible nodes, computed with the visible set and carrying
the `to-match` class the footer's marks use, so one stylesheet rule covers both. Recomputed per
state from the mapped anchors; occurrences are found in the node's current text, so a mark
follows an edit and disappears when the text no longer contains the query — the mark reports the
text, the anchor reports the membership.

### D7. Gates

Outline mode and not-nested, through the same checks `zoom-scope.ts` applies, so the filter is
absent outside them and a nested cell editor never filters. Per editor view, never persisted:
the field lives in the editor state.

## Risks / Trade-offs

- [Many replace decorations in a long note] → the count is bounded by the number of visible
  spans plus one, and a long note under a narrow query has few; the spike measures a
  thousand-line note with fifty matches.
- [An anchor mapped into a neighbouring node after a delete makes the wrong node visible] →
  covered by the gesture catalogue in the spike; the fallback is to drop an anchor whose
  mapped position is no longer inside a node with the same start line, and accept the loss.
- [The caret rule and the zoom's confinement disagree when both are active] → the filter's
  resolver is composed after zoom's, so zoom's answer is clamped first and the filter's second;
  the intersection in D4 makes both answers lie in the same span.
- [The fold UX landing in `feat/better-folding-ux` changes what a hidden child looks like] →
  this change waits for that stack; a match's hidden children may then borrow its fold control
  rather than plain hiding, which is a rendering choice the spec leaves open.

## Open Questions

- Whether a hidden child of a match should show a fold count or nothing, once the folding
  change has landed. Rendering only; the spec's "hidden unless it matches" holds either way.
- Whether the palette's narrowed scope should become a list view of this filter's visible set
  (`docs/research/31`, open question 4). Neither change depends on the answer.
