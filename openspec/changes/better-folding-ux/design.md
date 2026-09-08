## Context

See proposal.md — Why. What decides this design is one measurement:
[docs/research/24-fold-mechanics.md](../../../docs/research/24-fold-mechanics.md). Obsidian's fold
is CodeMirror's fold, behind a `foldService` facet that already holds three providers and takes a
fourth; a provider that answers from our tree makes any node foldable, makes Obsidian's own
`editor:toggle-fold` work on it, and makes the fold persist and restore per file. The chevron is
the exception — Obsidian paints it by its own heading/list rule, not from `foldable()` — so the
mechanism is inherited and the affordance is ours.

What the code already provides, and what this design leans on:

**Folded state is readable and writable from anywhere.** `zoom-view.ts` already imports
`foldedRanges` and `unfoldEffect` from `@codemirror/language` and dispatches them; the same
module supplies `foldEffect`, `foldable` and `foldService`. Nothing new enters the bundle.

**The tree is already computed per state.** `parsed-doc.ts` caches the parse; `decorate.ts`
produces per-line facts including each line's node and depth; `zoom-scope.ts` and
`selection-structural-ops` already turn a caret or a selection into subtree roots and their line
covers. A fold range is that cover expressed as offsets, so no new geometry is invented.

**The marker gutter is already shared chrome.** `decorations.ts` measures Obsidian's chevron and
transforms it onto our marker column per line (`--to-chevron-dy`, `--to-chevron-dead-right`), and
draws our own marker icons there. A second affordance in that column is a fourth tenant of a 14px
gutter whose budget is already the subject of a parking-lot entry
([12](../../../docs/research/12-decoration-follow-ups.md), "The affordance budget").

**Guides are one gradient, not elements.** Each line's `--to-guides` paints every ancestor level
at `depth × unit` on a single `::after`
([09](../../../docs/research/09-experiment-2-guide-lines.md)). There is no per-guide element to
click and there will not be one.

**Marker clicks are already claimed.** `zoom-click.ts` owns a capture-phase `pointerdown` above
the editor and zooms on a mark; `outline-zoom` requires that a marker click NOT fold. Fold
gestures have to compose with that listener rather than race it.

## Goals / Non-Goals

**Goals:**

- One fold rule, derived from the tree, that every kind and every entry point agrees on.
- Inherit Obsidian's fold state, placeholder, commands and persistence rather than shadowing them.
- Keep the affordance budget honest: one fold target per line, in one column, whoever draws it.
- Fold state that survives the operations a folded subtree exists to make possible.

**Non-Goals:**

- A fold model of our own in plugin data. Fold state stays CodeMirror's, persisted by Obsidian.
- Animated collapse. Out of scope, and CM6's block replacement gives no natural hook for it.
- Changing where Obsidian paints its own chevron. We add where it paints none; we do not remove.
- Reading mode, the core Backlinks pane, and configurability of the guide gesture (proposal —
  Non-goals).

## Decisions

### D1. One `foldService` provider, at high precedence, answering from the tree

`Prec.high(foldService.of(...))` so our answer wins over the three native providers on lines they
also claim. The provider resolves the line to its node through the cached parse, returns `null`
when the node has no children, and otherwise returns `{ from: end of the node's own last line, to:
end of its last descendant's last line }`.

*Alternative rejected:* answering only where the natives return `null` (the "fill the gaps" shape).
It is smaller, but it leaves fold extents differing by kind — a heading folding to the next heading,
a list item folding by indentation, a paragraph folding by our tree — and it leaves every fold
subject to Obsidian's "Fold heading" / "Fold indent" settings. The whole point of the change is
that a node folds because it is a node.

*Consequence to verify first (task 1):* whether Obsidian's own click and command paths consult
those two settings BEFORE asking `foldable()`. The research note lists this as the one unmeasured
claim the design rests on. If they do, the commands still work and only the native chevron goes
quiet with the settings off — a degradation, not a redesign.

### D2. The trailing gap stays visible

A fold ends at the last descendant's last CONTENT line, not at the end of its owned gap. Measured
native folds do the same, and hiding the blank line between two siblings makes folding one node
change the spacing of the next. Stated in the spec so it cannot drift.

