## Context

Chrome transparency arrived in this project as an *editing* principle
(`node-edit-enforcement` D9): an edit expressing a content-level intent is interpreted in
content space, with gap lines and marker internals maintained by the system rather than
addressed by the user. The caret itself was left in raw character space, deliberately — the
completion was filed in docs/research/13 with a specific risk (CM6's goal-column tracking)
and a specific instruction: prototype vertical motion first, do not decide from code review.

A real-Obsidian probe pass (2026-07-25, all frames recorded in [examples.md](examples.md))
measured what that gap costs in practice, and turned up one finding that reframes the
architecture question:

- ArrowLeft at a list item's content start is a permanent no-op at every depth — the caret
  cannot leave an item backwards at all. The only escape is Home twice, then ArrowLeft.
- **Home pressed twice reaches inside the marker**, a position ArrowLeft and mouse clicks
  are both clamped out of. The shipped clamp's own spec claims it applies "regardless of the
  gesture that produced the position"; measurement says otherwise.
- One Shift+ArrowDown from a subtree's last child selects the entire document, and every
  further press does nothing.
- With two cursors in adjacent siblings, one Shift+ArrowDown collapses to a single range
  covering everything.

The Home finding is the important one architecturally, and a review round root-caused it
precisely (measured 2026-07-25 via the stats counters, the same technique Q19 used):

| gesture | classification | clamped? |
| --- | --- | --- |
| ArrowLeft | `selection-only` | yes |
| Home | `programmatic` | no |

Obsidian's own Home command dispatches with no `userEvent`, so `isProgrammatic` returns true
and the funnel passes it through **by design**. Nothing is leaking; the classifier is doing
exactly what `node-selection-enforcement` specifies.

That correction matters, and it does not weaken the case for moving motion out of the filter
— it sharpens it. The clamp cannot be extended to cover Home without clamping `programmatic`
transactions, and `programmatic` pass-through is a committed requirement with its own
scenarios (workspace restore, sync reconciliation); the redo-cursor fix that landed in
`efce9de` leans on the same pass-through discipline for its own re-assert transactions. So
correction cannot reach this case at all without breaking something else that is load-bearing.

The general form of the argument, stated accurately: the funnel's *classes* are well defined
and enumerable, but the *mapping from a user gesture to a class* is decided by whether
Obsidian implements that gesture itself and whether it annotates a `userEvent`. That mapping
is not ours, is not documented, and can change in an Obsidian release. Correcting positions
after the fact therefore has coverage we cannot state in advance; binding keys has coverage
that is exactly the list of keys bound.

Selection extension has a parallel history: it was never designed at all. It is a
by-product of per-transaction escalation, and its granularity is an artifact of whether a
blank line happens to sit between two nodes.

## Goals / Non-Goals

**Goals:**

- Make the set of caret-addressable positions in outline mode a stated, testable property of
  the document, not an emergent consequence of which commands reach the filter.
- Complete chrome transparency from edits to the caret: gap lines and list-item marker
  prefixes stop being positions.
- Give Shift+Arrow a designed meaning — one node per press, symmetric in both directions,
  independent per range — replacing behavior that no one chose.
- Change no file bytes, no parse model, and no off-mode behavior.

**Non-Goals:**

- Structural keys over multi-node selections (Tab indenting only the last node). Confirmed
  again in this probe pass, but it is edit semantics, and it wants the operand definition
  this change produces before it can be designed.
- The two-transaction escalation flash (docs/research/13). Its mechanism is understood and
  its fix touches two shipped contracts; it deserves its own pass.
- Enter/Backspace edge cases, including Enter on an empty list item.
- Modal block-selection state, folding, zoom.
- Reopening whether a heading's `#` should be direct-edit-prohibited (docs/research/04 Q17,
  parked deliberately).

## Decisions

### D1. Motion is commands, not correction

Bind motion keys in the existing high-precedence, per-keypress outline-mode-gated keymap
(`src/plugin/keymap.ts`), alongside Tab/Enter/Mod-A. Each handler computes its target
directly from the parsed tree and dispatches it. The transaction filter's
`clampCursorToContent` is retired.

