# Backlinks footer: spike series plan & results

Answers the questions the `backlinks-footer` change cannot design its way out of — chiefly
whether a CodeMirror block widget can live at the end of a document this plugin already
governs — by running small, isolated, falsifiable prototypes before any of the feature is
built on top of them.

Design decisions this series tests are recorded in
[18-structured-backlinks.md](18-structured-backlinks.md); the change's own design rationale is
`openspec/changes/backlinks-footer/design.md` (D-A … D-G).

**Status: in progress.** Spikes are run in order; each is closed with a verdict in the results
table below before the next begins.

## Ground rules

Inherited verbatim from [07-decoration-experiments-plan.md](07-decoration-experiments-plan.md)
("Ground rules for every experiment below") rather than restated here, so there is one copy to
change. The two that bite hardest on this series:

- **A real-vault pass is mandatory before a spike is called done.** The synthetic corpus proves
  the shape; only a real vault proves the feature.
- **No spike is done on green tests alone.** Unit tests can show a pure computation is
  internally consistent. They cannot show anything about rendering, layout, or how a widget
  behaves inside a live editor.

One rule is specific to this series:

- **S1 may veto the change.** It is not a task to be completed but a question that can be
  answered "no". A negative verdict reopens D1 (the surface decision) with the user rather than
  being worked around, and the sidebar-pane fallback leaves the index, projection and chrome
  work intact.

## Results

| # | Question | Status | Verdict |
| --- | --- | --- | --- |
| **S1** | Can a block widget at `doc.length` coexist with the enforcement layer? | Done | **Yes — proceed**, with one mechanism correction: block decorations must come from a `StateField`, not a `ViewPlugin` |
| **S2** | Does the widget survive the editor's lifecycle? | Done | **Yes — proceed**, but a `StateField` needs an explicit invalidation bridge: the shared mode-toggle nudge is a no-op selection set and produces no transaction |
| **S3** | Does `decorate()` hold up on a foreign, projected tree? | Done | **Yes** — node-identity facts are invariant; position facts describe the tree passed in, which corrected a spec claim |
| **S4** | What does outline chrome cost outside `.cm-line`? | Done | **The token vocabulary was NOT sufficient** — the editor positions nothing in JS, so a surface that shares only the tokens reimplements the layout and diverges. What must be shared is the class + custom-property contract, and the footer now consumes it |
| **S6** | Would rendering the footer some other way be cheaper? | Done, with a correction | **No — both alternatives are worse.** Markdown loses the outline entirely; a bare CodeMirror per group loses Live Preview *and* our decorations. **The editor result does not generalise**: it was measured on a bare `EditorView`, not on a real embedded `WorkspaceLeaf`, which is a different technique — see [20](20-surfaces-and-embedding.md) |
| **S5** | What does a real vault cost? | Done | **Nothing worth capping for.** Placement is ~2ms for 42 sources / 150 references, so progressive paint saves no wall clock and a cap is a LEGIBILITY decision, not a performance one |

## The fixture corpus

Shared across every spike. The four diagnostic notes are tracked in `test-vault/Backlinks/` and
all reference `Projects/Aurora Dashboard.md`, which is a real vault note with a `## Current
sprint` heading for anchor and embed cases to resolve against.

| Fixture | Structural case | Diagnostic for |
| --- | --- | --- |
| `Backlinks/Deep chain.md` | four single-child ancestors above one reference; the third ancestor is multi-line | S3, S4 — lineage collapsing at depth, and a multi-line ancestor's first-line rule |
| `Backlinks/Branching arms.md` | one branch node with three arms of differing depth (0, 1, 2 below it), under a heading | S3 — recursive collapsing: each arm must squash independently, not only the common prefix |
| `Backlinks/Atoms and anchors.md` | reference in a list owned by a preceding paragraph; anchor link; alias link; reference inside a callout; reference inside a table | S3, S4 — atom kinds and the paragraph-owns-following-list rule, which is where our tree and Obsidian's metadata disagree |
| `Backlinks/Severity study writeup.md` | frontmatter property link; embed of a heading | S3 — the two reference kinds with no ordinary position in the block tree |
| existing `Journal/2026-07-07.md` | reference in a root-level paragraph, siblings pruned | S3 — the no-ancestor case |
| existing `Notes/Reading – The Design of Everyday Things.md` | reference two levels deep with a pruned sibling subtree and a multi-line ancestor | S3 — pruning a sibling that leads nowhere |
| `Backlinks/Kinds gallery.md` | one reference per node kind — heading, paragraph, bullet, ordered, two-digit ordered, open and done task, quote, callout, table, html — several of them nested under a referencing paragraph | S4 — every marker's alignment against its own text, side by side; and the first fixture in which one reference sits inside another's subtree |
| `Backlinks/Family tree.md` | references carrying real subtrees: children, grandchildren past the depth bound, a four-deep chain, and children of mixed kinds | S4 — descendant rows, the depth bound and the fold affordance |
| `Backlinks/Reference target.md` | the target of the two fixtures above, and of nothing else | keeps their footer readable; the hub note is the volume case, not the legibility one |
| `Backlinks/Hub/` (generated) | 120 notes, 400 references, mixed kinds and depths | S5 — index build, per-source parse, projection and first paint at scale |

