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

*Known edge, accepted deliberately:* two independently-extended cursors can grow until their
ranges become adjacent and normalization merges them into one, at which point the next press
switches to block semantics. It requires the cursors to meet exactly, and the result — one
selection now extending as a block — is defensible rather than wrong. Chosen over a mode flag
because the simplest thing that works should be measured in real use before complexity is added;
revisit after the manual pass.

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

## Migration Plan

In-editor behavior only. No file or data migration. Off-mode notes and the plugin-disabled case
are byte-for-byte stock.

## Open Questions

- Does the D4 merge edge ever occur in practice, and does it read as wrong when it does?
- Should extension have any relationship to the Mod-A ladder's rungs — for instance, should
  `⇧↑` from a whole-subtree cover ever climb rather than grow sideways? Deliberately not
  designed in: the two features answer different questions ("one more node, that way" versus
  "wider, from here"), and conflating them was rejected in the discussion that produced this
  change.
