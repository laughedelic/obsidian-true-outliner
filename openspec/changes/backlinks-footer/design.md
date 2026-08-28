## Context

See proposal.md — Why. The design inputs that constrain the approach:

- **A pure fact layer already exists.** `decorate(doc: OutlineDoc): LineDecorationFact[]`
  (`src/plugin/decorate.ts`) is a pure function of the tree. It emits, per line: `depth`,
  `kind`, `isFirstLine`, `isAtom`, `isListItem`, `hasNativeMarker`, `supplementalDepth`,
  `hasChildren`. It knows nothing about CM6. `decorations.ts` is the CM6 consumer that turns
  those facts into line decorations and widgets.
- **The chrome CSS does not.** Every rule in `styles.css` is scoped
  `.markdown-source-view.mod-cm6 .cm-content > .cm-line.to-decor-*`. The geometry is carried
  in custom properties (`--to-decor-unit: 1.5rem`, `--to-marker-gutter: 1.25rem`,
  `--to-marker-icon-size: 0.85rem`, `--to-guide-color`, `--to-decor-accent`) but the selectors
  assume CM6's line DOM.
- **A parse-cache pattern exists.** `parsedDoc()` (`src/plugin/parsed-doc.ts`) is a
  `WeakMap<Text, OutlineDoc>` keyed on CM6's immutable `Text`. Its own doc comment anticipates
  other consumers. The footer parses *other files' strings*, which are not `Text` instances, so
  it needs a sibling with the same shape and a different key.
- **The editor is heavily governed.** `content-space-caret`, `progressive-select-all`,
  `caret-placement-policy`, `node-edit-enforcement` and the transaction filter all hold
  invariants over the document and the caret. A block widget at `doc.length` enters that
  environment.
- **The repo has a method for this kind of risk.** The decoration-experiments series
  (`docs/research/07`–`11`) established: one technique per experiment, isolated; a fixed shared
  fixture corpus screenshotted every time; a mandatory real-vault pass; verdicts recorded before
  moving on; green unit tests are never the gate for anything visual.

## Goals / Non-Goals

**Goals:**

- One derivation of outline chrome. The footer must not compute depth, kind, markers or guide
  columns itself; it consumes `decorate()` on the projected tree.
- The projection algebra is pure, in the mapping core, and tested there — no editor, no DOM.
- The riskiest unknown (block widget vs. the enforcement layer) is measured before anything is
  built on top of it, and can veto the surface.
- Every experiment is falsifiable and leaves a recorded verdict, whether kept or rejected.

**Non-Goals:**

- Sharing a *renderer* between the editor and the footer. They share the fact layer and the
  visual vocabulary; the DOM below that is deliberately separate (D17).
- Generalising the projection beyond this change's needs. Zoom and search are named future
  consumers, not present ones; the function is built generically but not speculatively.
- Reading view. A separate code path, deliberately deferred (D1).

## Decisions

### D-A. The footer renders from `decorate()`, not from its own traversal

The footer's row list is `decorate(projected)` — the same call the editor makes, on a different
tree. Depth, kind, atom/list-item handling and `supplementalDepth` therefore cannot drift
between surfaces; a change to indentation semantics moves both at once.

