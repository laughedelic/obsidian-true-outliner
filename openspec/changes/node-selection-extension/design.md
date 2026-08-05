## Context

Keyboard extension today is emergent, not designed: `Shift+ArrowDown` moves a character cursor
one line and the transaction filter escalates whatever crossing results. Measured behavior in
one real document set (2026-07-25):

| gesture | today |
| --- | --- |
| `⇧↓` in a loose paragraph | 1 node |
| `⇧↓` in a tight list item | **2 nodes** |
| `⇧↓` on a parent | its whole subtree |
| first `⇧↑` from the last paragraph | **2 nodes** |
| `⇧↑` after any `⇧↓` | nothing — expand-only forbids shrinking |

The tight-list and upward cases are not design decisions; they are artifacts of whether a blank
gap line sits between two nodes, since a cursor landing on a gap stays inside the previous
node's territory while one landing on text does not.

### The gap-line fixpoint (2026-08-03, post-`selection-as-subtree-set`)

The table above understates one case. Re-traced against the SHIPPED `escalateRange` with the
native half modeled as "head moves one line, goal column preserved" — a simulation, unlike the
real-instance rows above, and on post-#36 geometry — extending UPWARD out of a child and then
reversing does not merely fail to shrink. It is a **fixpoint**: every subsequent press produces a
byte-identical selection.

| document | `⇧↑` from `c1` | then `⇧↓` |
| --- | --- | --- |
| heading section (`# P` with two paragraphs) | whole `P` section | **no change**, indefinitely |
| LOOSE list (blank line between items) | whole `P` subtree | **no change**, indefinitely |
| TIGHT list (no blank lines) | whole `P` subtree | shrinks, and drifts to `c2` |

Mechanism, and it is not the expand-only rule: after the upward press the head sits at the
cover's START — ch 0 of `# P`'s own line. `⇧↓` moves it down exactly one line, into **`P`'s own
trailing gap**. `nodeAtLine` resolves a gap line to the node that PRECEDES it, so the head
resolves back to `P`; `P` is an ancestor of the node the anchor sits in, so `forestCoverOf`
returns `P`'s whole subtree — the identical cover. The head can never travel toward the far end
of the range, because it is trapped one line below its own starting line.

So the tight/loose split that produces the granularity bug in the table above produces this one
too, from the same cause: gap ownership. It is not a heading behavior. Where there is no gap
(the tight list) the head escapes into `c1`'s own line and the selection shrinks instead — but to
a cover anchored on `c2`, because the first escalation already rewrote the range's ANCHOR offset
from inside `c1` to the end of `c2`. Either way the origin of the gesture is destroyed on press
one, by our own filter, and the character-mode offsets are what carry (and lose) it. That is the
sharpest available statement of why extension needs to be a bound command rather than a
correction: the correction has no way to preserve what the gesture meant.

