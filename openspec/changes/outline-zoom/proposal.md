## Why

Zoom (hoisting) is one of the eight defining behaviors of a true outliner
(docs/research/01, §6) and the one the reference apps are judged on most directly — Workflowy is
nothing but a zoom into an infinite outline. The core this project has built — universal block
tree, enforced node boundaries, node-aware selection — is exactly the substrate zoom needs, and
none of it exists in the plugins that already ship zoom for Obsidian. Q4 of the decision log
deferred zoom out of v1 on purpose, to be built on the stable core rather than beside it. The
core is now stable: the tree model, `subtreeCoverOf`'s geometry, the enforcement funnel, the
caret policy and the decoration layer are all in place and specified. Two pieces of the backlinks
work arrived pointing directly at this feature: `tree-projection` names zoom in its own Purpose as
a future consumer of the detached-tree guarantee, and `selection-structural-ops` replaced the
single-node operand with the selection's covered roots, which is the shape a scope check has to be
stated over.

Zoom is also the first feature that is not a rule about the document but a **scope over it**.
Every layer already built answers questions relative to "the document": the select-all ladder
tops out at the whole outline body, extension grows until the document is exhausted, decoration
depth is measured from the document root, motion runs to the document's ends. Introducing a
temporary root means each of those has to say what it does relative to the scope instead — which
is why eight capabilities acquire a zoom clause here, and a ninth — `tree-projection` — gains
the supporting operation they lean on, rather than any of this sitting beside them. Deferring the
scope half and shipping the hiding half would produce a view that lies: content is invisible but
still selectable, still deletable, still reachable by Mod-A.

## What Changes

- **Any node can become the temporary root of the view.** Zoom in on the node at the caret; zoom
  out one level; zoom out fully. Available on every node kind — heading, paragraph, list item,
  atom — because the tree model does not privilege lists.
- **Everything outside the zoom root's subtree stops rendering**, via block-level replace
  decorations over the two line ranges that bracket it. The file on disk is untouched; zoom is
  view state and never a document mutation.
- **A breadcrumb panel above the editor shows the ancestor path**, ending at the file itself.
  Clicking a crumb zooms to it; clicking the file zooms out fully.
- **The zoom root renders at depth 0.** Indentation and guides are measured from the zoom root
  while zoomed, so a deep node does not stay pushed halfway across the screen. The re-basing needs
  no change to the pure decoration layer: `tree-projection` already established that a detached
  document decorates like any other, so zoom decorates the root's subtree AS a document (design
  D9). One stated exception survives, in a smaller form than before the outline grid landed: a
  list-item zoom root keeps the within-list indentation Obsidian's own list rendering supplies,
  because `outline-decorations` now forbids repositioning a list item line by line.
- **The backlinks footer keeps working while zoomed.** It is a block widget anchored at the
  document's end, which is inside the range zoom hides, so it has to be excluded from the hidden
  range explicitly or it disappears (design D12). It renders after the zoomed content, answering
  for the note as it does today; focusing it on the zoomed block belongs to `backlinks-controls`.
- **The zoom scope confines selection, caret motion, and structural operands.** Escalated
  selections are clamped to the root's subtree; the Mod-A ladder tops out there instead of
  falling through to native Select All; Shift+Arrow extension stops there; motion does not leave
  it; an operation whose subject would land outside it is rejected through the existing typed
  rejection cue, with a new `would-leave-zoom-scope` reason.
- **Zoom exits on its own when it can no longer be honest**: the root stops resolving, a change
  touches the document outside the visible range (undo past the zoom, a sync write, another pane),
  or outline mode is switched off.
- **Zoom is ephemeral and per editor view**, held in a CM6 `StateField`. Two panes on the same
  file zoom independently; nothing is persisted and nothing is written to the note.

## Capabilities

### New Capabilities

- `outline-zoom`: the zoom scope itself — what identifies the root and how it survives editing,
  what is hidden and what is shown, the breadcrumb path, the entry and exit gestures, the
  confinement guarantee every other layer defers to, and the automatic-exit rules.

### Modified Capabilities

Each of these has a requirement that today says "the document" where zoom needs "the scope". They
are listed because the existing wording would otherwise directly contradict `outline-zoom`'s
confinement requirement — not to restate it once per capability.

- `progressive-select-all`: the ladder's top rung becomes the zoom root's whole subtree, and the
  documented fall-through to native Select All is suppressed while zoomed (native Select All
  would select hidden text).