### D3. Commands dispatch effects; they never edit the document

Fold and unfold are `foldEffect` / `unfoldEffect` dispatches, resolved through the same
`selection-structural-ops` operand the structural commands use. This keeps folding outside
`transaction-classification` entirely: a fold produces no `ChangeSet`, so the enforcement filter,
the minimal-change dispatch and the undo history never see it.

*Escalation to the nearest ancestor with children* (spec: "Three commands…") is resolved by
walking the node path from the caret's node upward — the path is already in hand from the parse.

### D4. Fold state through a structural op is re-derived, not mapped

Measured: an indent preserves a fold because it rewrites only indentation prefixes; a move
destroys it because a range whose ends are inside deleted text cannot map. So the operation
records the fold state of the operand's subtree BEFORE the change as node paths (not offsets),
and re-applies it AFTER, from the paths the operation's own result already reports.

*Alternative rejected:* making the move emit an edit shape CM6 can map a fold through (e.g. moving
the boundary lines only). That is a change to `ops.ts`'s minimal changesets for a presentation
concern, and `minimal-change-dispatch` exists to keep those changesets aligned with the tree, not
with the fold layer.

*Placement:* in the same dispatch that applies the operation, so one transaction carries the edit,
the selection and the fold effects, and one undo restores all three.

### D5. Our own affordance is a widget in the marker column, not a second gutter

For a foldable line Obsidian paints no chevron on, the plugin renders a fold affordance as a
line-start widget in the marker gutter — the same place `decorations.ts` already puts marker icons
and the same place the native chevron is transformed onto. One element per line at most: when
Obsidian's chevron is present, we position it and draw none of our own.