This change is sequenced after `selection-as-subtree-set`, which removed the ancestor pull-in
from escalation. That ordering is what keeps this change small — see D3. It has since landed
(#36, archived `2026-08-02`), together with `caret-placement-policy` (#33) and the nested-editor
keymap gate (#35); what each settled for this change is recorded in D3, D4, D6 and D7.

## Goals / Non-Goals

**Goals:**

- One node per press, in both directions, in every document shape.
- Symmetry: the opposite direction undoes the last press exactly.
- Stateless: the next selection is a function of the current one and the document.

**Non-Goals:**

- Modal block-selection state; cherry-picked non-contiguous selection.
- Changing escalation geometry (that is `selection-as-subtree-set`) or caret motion (that is
  `content-space-caret`).
- Structural commands over a multi-node operand.

## Decisions

### D1. The model is a sequence of covers, not a walk over head nodes

For an anchor node and direction, the reachable selections form an ordered, strictly growing
sequence of covers. A press moves one position; the opposite direction moves one back.

*Why not "move the head node one step":* two different head nodes can produce the identical
cover — with the anchor on a parent, a head on its last child and a head on the parent itself
both yield the parent's whole subtree. Head identity is not observable in the resulting
selection, so it can be neither the state nor the thing a property test asserts over. Covers
are observable; the inverse property is stated over them.

### D2. Steps that would not change the cover are omitted

Extending from a parent whose subtree is already covered must not spend a press moving the head
onto a child already inside the cover. The sequence is defined over *distinct* covers, so every
press that has somewhere to go changes what the user sees.

### D3. No stored state — and that is a consequence of the sequencing, not a claim

An earlier draft of this change required an extension-origin `StateField`. The reason was
concrete: under the old escalation rule, extending out of a scope pulled the parent into the
cover, after which the range's two ends were the parent's own bounds and the node the gesture
started from was unrecoverable. Reversing then stepped back along the *parent's* sequence and
produced a cover that never appeared on the way down.

`selection-as-subtree-set` removed the pull-in. The statelessness `progressive-select-all` enjoys
transfers here only because of that ordering — a bidirectional walk needs strictly more state
than a monotone one unless the selection itself keeps identifying its origin.

**Forward only, and this was measured rather than assumed (2026-08-03).** The cover's start edge
identifies the anchor node however far a DOWNWARD extension has grown, permanently:
`forestCoverOf`'s span begins at `firstNode`'s own subtree start, and every ancestor of
`firstNode` begins above it, so no ancestor can ever displace the start edge. The first root of a
forward cover is the anchor, always.

The backward half of the original claim is FALSE. In

```
- P
  - c1     ← caret here
  - c2
```

one upward step is `forestCoverOf(c1, P)`, and since `P` is an ancestor of `c1` the cover is `P`'s
whole subtree — roots `[P]`, lines 0..2. Downward closure drags `c2` in BELOW the anchor, so the
cover's end edge resolves to `c2`, not `c1`. The anchor sits on neither edge and is gone.

This is not a defect in `forestCoverOf`; escalate.ts's own comment already names the asymmetry as
"inherent to preorder, not a defect in the rule". `selection-as-subtree-set` removed the upward
pull-in on DOWNWARD extension, which is what this decision originally credited it with. The
downward closure on UPWARD extension is the governing invariant itself, so nothing removed it and
nothing can. It fires whenever the anchor is a non-last child — a first child of any list — which
is why no worked example caught it: every reversal example in examples.md extends downward, and
the one upward example is flat paragraphs with no ancestor to swallow.

The resolution is D8, which keeps the walk stateless.

The geometry to build on is `escalate.ts`'s exported `forestCoverOf` (two end nodes → covered
roots and their combined span) and `coveredForestOf` (a range → its forest, or `null` if the
range is not an exact cover). Both already have four consumers; this change adds a fifth and
introduces no cover math of its own. `coveredForestOf` returning `null` is exactly the malformed
input D6 handles.

### D4. Block versus multi-cursor is decided by range count

One range: a block selection; extend it as a whole. Several ranges: multi-cursor; extend each
independently.

*Why this works at all:* `selection-as-subtree-set`'s forest span is contiguous text, so a
growing block selection never fragments into several ranges. Had the pivot introduced a
set-of-ranges representation, block and multi-cursor selections would have been
indistinguishable and this would have needed a mode.

That is no longer a projection. Contiguity shipped as a property test over generated trees
(that change's task 2.2), and its e2e 6.2 confirms two cursors in adjacent siblings extended
once stay two ranges rather than collapsing to a whole-document range — the discriminator's
premise and its first real case, both measured.

*Known edge, measured rather than assumed.* CodeMirror's `EditorSelection` requires ranges not
to overlap but explicitly permits them to TOUCH. Verified directly (2026-07-25): two touching
non-empty ranges stay two ranges, both in outline mode and off; two overlapping ranges merge
into one. So the edge is not adjacency and it is not "two cursors meeting exactly" — it is
overlap, which two cursors N nodes apart reach after roughly N presses in the same direction.
That is an ordinary sequence, not a rare one.

What happens when it is reached: the merged range is the union of the two, which is itself a
coherent block selection, and the next press extends it as a block. The behavior is defensible.
What changes is the ACCEPTANCE ARGUMENT — this edge is accepted because its outcome is right,
not because it is unlikely to occur. An earlier draft of this decision claimed adjacency merged
ranges and leaned on rarity; both were wrong, and the measurement is recorded here so the
argument is not re-derived from the same mistake.

*Revisit trigger:* if the transition from per-cursor to block semantics reads as abrupt in real
use, the fix is a mode flag, which is the modal block-selection work docs/research/13 already
files. Not pre-solved here.

### D5. Extension dispatches exact covers

Each press dispatches a selection the filter's escalation leaves untouched, exactly as
`progressive-select-all`'s ladder rungs already do. So a shrinking extension does not weaken the
expand-only invariant: expand-only governs the filter's correction of ranges the *user* produced
by other gestures, and extension produces none of those.

`selection-as-subtree-set`'s task 2.4 asserts rung-in equals rung-out for every ladder rung under
the rewritten escalation, so the "dispatch an exact cover and the filter leaves it alone" pattern
is verified for the one feature already using it. Extension inherits the same check.

### D6. The walk normalizes its own input

The walk can receive a selection that is not a cover at all. Two sources, and the second was
missed until D10's ladder interplay was worked out: an undo or a redo restores a mapped-forward
selection the filter never saw (Risks, below), and **the Mod-A ladder's first rung is a node's
own content — not a cover.** D3's statelessness assumes a cover, and D4 compounds it, since both
of those are still ONE range and so read as a block selection.

**The walk normalizes its input to the ANCHOR NODE'S OWN SUBTREE COVER before stepping.**

The obvious phrasing — "escalate to the nearest cover" — is wrong, and measurably so.
`escalateRange` deliberately returns a within-node content range UNCHANGED; that is the whole
point of the same-node branch, since a partial selection inside one node must stay partial.
`escalateRanges` does not help either: its uniform second pass only fires when some range already
escalated. Measured on the ladder's rung 1 (`1,3 → 1,5`, c1's own content after its marker), both
return it untouched and it remains a non-cover. Only `subtreeCoverOf` of the node the range's
anchor resolves to produces the cover. The normalization is therefore its own step, not a call
into the escalation helpers.

**A normalization that changed the selection IS that press's step.** The press moves one position;
if the input was not on the sequence at all, arriving on it is that move. So Mod-A once (own
content) followed by `⇧↓` selects that node's own subtree — identical to `⇧↓` from a bare caret in
the same node, which is exactly the how-did-we-get-here independence D10 requires. For every
selection already on the sequence the normalization is the identity and costs nothing.

*Why here rather than at the history seam:* the earlier draft of this design expected
`caret-placement-policy` to own it, since that change owns the caret half of the same
`filter: false` fact. It shipped and explicitly declined — reshaping a restored selection changes
the range the user is about to act on, which is this capability's question, not a caret one. So
the choice is between normalizing in the walk and adding a new re-normalization point at the seam;
the walk is self-contained, needs agreement with nothing, and is idempotent. Stored state was
never the alternative: the failure is a malformed INPUT, and a `StateField` would be equally stale
after the same undo.

### D7. The handlers follow the Mod-A convention, not the motion-key convention

Two conventions already exist in `keymap.ts` and this change must pick the right one deliberately,
because they are opposites.

- **The outline gate is `outlinePathOf`, which also excludes NESTED editors.** Obsidian mounts a
  table cell being edited as its own `EditorView` and `registerEditorExtension` installs this
  keymap there too, where `editorInfoField` still resolves to the outer note. A private
  `editorInfoField` + `isOutline` check looks equivalent and is not; that defect has bitten twice
  (#35), which is why the module comment requires every binding to route through the one helper.
- **Multi-range: plan every range, like `makeSelectAllHandler`.** The motion handlers use
  `soleCursor`, which DECLINES on multiple ranges — load-bearing there, because those handlers
  plan from `selection.main` alone and would silently discard the other ranges. Extension is the
  opposite case by D4: it plans every range and dispatches them together, exactly as the Mod-A
  ladder does (each range advancing its own sequence, a range with nowhere to go left in place).
  `makeSelectAllHandler` is the shape to mirror, down to preserving `mainIndex`.

### D8. The anchor is the cover's own outer root; a single-root cover re-seats it

The walk reads its anchor off the normalized cover's ROOTS rather than off a stored origin:

- **Two or more roots.** The anchor node is `r1` for a forward cover, `rk` for a backward one —
  the root on the FIXED side. The pressed direction grows by taking the next node beyond the
  cover; the opposite direction steps that same candidate one node back INWARD and recomputes.
  This is the ordinary case and D1's inverse property holds exactly.

  Shrinking is deliberately NOT "drop the far root", which is what this decision first said and
  what the implementation had to abandon: growing upward can absorb the previous leading roots
  into the newly added ancestor, so removing that ancestor removes them too and lands several
  covers back. Measured on `# A / a1. / # B / b1. / b2.` — `[a1., # B]` grows up to `[# A, # B]`,
  because `a1.` lies inside `# A`'s subtree. Recomputing from the stepped-back candidate asks the
  same question growth asked, one step earlier, and cannot drift this way.
- **Exactly one root.** That root IS the anchor, and the cover is the base of its sequence. There
  is nothing to shrink to, so BOTH directions grow from it.

The single-root case is what an upward ancestor swallow produces, and the rule's consequence is
that the swallow **re-seats the anchor onto the swallowed ancestor**. Continuing the D3 example:

```
[c1]  --⇧↑-->  [P]  --⇧↓-->  [P, Q]  --⇧↑-->  [P]  --⇧↓-->  [P, Q]  ...
```

`⇧↓` out of `[P]` grows to `P`'s next sibling rather than shrinking, because `[P]` is a base. From
there the selection oscillates between `[P]` and `[P, Q]`; `c1` is not reachable again by
keyboard.

*Why this and not stored state.* Stored state restores D1's inverse property universally, and it
was the option considered first. It was rejected on the evidence in Context: the character-mode
anchor offset is ALREADY a hidden origin carrier, and losing it is precisely what makes today's
behavior wrong. Replacing one hidden carrier with another — a `StateField` needing invalidation
rules for every selection change that is not an extension — reintroduces the failure mode this
change exists to remove, and would be equally stale after an undo (D6). A rule that reads
everything it needs from the selection cannot go stale.

*Why not "shrink to whatever the end edge resolves to".* That is the third option and it is the
worst: from `[P]` it lands on `[c2]`, a cover that never appeared on the way up, reproducing
today's measured drift with better granularity. Rejected explicitly, not overlooked.

*What it costs.* D1's inverse property becomes conditional: `⇧↓` undoes `⇧↑` except across an
ancestor swallow, where the swallow is irreversible by keyboard. Accepted because the resulting
behavior is self-consistent and visible — every state on the oscillation is a cover the user can
see and act on — where the alternatives are silently wrong or silently stateful. The spec states
the condition rather than promising an inverse it cannot deliver.

### D9. Block selection is a derived interaction MODE, not a set of DOM corrections

**When every non-empty range is a cover, the editor is in block-selection mode.** The mode is
DERIVED — `allRangesCovered`, the predicate the chrome and the `::selection` suppression already
share — so there is no flag to set, no command to enter or leave it, and no way for it to
disagree with what is rendered.

Everything that currently happens per-gesture becomes a property of the mode:

| | in block-selection mode | otherwise |
| --- | --- | --- |
| Live Preview | rendered (editor blurred) | raw around the caret (editor focused) |
| native `::selection` | transparent | normal |
| block chrome | shown per covered root | none |
| key routing | the block-mode handler, first-class | ordinary CM6 focused dispatch |

*This is the reframe, and it is the point.* The three focus calls today are corrections applied
after the fact — blur because the selection turned out to be a cover, blur again because the
first one was skipped, refocus because blurring broke keys. Each is a cover-up for the previous.
Under a mode, focus is not a thing done TO the editor; it is one of the mode's properties, and it
changes only when the mode changes. Two block selections in a row are the same mode, so nothing
happens between them — which is why the flicker becomes unreachable rather than merely rarer, and
why `onDocumentKeyDown` stops being "recovering keyboard interaction after we broke it" and
becomes the block mode's own key path.

*Confirmed symptom (2026-08-03).* Both repaints are visible in the blink: the character-level
selection AND the raw-markdown toggle. That is a full round-trip out of the mode and back — the
editor genuinely leaves block-selection appearance on every keypress and returns. Making it
faster or less visible would be the cover-up; not leaving the mode is the fix.

*Relation to D4 and to the change's out-of-scope list.* Two different things are called "mode"
and only one is ruled out. D4 says no STORED modal state is needed to tell a block selection from
a multi-cursor one — that stands, and this mode is derived, so it introduces none. What
docs/research/13 files as "modal block-level keyboard selection" is the stored kind, with entry
and exit gestures and `Cmd`-click cherry-picking; still out of scope. The proposal's out-of-scope
entry is split accordingly rather than left to imply this is forbidden.

*What it replaces.* `SelectionDecorationPlugin` manipulates focus in three places, each added to
patch the previous one's fallout: `update()` blurs when covered and no drag is in progress;
`onMouseUp` blurs again because the drag's settling transaction may have committed while
`mouseDown` was still true, so `update()` skipped it; `onDocumentKeyDown` refocuses
unconditionally, because a blurred `contentDOM` never sees `keydown`. All three approximate the
one invariant above.

*Why the flicker follows from it.* Today every keypress is focus → run command → settle → blur a
macrotask later, because `onDocumentKeyDown` focuses BEFORE `runScopeHandlers`. A mouse drag
never does this: `update()`'s hook is guarded on `!mouseDown`, so the blur happens once at
`onMouseUp` — one transition per gesture, not one per event. Under D9 an extension press goes
cover → cover, the policy's answer does not change, and no focus transition happens at all. The
flicker is not made less likely; it is made unreachable.

*How key input survives.* `onDocumentKeyDown` stops treating focus as a precondition. It replays
the event through `runScopeHandlers` first; a command that matched dispatches its own selection
and the policy decides focus from the result. Only an UNMATCHED key focuses immediately, because
plain typing is inserted by the browser's own later `beforeinput` against whatever is focused at
that moment — and that case ends in a non-cover selection anyway, so the immediate focus agrees
with the policy rather than fighting it.

*Deferral mechanism corrected (2026-08-04).* The blur is deferred with
`requestAnimationFrame`, not `setTimeout(0)`. Measured: with a timer, one frame is painted
between the chrome landing and the blur — `class=true paints=0`, then `BLUR paints=1` — so the
first press into the mode renders a single frame of block chrome over raw markdown with a caret,
which is the residual flicker reported after the class fix. `setTimeout(0)` only guarantees
running after the current task; `requestAnimationFrame` guarantees running before the next paint.
The deferral itself is still required for the race below — rAF is asynchronous with respect to
the current task just as the timer was.

*What does not change.* The deferral stays on the blur direction. Blurring
synchronously inside `update()` races CM6's DOM-selection sync and was observed inserting typed
text at a stale position (decorations.ts's own comment). The policy governs WHEN focus should
change, not how soon the DOM call may follow. The `isActiveEditor` guard stays too — it
disambiguates two blurred panes and is orthogonal to this rule.

*Amended during implementation (2026-08-03): the two directions are NOT symmetric.* The rule as
first stated — assert focus whenever the selection is not a cover — is wrong, and measurably so.
Two corrections, both found by the existing suite rather than by review:

- **Focus must use `EditorView.focus()`, never `contentDOM.focus()`.** The raw DOM call lets
  CM6's selection observer read the BROWSER's DOM selection back into state; after a click that
  is the raw clicked offset, not the corrected one the filter just resolved. `EditorView.focus()`
  wraps the focus in `observer.ignore(...)` and then calls `docView.updateSelection()`, pushing
  STATE to DOM, so it cannot resurrect a pre-correction position. Exactly the mirror of the blur
  race: one direction strands the DOM's selection, the other lets it win.
- **Focus is restored on the mode's EXIT EDGE, not asserted continuously.** Even through
  `EditorView.focus()`, acting on every non-cover selection still regressed a plain mouse click
  (`65-content-space-caret.e2e.ts` D2: caret at `ch 1` instead of content start `ch 2`). A click
  produces a non-cover selection but never EXITS the mode, because it was never in it — so
  keying the restore to the transition leaves the click path untouched entirely. This costs one
  boolean, a transition detector rather than selection state; the mode itself stays derived.

So the honest invariant is asymmetric: **entering block-selection mode blurs; leaving it
restores focus; being outside it asserts nothing.** The flicker fix does not depend on the focus
half at all — it comes from the keymap reorder — but without the exit edge a bound command that
leaves the mode strands the keyboard, since `onDocumentKeyDown` only acts while the selection is
still a cover.

*Third amendment, from the real-vault pass (2026-08-04): the mode's marker class is CM6's to
write, not ours.* One flicker survived the reorder, on the FIRST press into the mode only, and it
was not the blur — instrumented, the blur lands ~0.1ms after the class goes on, before the next
paint. `EditorView.updateAttrs` recomputes the editor's whole class string on a focus change and
writes the `class` attribute wholesale, so the focus change the mode ITSELF causes clobbered a
class written with `classList`, and the next `update()` restored it one frame later. Declaring it
through the `editorAttributes` facet removes the window: CM6 folds the class into the same string
it rewrites.

That is the same lesson as both focus findings above, in a third place. **DOM state a library
considers its own gets recomputed from the library's model, and anything written outside that
model is transient** — selection for `focus()`, the class attribute for `updateAttrs`. Where CM6
offers a modelled entry point (`EditorView.focus`, `EditorView.editorAttributes`), that is the
one to use.

*Scope.* This is `escalated-selection-decoration`'s mechanism, not this capability's, and it is
pulled in deliberately: extension cannot look like mouse block selection while a refocus fires on
every press. Codifying it also closes a gap that capability's spec names outright — the blur
mechanism was "implemented alongside this capability but deliberately not codified here as a
formal requirement", which is exactly how three sites drifted apart with no spec disagreeing.

### D10. Extension and the Mod-A ladder compose through the selection, and only through it

Both features read the CURRENT selection and the document, and neither records how that selection
came about. So they compose in both directions with no coordination, and the resulting rule is
worth stating outright because it is a guarantee rather than an accident:

**A selection reached by any means behaves identically to the same selection reached any other
way.** Mod-A four times then `⇧↓` equals `⇧↓` from a caret that had already arrived at that
cover; extension sideways then Mod-A equals Mod-A from that cover directly.

Measured against the shipped `nextRung`, over extension-shaped selections in `- P / c1 / c2 / - Q`:

| current selection | `Mod-A` gives |
| --- | --- |
| `[c1]` | `c1 + c2` — the sibling run under `P` |
| `[c1, c2]` | `P`'s whole subtree — the parent |
| `[c1, c2, Q]` | the whole outline body |
| `[c2, Q]` (crosses a scope) | the whole outline body — the nearest run containing both |
| `[P]`, backward | the whole outline body, orientation preserved |

That is exactly "the nearest sibling run covering the whole current selection, else the parent",
so no new ladder behavior is needed. `nextRung` resolves its node from `range.anchor` and climbs
to the smallest rung that strictly contains the range, which for a mixed-depth forest lands on
the first enclosing run regardless of which end the anchor sits at — checked at both
orientations, since D8 makes backward covers ordinary.

*The one seam, and it is not free.* The ladder's rung 1 is a node's OWN CONTENT — for a list item
starting after its marker — and that is not an escalation cover. So Mod-A hands extension a
non-cover selection through a perfectly ordinary gesture, not only through undo. D6 owns the
answer and had to be corrected to give a right one; this interplay is what exposed it.

*What this rules out.* No shared state between the two features, and no special-casing of "this
selection came from the ladder". The reverse direction stays rejected: `⇧↑` from a whole-subtree
cover grows sideways rather than climbing, because the two features answer different questions
("one more node, that way" versus "wider, from here"). Composability is not conflation.

### D11. A press declines while it stays inside one node's own content

A node can own several source lines — a paragraph broken across lines, a code fence, a table.
Inside one, extension is ordinary TEXT selection: the user is selecting prose, not nodes, and the
outline has nothing to say about it.

**While the selection is a plain character range inside one node's own content lines and the
press would keep it there, the handler declines** and stock line-wise extension runs. The cover
sequence takes over at the node's boundary — reaching the trailing gap or the next node — which
is the first moment the gesture is about outline structure at all.

*Why this was missed.* Every worked example is a single-line node, so "the first press selects
the anchor node alone" was written for a document shape where a node and a line coincide, and
generalized silently to one where they do not. Measured on a two-line paragraph: the first
implementation returned the node's whole cover on press one, where the pre-change path kept the
character range `(0,5)→(1,5)`. Neither the no-fixpoint nor the inverse property could catch it —
taking over early is a correct walk over the wrong operand, not a broken walk.

*Corrected once, and the correction is the interesting part.* The first implementation put this
rule in the pure module and decided it from SOURCE lines. That handles a paragraph broken across
two source lines and gets the commoner shape exactly backwards: a long paragraph that soft-wraps
is ONE source line rendered as several rows, so it looked single-line and was block-selected on
the first press. Both shapes sat in the same real note, which is how the split showed up —
the last paragraph worked, the first did not.

`Shift+Arrow` moves by rendered ROW, so "would this press stay inside the node" is a question
about visual layout, and only the view can answer it. The decision therefore lives in the CM6
adapter and asks `EditorView.moveVertically` where stock extension would actually land. The pure
module deliberately does not try: it answers "what cover comes next", never "is this press about
the outline at all".

*Why the boundary is CONTENT lines, not the subtree and not the gap.* A node's trailing gap is
chrome between nodes; reaching it is already a boundary crossing, and the gap-line trigger in
`node-selection-enforcement` treats it that way. A single-line node's target line is therefore
always outside its content, so this rule never fires there and the common case is unchanged.

*Ranges are judged INDEPENDENTLY.* A selection can hold a cursor inside a multi-line node and
another that would cross a boundary; each keeps its own answer. The first draft gated
all-or-nothing, so one crossing range made every other one block-extend — silently overriding
this decision for ranges that had already answered "this is text". Only when EVERY range is text
motion does the handler decline outright, which lets stock extension run with its own bookkeeping
rather than a re-implementation of it.

Planning a text range means taking `moveVertically`'s HEAD and keeping the existing anchor, with
its goal column carried — `moveVertically` is motion, not extension, and using it whole collapses
the range. This is what `@codemirror/commands`' own `extendSel` does, and it is why vertical
motion tracks a visual x-coordinate rather than a character index: in a proportional font the
same x lands on a different column one row down.

*Cost, and it came due.* `null` from the walk means two things — "sequence exhausted" and "never
ours" — and they need OPPOSITE answers. This decision first claimed both could fall through, on
the reasoning that native extension has nowhere to go at a document edge either. False: at the
edge a backward cover still has its head at the TOP, and stock extension moves it inward,
shrinking the selection. So the adapter separates them on node jurisdiction — never-ours falls
through, exhausted consumes the key and leaves the selection unchanged, which is what the spec
requires.

## Risks / Trade-offs

- **The first press loses the caret's exact offset** — the walk bottoms out at "anchor node,
  whole", not at the original caret. Workflowy and Logseq behave the same way. → Accepted, and
  stated so it is a decision rather than a surprise.
- **The merge edge in D4** → recorded, measured in real use, revisited rather than pre-solved.
- **An upward ancestor swallow is irreversible by keyboard (D8).** Once `⇧↑` from a first child
  takes the parent's whole subtree, the anchor re-seats onto the parent and no number of `⇧↓`
  presses returns to the child. → Accepted as the price of a walk that stores nothing; judge it
  in the real-vault pass (5.x) rather than pre-solving. If it reads as a trap, the fix is D8's
  rejected option — a stored origin — and the argument against it is recorded there.
- **Keyboard extension flickers where a mouse drag does not.** Reported from real use,
  2026-08-03; traced to the focus/refocus cycle and fixed by D9. The two-transaction escalation
  flash was the first suspect and was WRONG — escalation returns `[tr, { selection }]` from
  inside a `transactionFilter`, which CM6 resolves into one transaction. Recorded because the
  wrong suspect is the plausible one, and re-deriving it would cost the same investigation
  again.
- **D9 changes when the editor is focused, which is load-bearing for input, not just for
  looks.** A focus policy that is wrong in the blurred direction silently eats keystrokes — the
  exact failure `onDocumentKeyDown` exists to recover from. → The e2e coverage (4.4x) asserts
  input still lands after every gesture, not only that the flicker is gone.
- **Someone relied on `⇧↓` grabbing two tight-list items in one press** → that was an artifact,
  not a feature; one press per node is the point of the change.
- **A selection restored by undo or redo need not be a cover at all, which D3's stateless walk
  assumes it is.** Found during `minimal-changesets-for-structural-ops` (docs/research/04 Q29
  and its follow-on). `@codemirror/commands` dispatches history transactions with
  `filter: false`, and CM6's `resolveTransaction` honours that by skipping `filterTransaction`
  entirely — so **the escalation filter provably never observes an undo or a redo**. What
  history restores is the pre-operation selection MAPPED FORWARD through the operation's
  changes, which for an edit inside or adjacent to the covered span is no longer an exact
  cover. Observed in a real vault: redoing an indent of a block-selected paragraph brought
  back a range covering "just the content within that new list node" rather than the block.

  This matters here specifically because D3's statelessness rests on "the cover's start edge
  identifies the anchor node, so the walk is a plain function of the current selection." That
  holds for every selection the filter produced, and undo/redo produce selections the filter
  never saw. D4 compounds it: a mapped-forward range is still ONE range, so the discriminator
  reads it as a block selection and extends from an anchor derived from an edge that no longer
  sits on a node boundary.

  → **Settled in D6: the walk normalizes its own input.** Not a reason to add the `StateField`
  back — the failure is a malformed INPUT, not an unrecoverable anchor, and stored state would be
  equally stale after the same undo. The other candidate, re-normalizing restored selections at
  the seam where history bypasses the filter, was offered to `caret-placement-policy`, which owns
  the caret half of this same `filter: false` fact; it shipped and declined, leaving the question
  here.

## Migration Plan

In-editor behavior only. No file or data migration. Off-mode notes and the plugin-disabled case
are byte-for-byte stock.

## Open Questions

- Does the D4 merge edge ever occur in practice, and does it read as wrong when it does?