*Alternative considered*: a footer-local walk over the projected tree emitting its own row
shape. Rejected — it is a second definition of what a line's depth means, and this project's
whole history is a case against two sources of truth for one fact (see the caret-placement
postmortem in `docs/research/04` and `caret-placement-policy`'s Purpose).

*Consequence*: `decorate()` gains a second consumer and must stay free of editor assumptions.
That is what `outline-decorations` is modified for in the proposal.

### D-B. Projection produces a real `OutlineDoc`, not a view model

`project(doc, predicate) → OutlineDoc` returns a tree of the same type, containing the same node
objects where unmodified. That is what lets `decorate()` accept it unchanged.

Lineage squashing is therefore **not** part of the projection — it is a separate pass over the
projected tree that groups runs of single-child, non-matching nodes into a lineage descriptor.
Keeping them apart means projection stays a pure subset operation (easy to state and test:
document order preserved, no synthesised nodes, idempotent) and squashing is a presentational
regrouping that can change without touching it.

*Alternative considered*: one pass emitting a display-ready row list. Rejected — it fuses a
structural guarantee with a presentation rule, and only the structural half is reusable by zoom.

### D-C. CSS splits into surface-neutral tokens and surface-specific scoping

`styles.css` grows a token layer that defines the geometry and colour custom properties without
reference to any surface, and two scoped layers that apply them: the existing
`.markdown-source-view.mod-cm6 .cm-content > .cm-line` rules, and a new footer scope. The
footer's DOM deliberately mirrors the editor's structure (a per-line row with depth applied as
padding/margin per the same `isAtom`/`isListItem` rules) so the two scopes stay legible against
each other.

*Alternative considered*: hosting a bare CM6 `EditorView` in the footer so the existing
selectors apply verbatim. Rejected — it buys selector reuse and costs all of Obsidian's inline
rendering (links, tags, checkboxes render as raw markdown), which is most of what makes a
reference readable. Recorded so it is not re-proposed.

### D-D. Node content is rendered by Obsidian, chrome by us

Each row's text goes through `MarkdownRenderer.render(app, md, el, sourcePath, component)` so
links, tags, checkboxes and formatting render exactly as Obsidian renders them, with
`sourcePath` set to the *referencing* note so relative links resolve correctly. The tree chrome
around it is ours. A `MarkdownRenderChild` per row gives lifecycle for cleanup.

### D-E. The index is a reverse map with a two-level cache

The reverse map is built once at `onLayoutReady` and updated incrementally on
`metadataCache` `changed` / `deleted` and `vault.on('rename')`.

**Enumeration walks `getFileCache` across the vault's markdown files, not `resolvedLinks`**
(revised during implementation; the first draft named `resolvedLinks`). `resolvedLinks` is the
cheaper reverse index, but it reports only counts — not whether a reference was a plain link, an
anchored link, an embed or a frontmatter property, and not where it sits. Every one of those has
to come from `getFileCache` anyway, and that is also an in-memory read, so taking both from the
same place removes a way for the two to disagree. Reference kinds come from
`getFileCache(f).links` / `.embeds` / `.frontmatterLinks`, with `parseLinktext` +
`getFirstLinkpathDest` resolving the destination and separating Note from Anchor.

Source trees are parsed with our own `parse()` from `cachedRead()`, cached by path + mtime —
**not** reconstructed from `CachedMetadata`. The cache could supply hierarchy for free, but it
is Obsidian's tree, not ours: no paragraph-owns-following-list, no atom kinds, no gap ownership.
A second, subtly different tree model is exactly the divergence this project exists to avoid.

### D-F. The spike series runs first and may veto the surface

Built as an experiment series in the shape of `docs/research/07`, with its own hub doc. Each
spike is isolated, run against a shared fixture corpus, given a real-vault pass, and closed with
a recorded verdict before the next begins. The series gates the rest of the change: a negative
verdict on S1 reopens D1 (surface) rather than being worked around.

| # | Question | Method | Verdict gates |
| --- | --- | --- | --- |
| **S1** ✅ | Can a `Decoration.widget({block: true})` at `doc.length` coexist with the enforcement layer? | Minimal widget, no content. Exercise: caret to doc end, `Ctrl/Cmd+End`, `progressive-select-all` ladder, click below last line, arrow-down off the last line, structural ops on the last node, undo/redo across them. Instrument the transaction filter's existing classification stats. | If the widget perturbs caret placement or selection escalation in ways the filter cannot absorb → surface decision (D1) reopens |
| **S2** ✅ | Does the widget survive the editor's lifecycle? | Mode toggle on/off, file switch in the same leaf, split panes on one file, Live Preview ↔ Source toggle, print/export, mobile viewport. Watch for orphaned DOM and duplicate widgets (the failure `coalesce` fights with a `MutationObserver`). | Leaks or duplicates → mechanism changes before rendering work starts |
| **S3** ✅ | Does `decorate()` hold up on a foreign, projected tree? | Feed projections of the fixture corpus through `decorate()` and compare emitted facts against the same notes decorated in the editor. Assert equality of depth/kind/atom/list-item semantics for surviving nodes. | Divergence → D-A is wrong and the fact layer needs a seam before reuse |
| **S4** | What does chrome cost outside `.cm-line`? | Port the guide gradient, marker widget and depth rules to a non-CM6 DOM against the corpus, in both bundled themes. Screenshot every fixture. | Establishes whether D-C's token split is sufficient or the chrome needs restructuring |
| **S5** | What does a real vault cost? | Index build and per-note projection timed on a vault with a hub note of several hundred references. Measure: reverse-map build, `cachedRead` + `parse` per source, projection, first paint. | Sets the cap defaults `backlinks-controls` will need, and tells us whether progressive paint (D11) is sufficient |

Ground rules are inherited verbatim from `docs/research/07` — including that green unit tests
are never the gate for anything visual, and that the real-vault pass is mandatory.

### D-H. The footer is a `StateField`, not a `ViewPlugin` (S1 result)

CodeMirror refuses block decorations supplied by a plugin — S1's first run failed with "Block
decorations may not be specified via plugins". They change document height, so the view needs
them before plugins run. The footer is therefore provided from a `StateField` via
`EditorView.decorations.from`.

This is a departure from every other decoration layer in `decorations.ts`, all of which are
`ViewPlugin`s. The departure is forced, not stylistic: those layers are `ViewPlugin`s because
each needs `view` access for `isNestedEditor()`'s DOM-ancestry check, and none of them uses a
*block* decoration. The footer is the plugin's first.

The nested-editor problem this creates was already solved. `nested-editor.ts` publishes that
answer into state as `nestedEditorField` for exactly this class of consumer, so the footer's
field reads it rather than asking the DOM. Its documented one-transaction latch window applies
to the footer too, and S2 exercises it.

A `StateField` also needs an **invalidation bridge** the `ViewPlugin` layers never did: outline
mode toggling dispatches no transaction, and the shared `setCursor(getCursor())` nudge that
`refreshDecorations` uses is a no-op selection set, so a field never recomputes and renders a
stale answer (measured in S2). The footer carries a small companion `ViewPlugin` that watches a
revision counter and dispatches a real effect-carrying transaction when it moves — rather than
widening the shared nudge, which sits on the path of every existing decoration layer.

Measured consequence: the widget's presence changes no observable behaviour — caret placement,
the select-all ladder, structural operations and undo are identical with and without it — at a
cost of a few extra `programmatic` transactions where caret resolution runs one more correction
next to the widget and reaches the same position. Full write-up:
`docs/research/17-backlinks-footer-spikes.md`, S1.

### D-G. Progressive paint, and why the footer can afford it

Note names and counts come from the index with no file reads, so the first frame is real
information. Lineage arrives per note as its parse lands, and a card grows when it does. Growth
is acceptable *specifically because this is a footer*: everything below it is the end of the
document, so nothing the reader is looking at moves. This is a genuine argument for the surface,
not only for the loading state.

## Risks / Trade-offs

- **The widget cannot coexist with the enforcement layer** → S1 runs first and can veto. The
  fallback is the sidebar pane (D1's deferred option), which has none of this risk; the index,
  projection and chrome work is unaffected either way, which is why the split puts them in the
  same change but behind the spike.
- **`decorate()` acquires a second consumer and could be pulled toward the footer's needs** →
  S3 asserts fact-level equality between surfaces on the same corpus; any footer-specific need
  is added as a new fact, never as a branch on which surface is asking.
- **Chrome refactor regresses the editor** → the token split is behaviour-preserving by
  construction (same properties, same values, moved), and the existing decoration e2e coverage
  plus a corpus screenshot pass in both themes is the gate.
- **A hub note makes opening a file slow** → S5 measures it; progressive paint (D-G) bounds the
  perceived cost, and caps land in `backlinks-controls`. If S5 shows the cost is unacceptable
  even progressively, capping moves forward into this change.
- **Cache staleness on external edits** (sync, another device) → the metadata events fire for
  those too; the mtime key means a changed file re-parses. Deletion of a source file must evict
  or the footer shows a reference to a file that no longer exists.
- **Two renderers drift over time even with a shared fact layer** → accepted. The mitigation is
  that the *fact* layer is shared and asserted equal (S3); pixel-level parity between surfaces
  is explicitly not a goal, since the footer is smaller type in a card.

## Open Questions

- **Footer collapse state** — per note, global, or not persisted. Does not affect the specs,
  the approach, or the task breakdown; it is one setting and one lookup wherever the answer
  lands.
- **Hover preview** via `registerHoverLinkSource` — clearly desirable, purely additive, and
  independent of everything above.