*How much of this there is:* less than it first looked. Only three kinds can hold children —
heading, list item (bullet, ordered or task), and paragraph via the attachment rule; an atom is
never a parent, verified against `parse` (a list after a table is the table's sibling). Obsidian
already paints a chevron on the first two, so the paragraph is the sole consumer today. The
condition is still written as "no native chevron on a foldable line" rather than "is a paragraph",
because which lines Obsidian decorates is internal to it.

*Alternative rejected:* a CM6 `gutter()` beside the content. It is the obvious mechanism and the
wrong one here: a gutter sits outside the readable-line-width column, so the affordance would
detach from the outline's own left edge and would not follow the zoom scope's re-based guides.

*Alternative rejected:* reusing the native chevron by making Obsidian paint more of them. Its rule
is internal; there is no supported way to extend it.

### D6. A folded marker is the same glyph, solid, plus the count — decided

The mark's job is to say what kind of node this is; folding is a second fact about the same node,
and the marker gutter's width is derived from the marks it must hold
([21](../../../docs/research/21-marker-text-gap.md)), so a folded variant that grows the box would
move every line. That rules out anything drawn around the glyph before taste enters.

Seven candidates were drawn against every foldable mark at real geometry in
[`24-fold-marker-mockup.html`](../../../docs/research/24-fold-marker-mockup.html) and reviewed
rendered. **Chosen: solid glyph plus the hidden-descendant count.**

*Why not the others.* The halo (Logseq's answer,
[12](../../../docs/research/12-decoration-follow-ups.md)) is too heavy at 14px and crops the
corners of a wide glyph — the "H", an ordered "12."; the shaped halo fixes the cropping only by
becoming a different shape per kind, so one state reads as several, and behind a task's checkbox
it is nearly the checkbox again. Outline and dashed outline sit 3px off a 14px glyph in a gutter
the fold affordance already shares, and an outline competes with the caret accent's own ring.
The underline is the quietest but collides with the guide line running through that column.

The weight change is the only treatment every mark can carry identically, and the count is the
only one that says HOW MUCH is hidden — which is the question a folded node actually raises, and
the one thing a bullet, already solid, cannot answer on its own.

The hidden-descendant count renders as a widget after the node's text, `contenteditable="false"`
and outside the document — the same class of chrome as the trail and the footer, and subject to
the same "never mutate document state" requirement `outline-decorations` already carries.

### D7. The guide gesture is hit-test arithmetic, not an element

The click's x-offset within the content column is compared against the guide columns the line
already declares (`depth × unit`, plus the marker gutter's base). Within a tolerance narrower than
half a unit, and only left of the node's own text, the click is a guide click; otherwise it falls
through untouched.

This dissolves the parking-lot blocker, which assumed a hit area had to be invented. It also keeps
the guides themselves `pointer-events: none`, so nothing about their painting changes.

*Where it lives:* the existing capture-phase `pointerdown` listener in `zoom-click.ts`, extended
rather than duplicated. Two listeners racing for the same press is the defect that listener was
written to avoid, and the ordering between "is this a mark?" and "is this a guide column?" has to
be decided in one place. Marks win; they are the smaller target and the more specific claim.

*Touch:* the same `pointerdown`, as `outline-zoom` established — a mouse-only listener makes the
gesture not exist on mobile, and the guide tolerance may need to be wider there. Left to the
implementation pass with a mobile e2e run as the check.

### D8. Persistence is Obsidian's, and the setting is a suppression

Nothing is written by us: with the provider registered, `app.foldManager` already saves and
restores our folds. The setting therefore does not choose a storage; it decides whether a restored
fold is kept. With it off, the plugin unfolds everything inside its jurisdiction when a note's
editor is created — the same lifecycle hook the footer's per-note state already uses. Obsidian's
own folds in non-outline notes are none of our business either way.

### D9. The footer reuses the editor's fold chrome, and deletes its own

`to-backlinks-fold` and its CSS rule go away rather than being fixed in place, which is what the
parking-lot entry asks for. The row's fold becomes a property of the row HAVING a subtree, kept in
`ViewState` per node id — the same shape the group cap's `truncatable` uses for the same reason
(once expanded, the old "has hidden children" test stops being true and the affordance vanished).
The footer's rows are DOM, not CM6, so what is shared is the mark, its column, its hover behaviour
and its folded treatment — not the fold state itself, which stays the footer's own reading state.

## Risks / Trade-offs

- **We take over folds that work today.** A high-precedence provider changes the extent of every
  heading and list fold to our subtree cover. → Task 1 diffs native vs. ours across the fixture
  corpus before anything is built on it; a divergence that is not clearly an improvement is a
  reason to narrow D1's precedence to the kinds Obsidian declines.
- **Obsidian's fold settings may gate more than `foldable()`.** → Measured in task 1; the fallback
  is stated in D1.
- **A fourth tenant in a 14px gutter.** The affordance budget entry already says the gutter is
  full. → We add no new column: at most one fold affordance per line, in the column the chevron is
  already transformed onto, and the marker takes the folded state rather than a new element.
- **The guide gesture competes with caret placement.** A tolerance too wide steals ordinary
  clicks near an indent. → The spec fixes the failure direction (a click on text is always a
  click on text), and the tolerance is verified by an e2e that clicks just inside and just
  outside it.
- **Re-derived fold state can be wrong where the operation re-encodes a node.** An outdent that
  changes a list item into a paragraph produces a node whose identity is the path, not the text.
  → Fold state is keyed by path from the operation's own result, which is the same source the
  caret placement uses; if the result reports no path for an operand, its fold is dropped rather
  than guessed.
- **Fold state is not undo state.** Undoing a move restores the text; the fold effects dispatched
  with it are not themselves undoable. → Dispatching them in the same transaction is what makes
  the pair behave as one step; verified by an e2e that folds, moves, undoes and reads both.

## Open Questions

- **Where the count sits when a node's text wraps.** After the text means after its LAST visual
  row, which is not where a reader looks. Anchoring it to the first row instead is a rendering
  decision the mockup does not settle, and either answer satisfies the spec.
- **The guide tolerance on touch.** Whether the mobile hit band needs to be wider than the desktop
  one, answered by the mobile e2e run rather than in advance.
- **Whether `fold one level more/less` should track a remembered depth** rather than recomputing
  the deepest unfolded level each time. Only observable when the two disagree — after an edit that
  changes depth between invocations — and either answer satisfies the spec's scenarios.
