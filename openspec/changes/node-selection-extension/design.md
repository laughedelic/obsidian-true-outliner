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

This change is sequenced after `selection-as-subtree-set`, which removes the ancestor pull-in
from escalation. That ordering is what keeps this change small — see D3.

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

`selection-as-subtree-set` removes the pull-in. The cover's start edge (forward) or end edge
(backward) again identifies the anchor node however far the selection has grown, so the walk is
a plain function of the current selection. The statelessness `progressive-select-all` enjoys
transfers here only because of that ordering — a bidirectional walk needs strictly more state
than a monotone one unless the selection itself keeps identifying its origin.

### D4. Block versus multi-cursor is decided by range count

One range: a block selection; extend it as a whole. Several ranges: multi-cursor; extend each
independently.

*Why this works at all:* `selection-as-subtree-set`'s forest span is contiguous text, so a
growing block selection never fragments into several ranges. Had the pivot introduced a
set-of-ranges representation, block and multi-cursor selections would have been
indistinguishable and this would have needed a mode.

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

## Risks / Trade-offs

- **The first press loses the caret's exact offset** — the walk bottoms out at "anchor node,
  whole", not at the original caret. Workflowy and Logseq behave the same way. → Accepted, and
  stated so it is a decision rather than a surprise.
- **The merge edge in D4** → recorded, measured in real use, revisited rather than pre-solved.
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

  → Not a reason to add the `StateField` back: the failure is a malformed INPUT, not an
  unrecoverable anchor, and stored state would be equally stale after the same undo. Two cheap
  options: have the walk normalize its input (escalate the current selection to the nearest
  cover before stepping, which is idempotent for every selection the filter already produced),
  or have something re-normalize restored selections at the point history bypasses the filter.
  The second belongs to `caret-placement-policy`, which owns the caret half of this same
  `filter: false` fact and is sequenced before this change partly for that reason. Normalizing
  in the walk is self-contained and needs no agreement with it — worth settling before the walk
  is written rather than after.

## Migration Plan

In-editor behavior only. No file or data migration. Off-mode notes and the plugin-disabled case
are byte-for-byte stock.

## Open Questions

- Should the walk normalize its input selection to the nearest cover before stepping, so a
  selection restored by undo/redo (which the escalation filter provably never sees — see
  Risks) has defined behavior? Idempotent for every selection the filter already produced, so
  the cost is one escalation call per press.
- Does the D4 merge edge ever occur in practice, and does it read as wrong when it does?
- Should extension have any relationship to the Mod-A ladder's rungs — for instance, should
  `⇧↑` from a whole-subtree cover ever climb rather than grow sideways? Deliberately not
  designed in: the two features answer different questions ("one more node, that way" versus
  "wider, from here"), and conflating them was rejected in the discussion that produced this
  change.
