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

The Home finding is the important one architecturally. The clamp lives in the transaction
filter, correcting positions *after* a command has produced them, and at least one ordinary
cursor command evidently does not reach it. Post-hoc correction is leaky by construction:
its coverage is a function of which transactions happen to flow through the funnel, which is
not a property anyone can state, test, or maintain.

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

*Why, concretely:* the measured Home inconsistency is not a bug to patch but the signature
of the approach. A correction layer covers exactly the commands that route through it, and
nothing guarantees which those are. A command layer covers exactly the keys it binds, which
is enumerable and reviewable. This project rejected "enumerate the inputs" for *selection
enforcement* — where the input space is unbounded (pointer, IME, sync, plugins, drag) — but
caret motion is the opposite case: a small, closed set of keys, each of which must produce a
specific position. The architectures fit different problems, and the manifest's objection
does not transfer.

*Alternative considered:* extend the filter's clamp to catch every cursor placement. Rejected
— it cannot catch what does not reach it, which is precisely the observed failure, and it
also cannot express *motion* (see D3: the correct target for `←` at a node start and for `→`
at the previous node's end are different positions, though both are "skip the gap").

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

### D3. Vertical motion delegates to CM6 and continues past chrome

`↑`/`↓` run the native vertical-motion command, then, if the landing position is not
addressable, continue in the same direction until one is — reusing CM6's own goal column
rather than recomputing a column from the snapped position.

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

### D6. Extension walks content order and recomputes the cover

The selection is understood as (anchor node, head node). The first press in either direction
sets the head node to the anchor node, selecting that node's whole subtree. Each further
press moves the head node to the next node in content order **that actually changes the
cover**, then recomputes the cover through the existing subtree/sibling-run geometry.
Reverse direction walks back the same way, bottoming out at the anchor node.

*Why "that actually changes the cover":* without it, extending from a parent whose subtree is
already covered would spend a press moving the head onto a child already inside the cover — a
visibly dead keypress.

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

Native Escape collapses a selection to one of its edges, direction-dependent. Under this
change a cover's end is a gap-line position, so D2's placement resolution catches it and the
caret lands at the owning node's content end. That is a good outcome, reached without a
binding.

*Why not bind it:* the project's standing bias is to leave stock behavior alone wherever
intervention is not needed, and `Esc` is wanted by the filed modal block-selection work.

*Reversal note:* an earlier round chose to bind Escape, on the mistaken basis (a probe
artifact — Escape was measured against a blurred editor) that it did nothing today. With the
native behavior confirmed, the binding is unnecessary.

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