- `node-selection-extension`: the cover sequence terminates at the zoom root's subtree instead of
  at document scope.
- `node-selection-enforcement`: an escalated selection is clamped to the zoom scope. This is the
  one place the expand-only guarantee is bounded, and the bound is stated rather than left to the
  interaction of two rules.
- `content-space-caret`: motion is confined to the scope; a motion whose target lies outside it
  stops at the boundary instead.
- `selection-structural-ops`: an operand — the selection's covered roots, not a single node —
  whose operation would land outside the zoom scope is refused. Stated here rather than once per
  entry point, because that capability already guarantees the keyboard and the palette resolve
  one operand and one after-state.
- `outline-keyboard-grammar`: the same refusal for the node-splitting keys, which are grammar
  rather than operand-resolved operations.
- `outline-decorations`: depth is measured from the zoom root while zoomed, with the list-item
  exception stated.
- `tree-projection`: gains the sibling of `project` that zoom needs — a node's subtree AS a
  document, re-rooted at depth 0. Its home is that capability because the guarantee it must carry
  is the one already stated there: a detached tree every pure consumer accepts unchanged.
- `backlinks-footer`: the footer survives an active zoom scope rather than being hidden with the
  content around it.

## Impact

- **New pure module** (`src/zoom.ts`): resolve the zoom root from an anchor line, the visible
  cover, the hidden line ranges, the ancestor trail, and the scope predicates the clamps use.
  Built on `escalate.ts`'s `subtreeCoverOf` and `locate.ts`'s `forEachNodeWithLine` — no new tree
  geometry.
- `src/project.ts`: the subtree-as-document operation, next to `project` rather than in
  `src/zoom.ts`, so the two detached-tree constructions state their guarantees in one place.
- `src/plugin/footer-model.ts`: its private `stripBlockPrefix` lifted to a shared home for the
  breadcrumb labels — a third marker-stripping function is exactly what
  `one definition per shared line-position helper` was written against.
- **New CM6 module** (`src/plugin/zoom-state.ts`): the `StateField` holding the mapped anchor,
  the effects that set and clear it, the hiding decorations, and the breadcrumb panel.
- **New view registry** (`src/plugin/view-registry.ts`): a `ViewPlugin` recording each live
  `EditorView` against its `editorInfoField`, so a command callback can dispatch a CM6 effect.
  Obsidian's public `Editor`/`MarkdownView` API exposes no `EditorState` — `main.ts`'s
  `StructuralOp` comment already records this as a known gap for the palette path — and this
  project does not reach for `(editor as any).cm`. Zoom's palette commands need a dispatch route
  and this is the public-API one. Design D5.
- `src/plugin/keymap.ts`: zoom bindings alongside the existing grammar, and the scope guard on
  the structural keys.
- `src/plugin/decorations.ts`: the hiding decorations compose with the existing decoration
  sources, and the re-based facts come from decorating a sub-document. `src/plugin/decorate.ts`
  and `src/plugin/chrome-tokens.ts` are READ, not changed — that is design D9's point.
- `src/plugin/backlinks-footer.ts`: the footer's widget position is excluded from the hidden
  trailing range.
