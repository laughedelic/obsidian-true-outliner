## Context

The prototype that settled the shell is described, with screenshots, in
`docs/research/search-surfaces` ("The palette prototype"); its source is under
`docs/research/prototypes/search-palette/`. This design turns it into a feature, and differs from
it in four places named below: the renderer is shared rather than copied, the tree cache is the
plugin's rather than a second one, the editor view is reached through the registry rather than a
private cast, and the row model is asked for no descendants rather than having them filtered out.

What this design builds on:

- `search-hits-and-footer-content-filter` gives `matchNodes(doc, query)` and a row model that
  speaks of hits.
- The footer's rows are drawn by `FooterController.renderRow` and its marker helpers in
  `backlinks-footer.ts`; the lineage row is already a shared primitive (`lineage-row.ts`) that
  the zoom trail also calls, and the trail imports `renderInline` and the segment glyphs from the
  footer module for want of a better home.
- Commands reach a live `EditorView` through `view-registry.ts`'s `viewFor(info)`, which is how
  the zoom commands are routed (`outline-zoom` design D5). `plugin-shell` forbids the
  `(editor as any).cm` cast the prototype used.
- Zoom is entered by dispatching the `zoomTo` effect with the root's start offset, and is gated
  on outline mode and on not being inside a nested editor (`outline-zoom`).
- `buildRows` emits one level of descendants for every match, as a module constant.

## Goals / Non-Goals

**Goals:**

- One renderer for a grouped lineage list, called by the footer and the palette.
- A palette whose keyboard model is over hits, with the shell's look and none of its internals.
- Landing on a hit through the same public route the zoom commands use.
- First paint that never waits for the last note.

**Non-Goals:**

- Ranking, or any change to the matcher.
- Persisting the palette's state between openings, beyond what a modal keeps while open.
- Reading-mode surfaces.

## Decisions

### D1. A custom `Modal`, not `SuggestModal`

Decided in `docs/research/search-surfaces` ("SuggestModal versus Modal") against the two shells
built there; not restated. The shell borrows Obsidian's `prompt`, `prompt-input-container`,
`prompt-results` and `prompt-instructions` classes so it sits and sizes like the Quick Switcher,
and removes the dialog chrome (`modal-header`, the close button) a `Modal` starts with.

### D2. The renderer is extracted, not copied

One level of this sharing already exists. `lineage-text-rendering` extracted the squashed
ancestor chain itself into `src/plugin/lineage-row.ts`, which the footer and zoom's breadcrumb
trail both render through; what it deliberately left with each surface is the row element, its
chrome, and what a segment does when activated. This change takes the level above it.

`src/plugin/lineage-list.ts` receives what the prototype duplicated from the footer and
`lineage-row.ts` does not hold: the group head, `renderRow` for the three row types, `markerFor` /
`markerSlot` / `ordinalMarker`, the glyphs, `renderInline` and `unwrapBlocks`, and the
match-marking walk from `search-hits-and-footer-content-filter`. Its callers are the footer and
the palette; the trail is not one, because it draws a single chain rather than a list of rows, and
it goes on calling `lineage-row.ts` directly. What differs per surface is passed as options —
whether a node row gets a fold control, whether media renders, what a click does — because the
chrome contract is the shared thing and the content rules are not
(`docs/research/surfaces-and-embedding`, "The two renderers"). The footer's own CSS scope
(`.to-backlinks`) becomes the list's scope, so the palette inherits every row rule by wrapping its
results in it.

Appearance is the footer's too: the rows read `backlinksSegmentIcons` and `backlinksSeparator`
rather than declaring a second pair, the way `lineage-row.ts` already has the trail read them.
One choice governs every surface that draws a lineage, which is the point of the extraction.

Alternative: leave the footer alone and keep the prototype's copy. Rejected: a marker or a
segment rule fixed in one would silently diverge in the other, which is the defect class
`docs/research/surfaces-and-embedding` records for two surfaces — and the same reasoning already
settled the level below.

### D3. The row model is asked for no descendants

`buildRows` gains a `descendantDepth` option, defaulting to the footer's one level; the palette
passes zero and renders every row that comes back.

Filtering afterwards — the prototype's rule, keep the lineage rows and the node rows that are
hits — is not the same result. The row model puts the nodes BETWEEN two hits on screen as plain
node rows, so a hit nested under a non-matching ancestor is not left indented under nothing, and
a hit-or-lineage filter discards exactly those rows:

    zero descendants            the prototype's filter
    ~ Heading                   ~ Heading
      * alpha TARGET              * alpha TARGET
        . middle node                 * beta TARGET
          * beta TARGET

The filter also pays for a level of descendant rows, and the fold counts computed over them,
that nothing keeps.

### D4. One tree cache

