## Why

Every outliner in the survey filters the current document in place: type a query and the
outline collapses to the matching nodes and the ancestors that lead to them, still editable,
live as you type (`docs/research/31`, "What other apps do": Workflowy, Dynalist, RemNote's
Filter, Org's sparse trees). Obsidian's in-file find highlights and steps through matching
lines and cannot hide anything, and it is a closed component we cannot extend. The plugin
already owns the mechanism this needs: zoom hides every line outside one subtree with
block-replace decorations from a state field (`docs/research/23`), and a filter is the same
hiding applied to the union of several subtrees' paths. It is the third search surface in the
plan, after the footer's content filter and the palette, and a nice-to-have rather than
essential — which is why it is proposed separately and sequenced last.

## What Changes

- **A command, "Filter outline", opens a filter panel** at the top of the editor in outline
  mode, with a query field. Typing filters the note live: nodes matching the query stay, their
  ancestors stay so each match keeps its path, everything else is hidden — occupying no space and
  taking no caret. Matches are marked. A match's children stay hidden unless they match
  themselves.
- **The view stays editable.** Visible nodes edit as they always do. The set of visible nodes
  is fixed when the query runs: editing a match so it no longer contains the query does not hide
  it, and typing the query into a hidden node does not reveal it, until the query is re-run.
  Clearing the query or closing the panel restores the whole note.
- **The filter composes with zoom.** Inside a zoom scope the filter searches the scope only and
  the trail stays; zooming into a visible node keeps the filter; clearing the filter leaves the
  zoom as it was.
- **The caret never lands on a hidden line.** A gesture or an operation whose result would put
  the caret on hidden content lands it on the nearest visible line instead. Structural
  operations otherwise act on the document as they always do, hidden content included.
- **Same grammar as the other surfaces**: the matcher from
  `search-hits-and-footer-content-filter`, so a query means the same thing in the footer, the
  palette and here.

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
- Any change to the grammar; ancestor operators and fuzziness are later layers of the matcher.
- Reading view.
- Persisting a filter across tabs or sessions.

## Impact

- **New**: `src/plugin/filter-state.ts` (the query and the frozen match set, as a state field
  mapping through changes), `src/plugin/filter-panel.ts` (the panel), an `outline-filter` spec,
  `e2e/specs/8x-outline-filter.e2e.ts` in the zoom group.
- **Modified**: `src/plugin/zoom-decorations.ts` and `src/plugin/zoom-offsets.ts` (hidden
  ranges become the complement of a SET of visible ranges, with zoom's scope as the one-range
  case), `src/plugin/zoom-scope.ts` (the visible bounds a filter adds), the caret placement that
  clamps into the zoom scope (`zoom-state.ts`'s resolvers), `main.ts` (the command),
  `styles.css`.
- **Spike before implementation**: whether the hiding builder holds with many visible ranges,
  and what editing under a frozen match set does at range edges (design, open questions).

## Sequencing

Off `main`, after `search-hits-and-footer-content-filter` has merged (it supplies the
matcher) and after the zoom branches in flight have landed — `feat/zoom-boundary-edits` and
`fix/positions-re-base-with-the-zoom` on the `feat/better-folding-ux` stack — because this
change edits the same zoom modules and stacking across a stack about to move pays every
restack for nothing. Independent of `search-palette`.