*Why, concretely:* Home is classified `programmatic` and deliberately passed through
(measured; see Context). A correction layer's coverage is therefore decided by Obsidian's
own implementation choices per gesture, which are neither documented nor stable across
releases. A command layer's coverage is the list of keys it binds. This project rejected
"enumerate the inputs" for *selection enforcement* — where the input space really is
unbounded (pointer, IME, sync, plugins, drag) — but caret motion is the opposite case: a
small, closed set of keys, each of which must produce a specific position. The architectures
fit different problems, and the manifest's objection does not transfer.

*Alternative considered:* extend the filter's clamp to catch every cursor placement.
Rejected on the measurement — reaching Home means clamping `programmatic` transactions,
which breaks `transaction-classification`'s "Programmatic and remote transactions pass
through untouched" requirement, the workspace-restore and sync-reconciliation scenarios that
sit under it, and the byte-exact plugin dispatch discipline. It also cannot express *motion*
(see D3: the correct target for `←` at a node start and for `→` at the previous node's end
are different positions, though both are "skip the gap").

*The assumption this rests on, and what was measured.* "Binding keys has coverage that is
exactly the list of keys bound" only holds if the binding actually wins the key. Home's
`programmatic` classification is evidence Obsidian is not routing it through a stock CM6
command, which raises both "does our binding see it at all" and the double-fire mode
docs/research/13 records (`runScopeHandlers` matching while the native default still ran).
Measured 2026-07-25 by instrumenting the keydown path: Home is NOT prevented at
document-capture and IS prevented by the time it passes `contentDOM` — a profile identical to
ArrowLeft's, a known CM6 command. So nothing consumes Home ahead of the contentDOM stage, and
the document-level scope-handler mode that produced the earlier double-fire does not apply.
The coherent reading is that Obsidian binds Home in its own CM6 keymap whose handler
dispatches without annotating a `userEvent`; a `Prec.highest` entry sits ahead of it.

This is inference from stage and classification, not observation of our own binding winning.
Task 0.5 closes it directly — bind Home, press it once, count the fires — and it is cheap
enough that it runs before `clampCursorToContent` is retired.

### D2. Two mechanisms, not one: motion and placement resolution

They are genuinely different problems and conflating them produces wrong answers.

- **Motion** (`←`, `→`, `↑`, `↓`, Home, End): given a position and a direction, compute the
  next addressable position in that direction. Direction is an input.
- **Placement resolution**: given a position produced by something that is not a motion — a
  mouse click, a selection collapse, a drag release — map it to a legal position. Ownership
  supplies the answer with no heuristic: a gap line belongs to the node above it, so the
  caret resolves to that node's content end; a marker prefix resolves to its own content
  start.

*Why both:* a single "snap to nearest legal position" function would send `←` at the start
of `Bravo` and `→` at the end of `Alpha` to the same place, when they must land on opposite
sides of the gap. Conversely, motion cannot answer a click, which has no direction.

*Consequence worth stating:* placement resolution is what makes Escape work without binding
it (D8), and what keeps drag-release and pointer paths coherent for free.

*Jurisdiction, stated rather than implied.* The resolver replaces `clampCursorToContent` at
its existing call site and inherits its scope exactly: transactions classified
`selection-only` in an outline-mode editor. It SHALL NOT touch `programmatic`, `plugin-own`,
or `composition` transactions. This is not a limitation to work around — it is the same
pass-through discipline `transaction-classification` already commits to in "Programmatic and
remote transactions pass through untouched", and which `node-selection-enforcement` scopes
itself by in "Enforcement is scoped to outline mode and enforced classes only."

The rule is about the CLASS, not any one mechanism. The plugin's own dispatches must land
byte-exactly because that is what makes them predictable operands for history and
decorations; `efce9de`'s cursor re-assertion is one current instance of that need, and
`minimal-changesets-for-structural-ops` proposes retiring exactly that instance — which is
why the requirement is written against `plugin-own` and not against
`CURSOR_REASSERT_USER_EVENT`. Either way the class-level rule holds.

*Therefore the addressable-position invariant is scoped, not absolute.* It holds for
positions produced by user gestures in outline mode. A `programmatic` placement — a search
jump, link navigation, workspace restore — can still leave the caret on a non-addressable
position, and the next user motion normalizes it. Claiming otherwise would repeat, at wider
scope, exactly the over-claim this design faults the old clamp's spec for.

### D3. Vertical motion delegates to CM6, then continues OR clamps — the two are different

