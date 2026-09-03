## Context

See proposal.md — Why. What matters for the approach is what already exists and what zoom is
allowed to use.

**What zoom can build on.** The tree is parsed once per document version and cached by CM6 `Text`
identity (`src/plugin/parsed-doc.ts`). Subtree geometry in line space already exists and is
shared by four consumers: `escalate.ts`'s `subtreeCoverOf` returns exactly "this node plus its
descendants plus its trailing gap" as a `{start, end}` `LinePos` pair. `locate.ts`'s
`forEachNodeWithLine` is the one traversal pairing nodes with absolute lines, and `nodeAtLine`
resolves a line to its node with gap ownership already applied. Rejections are typed values with
a message table and a Notice path (`src/result.ts`, `src/plugin/messages.ts`). Every editor
extension gates on outline mode through one helper and declines inside nested editors.

**What the backlinks work left behind for this feature.** `tree-projection` states that a detached
tree is "a valid document its consumers can treat as any other", that a consumer reads the tree it
was handed and never a remembered source depth, and that the decoration fact layer accepts one
unchanged — pinned by `tests/projection-decorate.test.ts`. That is the guarantee zoom's re-basing
rides on (D9). `selection-structural-ops` moved every structural operation's operand from the node
at the caret to the selection's covered roots, and made the keyboard and the palette resolve one
operand and one after-state — so a scope check is stated once, over a forest (D8).
`backlinks-footer` mounts a block widget at `state.doc.length`, which is a position zoom would
otherwise hide (D12). The outline-grid series (#54/#61/#65/#67) rewrote how list indentation is
produced, which shrinks but does not remove D9's exception.

**What zoom may not do.** Public Obsidian APIs only, no `(editor as any).cm`. No in-file
metadata — zoom is transient view state, so even a `^block-id` anchor is out. Native list
rendering is never overridden (Experiment 1's rule, docs/research/08); our indentation is
strictly additive. The decoration layer has a postmortem behind it (docs/research/06): a visual
mechanism is proven against a real vault before a design is built on it, not after.

**What the precedent gives us.** obsidian-zoom (MIT, vslinko) proves block-level replace
decorations hide content in the standard markdown view on public APIs, and that a CM6 panel
renders as a breadcrumb header there. It also shows two things not to copy: it derives its
ranges from Obsidian's native folding, which is why it demands "Fold heading"/"Fold indent" be
enabled, and it maps the hidden-range decorations themselves through document changes, so the
ranges and the content can drift apart. We have our own parse and do not need either.

## Goals / Non-Goals

**Goals:**

- One source of truth for the scope: the zoom root is re-derived from the current parse, never
  stored as geometry.
- Zoom is a scope parameter, not a second set of rules. Every layer that already answers a
  question about the document answers the same question about the scope, in the same shape.
- The view never lies: what is invisible is also unselectable, unreachable, and unmodifiable.
- Nothing zoom does is a document mutation, and nothing it stores outlives the editor view.

**Non-Goals:**

- Making the zoom root's own text behave differently from any other node's (that is the
  Workflowy hoisted-title model; proposal.md — Out of scope).
- Changing subtree geometry, escalation geometry, or the caret policy. Zoom bounds their results;
  it does not restate them.
- Any composition rule with fold, which does not exist yet.

## Decisions

### D1. The zoom root is a mapped document position, re-resolved through the parse

The state is one CM6 position: the start of the zoom root's own first line. It maps forward
through every transaction with `tr.changes.mapPos`, the same mapping the caret already rides.
Everything else — the visible cover, the hidden ranges, the ancestor trail, the sub-document the
re-based facts come from — is **derived** from `(anchor, parsed doc)` at the moment it is needed.

*Why not the node id:* ids are allocated per parse and `model.ts` says so in its own comment —
"stable within one tree; not persisted anywhere". A re-parse after any keystroke invalidates it.

*Why not a `NodePath`:* a path is stable under edits inside the node and unstable under exactly
the edits that are common — inserting or deleting a sibling above the root shifts every index in
the path's prefix, silently retargeting the zoom.

*Why not a native `^block-id`:* it writes to the file. Zoom is transient view state; Q3 of the
decision log allows block ids only on demand for real references.

*Consequence worth naming:* the hidden ranges are never stored and never mapped, so they cannot
disagree with the content the way obsidian-zoom's mapped decorations can. There is one piece of
mapped state and it is a single integer.

*Association: FORWARD (`assoc: 1`), and it is observable.* An earlier draft claimed the argument
could not change which node resolves, on the grounds that the anchor is only consumed as "which
line is this". That is false, and the counter-example is an ordinary in-scope edit: insert text
CONTAINING A NEWLINE at the root's own line start — a paste, or typing followed by Enter. With
`assoc: -1` (CM6's default) the anchor stays before the insertion and now sits on the inserted
line; with `assoc: 1` it follows the insertion and stays on the root's own line. The two resolve
to different nodes, and only the forward one resolves to the node the user zoomed into.

Forward association is therefore part of the design, not an incidental argument. An insertion at
the anchor with no newline in it moves the anchor along its own line, which resolves identically
either way — so forward is never worse and is sometimes the only correct answer. The remaining
case, the anchor's line being deleted outright, is D4's first exit trigger and is not an
association question.

### D2. Hiding is two block-level replace decorations, and the mechanism is a gate, not an assumption

Two `Decoration.replace({block: true})` ranges: document start through the start of the root's
first line, and the end of the root's subtree cover through document end. Each range must consume
the newline that separates it from the visible content, or CM6 leaves a stray empty line where
the replacement ends — the same correction obsidian-zoom expresses as `from - 1` / `to + 1`.
Either range is omitted when empty (a top-level first node has nothing above it).

*Why replace rather than a `display: none` line class:* a hidden-but-present line keeps its line
box and keeps accepting the caret. Block replacement takes the lines out of the layout entirely —
measured, docs/research/23: content height fell from 770px to 589px for a four-line span, with no
leftover box.

*Struck by measurement (docs/research/23).* An earlier version of this decision added that
block replacement therefore delivers "most of the confinement guarantee for free rather than as a
pile of corrections". It does not. With only lines 4–5 visible, `ArrowDown` on the last visible
line put the caret on line 7, `ArrowUp` on the first put it on line 2, and three `Mod-A` presses
selected the whole document. Outline mode's own motion handlers and ladder are what moved the
caret — they know nothing about a scope, and the spike cannot separate them from CM6 because both
gate on outline mode — but the conclusion for this change is the same either way: **every site in
D7 and section 8 is real work, and none of it is free.**

*The gate.* This is a visual-layer bet of exactly the kind docs/research/06 was written about,
and this one is placed under three existing decoration sources plus Obsidian's own Live Preview
widgets. Task 1 proves, against a real vault, that: the two ranges hide correctly with the
caret at either boundary; widget-rendered atoms (table, callout, html, hr) inside and outside the
scope behave; the existing line decorations, markers, guides and margin compensation are
unaffected on the visible lines; and `showPanel` renders. If it does not hold, the change stops
and the findings are written up — the fallback (per-line replacement plus a zero-height line
class) keeps the line boxes and would not deliver confinement, so it is a different design and
deserves a different proposal, not a silent substitution.

### D3. The scope is `subtreeCoverOf(root)` exactly, trailing gap included

The visible range is the zoom root's subtree cover as `escalate.ts` already computes it —
including the root's own trailing gap, which the cover geometry includes and every clamp
comparison assumes.

*Why not trim the gap:* a trimmed range would be a range no cover computation ever produces, so
every clamp would be comparing a cover against a not-quite-cover and the "still an exact cover"
guarantee in D7 would fail on a blank line. The cost is a trailing blank line at the bottom of
the zoomed view; the benefit is that scope and cover are the same kind of object everywhere.

### D4. Zoom exits automatically on three triggers, and no others

1. **The anchor no longer resolves to a node.** `nodeAtLine` returns undefined — the root's lines
   were deleted, or the document has no nodes left.
2. **A change touches a position outside the visible range as it stood before the transaction.**
   This is the catch-all for changes that never passed the clamps: undo and redo, which bypass the
   enforcement filter entirely because `@codemirror/commands` dispatches history transactions with
   `filter: false` (established in `caret-placement-policy`); a sync or external write; an edit
   dispatched from another pane onto the same file.
3. **Outline mode goes off** for the file, which already forces a redraw path.

*Why not a content or kind signature on the root:* it would exit on ordinary typing inside the
root's own text, which is the one edit that must not disturb the zoom.

*The retarget hazard, and why it is closed rather than mitigated.* The feared failure is an edit
that merges the root's first line into the node above, after which the anchor resolves to a
different node and the zoom silently retargets. That edit is impossible from inside the scope:
the node above is outside the visible range, so the clamp (D7) forbids a selection or change
reaching it, and any change that does reach it trips trigger 2 and exits first. The property is
therefore *the clamp makes the anchor safe*, and it is worth a property test rather than a
comment.

### D5. Commands dispatch through a view registry, because the public `Editor` exposes no `EditorState`

A CM6 `StateEffect` can only be dispatched to an `EditorView`. Obsidian's public `Editor` and
`MarkdownView` do not expose one — `main.ts`'s `StructuralOp` comment already records this as the
reason the palette path cannot read the `indentUnit` facet. So: a small `ViewPlugin` records each
live `EditorView` against the `MarkdownFileInfo` it carries in the public `editorInfoField`, and
drops it on destroy. A command callback resolves the active view, looks up its `EditorView`, and
dispatches.

*Why not `(editor as any).cm`:* the project's own public-API rule, and the scorecard target.

*Why not bind zoom in the CM6 keymap, where the view is already in hand:* zoom needs a
command-palette entry, user-rebindable hotkeys, and a context-menu item — all of which come from
`addCommand`, and none of which a keymap binding provides.

*And, on implementation, that argument turned out to remove the keymap binding entirely rather
than merely rank it second.* An earlier version of this decision assumed two keyboard paths, the
way `caret-policy.ts` is shared by the grammar and the palette. The analogy does not hold: the
grammar binds Tab and Enter in CM6 because it must INTERCEPT keys the platform would otherwise
handle, and zoom has no such key. A CM6 binding for it would be strictly worse than the command's
own hotkey — invisible in Obsidian's hotkey UI and impossible for a user to rebind. So the
keyboard path IS `addCommand`'s hotkey, and there is one dispatch route rather than two.

No DEFAULT hotkey ships with it, unlike the move commands. Those inherit a dominant convention
(`addStructuralCommand`'s comment records why a default is justified there despite the guideline);
zoom has none, and every plausible binding is already spoken for by Obsidian core or a common
community plugin.

*Side note, not in scope:* the same registry would close the `indentUnit` gap for the four
structural commands. Not done here — it is a separate defect with its own tests.

### D6. Zoom in targets the node at the caret; the caret is untouched by zoom

Resolution is `nodeAtLine` on the caret's line — the same resolution `addStructuralCommand` uses,
gap ownership included, so a caret on a node's trailing gap zooms into that node.

Zooming into a childless node, or into an atom, is **allowed**. A "must have children"
precondition would make the command's availability depend on a fact the user cannot see before
pressing, and it would be the feature's only kind-conditional rule. Workflowy allows it too.

The caret does not move in either direction. Zoom in targets the caret's own node, so the caret is
already inside the new scope; zoom out only widens it. There is no case where zoom must relocate
a caret, and inventing one would put a second caret authority beside `caret-placement-policy`.

### D7. Confinement is one predicate applied at three kinds of site, and only one of them clamps

The predicate is "is this position/range inside the visible cover". Where it is applied differs,
and the difference is load-bearing:

- **Walks are told their scope and stop inside it.** The select-all ladder's rungs and the
  Shift+Arrow cover sequence are enumerations; they take the scope as a bound and their last
  element becomes the root's own subtree. The ladder additionally suppresses its documented
  fall-through to native Select All, which would select hidden text.
- **Escalation clamps by intersection.** The enforcement filter's escalation is a correction
  applied to whatever the platform produced, not an enumeration, so it is the one site that
  truncates. Its result is still an exact cover, because the scope is itself a cover and the
  intersection of a cover with an enclosing cover is a cover.
- **Motion stops at the boundary.** A motion command whose computed target lies outside the scope
  leaves the caret where it is rather than moving to the boundary and then being corrected.

*Why not one clamp applied to everything at the end:* truncating an already-computed cover can
produce a range that is not a cover, which `node-selection-extension` explicitly requires its
dispatches to be ("Extension dispatches exact covers and leaves escalation untouched"). Bounding
the enumeration preserves that invariant; truncating its output does not.

### D8. An escaping operation is refused over the OPERAND, at one site, not inside the ops algebra

`src/ops.ts` stays zoom-unaware. The guard is a precondition on the resolved operand: the
operation is refused when ANY covered root of the operand is the zoom root itself, or when the
operation is an outdent and any covered root is a direct child of the zoom root. New typed reason
`would-leave-zoom-scope`, surfaced through the existing rejection Notice, with no document
change.

*The splitting keys are judged by DESTINATION SCOPE, not by node identity.* An earlier draft
refused every Enter that would split the zoom root, which is wrong and would have rejected valid
in-scope edits. `outline-keyboard-grammar` already states where each split lands: at a node's
content END the new position is in its CHILD scope when it has children and its SIBLING scope when
it does not; at a content START it is always the sibling scope; an interior split makes the
remainder a FIRST CHILD for a node with children and a next sibling for a node without; and an
interior Enter on a heading always produces a child, because a plain-text split has no
heading-sibling encoding. So the rule is: an Enter on the zoom root whose destination is the
root's SIBLING scope is refused; one whose destination is its CHILD scope is allowed, because a
child is inside the scope. Enter on an EMPTY list item is refused when the root is that item,
since it outdents or unwraps rather than splitting — both of which move the root itself.

*Over the operand, not a subject.* `selection-structural-ops` shipped after this change was first
drafted and replaced "the node at the caret" with "the selection's covered roots, one contiguous
sibling run per parent". A scope check written over a single subject would pass a multi-root
selection whose FIRST root is safe and whose last one escapes. The check is therefore a predicate
over the operand forest — refuse if any root escapes — which is also the only formulation that
survives the next selection feature.

*At one site, not two.* The same capability guarantees the keyboard and the palette resolve one
operand and one after-state, so the guard sits on that shared resolution and the two entry points
cannot diverge by construction. The earlier draft of this change specified the refusal twice, once
per entry point, and would have re-introduced exactly the palette-versus-keyboard drift that
capability exists to prevent.

*Why not pass a scope into `indent`/`outdent`:* the algebra's closure and round-trip properties
are this project's load-bearing guarantee, and every property test over them would acquire a
parameter it does not care about. Zoom is a property of a view, not of a tree.

*Why not auto-zoom-out and perform the operation:* a keystroke would silently change the view
scope, and undo would restore the document without restoring the scope — a state the history
integration has no way to express.

*Cost, stated plainly — and smaller than the earlier draft claimed.* Enter at the end of the zoom
root's own line is refused only when the root has NO children, since that is the case the grammar
sends to the sibling scope. A zoom root WITH children — the ordinary case for zooming — already
gets a first child from that keystroke, which is the Workflowy behaviour a previous version of
this design filed as a follow-up before checking what the grammar already did. What remains
refused is Enter at a content start, an interior Enter on a childless root, and Enter on an empty
list-item root; making those land somewhere useful instead of being refused is the part still
deferred (proposal.md — Out of scope).

### D9. Re-basing decorates a SUB-DOCUMENT; the pure decoration layer is not modified at all

While zoomed, the decoration facts for the visible lines are derived by decorating the zoom root's
subtree AS a document — `{ preamble: [], children: [root] }` — with the existing `decorate()` and
`computeLineGuides()`, unchanged. The root comes out at depth 0 and its descendants at 1, 2, …
because depth is read from the tree that was handed in. Line numbers translate by a constant
offset: the subtree is contiguous in the source, and the sub-document has no preamble, so
document line = subtree start line + sub-document line.

*This is a guarantee, not a hope.* `tree-projection` states it outright — a detached tree is a
document its consumers accept unchanged, depth is the detached tree's own, and nothing carries a
remembered source depth — and `tests/projection-decorate.test.ts` pins it for the decoration fact
layer specifically. Zoom is the second consumer of a guarantee that already has a test.

*Why not thread a re-basing offset through `decorate()`,* which is what this decision said before
the rebase onto the backlinks work: it adds a parameter to two pure functions every decoration
path calls, for the benefit of one caller, and creates a second way to express depth in a layer
whose whole recent direction has been the opposite — one grid, one unit, one column definition
(`outline-decorations`, `chrome-tokens.ts`). The sub-document reaches the same facts by handing
the existing function a different tree, which is an operation the codebase already models.

*Why the sub-document is not `project()`.* The obvious reading of `tree-projection` is that zoom is
a projection with the predicate `node === root`. It is not: a projection deliberately KEEPS every
ancestor of a match, and its own depth rule says a match's depth in the projection equals its depth
in the source. Both are right for backlinks and wrong for zoom, which wants the ancestors as
breadcrumbs and the root at depth 0. So this is a sibling operation, and its home is
`src/project.ts` beside `project` rather than inside `src/zoom.ts` — the two detached-tree
constructions carry one consumer contract and should state it in one place.

**The exception, smaller than it was.** For a list item the within-list depth is still supplied by
Obsidian's own list rendering: `decorations.ts` applies only `supplementalDepth` for a list item,
retargeting native rendering by supplying the unit, and `outline-decorations` now explicitly
forbids repositioning a list item line by line. A sub-document re-bases our contribution and cannot
re-base theirs, so a zoom into a deeply nested list item still carries its within-list indentation.

What the outline grid changed is that this residual is a KNOWN quantity — the root's depth within
its list, times the outline unit, both already stated by the plugin — rather than whatever Obsidian
measured from the leading whitespace. The deferred fix is therefore computable: **one** negative
`margin-left` on the content container, not per-line surgery, since every visible line shares the
identical offset while zoomed. Deferred until the plain case has been used against a real vault
(docs/research/12's parking-lot standard).

### D10. Breadcrumbs are a CM6 panel

`showPanel` from `@codemirror/view` — externalized in the build and provided by Obsidian, and
used by obsidian-zoom in this exact context. The panel exists only while zoomed.

Contents, in order: the file's basename, then each ancestor of the zoom root from the outermost
in. The zoom root itself is not a crumb — it is the first visible line (proposal.md — What
Changes). Clicking a crumb zooms to it; clicking the file zooms out fully.

Crumb labels are each node's first line with its leading block syntax stripped, through the
function `footer-model.ts` already has for exactly this — see D13, which is where that decision
now lives. A node whose label would be empty falls back to its kind name, so a crumb is never
blank and never zero-width.

*Why not inject into the `MarkdownView` header:* not a public extension point, and it would need
per-view lifecycle management that the panel provides for free.

### D11. Zoom is another decoration source, and hidden lines make the others inert

The hiding decorations come from their own `StateField` exposed through `EditorView.decorations`,
alongside the three existing sources. Ordering against them does not need a rule: a hidden line is
never rendered, so a `Decoration.line` on it has nothing to apply to, and the widget-atom DOM
patcher iterates mounted DOM only, so hidden widgets are simply absent from its walk. What must
be verified rather than reasoned about is the *visible* lines' chrome, which is spike task 1.

Zoom declines inside nested per-cell editors through the same `isNestedEditor` gate every other
extension uses.

### D12. The backlinks footer is excluded from the hidden trailing range

`backlinks-footer` mounts its widget with `Decoration.widget({block: true, side: -1})` at
`state.doc.length`. D2's trailing hidden range runs from the end of the zoom root's subtree to
that same position, so the naive construction hides the footer along with the content it sits
after. The footer stays visible while zoomed, rendered after the zoomed content and still
answering for the note.

*Settled by measurement (docs/research/23): the widget is re-anchored, because shortening the
range is not a fix.* Both moves were tried. The footer does disappear under a trailing range that
runs to `doc.length`, as predicted. Stopping that range at the final line's start does NOT bring
it back — and cannot, for any document ending in a newline: such a document's empty final line
STARTS at `doc.length`, so the two candidate endpoints are the same position, and no position
strictly inside the trailing range leaves an anchor at `doc.length` outside it. A stand-in block
widget anchored at the end of the visible range, just outside the trailing range, renders
normally. So the fix is that the footer anchors at the visible end while a zoom is active.

*Why not simply suppress the footer while zoomed:* it removes a shipped feature from the zoomed
view to avoid a mechanical interaction, and the zoomed reader is exactly the reader most likely to
want to know what points here.

*Scoping the footer to the zoom root is NOT this change.* It is the right end state and it needs
the filter model `backlinks-controls` is still designing. This change leaves the footer
unfiltered, which is the state that change can then narrow — and it deliberately does not add a
zoom-shaped hook for it to use, since that would be designing that change's interface from here.

### D13. Crumb labels reuse the footer's prefix stripping, lifted rather than copied

`footer-model.ts` already has `stripBlockPrefix`: one line's leading block syntax — quote carets,
heading hashes, a list marker with its optional checkbox, an ordered number — removed in the order
those actually nest. That is exactly what D10's crumb labels need, and it is currently private to
that module.

It is lifted to a shared home and used by both, rather than reimplemented in `src/zoom.ts`. Two
markers-stripping functions that agree today and drift tomorrow is a defect this repo has already
paid for once and fixed deliberately — `line-pos.ts` exists because `LinePos` had been declared in
three modules, and `29bf257` collapsed the line-position helpers to one definition each for the
same reason. The earlier draft of D10 specified a fresh `nodeTitle` built on `contentColumnCh`,
which would have been the third such function and the one that handles the fewest shapes.

## Risks / Trade-offs

- **Block replacement misbehaves under Live Preview** (the widget-atom interaction is the most
  likely shape) → D2's spike is task 1 and is a stop-the-change gate, with the findings written
  up either way. No design work downstream of it starts before it passes.
- **Hidden text remains in the document, so Obsidian's own search may still match it** → CM6
  removes replaced blocks from cursor motion, but the text is still in `state.doc`, and
  find-in-page behavior is Obsidian's, not ours. Measured in the spike; if it holds, it is stated
  as a known limitation of the scope rather than papered over.
- **The footer's widget sits inside the range zoom hides** → D12 states the requirement and hands
  the mechanism to task 1, where the editor is already open for the same class of question. Left
  unhandled this is not subtle: the footer simply vanishes on zoom.
- **Eight capabilities acquire a zoom clause** → the confinement rule is stated once, in
  `outline-zoom`, and each delta states only its own bound. The alternative — leaving the bound
  implicit in the interaction of two specs — is what produced the Shift+Arrow behavior that
  `node-selection-extension` had to replace.
- **The scope check reads a single subject rather than the operand forest** → D8 states it over
  the covered roots; the multi-root case (first root safe, last root escaping) is a test, since it
  is the one a single-subject formulation passes wrongly.
- **A clamped escalation could stop being an exact cover** → D7 argues it cannot, because the
  scope is a cover; this is asserted by a property test over generated trees, not by the argument.
- **The anchor retargets onto a different node** → closed by D4 rather than mitigated, and pinned
  by a property test.
- **Per-keystroke cost** → the scope derives from the already-cached parse plus one
  `subtreeCoverOf`; it sits inside the keystroke budget `transaction-classification` sets, and is
  measured against it in the same way.
- **A list-item zoom root keeps its within-list indentation** → D9 states it and names the
  computable fix; it is a visible limit, not a hidden one, and it is smaller after the outline
  grid than it was before.
- **Refusing Enter on the zoom root will be felt** → D8 states the cost and names the filed
  alternative; real use decides whether it is revisited.

## Migration Plan

None. Zoom adds no persisted data, no file format change, and no migration: the state lives in a
`StateField` and dies with the view. Rollback is removing the extension registration; a note
edited while zoomed is byte-identical to one edited without it, which is itself an e2e assertion.

## Open Questions

- **Scroll position after a zoom.** Whether CM6's default suffices or the visible range needs an
  explicit `scrollIntoView` is a measurement, not a decision; it changes no requirement and is
  answered during task 1.
- **Whether `would-leave-zoom-scope` deserves per-operation cue wording** (one message versus one
  per shape). Message text is a table entry; the reason is what the spec fixes.
