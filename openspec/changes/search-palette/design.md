## Context

The prototype that settled the shell is described, with screenshots, in
`docs/research/search-surfaces` ("The palette prototype"); its source is under
`docs/research/prototypes/search-palette/`. This design turns it into a feature, and differs from
it in four places named below: the renderer is shared rather than copied, the tree cache is the
plugin's rather than a second one, the editor view is reached through the registry rather than a
private cast, and the row model is asked for no descendants rather than having them filtered out.

What this design builds on:

- `src/search.ts` holds `matchNodes(doc, query)` and `matchRanges(text, query)`, and
  `footer-model.ts`'s rows speak of hits — both landed with
  `search-hits-and-footer-content-filter`.
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

`src/plugin/lineage-list.ts` receives what the prototype duplicated from the footer and is about
a LIST of rows: the group head, `renderRow` for the three row types, `markerFor`, and the
match-marking walk from `search-hits-and-footer-content-filter`. Its callers are the footer and
the palette; the trail is not one, because it draws a single chain rather than a list of rows.
What differs per surface is passed as options, and there are more of them than the three the
shape suggests: `FooterController.renderRow` reaches for the guide settings, the `App`, the owning
`Component`, the active term, the expanded-rows state, the re-render that a fold toggle triggers
and the collector the pending renders are pushed onto, and `renderGroupHead` for the collapsed-
groups state and that same re-render. Eight or nine, then, passed because the chrome contract is
the shared thing and the content rules are not (`docs/research/surfaces-and-embedding`, "The two
renderers"). Whether the palette's groups collapse at all is a question the shared group head has
to be given an answer to; they do not, so it is passed the option saying so.

The rest of what the footer holds goes DOWN rather than across. `renderInline` and `unwrapBlocks`,
`segmentGlyph`, `separatorGlyph`, `segmentMarker`, and the `markerSlot` / `ordinalMarker` /
`checkboxGlyph` primitives beneath them describe one segment or one marker, never a list — and
three of them are what the trail imports from `backlinks-footer.ts` today, for want of a better
home. They join `lineage-row.ts`, the level that matches them and the one the trail already calls,
so the trail's import line changes module and nothing else. `lineage-list.ts` calls down for them
the same way.

The CSS splits the same way. The row rules and the custom properties they rest on move to a scope
both surfaces set — `to-lineage-list`, in its own part under `styles/` — and `.to-backlinks` keeps
only what places the footer under a note: the 4rem top margin and the 1.75rem padding, which are
correct for a section below a document and wrong inside a modal. Wrapping the palette's results in
the footer's own class, as the prototype's styling implied, would hand it that placement to undo
and would make every rule later added to `.to-backlinks` a rule someone has to check against the
palette.

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

What one cache does not do is bound what the sweep leaves behind. `entries` is a plain `Map` with
`forget(path)` and `clear()` and no eviction, and `clearTrees()` has no caller outside the footer's
cost spec — so today the cache holds the notes that reference whatever is open, and after this
change one whole-vault sweep pins a parsed tree for every markdown file for the rest of the
session. That is the same cost in either design, and it is the figure task 1.1 records beside the
timings: retained heap after the sweep, on the same vault. A bound belongs here only if that
figure says so, and the choice then is an LRU over the map or dropping the palette's own
additions when it closes.

### D5. Progressive, generation-guarded search that yields

`vault-search.ts` walks `vault.getMarkdownFiles()` sorted by modification time, most recent
first, resolving each tree through the cache and calling back per note with hits, yielding to the
event loop every few files so typing stays responsive during a cold sweep. Sorted BEFORE the
sweep, not after it: `mtime` is on the `TFile` and costs no read, and taking the order first is
what lets a progressive paint append each group in its final place. The prototype sorted its
groups at the end because it painted once, at the end; sorting late here would either move rows
already on screen or leave the cap admitting whichever notes resolved first rather than the most
recently modified ones. A generation counter, bumped on every query or scope change, is checked
at every yield point and ends the walk there — not only silenced at the callback. Silencing the
callback alone leaves a superseded sweep reading and parsing to the end, so a fast typist has one
whole-vault sweep in flight per keystroke, which is the opposite of what the guard is for. The cap
is on groups; the walk continues past it only to count, so the tail's number is true
(`backlink-filtering`'s totals rule, applied here).

The callback carries a hit per node rather than a bare id. `matchNodes` answers with ids, and a
row's text is `nodeContent(node, hitOf(node))`, whose per-kind rule needs to be told WHICH line the
hit is on: with nothing passed, a fence shows its first non-fence line, a table its first cell and
a callout its title — so a hit anywhere else in one of those nodes renders text the query does not
appear in, and the palette shows a hit with nothing marked. The search therefore reports, per
matching node, the index of the first of its own lines that `matchRanges` finds the term in, and
that occurrence as written; `matchRanges` is already exported beside `matchNodes`, so this reads
the matcher rather than changing it. The text as written and not the query itself, because
`tableTextOf` picks its cell with a case-SENSITIVE `includes`.

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
surfaced") — and the caret stays on the hit either way. A childless top-level hit has no parent
to take, and opens the note unzoomed: the same rule, applied where the only alternatives are a
zoom to one line and no zoom at all.

Alternative: switch the tab into outline mode when it is not, so a hit always opens zoomed.
Rejected for now: the mode is a per-tab reader choice (`outline-mode`), and a search should not
flip it. Recorded as the alternative to revisit if readers ask.

### D7. Scope is the note the palette opened from

Captured at open time as `getActiveViewOfType(MarkdownView)?.file`, not `getActiveFile()`: that
one "will return the most recently active file" when the current view is not a `FileView`, so from
the graph view the palette would offer to narrow to whichever note was open last, and from a canvas
or a PDF to a file it cannot parse. Absent when there is none, in which case neither the key nor
the control is offered. Tab is the toggle key because both prior-art palettes
that offer the hop use it (`docs/research/search-surfaces`, survey: Omnisearch, RemNote) and a
modal has no other use for it.

The control stands in for that key where there is no key. It is in the input row in both scopes,
with two appearances: while the vault is active it reads "This note" and carries the key's own
glyph, an offer rather than a label; once narrowed it becomes the chip naming the note, with the
way back on it. Showing it only when narrowed — the prototype's shape — leaves a phone with nothing to tap in
the scope it opens in, which is to say no way to reach the narrowed scope at all. Labelling the default instead ("Vault") fills the row
to report that nothing has changed.

### D8. Keys through the modal's `Scope`, roles on the DOM

Arrows, the modified arrows, Enter with its modifiers and Tab are registered on the modal's own
`Scope`, which Obsidian pushes while the modal is open and pops when it closes. The field
carries `role="combobox"` with `aria-activedescendant` naming the active hit's row id; the
results container is the `listbox` and each hit row an `option`. Lineage rows are presentation.

The ends stop rather than wrap. The prototype wrapped, which reads fine over a handful of hits
and badly over a capped list of many groups: the move from the last hit to the first scrolls the
whole results area, and looks the same as a move by one row (`docs/research/search-surfaces`,
"What the prototype surfaced", where the note asked for the stop).

### D9. Minimum query length, no debounce

A one-character query matches nearly every node and paints a wall; two characters is the floor,
as in the prototype. No debounce: the generation guard ends a superseded walk at its next yield
(D5), so an intermediate query costs the files read before the next keystroke rather than a whole
sweep. The only figure in hand is the prototype's, over 149 notes; task 1.1 measures the vault
this is designed for, and a debounce is added if that figure asks for one.

### D10. Phone

Obsidian renders a `Modal` full-screen on a phone; the palette keeps that. Hits open on tap, and
the instructions row is hidden by a container query the palette declares over its own shell — the
footer's `@container` rule is on `.to-backlinks` and switches its own compact labels, so there is
nothing here to inherit. That the hints can be hidden is the second reason the scope control
carries the key's glyph rather than relying on them to name it, and the first reason it is present
in both scopes (D7).

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
  the leaf is taken from `getLeaf(newLeaf)` and opened with `leaf.openFile(file)`, so the view is
  in hand rather than read back off "whatever is active now" — `openLinkText` answers
  `Promise<void>` and hands back neither. A wrong view is therefore impossible; a view the
  registry has not yet seen is the open question below.
- [The registry has no entry for a view that has not yet mounted its editor extensions] →
  fall back to opening unzoomed, and cover the case in e2e by opening a note that is not yet
  loaded.

## Open Questions

- The cold-sweep figure itself (task 1.1). It decides only whether background warming is added,
  not the shape of anything above.
