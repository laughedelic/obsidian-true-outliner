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
| **S4** | What does outline chrome cost outside `.cm-line`? | Rendering done, screenshots pending | Token layer extracted and the editor proven unchanged by it; the visual verdict needs a footer DOM and runs with it |
| **S5** | What does a real vault cost? | Not started | — |

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

### Finding — the vocabulary was sufficient; no chrome restructuring needed

With the footer built, the answer is yes. Its rows consume `--to-decor-unit` and
`--to-marker-gutter` for geometry, `buildMarkerIcon` for kind notation, and the theme
variables for colour, without a single value restated. Nothing about the chrome had to change
to draw on ordinary `div`s rather than `.cm-line`s.

Two things did have to be handled, neither a chrome problem:

- **Node text must be dedented before rendering.** A node's own lines carry the indentation
  that expresses its depth, and markdown reads a leading tab as a CODE BLOCK — so a nested list
  item rendered verbatim came out as raw text with its `-` marker and `[[link]]` brackets
  showing, while a top-level paragraph in the same footer rendered correctly. Depth is the
  row's job; the text starts at column 0.
- **An embed of the target renders as a link, not a transclusion.** Left alone, an
  `![[Target#Heading]]` reference transcluded the target into its own footer — the reader asked
  where it was referenced, not to read it again.

The screenshot pass across both bundled themes is still outstanding.

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

*Not yet run.*
