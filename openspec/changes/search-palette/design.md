## Context

The prototype that settled the shell is described, with screenshots, in `docs/research/31`
("The palette prototype"); its source is under `docs/research/prototypes/search-palette/`.
This design turns it into a feature, and differs from it in four places named below: the
renderer is shared rather than copied, the tree cache is the plugin's rather than a second one,
the editor view is reached through the registry rather than a private cast, and the row model
is asked for no descendants rather than having them filtered out.

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

- One renderer for a grouped lineage list, called by the footer, the palette and the trail.
- A palette whose keyboard model is over hits, with the shell's look and none of its internals.
- Landing on a hit through the same public route the zoom commands use.
- First paint that never waits for the last note.

**Non-Goals:**

- Ranking, or any change to the matcher.
- Persisting the palette's state between openings, beyond what a modal keeps while open.
- Reading-mode surfaces.

## Decisions

### D1. A custom `Modal`, not `SuggestModal`

Decided in `docs/research/31` ("SuggestModal versus Modal") against the two shells built there;
not restated. The shell borrows Obsidian's `prompt`, `prompt-input-container`, `prompt-results`
and `prompt-instructions` classes so it sits and sizes like the Quick Switcher, and removes the
dialog chrome (`modal-header`, the close button) a `Modal` starts with.

### D2. The renderer is extracted, not copied

`src/plugin/lineage-list.ts` receives what the prototype duplicated from the footer: the group
head, `renderRow` for the three row types, `markerFor` / `markerSlot` / `ordinalMarker`, the
glyphs, `renderInline` and `unwrapBlocks`, and the match-marking walk from
`search-hits-and-footer-content-filter`. The footer, the palette and the trail call it. What
differs per surface is passed as options — whether a node row gets a fold control, whether
media renders, what a click does — because the chrome contract is the shared thing and the
content rules are not (`docs/research/20`, "The two renderers"). The footer's own CSS scope
(`.to-backlinks`) becomes the list's scope, so the palette inherits every row rule by wrapping
its results in it.

Alternative: leave the footer alone and keep the prototype's copy. Rejected: a marker or a
segment rule fixed in one would silently diverge in the other, which is the defect class
`docs/research/20` records for two surfaces.

### D3. The row model is asked for no descendants

`buildRows` gains a `descendantDepth` option, defaulting to the footer's one level; the palette
passes zero. Filtering descendant rows out afterwards, as the prototype did, leaves fold counts
computed for rows that are then dropped.

### D4. One tree cache

The backlink index owns a `SourceTreeCache`; the vault search reads the same one, exposed by the
index as `ensureTree(file)`, so a note parsed for the footer is not parsed again for the palette
and vice versa. A second cache — what the prototype did — doubles memory for every note both
surfaces touch.

### D5. Progressive, generation-guarded search that yields

`vault-search.ts` walks `vault.getMarkdownFiles()`, resolving each tree through the cache and
calling back per note with hits, yielding to the event loop every few files so typing stays
responsive during a cold sweep. A generation counter, bumped on every query or scope change,
makes a stale callback a no-op. The cap is on groups; the walk continues past it only to count,
so the tail's number is true (`backlink-filtering`'s totals rule, applied here).

The cold sweep is the one unmeasured cost (`docs/research/31`, open question 1). The first task
measures it in the application on a vault of a few thousand notes and records the figure. If it
is seconds rather than tens of milliseconds, the mitigation is to warm the cache in the
background after layout is ready rather than at first open; the design does not change.

### D6. Landing on a hit goes through the registry

Open via `workspace.openLinkText(path, '', newLeaf)`; take the active `MarkdownView`; place the
caret with the public `Editor` API and scroll it into view; then `viewFor(view)` for the
`EditorView`, and dispatch `zoomTo` only if that state is in outline mode. No private member is
touched. The zoom root is the hit when it has children, and its parent when it does not — a
zoomed single line is the finding recorded in `docs/research/31` ("What the prototype
surfaced") — and the caret stays on the hit either way.

Alternative: switch the tab into outline mode when it is not, so a hit always opens zoomed.
Rejected for now: the mode is a per-tab reader choice (`outline-mode`), and a search should not
flip it. Recorded as the alternative to revisit if readers ask.

### D7. Scope is the note the palette opened from

Captured at open time as `workspace.getActiveFile()`; absent when there is none, in which case
the toggle is inert. Tab is the toggle key because both prior-art palettes that offer the hop
use it (`docs/research/31`, survey: Omnisearch, RemNote) and a modal has no other use for it.

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