The hub fixture is generated rather than tracked — several hundred near-identical notes whose
only property is bulk would be noise in every diff. `node scripts/gen-backlink-hub.mjs` writes
it deterministically (fixed seed, no randomness), so it is the same corpus on every machine;
`.gitignore` excludes the output.

## S1 — block widget vs. the enforcement layer

**Question.** The footer is a `Decoration.widget({ block: true })` anchored at
`state.doc.length`. That position sits inside an editor already governed by
`content-space-caret` (which positions the caret may occupy), `progressive-select-all` (the
select-all ladder), `caret-placement-policy` (where the caret lands after an operation) and the
transaction filter that enforces all of it. This spike asks whether the widget perturbs any of
them, and if so whether the filter can absorb it.

**Verdict: proceed.** The widget's presence changes no observable behaviour. It cost one
mechanism correction, recorded below, and a small amount of extra internal work that the filter
absorbs.

### Method

Apparatus: `src/plugin/spike-footer-widget.ts`, a content-free widget behind the
`debugFooterWidget` setting; measured by `e2e/specs/70-spike-footer-widget.e2e.ts` against
`Backlinks/Deep chain.md`.

The measurement is **differential**. "Where does the caret land with a widget present" means
nothing on its own, so the same script runs twice against the same note — widget off, then on —
and the two observation records are compared. A perturbation shows up as a diff between the
halves, not as a hardcoded expectation that would need re-deriving whenever caret policy
legitimately changes. The widget is content-free for the same reason: the variable under test is
its presence, and content would confound "the widget is here" with "the content did something".

Observed per run: caret after `End`; caret after a programmatic placement at the document's last
offset; caret after arrow-down off the last content line; caret after a click below the last line
(which lands *inside* the widget when it is mounted); four rungs of the select-all ladder;
buffer and caret after indent / outdent / move-up / move-down on the last node; buffer after
undoing all of it; and the transaction filter's own classification counts and trace.

### Finding 1 — block decorations cannot come from a ViewPlugin

The first run failed outright:

```
CodeMirror: Block decorations may not be specified via plugins
```

Block decorations change the document's height, so the view needs them before plugins run in
order to lay out and measure. They must be provided from a `StateField` through
`EditorView.decorations.from`.

This matters because **every decoration layer in `decorations.ts` is a `ViewPlugin`** — and none
of them uses a block decoration. The footer is the plugin's first, so it cannot follow the
established pattern, and a design that assumed it could was wrong on the mechanism.

The prior art already said so and we did not transfer it: `influx` anchors its footer from a
`StateField` (`src/cm6/StatefulDecorationSet.tsx`), which
[18-structured-backlinks.md](18-structured-backlinks.md) cites for the *anchoring* while
recording the mechanism only as `registerEditorExtension`. Reading a reference implementation
for the answer we were looking for, and not for the one we would need next, is the transferable
lesson.

### Finding 2 — the state-level seam for nested editors already existed

`decorations.ts` uses `ViewPlugin` deliberately: each layer needs `view` access for
`isNestedEditor()`'s DOM-ancestry check, because a nested per-cell editor resolves to the same
outer file through `editorInfoField` and state alone cannot tell the two apart. A `StateField`
has no view and cannot ask the DOM anything.

