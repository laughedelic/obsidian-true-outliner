## Why

Every outliner in the survey filters the current document in place: type a query and the outline
collapses to the matching nodes and the ancestors that lead to them, still editable, live as it is
typed (`docs/research/search-surfaces`, "What other apps do": Workflowy, Dynalist, RemNote's
Filter, Org's sparse trees). Obsidian's in-file find highlights and steps through matching lines
and cannot hide anything, and it is a closed component we cannot extend. The plugin already owns
the mechanism this needs: zoom hides every line outside one subtree with block-replace decorations
from a state field (`docs/research/zoom-hiding-mechanism`), and a filter is the same hiding
applied to the union of several subtrees' paths. It is the third search surface in the plan, after
the footer's content filter and the palette, and a nice-to-have rather than essential — which is
why it is proposed separately and sequenced last.

## What Changes

- **A command, "Filter outline", opens a filter panel** fixed above the editor's content in
  outline mode, with a query field, a match count and a close control. Typing filters the note live: nodes matching
  the query stay, their ancestors stay so each match keeps its path, everything else is hidden —
  occupying no space and taking no caret. The note's own title and properties keep rendering, as
  they do unfiltered. Matches are marked. A match's children stay hidden unless they match
  themselves.
- **The view stays editable.** Visible nodes edit as they always do. The set of MATCHES is
  fixed when the query runs: editing a match so it no longer contains the query does not hide
  it, and typing the query into a hidden node does not reveal it, until the query is re-run. The
  path to each match is not fixed — it is read from the document as it stands, so moving a match
  reveals its new ancestors. Clearing the query or closing the panel restores the whole note.
- **The filter composes with zoom.** Inside a zoom scope the filter searches the scope only and
  the trail stays; zooming into a visible node keeps the filter, re-decided over the new scope;
  clearing the filter leaves the zoom as it was. A zoom still hides the title and the properties
  block, as `outline-zoom` requires — the filter adds nothing there and takes nothing away.
- **The caret never lands on a hidden line, and a selection never spans one.** A gesture whose
  result would put the caret on hidden content lands it on the nearest visible line instead; one
  that would extend a SELECTION past the visible run it started in is refused with a message,
  because a range covering nodes the reader cannot see is one Copy and Delete would act on.
  Clearing the query is the way to act across what the filter hid. Structural operations
  otherwise act on the document as they always do, hidden content included.
- **A query that matches nothing hides everything and says so**, rather than rendering the note
  whole — the title, the properties and the footer stay, so the empty result is not an empty
  editor.
- **Same grammar as the other surfaces**: `matchNodes` from
  `search-hits-and-footer-content-filter`, so a query means the same thing in the footer, the
  palette and here. The one-character floor below is this surface's threshold for when to hide
  anything, not part of the grammar — the other two surfaces answer a one-character query.

## Capabilities

### New Capabilities

- `outline-filter`: the in-note filter — the panel, what stays visible, marking, the frozen
  match set under editing, the caret rule, composition with zoom, mode gating, empty states.

### Modified Capabilities

_None._ `outline-zoom`'s requirements keep holding while a filter is active; the filter states
its own interaction with a zoom scope in its own spec, and the shared hiding builder is an
implementation concern recorded in design.

## Non-goals

- Confining structural operations to the visible set, as zoom confines them to its scope. The
  document is the truth and an operation acts on it whole; the caret rule is the only guard.
- Revealing hidden content on demand from within the filtered view (a per-node "show hidden
  siblings" control). Clearing the query is the way out.
- Org's second refinement — revealing the node after the last match, so the end of a sparse tree
  is not claustrophobic (`docs/research/search-surfaces`, lesson 1). Our view is editable and
  Enter at a visible node's end already makes a visible node, so the motivation does not carry;
  the manual pass reports whether the end reads cramped without it.
- Letting a selection span hidden content. Refused for now (design D3) rather than settled:
  a refusal can widen later, and the surface has not been used yet.
- Any change to the grammar; ancestor operators and fuzziness are later layers of the matcher.
- Reading view.
- Persisting a filter across tabs or sessions.

## Impact

- **New**: `src/plugin/outline-filter-state.ts` (the query and the frozen match set, as a state
  field mapping through changes), `src/plugin/outline-filter-panel.ts` (the panel), an
  `outline-filter` spec, `e2e/specs/81-outline-filter.e2e.ts` with `e2e/outline-filter.ts` beside
  it, `styles/70-outline-filter.css`, `docs/research/outline-filter-spike.md`.
- **Modified**: `src/plugin/zoom-offsets.ts` (`hiddenOffsetRanges` takes a SET of visible spans
  and returns their gaps, with zoom's cover as the one-span case) and `src/zoom.ts` (where the
  complement is computed today, as `ZoomScope.hidden`), `src/plugin/zoom-decorations.ts` (the
  union of both surfaces' spans, and `ZOOMED_CLASS` left to the zoom alone),
  `src/plugin/zoom-scope.ts` (its visible-bounds resolver intersects with the filter's spans),
  `src/result.ts` and `src/plugin/messages.ts` (a rejection reason and its cue for a selection
  that would span a gap), `main.ts` (the command), `scripts/spec-groups.mjs` (a label for the new spec's decade),
  `styles/10-editor.css` and `styles/20-backlinks-footer.css` (the `to-match` rule moves to the
  part the two surfaces share), `tests/zoom-offsets.test.ts` (the new signature).
- **Spike before implementation**: whether the hiding builder holds with many visible ranges,
  and what editing under a frozen match set does at range edges (design, open questions).

## Sequencing

Off `main`, after `search-hits-and-footer-content-filter` has merged, because it supplies the
matcher, the `to-match` class and `docs/research/search-surfaces`. Waiting rather than stacking:
the three files this change shares with it are all ones it ADDS, so there is nothing to rebase
against and a stack would only pay the restack toll. The zoom work this change edits around —
`zoom-edit-confinement`, `positions-re-base-with-the-zoom` and the folding stack — has landed, so
nothing else is in its way. Independent of `search-palette`.