`↑`/`↓` run the native vertical-motion command. If the landing position is not addressable,
the correction depends on *why*:

- **The landing line has no content at all** (a gap line) → **continue** in the same
  direction to the next line that does. There is nothing on this line to land on.
- **The landing line has content, but the column is chrome** (a list item's marker prefix or
  a continuation line's alignment whitespace) → **clamp within the line** to its content
  column. The node is the right destination; only the column is wrong.

An earlier draft of this decision said only "continue in the same direction until the
position is addressable," which is wrong for the second case: applied to `↓` landing at
column 1 of `- item`, it would skip the entire list item. It would also have silently dropped
a shipped, specified behavior — `node-selection-enforcement`'s "Vertical motion onto a
shorter marker line still lands on content." The distinction above preserves it.

Both corrections reuse CM6's own goal column rather than recomputing a column from the
corrected position.

*Why:* docs/research/13's recorded risk is specifically that snapping recomputes the *next*
move's goal column from the snapped position, drifting over consecutive presses. Two
measurements bound that risk. CM6's goal column already survives gap lines today (measured:
column 7 restored after passing over one), and the drift mechanism is a property of
correction, not of motion. Continuing the same motion sets the goal once, from the user's
actual gesture.

*Prototype gate:* this is the one decision the research note says must not be settled from
reasoning. It is task 1, before any spec language is finalized.

### D4. Horizontal motion crosses at content boundaries

`←` at a node's content start moves to the previous node's content end; `→` at a content end
moves to the next node's content start. Marker prefixes and gap lines are never entered. At
the document's first or last node the key is a silent no-op — a document boundary is
self-evident and needs no cue, unlike a structural rejection whose reason is invisible.

Forward motion already behaves this way today (measured: `→` at the end of `- alpha` lands on
`- |bravo`, skipping the marker). This decision makes backward motion its mirror.

### D5. Home and End escalate, with adjacent-rung collapse

First press moves to the current visual row's own content boundary; second press to the whole
node's content boundary. When those coincide — a single-line, unwrapped node — the two rungs
collapse into one step, the same adjacent-identical-rung collapse `progressive-select-all`
already specifies for its ladder.

*Why visual row rather than logical line as the first rung:* Obsidian wraps by default, and
row-start is where the native behavior earns its keep on long paragraphs. Keeping it costs
nothing, because for an unwrapped line the row and the line coincide and collapse.

For a list item's continuation line, the row's content boundary is its alignment column, not
column 0 — continuation-line alignment whitespace is marker chrome like any other.

### D6. Extension steps along an ordered sequence of covers

For a given anchor node and direction, the reachable selections form an **ordered, strictly
growing sequence of covers**: the anchor node's own subtree, then the cover produced by
taking each successive node in content order in that direction, with any step that would
leave the cover unchanged omitted. Each press moves one position along the sequence for the
current direction; the opposite direction moves one position back. Stepping below the first
element switches to the opposite direction's sequence.

*Why a sequence of covers, and not "walk the head node":* an earlier formulation defined the
state as (anchor node, head node) and called the two directions "exact inverses over the head
node's walk." Review flagged that as ambiguous, and it is worse than ambiguous — it is not
well defined. Two different head nodes can produce the identical cover: with the anchor on a
parent, head = `child two` and head = `parent` both yield the parent's whole subtree. Head
identity is not recoverable from the selection, so it cannot be the state. The cover is, and
the range's orientation supplies the direction. Stating the model over covers also makes the
property test express the right invariant: consecutive covers are strictly nested, and
opposite presses are mutual inverses *over covers*, not over head identity.

*The anchor node needs real state — statelessness does not transfer here.* A second review
round found that the same non-recoverability argument applies to the ANCHOR node, which the
sequence is defined in terms of. Worked through this change's own flagged example:

```
- parent
	- child one
	- child t|wo          ⇧↓ →  cover = child two's subtree, anchor at line 2 → child two ✓
- next                    ⇧↓ →  cover = parent's subtree + next, anchor at line 0 → PARENT ✗
                          ⇧↑ →  steps back in PARENT's sequence → parent's subtree
```

The third press should return the selection to `child two`'s subtree. Instead it produces
`parent`'s subtree — a cover that never appeared on the way down — breaking both "Shift+Up
undoes Shift+Down" and "shrinking bottoms out at the anchor node."