No new mechanism was needed. `nested-editor.ts` already publishes that answer into state as
`nestedEditorField`, for exactly this class of consumer, and the footer's field reads it. The
seam was built before there was a second kind of consumer to use it, and it held.

### Finding 3 — behaviour is unchanged; the cost is extra bookkeeping the filter absorbs

Every behavioural observation is identical with and without the widget: caret placement in all
four probes, all four rungs of the select-all ladder, the buffer and caret after every structural
operation, and the buffer after undoing them.

The one difference is internal. The filter classified **24** transactions without the widget and
**29** with it, all of the surplus `programmatic/set` — the caret-resolution pass running an
extra correction when a placement lands adjacent to the block widget, and arriving at the same
position. Nothing moves into `boundary-crossing-edit`, `within-node-edit`, `composition` or
`plugin-own`, which are the classes that would mean the widget changed what an edit *is*.

The spike's veto condition was a perturbation "the transaction filter cannot absorb". It absorbs
this one. The e2e spec therefore asserts the behavioural equalities and the classification
*kinds*, and records the count as a diagnostic — asserting that the filter does the same amount
of work is not a behavioural guarantee, and encoding it would break on any legitimate policy
change.

### Consequences

- The real footer is a `StateField`, not a `ViewPlugin` (change design.md, D-H).
- It reads `nestedEditorField` rather than calling `isNestedEditor()`.
- The one-transaction window before `nestedEditorField` latches (documented in
  `nested-editor.ts`) applies to the footer too: for the frames before the flag lands, a nested
  editor could briefly mount a footer. Not observed in this spike, whose widget is gated on
  outline mode and a debug flag, but it is a real edge S2 should exercise.
- Regression check: `53-decoration-contracts`, `65-content-space-caret` and
  `64-progressive-select-all` all pass with the extension registered.

## S2 — widget lifecycle

**Question.** Whether the widget survives mode toggling, file switching, multiple leaves on one
file, view-mode switching, print/export and the mobile viewport without leaking DOM or
duplicating itself — the failure `coalesce` fights with a `MutationObserver` and an
orphaned-container sweeper (see [16](18-structured-backlinks.md), "Prior art").

**Verdict: proceed.** No leaks, no orphans, no duplicates. One real defect found and fixed: a
`StateField` needs an invalidation signal the existing decoration layers never needed.

Covered by `e2e/specs/71-spike-footer-lifecycle.e2e.ts`. The invariant asserted throughout is
**one widget per outline-mode editor, and none anywhere else**, counted over the whole document
rather than the workspace container — an orphan in a detached container would not show up in a
workspace-scoped query, and orphans are the thing most worth catching.

### Finding 1 — a StateField does not see the mode-toggle nudge

Toggling outline mode dispatches no transaction of its own. `main.ts`'s `refreshDecorations`
compensates with `view.editor.setCursor(view.editor.getCursor())` — a selection set to the
position the caret already occupies — and its comment calls this "a real (public-API) dispatch
that forces the recompute".

That is true for a `ViewPlugin`, which reruns on any view update whether or not a transaction
was dispatched. It is **not** true for a `StateField`, which recomputes only when a transaction
arrives, and a no-op selection set produces none.

Measured directly rather than inferred. After toggling outline mode off, the widget stayed;
after the next real document edit it vanished:

```
[DIAG2] after toggle OFF (nudge only):   1
[DIAG2] after a real doc transaction:    0
```

This is a second-order consequence of S1's forced move to a `StateField`, and precisely the kind
of defect that would otherwise surface much later as "the footer sometimes shows on notes where
outline mode is off".

**Fix, and why not the obvious one.** Changing the shared nudge to always produce a real
transaction would fix it for every state-level consumer at once, but that nudge is on the path of
every existing decoration layer, and widening it to satisfy a new consumer risks all of them. The
footer instead carries its own bridge: a small `ViewPlugin` — which *does* observe the nudge's
view update — watches a revision counter the plugin bumps on mode and setting changes, and
dispatches a real effect-carrying transaction when it moves. The dispatch is deferred to a
microtask, because dispatching from inside `update()` re-enters the view.

### Finding 2 — `openNote` opens a new leaf, so "one widget" is the wrong invariant