- `src/plugin/transaction-filter.ts`: the escalation clamp.
- `src/select-all-ladder.ts`, `src/select-extend.ts`: scope-bounded termination.
- `src/result.ts`, `src/plugin/messages.ts`: one new rejection reason and its cue.
- `src/plugin/main.ts`: three commands, a context-menu entry, the view registry registration.
- `styles.css`: the breadcrumb panel.
- Tests: a new `tests/zoom.test.ts` unit + property suite; subtree-as-document cases in
  `tests/project.test.ts`; scope cases added to `tests/select-all-ladder.test.ts` and
  `tests/select-extend.test.ts`; a new `e2e/specs/80-outline-zoom.e2e.ts` plus its label in
  `scripts/spec-groups.mjs` (70–76 are the footer's).

## Sequencing

- **Rebased onto `main` after the backlinks work landed** (#64 `backlinks-footer` /
  `backlink-index` / `tree-projection`, #50 `selection-structural-ops`, and the outline-grid
  decoration series #54/#61/#65/#67). Those are what this change now builds on rather than works
  around; each is credited where it is used.
- **Stacked on `backlinks-controls` (#71), which carries the shared sequencing.** That change
  states the relationship from its side and this one does not restate it: the two are
  independent in both directions, their `backlinks-footer` deltas do not collide, and the three
  files both touch — `backlinks-footer.ts`, `footer-model.ts`, `styles.css` — collide
  mechanically rather than by design. Stacking makes "whichever lands second rebases" an order
  rather than a race. This change still must NOT assume the filter model exists, and deliberately
  leaves the footer answering for the note while zoomed.
- **The shared touch point is settled, on both sides.** Task 1 measured that the footer fix can
  only be a re-anchoring, never a shortened hidden range (docs/research/23), and #71 now carries
  that in its own sequencing rather than the open question it started with. The two changes agree
  on what `backlinks-footer.ts` gets: a zoom-conditional mount position, which is a rebase for
  whichever lands second and not a design conflict.
- **`paste-heading-section-reencoding` is unrelated** — it touches the re-encoding algebra, which
  zoom does not read.
- **Fold does not exist yet, and zoom does not need it.** Unlike obsidian-zoom, which requires
  Obsidian's "Fold heading"/"Fold indent" settings because it derives its ranges from native
  folding, this change computes the visible range from our own parse. Their composition is a
  question for whenever fold lands, not a prerequisite here.
- **Task 1 was a mechanism spike and a real gate, and it has returned its verdict.** Block-level
  replace decorations under Live Preview, over widget-rendered atoms, alongside three existing
  decoration sources and the footer, is exactly the shape of bet the `outline-decorations`
  postmortem was written about (docs/research/06). The verdict is PROCEED, with two of this
  change's own claims struck by measurement — D2's "confinement comes mostly for free" and D12's
  first candidate fix. Both are recorded in `docs/research/23-zoom-hiding-mechanism.md` and folded
  back into the decisions they belong to.

## Follow-ups this change records rather than builds

Each is written where the work would be picked up, not only here.

- **Re-basing a list-item root's within-list indentation** —
  `docs/research/12-decoration-follow-ups.md`, with the mechanism and the offset the outline grid
  made computable.
- **Click-to-zoom on a marker or a guide** — already filed in the same parking lot, still gated on
  the `pointer-events` work named there.
- **Zoom persistence, and the Workflowy rule for the splits that stay refused** — below, and in
  design D8's cost note.
- **Focusing the footer on the zoomed block** — `backlinks-controls` carries it in its own
  sequencing, which is where the filter model it needs is being designed.

## Out of scope

- **Persistence.** Zoom does not survive a file switch, a pane close, or a restart. Q11 of the
  decision log already places view-state restoration in a later layer, and a path-keyed store
  (the shape `outlinePaths` uses) cannot represent two panes zoomed differently on the same file.
- **Click-to-zoom on a marker or a guide.** Filed in docs/research/12 and gated there on work
  this change does not do: `MarkerWidget` is `pointer-events: none` with `ignoreEvent() → true`,
  and guides are pseudo-elements with no hit area.
- **Changing what Enter does on the zoom root.** The refusal is scoped to the splits whose
  destination is the root's SIBLING scope; the ones landing in its child scope already work, so
  the Workflowy feel this was originally filed as a follow-up for is mostly what the existing
  grammar already produces. What is still deferred is making the sibling-scope cases land
  somewhere useful instead of being refused — a zoom-conditional rule in a grammar that is
  otherwise zoom-unaware, worth judging against real use first.
- **Re-basing a list-item zoom root's within-list indentation.** Diagnosed in design D9 with the
  mechanism that would do it (one container-level shift, not per-line surgery); deliberately not
  built until the plain case has been used. The outline grid landing makes the residual offset
  computable rather than measured, which is what the deferred fix would need.
- **Focusing the backlinks footer on the zoomed block.** The right end state, and the wrong change
  for it: it needs the filter model `backlinks-controls` is still designing, and pulling it here
  would couple two open proposals. This change keeps the footer visible and unfiltered while
  zoomed, which is the thing that change can then narrow.
- **Zoom as a navigation target**: following a link or a search hit into a zoomed scope, revealing
  a hidden match, or a "zoom here" affordance in the core outline pane.
- **Mobile gestures and breadcrumb overflow.** The panel renders and is usable; a long ancestor
  path collapsing into a popover is polish.
- **Zoom out one level from the keyboard by pressing Left on the top node** (Workflowy's gesture).
  Motion keys stay motion keys in this change.
