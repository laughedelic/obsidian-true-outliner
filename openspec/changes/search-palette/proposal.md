## Why

Obsidian's search shows matching LINES. In an outline a line without its path is ambiguous — a
bullet reading "handles: undecided" could belong to any of a dozen notes and headings — which is
the gap Better Search Views was written to fill by patching the core pane, and the reason it
breaks on every other Obsidian release (`docs/research/search-surfaces`). The backlinks footer
already draws the answer: a hit under its squashed ancestor chain, in the outline's own notation.
A palette that searches the vault and shows hits that way, then lands the reader on the hit
zoomed, is the highest-value search surface in the plan (`docs/research/search-surfaces`, "The
surfaces we can own"), and the prototype built there shows it costs a custom `Modal` and the
footer's renderer, nothing private.

## What Changes

- **A command, "Search outline", opens a palette** from anywhere in the app, in any view mode
  and whether or not the current tab is in outline mode: search is navigation, not a structural
  edit. No default hotkey; the reader binds one.
- **Results are the outline's structured view.** Grouped per note with the note's name, folder
  and hit count; each matching node under its squashed lineage, in the outline's notation; the
  matched text marked. No children, no folding: the palette answers "where is this", and the
  footer's context rules do not apply to it. Groups are ordered by the note's modification time,
  hits within a group in document order.
- **Two scopes in one box.** The vault by default; a key toggles to the note the palette was
  opened from, and a chip in the input row says which is active.
- **A keyboard model over hits, not items.** One hit is active; arrow keys move between hits
  across group boundaries and stop at each end of the list; a modified arrow jumps between
  groups; focus never leaves the input.
  Moving the pointer over a hit selects it; tapping one opens it.
- **Selecting a hit lands on it.** The note opens with the caret at the hit's node, scrolled into
  view, zoomed to it when that tab is in outline mode. Shift opens the whole note unzoomed; the
  platform's modifier opens a new tab. The palette closes.
- **Results paint progressively and are bounded.** Groups appear as notes resolve; a cap bounds
  the number of groups and the tail states how many notes are not shown; a changed query
  discards what an older one had not yet painted.
- **The footer's row renderer becomes a shared module** that the footer and the palette both
  call, so a row is drawn by one function on both surfaces. No visible change to the footer.
- **The palette uses the matcher and the hit model from `search-hits-and-footer-content-filter`**,
  so a query means the same thing in the footer and the palette.

## Capabilities

### New Capabilities

- `search-palette`: the palette — how it opens, what it shows, its scopes, its keyboard model,
  what selecting a hit does, how it paints and bounds results, its empty states, and what it
  offers assistive technology.

### Modified Capabilities

_None._ The renderer extraction changes no requirement; `backlinks-footer`'s rendering
requirements keep holding, on the shared module.

## Non-goals

- Fuzziness, word splitting, quoted phrases, exclusion, ancestor operators, or ranking. The
  grammar is the matcher's, and this change adds nothing to it.
- Showing a hit's children in the palette, or unfolding them there.
- A persistent sidebar view of the same results (`docs/research/search-surfaces`, surface D).
- Any coupling to Obsidian's native search pane, including handing a query to it.
- Suppressing a lineage row whose first ancestor repeats the note's name. Recorded in
  `docs/research/search-surfaces` as a question for the shared renderer, not settled here.
- A default hotkey.

## Impact

- **New**: `src/plugin/search-palette.ts` (the modal, its keyboard model, the open-and-zoom
  route), `src/plugin/lineage-list.ts` (the group head and the rows, extracted from the footer,
  one level above the `lineage-row.ts` that `lineage-text-rendering` already shares),
  `src/plugin/vault-search.ts` (the progressive vault-wide search over the shared tree cache),
  a `search-palette` spec, `e2e/specs/45-search-palette.e2e.ts`, `styles/70-search-palette.css`,
  `styles/15-lineage-list.css` (the row rules both surfaces share, out of the footer's part).
- **Modified**: `src/plugin/backlinks-footer.ts` (calls the shared list renderer),
  `src/plugin/lineage-row.ts` (takes the segment-level helpers the trail already imports from the
  footer), `src/plugin/zoom-trail.ts` (those imports change module), `src/plugin/footer-model.ts`
  (a descendant-depth option, so the palette can ask for none), `src/plugin/backlink-index.ts`
  (exposes the `SourceTreeCache` it owns, so the index and the search share one),
  `styles/20-backlinks-footer.css` (keeps the footer's placement, gives up the row rules),
  `src/plugin/main.ts` (the command).
- **Measurement before design is final**: the cold whole-vault read inside Obsidian on a large
  vault, recorded in `docs/research/search-surfaces` (open question 1).

## Sequencing

Stacked on `search-hits-and-footer-content-filter`: it reads that change's matcher and hit
model, and rewrites the footer file that change also edits. The two are one unit of work. The
in-note filter and the sidebar view come after, off `main`.