Not a product defect, but it invalidated the spec's first two drafts and is worth recording so
the next lifecycle test does not rediscover it. `obsidianPage.openFile` opens the note in a
**new leaf** rather than reusing the active one, so editors accumulate across a spec and the
widget count rises with them — correctly, one per editor:

```
[DIAG3] fresh:                  editors 1, widgets 1, mdLeaves 1
[DIAG3] after re-open same note: editors 2, widgets 2, mdLeaves 2
```

The invariant is therefore per-editor, and a lifecycle spec has to normalise the leaf set before
counting — keeping the **active** leaf, not the oldest, or it measures a different file than the
one under test.

### Finding 3 — the first two drafts failed for timing, not behaviour

Both earlier versions asserted counts immediately after a mode toggle and failed six ways. A
diagnostic run showed the widget was correct at every step; the assertions were racing an
asynchronous re-render. The spec now polls for the expected count instead. Recorded because "the
test failed" and "the feature is broken" looked identical here, and the difference was only
visible by instrumenting rather than reasoning.

### What is not automated

- **Window resize.** WebDriver cannot resize this Electron window
  (`Browser.getWindowForTarget wasn't found`), and emulating a viewport inside the page would
  exercise CSS rather than the editor's own re-measure — coverage in appearance only.
- **Print / export.**
- **Mobile viewport**, which has its own harness config (`npm run test:e2e:mobile`).

All three are manual-pass items, carried into the mandatory real-vault pass rather than faked.

## S3 — `decorate()` on a foreign, projected tree

**Question.** D-A makes the footer render from the same `decorate()` the editor uses, fed a
projected tree from another note. This spike checks that the fact layer really is independent of
the surface asking.

**Verdict: yes, with a sharpened contract.** `decorate()` needs no seam and no changes.

Covered by `tests/projection-decorate.test.ts`, run against the real corpus files on disk.

### Why this one is a unit test

The editor's own facts come from `decorate(doc)` via `docFacts(state)` (`decorations.ts`,
`factsFor`) — the same pure function the footer would call. An e2e comparison would therefore
add a live app and render timing without adding evidence, and would only contribute flakiness.
The corpus is read from disk rather than inlined so a change to it is caught here instead of
silently diverging from what the other spikes measure.

### Finding — two classes of fact, and the spec was wrong about one

Facts split cleanly, and the split is not the one the change's spec originally claimed:

- **Node-identity facts are invariant under projection**: `kind`, `isAtom`, `isListItem`,
  `hasNativeMarker`. These describe what a node *is*, and they are identical whether the node is
  decorated as part of its own document or as part of a projection. Verified across all six
  corpus notes.
- **Position facts describe the tree actually passed in**: `depth`, `supplementalDepth`, and
  `hasChildren`. A node whose children were pruned reports `hasChildren: false`.

That last one contradicted the delta spec, which asserted the two derivations "agree on depth,
kind, first-line status, atom classification, list-item classification, supplemental depth, and
whether the node has children". Measured, they do not — and **should not**. A referencing node
whose descendants were pruned genuinely has none in the footer, and reporting otherwise would
put a fold affordance on nothing. The spec was corrected to state the two classes separately;
the implementation was not changed, because it was already right.

This is the spike series doing its job in the least dramatic way available: a claim written
confidently during planning, falsified cheaply before anything was built on it.

### Also confirmed

The paragraph-owns-following-list rule survives projection — `Backlinks/Atoms and anchors.md`
keeps "Follow-ups from the review:" attached to the reference beneath it. This is the case where
our tree and Obsidian's metadata cache disagree, and it is the concrete reason D-E parses source
notes with our own parser instead of reconstructing structure from `CachedMetadata`.

## S4 — chrome outside `.cm-line`

**Question.** Every decoration selector in `styles.css` is scoped
`.markdown-source-view.mod-cm6 .cm-content > .cm-line.to-decor-*`. The footer's rows are not
`.cm-line`s. This spike measures what it costs to render the same chrome — guide gradient,
marker widget, depth rules — against a different DOM, and whether the token split D-C proposes
is sufficient or the chrome needs restructuring.

**Preparation done; the visual verdict runs with the footer DOM.**

### Finding — the token layer was thinner than the design assumed, and lived in the wrong place

