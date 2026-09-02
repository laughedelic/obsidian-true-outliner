# Structured backlinks: prior art, API constraints, and design decisions

The backlinks layer named in the README's vision and deferred as post-v1 in
[04-open-questions.md](04-open-questions.md) (Q10). This doc records what the reference
outliners do, what Obsidian's public API actually permits, and the decisions taken in the
design round that produced the interactive prototype. It is a **pre-change** record: once a
change exists, its specs are the source of truth for behavior.

## What the feature is

Obsidian's core backlinks show a **matched line**. A structured backlinks view shows the
**referencing node in its tree**: the path that leads to it, and the subtree hanging off it.
The gap is context, and core has none of it — no ancestry, no descendants, only optional
±N raw lines.

The distinction the reference apps draw is between *bi-directional linking* (Obsidian has
this) and *bi-directional outlining* (Roam, Logseq, Tana, Orca): the references section is
not a report about other pages, it is those pages' structure, shown here.

## Prior art

Every implementation is the same three-layer sandwich — grouping (which file), context
(where in that file's tree), substance (the node and its children) — and they differ only
in what they put in each layer.

| | Grouping | Context | Substance | Editable |
| --- | --- | --- | --- | --- |
| Roam | by page, collapsible, filterable | horizontal breadcrumb of ancestor blocks | block + children (collapsed) | yes, fully |
| Logseq | by page, collapsible | horizontal breadcrumb, repeated per match | block + children (expanded) | yes, fully |
| Tana | "References" per *node* | breadcrumb on expand | the reference *is* a mirror | yes (mirror semantics) |
| Workflowy | "Backlinks" at the bottom of the linked node | bullet path | the referencing bullet | yes |
| Orca | block-level, its whole positioning | breadcrumb | block | yes |
| Obsidian core | by file, collapsible | **none** (optional ±N raw lines) | the matching *line* | no |
| influx | by file | ancestor bullets | block + children, rendered md | no |
| better-search-views | by file | breadcrumb + children | rendered md | no |
| coalesce | by file | configurable | rendered md | no |

Three findings carry into our design:

- **Nobody in the Obsidian ecosystem has done the editable half.** Roam and Logseq's actual
  differentiator is that the references section is a live editing surface into other files.
  [02-obsidian-plugin-landscape.md](02-obsidian-plugin-landscape.md) already flags this as
  the open opportunity; we deliberately do not take it in the first cut (D2).
- **Tana collapses backlinks and mirrors into one primitive** — a reference *is* a mirror of
  the node. Worth keeping the data model shaped so mirrors can later be a rendering mode of
  it rather than a second feature.
- **Everyone who patches core panes breaks; everyone who renders their own view survives.**
  `better-search-views` monkey-patches `Component.addChild`, the search DOM's `addResult`
  and `renderContentMatches`; its own README warns it breaks on Obsidian updates, which it
  periodically does. `coalesce` injects into `.markdown-preview-section` and then fights
  Obsidian's inline styles with a `MutationObserver` that strips `padding-bottom` and
  `min-height` as Obsidian re-adds them, plus an `!important` style block and an
  orphaned-container sweeper. Both are the cost of appending to a view we do not own.

## What Obsidian permits (verified against `obsidian.d.ts` 1.13.1)

**The core backlinks feature has no public surface at all.** `grep -i backlink` over the
public typings returns zero matches: not the pane, not the in-document section, not
`getBacklinksForFile`, not the view type, not a settings hook. There is nothing to subclass,
extend, decorate, or read. Replacing or extending it is therefore off the table, exactly as
Q10 assumed.

Everything the feature needs is nonetheless public:

| Need | Public API |
| --- | --- |
| Reverse index (who links here) | `metadataCache.resolvedLinks` + our own reverse map |
| Where in the source file | `getFileCache(f).links` / `.embeds` / `.frontmatterLinks` (`ReferenceCache.position`) |
| Resolve `Note#Heading` / `Note#^id` | `parseLinktext`, `getLinkpath`, `getFirstLinkpathDest`, `resolveSubpath` |
| Invalidation | `metadataCache.on('changed' \| 'resolve' \| 'resolved' \| 'deleted')` |
| Read source text | `vault.cachedRead(file)` |
| Render node content | `MarkdownRenderer.render(app, md, el, sourcePath, component)` |
| Navigate on click | `workspace.openLinkText(...)` |
| Hover preview | `registerHoverLinkSource` |
| An in-document footer in the editing view | `registerEditorExtension` + `Decoration.widget({block: true})` at `state.doc.length`, `side: -1`, **provided from a `StateField`** — CodeMirror rejects block decorations from a `ViewPlugin` (measured: docs/research/17, S1) |

The block-widget footer is proven: `influx` anchors exactly that way, from a `StateField`
(`src/cm6/StatefulDecorationSet.tsx` — the class name says so, and S1 later found out the hard
way that the field is not incidental). It needs no private API — influx's
`(window as any).influxPlugin` exists only because it builds the extension outside the
plugin instance, which we already avoid.

The one thing genuinely unavailable is **an Obsidian-quality editable editor inside our own
DOM**. There is no public API to instantiate a `MarkdownEditView` or embedded editor; native
embeds render read-only (the "Embed Editor" plugin exists solely to bolt a floating source
editor onto them). Our own [nested-editor.ts](../../src/plugin/nested-editor.ts) documents
Obsidian's internal version of this — a nested CM6 instance inside a table-cell widget. We
can detect those; we cannot create them. This is the constraint that makes read-only the
right first cut rather than merely the cheap one.

## Decisions

### D1. Surface: in-document footer first, sidebar pane deferred

Q10 is answered: **footer**. Full note width gives the tree room, and it matches the
Logseq/Roam/Tana muscle memory of references living at the bottom of the page. The sidebar
pane is the same component in a narrower frame and can follow once the footer has been lived
with; it is the only surface that could ever do node-scoped references, which is itself
deferred (D13).

The cost the footer carries and the pane would not: it lives inside a CM6 editor governed by
`content-space-caret`, `progressive-select-all` and `caret-placement-policy`. A block widget
at `doc.length` has to coexist with all three.

Reading view is a separate code path (`registerMarkdownPostProcessor`) and is not in the
first cut.

### D2. Read-only

No in-place editing of referencing blocks. Editing needs either a nested Obsidian editor
(not public) or a click-to-swap CM6 editor plus write-back through `Editor` / `vault.process`
— the highest-risk surface in the plugin. Read-only plus click-to-open already beats
everything in the ecosystem.

### D3. Result shape: pruned projection

A result is **the source note's tree, pruned to the root-paths that contain a reference**,
plus each referencing node's own subtree. One definition, no special cases. Two references
in one note share their common ancestors instead of repeating a breadcrumb each, which is
what every prior implementation does and what an outliner should not.

This generalises: pruning is the same operation as filtered search, and a close cousin of
zoom. Whether "pruned tree projection" becomes a shared primitive is an open question (Q3
below), but the shape is decided.

### D4. Lineage is squashed, not laddered

Single-child runs in the pruned tree collapse into one lineage line; the tree splits only
where it branches — the rule IDE file explorers use for unambiguous directory paths.

The rule applies **recursively, to every sub-branch**, not just to the common prefix. A
branch node is absorbed as the last segment of the lineage that reaches it, and each arm
below then squashes on its own:

```
    source tree                       rendered
    - a                               a › b
      - b                               • [[x]] first mention
        - [[x]] first mention           c › d
        - c                               • [[x]] second mention
          - d                           e › f › g
            - [[x]] second mention        • [[x]] third mention
        - e
          - f
            - g
              - [[x]] third mention
```

A one-segment lineage (a lone ancestor, or a branch node with nothing to absorb) renders in
the same dim, kind-marked lineage style as a long one — lineage always looks like lineage.
The note's own H1 is an ordinary segment; nothing about the root is special-cased.

**Markers are notation, not emphasis.** A node's marker says what kind of node it is and
nothing else, so it is drawn identically on a lineage segment and on a reference — same glyph,
same size, same colour. Only the *text* separates them: lineage is smaller and dimmer, the
reference reads at full weight. An earlier draft accented the reference's marker and shrank the
lineage's; both made the marker carry emphasis it has no business carrying.

Measured on the prototype's deep case: ladder costs 4 rows and 72px of indent, squashed
costs 2 rows and 24px.

Lineage renders **verbatim** — no abbreviation. Segment-level elision was prototyped and rejected
for the default: clipping every segment shows a little of each ancestor and enough of none. The
line is inline text, so it wraps like prose rather than breaking per segment, and a pathological
case is handled by wrapping rather than by hiding text. If real vaults produce lineages that wrap
badly, the fallback is eliding **only** segments past a generous threshold (~60 characters), which
leaves short ancestors intact; that variant is kept in the prototype.

The lineage line is **clickable**: one click unfolds that note's lineage to the full ladder, and
clicking any ancestor folds it back. Cheap to implement (a per-group flag), and it means squashing
never permanently costs information.

The first segment carries its node's kind marker, so a one-segment lineage still reads as a node
path rather than as a stray dim line.

### D5. Ancestor text is first-line only

A multi-line node contributes only its first line to a lineage. Continuation lines are
context for reading that node, not for identifying it.

### D6. Grouping: one card per source note

Each source note's references render in a bordered, slightly recessed card
(`--color-base-05` on `--color-base-00`). At full note width the identical outline chrome
otherwise makes another note's tree read as part of the current document. The card is the
"this is a fragment of another file" signal.

### D7. Children: one level, then fold

Immediate children of a referencing node render; any child that itself has children renders
collapsed behind **the outline's own fold chevron**, beside the node's marker — not a
bespoke count badge. The affordance a reader already knows from the editor is the affordance
here. This is Logseq's rule and it is
the right default — a paragraph like "Decisions that came out of the review:" is useless
without its children and unreadable with all of them.

### D8. Controls: one header line, filter on demand

The header is a single line: reference count, a filter toggle, and a sort dropdown. Toggling
the filter reveals a second line with a search field and folder chips. Lineage and children
behavior are decided (D4, D7) and therefore are not user-facing toggles.

Folder chips are the cheap half of filtering — derived from the folders present in the
results, no search engine behind them. Free-text filtering over reference content is more
complexity than the first cut justifies.

Chip semantics are **focus-on, not filter-out**: every chip starts deselected, which means no
folder filter at all; selecting one narrows the list to it. A Reset control appears whenever any
filter is active and clears chips and search together. The sort control is a dropdown carrying a
sort icon, not a cycling button — four options should be directly selectable.

### D9. Empty state: a dormant bar

A note with no references shows a single quiet line, "No linked references", rather than
nothing at all. The alternative — rendering no chrome until a reference exists — was
considered and rejected: the bar's presence is what makes the footer's absence elsewhere
legible, and a footer that appears and disappears is more startling than one that is simply
empty.

### D10. Volume: a configurable cap, honest counts

Hub notes in a daily-notes vault produce hundreds of references, each costing a file read and
a parse. Two caps — one per note, one overall — both configurable, with sensible defaults.
The header always reports the true total; truncation is stated at the foot of the list as
*"X references across Y notes not shown"*, with the *Load next Z* action to its left.

Incompleteness is announced **spatially as well as numerically**: an **ellipsis rung** — a row in
the tree's own vocabulary, at the depth the missing nodes would occupy, reading *"3 more"* or
*"93 more notes"* — **plus a fade** dissolving the last card, so the list is visibly running off
rather than ending. A count sentence alone was rejected as too quiet for a section a reader
scrolls past.

**Sharpened by S5: the premise was wrong, the conclusion survives.** This decision opens with
cost — "each costing a file read and a parse" — and S5 measured it: placing all 42 sources of
the hub fixture, 150 references, takes about 2ms, and the header and the group bodies land in
the same frame. There is nothing to cap for performance. The caps are still wanted, but they are
a **legibility** decision — a note should not be buried under four hundred backlinks — and
`backlinks-controls` must choose its defaults on that basis. Choosing them from an imagined read
cost would size them wrongly, and probably far too small.

### D11. First paint: progressive, never skeletal

The reference count and the list of referencing notes are **instant** — they come from
Obsidian's own link index with no file reads. Only the lineage requires reading and parsing
each referencing note. So the first paint shows real information (note names, per-note
counts) and fills lineage in per note as it resolves. No skeleton placeholder blocks: they
show fake structure where real structure is already known.

Groups hold their vertical space as they resolve so the document below the cursor does not
jump.

**Sharpened by S5: progressive paint buys no wall clock, and is still right.** At the measured
2ms for a hub note, the header and the bodies arrive in the same frame — there is no perceptible
staging to observe, and the mechanism saves nothing a reader could time. What it buys is the
guarantee that the footer NEVER shows a count without the rows that justify it, and never
fabricates a row while resolving. That is a correctness property, not a speed one, and it is
what the e2e assertion holds. The architecture stays; only the reason for it changes.

### D12. Coexistence with core backlinks: hide by default, setting to keep both

Obsidian's core Backlinks plugin has "Show backlinks at the bottom of notes", on for many
users, producing a second footer over the same references with no lineage. We cannot read
that setting, extend it, or turn it off through public API — but our own stylesheet can hide
the core section. Default: hidden. A plugin setting restores it for users who want both.

Detect-and-defer was considered and is not implementable.

### D13. Node-level references: deferred, and folded into zoom

Deferred, but recorded so it is not re-derived:

- **Zoom carries the footer.** Once a node can be zoomed into, the same footer renders below
  it scoped to that node. No new surface, no new interaction.
- **A count decoration on the anchor.** A heading is addressable as `[[Note#Heading]]` with
  **no block id and no file pollution** — node-level backlinks come free for every heading in
  the vault, and for any block once it carries a `^id`. The count for both is already in
  Obsidian's index, cheap enough to hang off the node's anchor as one more decoration
  (`^legal-followup ⌁1`, fused into the anchor chip rather than floating beside it).

Heading identity survives the outliner's own heading regime: promote/demote changes level,
not text, so `[[Note#Heading]]` keeps resolving.

### D14. Reference kinds: four, filterable

Four kinds of reference, all of them in the footer, each filterable:

- **Note** `[[Note]]` — addresses the note as a whole.
- **Anchor** `[[Note#Heading]]`, `[[Note#^id]]` — addresses a *node inside* the note. This is
  the split worth having: an anchor reference is evidence someone pointed at a specific place,
  which is exactly what node-level backlinks (D13) will later act on.
- **Embed** `![[Note#^id]]` — marked with a small `embed` tag so a transclusion is not read as
  a mention.
- **Property** `project: "[[Note]]"` — no position in the block tree at all, so it gets its own
  row kind: no lineage, no indent, the property name in a monospace chip beside the link.
  Honest about being metadata rather than faking a place in the outline.

Naming is provisional. "Note / Anchor" was chosen over "Mentions / Blocks" because *anchor* is
exactly what the `#…` part of a link is, and because "block" over-claims — a heading reference
is not a block reference. "Note / Node" is the most native pair to this plugin but the two words
are near-identical at 11px. The taxonomy also flattens two axes (what a reference targets vs how
it is written — an embed can itself be note- or anchor-targeted); acceptable for four chips,
revisit if it starts lying.

The filter row carries these chips beside the folder chips, same focus-on semantics, but
**deliberately different in shape**: folders are round pills (a *where*), reference kinds are
square icon-led chips (a *what*), split by a divider.

An alias renders as written — `[[Maya Lindqvist|Maya]]` shows *Maya* — because the row shows
the source node's own text verbatim, which is the whole point of the feature.

### D15. Default sort: recently modified

Recency first. A **chronological** mode — filter to daily notes, sort by the note's name
parsed as a date rather than by file mtime — is a recognised want for journal-heavy vaults
and is deferred, not rejected.

### D16. Unlinked mentions: out of scope

Core already has them, they are expensive, and they have no tree structure to show.

### D17. Pruned projection is a shared function, not a shared renderer

Backlinks, zoom and filtered search all want the same tree algebra: keep a subset of nodes plus
the paths that reach them, then squash single-child runs. That belongs in the mapping core as a
pure function over `OutlineNode`, beside `select-extend.ts` and `escalate.ts`, unit-testable
with no editor.

What is deliberately **not** shared is the rendering. Zoom hides lines in the live CM6 document
via replace-decorations; backlinks renders other files into our own DOM. They have the algebra
in common and nothing else, and unifying the presentation is the expensive mistake available
here. Build the function generically, keep the surfaces apart, and do not generalise further
until a second consumer actually exists.

### D18. Content is notation, not reproduction

**Revises nothing above; supplies what the exploration never asked.** Every decision to this
point is about STRUCTURE — which nodes appear, at what depth, in what order, with which marker.
None of them says what a row's own content should look like, and that silence is what let the
first implementation answer "whatever Obsidian's reading-mode renderer returns."

Reproduction is the wrong answer, and the reason is already in D4: **a marker is notation.** It
says what kind of node this is. Rendering the kind's own typography as well — a heading at
heading size, a callout in its coloured box, a table with its frame, a quote with its bar — says
the same thing a second time, louder, in a channel the reader reads first. The result stops
reading as an index of mentions and starts reading as a scrapbook of other documents'
fragments. Measured on `Backlinks/Kinds gallery.md`, and confirmed against a working prototype
of the alternative.

So: **the footer's chrome carries structure; a row's content is inline markdown only.** Links,
emphasis, code spans, tags, math — everything that lives *inside* a line. Nothing block-level
ever enters a row. Block syntax is stripped before the content is handed to the renderer, so the
renderer is never asked for a document in the first place.

Two things move from content into notation, because they are neither presentation nor prose:

- **A task's checkbox replaces its bullet.** Checked-ness is state the reader is looking for, and
  it belongs where the kind is said. A checkbox nested *inside* a bullet — what the reproduction
  model produced — says "list item containing a checkbox", which is not what a task is.
- **An ordered item's number replaces its bullet**, drawn on the outline grid the editor's own
  ordered markers use.

What each kind shows, decided against the prototype:

| Kind | Row content |
| --- | --- |
| paragraph, heading, quote | the node's lines, block syntax stripped, joined into one flowing row — they are continuations of one thought |
| list item | the item's text; the bullet is the marker |
| ordered item | the item's text; the NUMBER is the marker |
| task | the item's text; the CHECKBOX is the marker, in the bullet's place |
| callout | the callout's title, with the `[!type]` token dropped — the marker already says callout. When the reference sits in the body rather than the title, the body line instead |
| code | the line the reference sits on, monospaced. Lines in a fence are separate records, not continuations |
| table | the cell the reference is in, and nothing else. The header row was tried first — a bare value seems to need its column name — and in place it was the noisiest row in the footer: two rows of pipe-separated fields to say that one cell mentions the note. A cell is the smallest thing that can hold a reference, and quoting it is the promise every other kind's row makes. The cell is found by the reference's own TEXT, since a row can hold several links |
| html | the block's text content, as plain text — Obsidian does not resolve wikilinks inside an HTML block, so rendering it as markdown would only pretend |
| hr | marker only; there is no text |

**Why the initial exploration missed this.** The prototype it was designed against was a mockup:
its rows held text the designer wrote, so the question "what happens when real markdown of every
kind passes through" never arose. It only becomes visible once a real corpus renders, which is
what `Kinds gallery` exists for now.

**Consequence for reading mode.** Doc 20 claimed the footer's per-kind rendering work was the
reading-mode rendering problem solved once. That was wrong and is corrected there: reading mode
must be faithful, because it *is* the document, while the footer must not be. What the two
genuinely share is the chrome contract in `chrome-line.ts` — depth, guides, markers, the column.

### D19. A lineage names every ancestor, and nothing stands between them

**Revises D4's application to a collapsed chain.** D4 settled that a marker is notation, and a
chain took one — its *first* element's. On a two-element chain that is harmless. Deeper, it is
misleading in a specific way: the marker names the top of the trail while the reader is trying
to see what the mention hangs off, which is the *last* element. A four-deep chain under a
heading reported "heading" and said nothing about the list item the mention actually sat in.

Picking the last element instead would have fixed that case and broken the mirror one. The
answer is that a collapsed chain is several ancestors on one line, so it needs several marks:
**every element carries its own kind's marker.** The first element's is the row marker already
in the gutter; the rest are drawn inline, immediately before the text they name. Nothing is
picked, so nothing is misreported.

Four consequences follow, and they are one decision rather than four preferences:

- **No separator.** A chevron divided the names when they were bare words. With an icon leading
  every name, two marks sit between each pair and only one of them carries information. Space
  alone divides them — the width the chevron's own margins held, so the chain's rhythm is
  unchanged.
- **One size, smaller than the editor's.** At the editor's `0.85rem` a four-deep trail reads as
  a row of buttons. Every mark in the footer is `0.8em` of its row instead, which is also the
  inline icons' size, so the two agree by construction rather than by two numbers kept in step.
  The marker's *centre* is anchored independently of its size, so the column does not move —
  but only because the placement arithmetic reads the size property rather than the literal
  (`MARKER_ICON_VAR`; spelled as a literal, the centre drifts by half the delta, and the result
  looks like a marker beside some text either way).
- **Muted, not faint.** A `0.8em` mark at `--text-faint` is below reading. Applied footer-wide
  and never to lineage alone: D4 forbids a marker encoding emphasis, so a lineage element and a
  reference of the same kind stay identically drawn, and the text carries the difference.
- **No guide lines.** The stripes crowded a body that is only ever a few rows deep, and with a
  mark now on every segment they competed with the notation. Indentation carries depth here.
  The footer is a quotation of a tree, not the tree.

Chosen against real fixture content at the footer's true geometry, by rendering the
alternatives — every-segment, last-only, row-marker-takes-the-last, and none-at-all — side by
side and looking, in both themes. Not by argument.

**Configurability is deferred, deliberately.** Each of these is a plausible setting, and
`backlinks-controls` is where the three worth having go (segment icons, separator, guide lines).
Shipping them here would have meant designing a settings surface before the default it varies
had been chosen. The colour and spacing knobs are not planned as settings at all: the chrome
contract publishes `--to-*` custom properties, so a CSS snippet already covers them.

## Open questions

All three are now answered — by the spike series
([19](19-backlinks-footer-spikes.md)) and by building the change. Kept with their answers
rather than deleted, since two of them were answered differently from how they were asked.

1. ~~**Footer collapse state** — per note, global, or not persisted?~~ **Per note, and not
   persisted past the tab.** What a reader unfolded is about the reading they are doing, not
   about the note: a group opened while chasing one question should not still be open a week
   later. Keyed to the tab rather than to the session, because closing a tab is the moment a
   reader means "done with that", and pruned on layout change.
2. ~~**The CM6 interaction budget.**~~ **Answered by S1, and it cost one mechanism correction
   rather than a redesign.** The widget changes no observable caret placement, selection
   escalation or structural operation — but block decorations must come from a `StateField`,
   which CodeMirror enforces, and a field then needs its own invalidation bridge because it
   never sees the no-op transaction the shared mode-toggle nudge produces (S2).
3. ~~**Two renderers.**~~ **Asked wrongly, and S4 says so.** The premise — that the chrome needs
   refactoring into "surface-neutral tokens plus surface-specific scoping" — assumed the tokens
   were the shared thing. They are not: the editor computes almost no geometry in JS, so a
   surface holding only the vocabulary writes its own layout rules and diverges. What is shared
   is the fact→(class, custom properties) CONTRACT, now `src/plugin/chrome-line.ts`, which both
   surfaces call. S6 then confirmed the two alternatives to consuming it — a markdown list, and
   a real CodeMirror per group — are both worse.

## Prototype

The design decisions above were taken against an interactive prototype rendered in Obsidian's
own visual vocabulary (1.13.3 dark palette, the plugin's `--to-decor-unit` /
`--to-marker-gutter` geometry and marker icon set) using real notes from `test-vault/`.
It carries the footer, a lineage-rule comparison, the scale and edge-case states, and the two
deferred surfaces.