There is no geometric escape. D7 requires the dispatched selection to BE the cover, which
forces the range's anchor onto one of the cover's two edges; once an ancestor is pulled in,
neither edge identifies the original node. The reason statelessness transferred cleanly to
`progressive-select-all` is that its ladder is MONOTONE — Mod-A only ever widens, so every
rung is identifiable from the cover alone. A bidirectional walk needs strictly more state
than a monotone one.

*Decision:* keep an **extension origin** — the document offset the current extension gesture
started from — in a `StateField`, cleared by any document change and by any selection change
this capability's own dispatches did not produce. The sequence is computed for
`nodeAtLine(origin)`. With no origin recorded, a press starts a fresh gesture from the
current selection. So the recomputed-every-press discipline is preserved for the sequence
itself; the only retained state is where the gesture began, and it is discarded the moment
anything else touches the selection.

*Alternative considered:* accept the behavior and weaken the guarantee — shrink bottoms out
at the current cover's own root, and ⇧↓/⇧↑ are inverses only while no ancestor has been
pulled in. Rejected: it produces a cover the user never passed through, in exactly the
document shape this change already flags as its riskiest (E4b), and it contradicts examples
E5 and E6 as already reviewed and approved. The modal block-selection work filed in
docs/research/13 needs an equivalent origin field regardless, so this is not a mechanism
invented solely for this change.

*Why steps that leave the cover unchanged are omitted:* without it, extending from a parent
whose subtree is already covered would spend a press moving the head onto a child already
inside the cover — a visibly dead keypress.

*Why content order rather than ladder rungs:* an earlier draft had the head climb the Mod-A
ladder's rungs, so that running out of siblings produced "the parent's subtree" as its own
stop before reaching the parent's next sibling. Rejected on review: a directional key means
"one more node, that way," and when the no-partial-subtrees invariant forces the parent in,
that is a consequence of taking the next node, not a separate destination. Splitting it into
two presses makes the user pay for an invariant they did not ask about. Selecting the
parent's subtree alone remains reachable through the Mod-A ladder, which is the feature that
answers "wider, from here."

*Why this is not what motivated the ladder draft:* the multi-cursor collapse (two adjacent
cursors, one press, whole document) is fixed by "first press selects the anchor node,"
independent of how later presses walk. The ladder draft was solving an already-solved
problem.

*Accepted cost:* the first press loses the caret's exact offset, so the walk bottoms out at
"anchor node, whole" rather than at the original caret. Workflowy and Logseq behave the same
way.

### D7. Extension does not touch escalation math

Extension dispatches an exact cover. `escalateRanges` leaves exact covers unchanged — a
property already established and tested by `progressive-select-all`, whose ladder rungs pass
through the filter untouched for the same reason. So the expand-only invariant is not
weakened by a shrinking extension: expand-only governs the filter's correction of
*user-produced* ranges, and extension produces none.

### D8. Escape stays native

Native Escape collapses a selection to one of its edges. Under this change a cover's end is a
gap-line position, so D2's placement resolution catches it and the caret lands at the owning
node's content end. That is a good outcome, reached without a binding.

*Why not bind it:* the project's standing bias is to leave stock behavior alone wherever
intervention is not needed, and `Esc` is wanted by the filed modal block-selection work.

*Measured, and messier than either earlier account.* On a forward two-node cover the FIRST
Escape changes nothing and the SECOND collapses to the head edge — which lands on a gap line
(`0:0→3:0` collapsing to caret `3:0`, a blank line). On a backward cover the first Escape
also changes nothing. So the original probe reading ("Escape does nothing") and the hands-on
report ("collapses to an edge, direction-dependent") are both partly right, and neither is the
whole behavior. The two-press oddity is plausibly the blur-based chrome mechanism consuming
the first Escape — the same mechanism `docs/research/13` records as hard to reason about, and
which a fix on another branch (`4e6b0ef`, not on main) touches.

*What this does not change:* the decision. Whatever Escape does natively, it can land the
caret on chrome, and D2 has to catch that regardless. Binding Escape would not make the
two-press behavior better; it would only hide it. The oddity is recorded as a manual-pass
item, not as a reason to take the key.

### D9. Headings are ordinary nodes; their `#` stays addressable