Only three custom properties were ever declared in CSS (`--to-guide-color`, `--to-decor-accent`,
`--to-trail-width`), all scoped to `.markdown-source-view.mod-cm6 .cm-content`. The geometry the
design called tokens — the indentation unit, the marker gutter, the icon size — lived as
constants inside `decorations.ts` and reached CSS only as inline styles.

`--to-decor-unit` turned out never to be **set** at all: every call site reads it as
`var(--to-decor-unit, 1.5rem)`, so the fallback was the real value and the token existed purely
as a snippet-facing knob. Repeating that fallback at each call site is exactly how two surfaces
drift apart while both look correct.

Split accordingly, and behaviour-preservingly:

- The colour and width tokens move to `body` — surface-neutral, because there are now two
  surfaces and a token declared inside one of them is that surface's private value, not a shared
  vocabulary. Snippets that retuned them at `.cm-content` still win on specificity, and can now
  retune both surfaces at once from above.
- The geometry moves to `src/plugin/chrome-tokens.ts`, which `decorations.ts` now consumes
  instead of holding its own copy, and which the footer will consume too.
- `--to-decor-unit` is declared once, with the value its fallback always had.

Verified unchanged: 92 assertions across `50-decorations`, `51-guides-gradient`,
`52-block-markers-icons`, `53-decoration-contracts` and `55-position-indicators`.

### Finding — the vocabulary was sufficient, the CONTRACT was not

This finding replaces an earlier one that called the vocabulary sufficient and stopped there.
It was recorded before the footer had been looked at, on the evidence that the footer's rows
consumed `--to-decor-unit`, `--to-marker-gutter` and `buildMarkerIcon` without restating a
value. That is true, and it is not the question. The rendered footer did not look like the
editor's outline, which was the explicit goal.

What the earlier verdict missed is where the editor's layout actually happens. `lineDecoration()`
computes almost no geometry: it emits a **class** (`to-decor-block` / `to-decor-atom` /
`to-decor-list`, plus `to-decor-guides`) and a set of **custom properties** (`--to-depth`,
`--to-marker-gutter`, `--to-supp-depth`, `--to-own-shift`, `--to-list-marker-cols`,
`--to-guides`), and `styles.css` derives every offset, hang and stripe from those. The tokens
are the alphabet; that class-plus-properties pair is the sentence.

A surface that shares only the alphabet writes its own sentences, and they differ. Measured
against the corpus, three ways:

- **No guide lines at all.** `computeLineGuides` and `guideBackground` were never called from
  the footer, so `--to-guides` was never set and the whole gradient layer was absent.
- **Bullets off the column.** The footer laid rows out with a fixed-width flex gutter; the
  editor computes the column as `depth * unit + gutter` and centres the marker on it with
  `stripeStartExpr`. The two agree only at depth 0.
- **Depth applied through the wrong property.** The editor uses `padding-left` for block lines
  and `margin-left` for atoms and list items — a distinction `--to-own-shift` exists to record,
  because the guide layer must undo exactly the shift the line applied. The footer used one
  rule for everything.

The per-row hover boxes and the oversized gaps around reference rows have the same root: both
are footer-local CSS invented to stand in for rules that already existed.

**Corrected verdict: no chrome restructuring is needed, but the seam was in the wrong place.**
The shared unit is the fact→(class, custom properties) mapping. It now lives in
`src/plugin/chrome-line.ts` — `lineChrome()`, the column and stripe geometry, the guide layer
builder and the plain-line marker placement — and `lineDecoration()` and the footer both call
it. The three `styles.css` rules that lay a line out (the block depth rule, the atom depth rule,
the guide overlay) carry a second selector for footer rows, so both surfaces take their layout
from the same declarations.

The editor was proven unchanged by the extraction before the footer consumed it: 1051 unit tests
and 62 e2e assertions across `50-decorations`, `51-guides-gradient`, `52-block-markers-icons`,
`53-decoration-contracts`, `55-position-indicators`, `56-list-grid` and `55-position-indicators`.

### Finding — three defects the shared contract did not fix by itself

Consuming the contract fixed the guides, the marker column and the row rhythm outright. Three
things remained, each invisible in the editor for a reason worth recording, and each found by
measuring the footer against a `.cm-line` in the same session rather than by looking.