`SourceTreeCache` is already its own module (`src/plugin/source-tree-cache.ts`), constructed by
the backlink index and keyed on path plus mtime. The vault search reads that same instance —
`get(file)` as it stands — rather than holding a second, so a note parsed for the footer is not
parsed again for the palette and vice versa. The index exposes the instance it owns; nothing about
the cache itself changes. A second cache — what the prototype did — doubles memory for every note
both surfaces touch.

### D5. Progressive, generation-guarded search that yields

`vault-search.ts` walks `vault.getMarkdownFiles()` sorted by modification time, most recent
first, resolving each tree through the cache and calling back per note with hits, yielding to the
event loop every few files so typing stays responsive during a cold sweep. Sorted BEFORE the
sweep, not after it: `mtime` is on the `TFile` and costs no read, and taking the order first is
what lets a progressive paint append each group in its final place. The prototype sorted its
groups at the end because it painted once, at the end; sorting late here would either move rows
already on screen or leave the cap admitting whichever notes resolved first rather than the most
recently modified ones. A generation counter, bumped on every query or scope change,
makes a stale callback a no-op. The cap is on groups; the walk continues past it only to count,
so the tail's number is true (`backlink-filtering`'s totals rule, applied here).

The cold sweep is the one unmeasured cost (`docs/research/search-surfaces`, open question 1). The
first task measures it in the application on a vault of a few thousand notes and records the
figure. If it is seconds rather than tens of milliseconds, the mitigation is to warm the cache in
the background after layout is ready rather than at first open; the design does not change.

### D6. Landing on a hit goes through the registry

Open via `workspace.openLinkText(path, '', newLeaf)`; take the active `MarkdownView`; place the
caret with the public `Editor` API and scroll it into view; then `viewFor(view)` for the
`EditorView`, and dispatch `zoomTo` only if that state is in outline mode. No private member is
touched. The zoom root is the hit when it has children, and its parent when it does not — a
zoomed single line is the finding recorded in `docs/research/search-surfaces` ("What the prototype
surfaced") — and the caret stays on the hit either way. A childless hit with no parent, a
top-level node or one in the preamble, opens the note unzoomed: the same rule, applied where the
only alternatives are a zoom to one line and no zoom at all.

Alternative: switch the tab into outline mode when it is not, so a hit always opens zoomed.
Rejected for now: the mode is a per-tab reader choice (`outline-mode`), and a search should not
flip it. Recorded as the alternative to revisit if readers ask.

### D7. Scope is the note the palette opened from

Captured at open time as `workspace.getActiveFile()`; absent when there is none, in which case the
toggle is inert. Tab is the toggle key because both prior-art palettes that offer the hop use it
(`docs/research/search-surfaces`, survey: Omnisearch, RemNote) and a modal has no other use for
it.

### D8. Keys through the modal's `Scope`, roles on the DOM

Arrows, the modified arrows, Enter with its modifiers and Tab are registered on the modal's own
`Scope`, which Obsidian pushes while the modal is open and pops when it closes. The field
carries `role="combobox"` with `aria-activedescendant` naming the active hit's row id; the
results container is the `listbox` and each hit row an `option`. Lineage rows are presentation.

### D9. Minimum query length, no debounce

A one-character query matches nearly every node and paints a wall; two characters is the floor,
as in the prototype. No debounce: the measured cost does not need one and the generation guard
already makes a fast typist's intermediate queries free. Added only if the cold-sweep
measurement says so.

### D10. Phone

Obsidian renders a `Modal` full-screen on a phone; the palette keeps that. Hits open on tap,
the instructions row is hidden by the existing phone container query, and the scope toggle is a
tappable chip since there is no Tab key to press.

## Risks / Trade-offs

- [The cold whole-vault read on a large vault] → measured first (task 1.1); background warming
  after layout-ready is the fallback, and the progressive paint means the palette is usable
  while it runs either way.
- [Extracting the footer's renderer regresses the footer or the trail] → the whole `backlinks`
  e2e group and the zoom trail spec run before the palette is built on it; the extraction is its
  own commit.
- [A results DOM for a broad query on a large vault] → the group cap bounds it, and rows render
  markdown lazily as the footer's do.
- [Zooming into a hit whose tab was opened in a new leaf races the view becoming active] →
  `openLinkText` resolves once the leaf is open; the registry lookup is by the resolved view,
  not by "whatever is active now"; a missing view means "opened unzoomed", never a wrong one.
- [The registry has no entry for a view that has not yet mounted its editor extensions] →
  fall back to opening unzoomed, and cover the case in e2e by opening a note that is not yet
  loaded.

## Open Questions

- The cold-sweep figure itself (task 1.1). It decides only whether background warming is added,
  not the shape of anything above.