Every rule here treats a heading as a paragraph that owns a section. Its `#` prefix is
directly editable text, unlike a list marker — already the shipped position
(`clampCursorToContent` is list-item-only by construction, and `progressive-select-all`
specifies column 0 as a heading's content-start rung). Q17's "should headings get the same
prohibition" stays parked.

### D10. Atoms are content, not chrome

An atom's own lines — a fenced code block's body, a table's rows — are content lines and
carry no marker prefix rule. Motion inside an atom is ordinary line motion; only the atom's
trailing gap is skipped. This follows the existing model, where an atom is opaque to
*structural* operations but is a normal node otherwise.

### D11. Two shipped invariants are knowingly reversed

- `node-selection-enforcement`'s "cursors are never moved by this layer, including on gap
  lines" is reversed for outline mode. It was signed up for in Phase B, backed by a property
  test, and docs/research/13 already recorded that extending enforcement from edits to caret
  placement "deserves its own design pass." This is that pass.
- `node-edit-enforcement`'s gap-line editing escape hatch ("cursor deliberately left on the
  gap, editing it, stays native") becomes unreachable, because the caret can no longer be put
  there. The escape hatch becomes the outline-mode toggle, exactly as docs/research/13
  anticipated.

### D12. The preamble is out of jurisdiction, explicitly

Frontmatter and any other content before the first node belong to no node. Everything in this
change applies to node content only: in the preamble, motion, placement, and extension are
byte-for-byte stock, exactly as `node-selection-enforcement`'s "Preamble and
out-of-jurisdiction selections pass through" already requires. The addressable-position rule
must say so in its own text — read without the carve-out it makes frontmatter unreachable,
since preamble lines are in no node's content span.

*This is a carve-out, not a feature.* No frontmatter handling is wanted or needed: Obsidian
provides its own Properties UI for editing frontmatter, and a note can always be taken out of
outline mode for raw editing. Measurement backs that up — in Live Preview with properties
rendered, the caret already cannot be placed inside frontmatter at all (a `setCursor` into a
frontmatter line lands on the blank line below the closing `---`, and ArrowUp from the first
node stops there too). The risk was never that we would under-serve frontmatter; it was that
an unqualified addressable-position rule would clamp the caret out of a region Obsidian is
already handling, and out of raw frontmatter in Source mode where it genuinely is editable
text.

## Risks / Trade-offs

- **Goal-column drift over consecutive vertical presses** → D3 delegates to CM6's own goal
  column instead of recomputing; task 1 is a hands-on prototype before the spec language is
  fixed. This is the risk the research note singled out.
- **Wrapped lines make "the line" ambiguous for Home/End** → D5 pins the first rung to the
  visual row, matching native, with collapse making it a non-issue for unwrapped content.
  Still wants a manual pass on a long wrapped paragraph.
- **Losing the gap-editing escape hatch annoys someone with template spacing to maintain** →
  the mode toggle is the documented answer; a real complaint would be evidence for an
  in-mode exception, which this change deliberately does not invent up front.
- **The E4b jump reads as a surprise** (a *down* key extending the selection upward when the
  invariant pulls a parent in) → flagged as the primary manual-pass question; the alternative
  costs an extra press on every such extension.
- **Node kinds not covered by the fixtures** (callouts, tables, embeds, front-matter
  adjacency) behave unexpectedly → discover during implementation against real notes rather
  than guessing up front; D10 states the default.
- **Motion commands must not fire in nested editors** (table cells run their own CM6
  instances) → the same `editorInfoField` gate the grammar already uses, plus the nested-editor
  safety requirement `transaction-classification` already carries.
- **Mobile** → the keymap path is shared; mobile emulation runs the same suite, as with every
  prior keymap change.

## Migration Plan

No data or file migration: this changes in-editor behavior only, and outline mode is already
per-note and reversible. Rollback is disabling the plugin or toggling the note out of outline
mode, both of which restore stock behavior byte-for-byte. The keymap handlers decline every
key outside outline mode, so notes without the mode are unaffected at all times.

## Open Questions

- Does vertical motion feel right with the goal column delegated rather than recomputed?
  Task 1's prototype answers this, and it may send D3 back for revision.
- Should Home's first rung be the visual row or the logical line, on a genuinely wrapped
  paragraph? D5 recommends the row; only hands-on use decides.
- Does E4b's jump read as sensible? If not, the ladder-walk alternative recorded in D6 is the
  fallback, at the cost of one extra press per such extension.