- **The guide overlay was scoped to the wrong stacking context.** It is a `z-index: -1`
  pseudo-element, and negative-z children paint *before* the in-flow block backgrounds of their
  stacking context — so the group card's opaque background covered every guide. A `.cm-line` has
  no opaque box between it and its stacking context, so the editor never meets this. Fixed by
  making the row a stacking context of its own (`isolation: isolate`), which scopes the overlay
  to the row: still behind its text, no longer behind the card.
- **Obsidian's own HTML whitespace became visible content.** The footer inherits CodeMirror's
  `white-space: pre-wrap`, under which the newline inside a rendered `<li>` is a HARD BREAK: every
  list-derived row's text landed on the line below its own marker (measured, a depth-1 row was
  37.6px tall against a depth-0 row's 20.7px). Set to `normal`, that newline collapses to a
  SPACE instead — invisible inside a block, but real after an inline marker, and worth 3.6px of
  extra gap. Both halves are now handled: `normal` on the footer, and the edge whitespace
  stripped in `unwrapBlocks`.
- **The footer rendered at UI size while the chrome is sized in `rem`.** The marker's box is
  0.85rem, tuned against the editor's text size; shrinking only the text left the marker's centre
  1.8px above its text's, against the editor's own 0.8px. UI size now applies to the footer's own
  chrome — its heading, its group headers — and a row reads at the size a note's text reads at,
  because a row holds a node of a note.

Measured after all three, against a `.cm-line` in the same session: marker-to-text gap 13.2px on
both surfaces, marker-to-text vertical offset −0.8px on both. `74-footer-chrome-pass` holds that
as a relationship rather than a pixel count, since CI's font is not a developer's.

### Finding — the marker sat above its text on BOTH surfaces, and the box was not where it looked

−0.8px against the line box still read as high, because a line box is not what the eye centres
on: text is optically centred on its x-height midline, which sits above the box's centre. Two
causes, and the first is why the arithmetic never added up:

- **An inline-block's baseline is its last LINE BOX's baseline**, not its bottom edge. The marker
  span inherited the line's 24px `line-height`, so it carried an internal strut whose baseline sat
  ~17.5px down a box only 13.6px tall — lifting the icon ~4.4px above where every placement
  calculation in `decorations.ts` and `chrome-line.ts` assumed it was. `line-height: 0` (and a
  `display: block` SVG) leaves no line box, so the spec's fallback applies and the baseline is the
  bottom margin edge, which is what that arithmetic means.
- **`baseline` then centres the box `iconSize / 2` above the baseline**, where the text's optical
  centre is `0.5ex` above it. `top: calc(var(--to-marker-icon-size) / 2 - 0.5ex)` closes exactly
  that difference, in `ex` — which IS the font's x-height — so it holds at any text size.
  `vertical-align: middle` is the alignment that claims to do this and does not: it centres the
  margin box on `baseline + x-height/2`, the same answer only when the box's height happens to
  match the x-height.

Measured after: the icon's centre and the text's x-height midline coincide to **0.00px** on every
kind and at every text size, heading and atom included, on both surfaces.

### Finding — a reference inside another reference's subtree rendered twice

Found by `Kinds gallery`, the first fixture with that shape. `collapseLineage` emits every match
as its own row; `buildRows` independently emits each match's source-tree descendants. Where a
match sat inside another match's subtree the two overlapped, and ten references rendered as
twenty rows — once as dim context under the parent, once as themselves. `emitDescendants` now
skips matches, and does not recurse into them: their own row carries their own subtree.

Not a rendering bug, and not one any amount of looking at the old corpus would have surfaced.

### Finding — three marker mechanisms, because the renderer answers in three shapes

The gallery exposed three defects at once, and they turned out to be one question: the
reading-mode renderer returns more than one kind of thing, and a single marker mechanism cannot
serve all of them. Closed as follows, and held by `74-footer-chrome-pass`.

- **Atoms are real blocks.** A quote, callout, table, code fence or html block arrives with no
  text run to sit beside, so the inline marker landed at the row's top-left with the content
  below it. They now use the editor's own absolute mechanism —
  `.to-decor-marker-icon--widget`, positioned by `markerAnchorLeftExpr`, which moved into
  `chrome-line.ts` for the purpose. Note the atom set is WIDER here than in the editor, where a
  quote and a code fence are still `.cm-line`s: this renderer returns a block for every one of
  them.
- **A heading's size belongs to the row, not to its text.** `<h1>` is unwrapped and the row
  carries the heading level, because the marker is a sibling of the content — size the text alone
  and the `0.5ex` correction resolves against the row's font while the marker sits beside much
  bigger text, which is the defect this whole pass started from.
- **An ordered item's number is content, not notation.** Unwrapping the `<ol>` discards it, so it
  is read back off the source line and drawn in the gutter. Anchored by its RIGHT edge rather
  than given the gutter's width: a fixed-width box with `text-align: right` does not survive a
  label wider than it, because an overflowing line box stops honouring the alignment and spills
  off the END edge — measured, `10.` ran rightwards underneath its own text, and before
  `white-space: nowrap` it broke over two lines onto the row below, covering that row's marker.

This is the finding that generalises: these are not footer defects, they are what any surface
built on `MarkdownRenderer` has to answer, and reading mode will meet all three. See
[20-surfaces-and-embedding.md](20-surfaces-and-embedding.md).

Two further things had to be handled, neither a chrome problem:

- **Node text must be dedented before rendering.** A node's own lines carry the indentation
  that expresses its depth, and markdown reads a leading tab as a CODE BLOCK — so a nested list
  item rendered verbatim came out as raw text with its `-` marker and `[[link]]` brackets
  showing, while a top-level paragraph in the same footer rendered correctly. Depth is the
  row's job; the text starts at column 0.
- **An embed of the target renders as a link, not a transclusion.** Left alone, an
  `![[Target#Heading]]` reference transcluded the target into its own footer — the reader asked
  where it was referenced, not to read it again.

### Finding — the footer only exists once the reader reaches it

Not a defect, but the single most surprising property of the surface, and worth stating because
every future assertion about the footer depends on it.

CodeMirror **virtualises**: a document long enough for its end to fall outside the viewport
represents that region as a `cm-gap`, and nothing in it has DOM. The footer sits at
`doc.length`. On a long note it therefore does not exist until the reader scrolls to the
bottom.

This was found the expensive way — a footer that rendered perfectly for short notes and not at
all for `Projects/Aurora Dashboard.md`, through several wrong hypotheses (scale, then a
per-path controller cache, then the note's own structure) before the DOM tail showed a
`cm-gap` sitting where the widget should have been. Two useful consequences:

- **It is free until it is read.** No index work, no file reads, no parsing happens for a note
  nobody scrolls to the end of. The volume problem `backlinks-controls` addresses is
  correspondingly smaller than S5 will suggest on paper.
- **Every test must scroll first.** An assertion that opens a note and looks for the footer
  passes or fails on the note's length, which is not what it was written to measure.

A real defect was found on the way, and fixed: controllers were cached per note PATH, so a note
open in two editors shared one element — and an element can only be in one place, so the second
mount stole it from the first and the first's teardown disposed it. Each widget instance owns
its own controller now. Precisely the "one widget per editor" invariant S2 exists to hold.

## S5 — real-vault cost

**Question.** What opening a hub note actually costs: reverse-map build, per-source
`cachedRead` + `parse`, projection, and first paint. Its numbers are the input
`backlinks-controls` needs to choose cap defaults, which is why that change's design is held
until this spike reports.

**Verdict: there is no performance problem to cap.** Apparatus is
`e2e/specs/76-footer-cost.e2e.ts`, which reports rather than asserts — a budget invented before
the feature has a cap would be a number defending itself.

| | 145-file vault, target with 42 sources / 150 references |
| --- | --- |
| index build (whole vault) | **0.1–0.2 ms** |
| summaries (the header's input) | **0.10 ms** |
| place, all 42 sources | **2.0–2.2 ms** |
| place, per source | median **&lt;0.01 ms**, max **0.60 ms** |
| first paint: header on screen | **253 ms** |
| first paint: every group resolved | **253 ms** — the same frame |

### Finding — progressive paint saves no wall clock at this scale

Header and bodies land in the same frame, because placing all 42 sources costs 2ms and the
253ms is the scroll and CodeMirror mounting the widget, not our work. D-G is therefore not
buying latency here; what it still buys is a *shape* that stays correct when a vault is larger
or slower than this one, and the absence of a frame that shows fabricated structure. Keeping it
is cheap and removing it would be a bet on every vault resembling this fixture.

### Finding — a cap is a legibility decision, not a performance one

This is the input `backlinks-controls` was waiting for, and it moves the question. D10 framed
volume as something to cap; these numbers say nothing needs capping to stay fast. The group
height cap this change ships is justified entirely by *reading* — a hub note's footer is
unskimmable long before it is slow — and `backlinks-controls` should choose its defaults on that
basis rather than on a budget.

**One caveat, stated because it bounds the claim.** `cachedRead` reads Obsidian's own in-memory
file cache, and `clearTrees()` clears only OUR parse cache. So "cold" here means an unparsed
tree, not an unread file. On a vault whose files are genuinely cold — first open after launch,
or a synced vault — per-source cost would be higher, and the ordering of the four costs is what
this spike establishes rather than their absolute values.

## S6 — is there a cheaper renderer than our own chrome?

**Question.** S4's corrected verdict says the footer must consume the editor's own
class-and-property contract. Before paying for that, the two obvious alternatives were built
and looked at rather than argued about: hand each group to Obsidian as one nested markdown
list, or mount a real CodeMirror per group running our decoration stack over a synthesised
document.

**Verdict: neither. Consume the real contract.** Both alternatives were rendered on the same
note, same build, both bundled themes, and screenshotted side by side with the current chrome.

### Method

Apparatus: `src/plugin/footer-render-modes.ts` behind a `footerRenderMode` plugin-data key,
switched in `FooterController.fillGroup`; `e2e/specs/79-render-mode-comparison.e2e.ts` renders
`People/Priya Nair.md` in all three modes across both themes into
`.obsidian-cache/footer-render-modes/`. Both were removed once this was recorded — the
apparatus existed to answer one question, and a switch nobody will ever flip again is a
liability, not a feature.

Both alternatives need the group as markdown text first, which is itself informative: neither
can show anything our own renderer cannot. They differ only in who draws it.

### Finding — markdown loses the outline, and does not even gain spacing

`liItems: 7, markers: 0, rows: 0`. Obsidian's own nested list is legible, but it is Obsidian's
list: no kind markers, no guide gradient, no depth grid on our unit. Structure that has no
markdown spelling is simply lost — a collapsed lineage degrades to `a › b › c` as plain text,
and node kind disappears. The vertical spacing is *worse* than the current chrome, not better,
because every row becomes an `<li>` carrying list margins rather than only the descendants.

### Correction — what the editor finding does and does not cover

The finding below is true of a bare `EditorView` and **does not rule out embedding a real
Obsidian editor**, which is a different technique with different properties. Recorded here
because the original write-up read as though it did.

A bare `new EditorView({ state, extensions })` is a CodeMirror instance. Mounting a real
`WorkspaceLeaf` holding a real `MarkdownView` — the detached-`WorkspaceSplit` technique used by
Hover Editor and its descendants — gives Live Preview and our decorations by construction,
because the editor *is* Obsidian's. It is not the answer for the footer, for reasons of
granularity and cost rather than fidelity, and it is the strongest known candidate for an
editable mirrors view. Both are worked through in
[20-surfaces-and-embedding.md](20-surfaces-and-embedding.md).

### Finding — a bare per-group editor loses Live Preview *and* our decorations

`cmLines: 7, markers: 0`, and the rendered text reads ``- `team.1` [[Priya Nair]]`` — raw
markdown, brackets and all. Two separate failures land together:

- **Live Preview is not a CodeMirror feature.** It is Obsidian's view layer, built on a
  `MarkdownView` that a bare `EditorView` does not have. A synthetic editor renders source. This
  is exactly the property a real embedded leaf would have and this apparatus did not.
- **Our decorations did not attach**, despite `decorationsExtension` being in the extension
  list and `editorInfoField` hand-seeded to claim an outline-mode file. The stack expects an
  editor Obsidian created; seeding one field is not the same as being one.

So the option that promised identical chrome by construction delivered neither Obsidian's
rendering nor ours, at the cost of a full editor instance per group.

### Consequence

The comparison also explains the current chrome's defects without needing a fourth experiment.
Every one of them is footer-local CSS standing in for a rule that already exists in
`styles.css` — which is exactly what S4's corrected verdict predicts, and what group 7's
re-scoping fixes.
