## Why

Chrome transparency (node-edit-enforcement D9) currently governs *edits* only: Backspace
and Delete read intent from the cursor regardless of gap width or marker internals, but the
caret itself is still placed and moved in raw character space. Blank gap lines and list-item
marker prefixes are addressable positions, so ordinary navigation stumbles over encoding
chrome that carries no content. A real-Obsidian probe pass (2026-07-25, recorded in
[examples.md](examples.md)) measured three concrete failures: ArrowLeft at a list item's
content start is a permanent no-op at every depth, so the caret cannot leave an item
backwards at all; Home pressed twice reaches inside the marker even though ArrowLeft and
mouse clicks are clamped out of it; and a single Shift+ArrowDown from a subtree's last child
selects the **entire document**, with every further press doing nothing.

The Home case was then root-caused, and the answer is this change's most useful finding.
ArrowLeft classifies `selection-only` and is clamped; Home classifies `programmatic` —
Obsidian's own Home dispatches with no `userEvent` — and is passed through by design. The
funnel behaves exactly as specified; the clamp simply never sees the key. That matters
because the clamp cannot be extended to reach Home without clamping `programmatic`
transactions, which breaks a committed pass-through requirement and the workspace-restore and
sync-reconciliation scenarios under it. Correction cannot fix this case at all. Which gesture
lands in which class is Obsidian's implementation choice, per gesture and per release — not
something a correction layer can enumerate in advance, and the reason motion moves to bound
keys instead (design.md D1).

The second half of the problem is that Shift+Arrow extension was never designed — it is an
emergent by-product of per-transaction selection escalation. Its granularity depends on
whether a blank line happens to sit between two nodes (one node per press in a loose list,
two in a tight one), it can never shrink because escalation is expand-only, and with two
cursors in adjacent siblings one keypress selects everything. These threads are already
filed as deferred work in [docs/research/13](../../../docs/research/13-selection-follow-ups.md)
("Gap-line cursor transparency", "Modal block-level keyboard selection"); this change picks
them up together, because they are the same question asked of the caret and of the selection.

## What Changes

- **Gap lines stop being addressable in outline mode.** Vertical and horizontal motion move
  between node contents, never landing on a blank gap line. A click on a gap line resolves
  through gap *ownership*, which the parse model already fixes: the gap belongs to the node
  above it, so the caret lands at that node's content end. No pixel-proximity heuristic.
- **The list-item marker prefix stops being addressable, uniformly.** Leading indentation,
  the marker character, and its trailing space are not caret positions by any gesture —
  closing the Home-versus-ArrowLeft inconsistency in the shipped clamp. ArrowLeft at a
  content start now crosses to the previous node's content end, mirroring ArrowRight, which
  already skips the next item's marker correctly. A heading's `#` prefix is NOT affected:
  it stays directly editable text, as `clampCursorToContent`'s existing list-item-only scope
  and `progressive-select-all`'s column-0 heading rung both already have it. Headings are
  otherwise ordinary nodes for every rule here — they simply own a section, the way a list
  item owns its children.
- **Shift+Arrow becomes a deliberate directional walk.** The first press in either direction
  selects the anchor node's own whole subtree. Each further press moves the selection's head
  end to the next node in content order that actually changes the cover, then recomputes the
  cover through the existing subtree/sibling-run geometry. Steps that would not change the
  cover are skipped, so no press is ever a no-op.
- **Shift+Arrow can shrink.** The reverse direction walks the head back the same way,
  bottoming out at the anchor node's own subtree. This does not weaken the expand-only
  invariant, which belongs to the transaction filter's escalation path — extension dispatches
  an exact cover, which escalation already leaves untouched.
- **Home and End escalate**: first press to the current line's own content boundary, second
  press to the whole node's content boundary. This is the multiline-node answer (continuation
  lines from Shift+Enter, multi-line paragraphs), and it collapses to a single step when the
  node occupies one line — the same adjacent-identical-rung collapse `progressive-select-all`
  already specifies.
- **Escape is NOT bound.** Native collapse-to-edge stays; because a cover's end is a gap-line
  position, the placement rule above already lands the caret on content. Leaving the key
  unbound keeps it free for the filed modal block-selection work. (An earlier round chose to
  bind it, on a probe reading since superseded — see design.md D8 and examples.md E7.)
- **The preamble is out of jurisdiction, explicitly.** Frontmatter and anything before the
  first node keep byte-for-byte stock motion and placement. No frontmatter handling is added:
  Obsidian has its own Properties UI, and a note can be taken out of outline mode for raw
  editing. The carve-out exists so the addressable-position rule — stated over node content
  spans — cannot be read as clamping the caret out of a region that belongs to no node.
- **BREAKING (in-mode behavior, not file format)**: positions the caret could previously
  occupy in outline mode become unreachable, and Shift+Arrow granularity changes in tight
  lists and in the upward direction. Files, the parse model, and off-mode behavior are
  untouched.

## Capabilities

### New Capabilities

- `content-space-caret`: caret placement and motion in outline mode — which document
  positions are addressable at all, how vertical and horizontal motion traverse node
  contents, how Home/End and pointer clicks resolve, and the goal-column contract for
  repeated vertical motion.
- `node-selection-extension`: keyboard selection extension as a directional step along an
  ordered sequence of node covers — one node per press, symmetric shrink anchored to an
  explicit extension origin, and per-range independence.

### Modified Capabilities

- `node-selection-enforcement`: the requirement "Within-node content selections and cursors
  are untouched" is narrowed. Its guarantee that gap-line cursor placement stays native is
  reversed for outline mode, and its list-item marker clamp is superseded by the broader
  addressable-position rule in `content-space-caret` — the clamp becomes one consequence of a
  general rule rather than a standalone mechanism.
- `node-edit-enforcement`: the "Editing semantics are chrome-transparent" requirement's
  deliberate escape hatch — an edit made with the caret placed ON a gap line stays native —
  becomes unreachable in outline mode, since the caret can no longer be placed there. The
  escape hatch becomes the outline-mode toggle itself, as anticipated in docs/research/13.

## Impact

- `src/plugin/keymap.ts`: new motion and extension handlers join the existing
  high-precedence, per-keypress outline-mode-gated keymap.
- `src/escalate.ts`: `clampCursorToContent` is superseded by a general content-space position
  mapper; `subtreeCoverOf` and the sibling-run geometry are reused unchanged.
- `src/select-all-ladder.ts`: unchanged. Directional extension walks content order and reuses
  `escalate.ts`'s cover geometry directly, so it needs no rung machinery — the two features
  share the geometry beneath them, not the ladder itself.
- `src/plugin/transaction-filter.ts`: the clamp call site is replaced; escalation math is
  untouched.
- New pure decision modules, unit- and property-tested independently of Obsidian, following
  the established `escalate.ts`/`select-all-ladder.ts` pattern.
- Tests: new pure-module suites; new e2e spec driving real keyboard and pointer input;
  regressions in `tests/escalate.test.ts` for the reversed cursor-placement invariant.
- Manual verification is a gate, not a formality: the goal-column risk recorded in
  docs/research/13 needs hands-on testing against real navigation before the motion rules are
  settled.

## Coordination with other active changes

- `minimal-changesets-for-structural-ops` proposes retiring the cursor re-assertion
  mechanism (`src/plugin/history-cursor.ts` and its `plugin-own` `userEvent`). This change
  does not depend on that mechanism: its jurisdiction rule is written against the
  `plugin-own` CLASS, which survives either outcome, since structural dispatches keep their
  `input.structure.*` events regardless. **Either change may land first**; no sequencing is
  required, and neither needs to wait on the other.
- `structural-history-integration` is not yet in `openspec/specs/` — it exists only as a
  delta inside the unarchived `fix-redo-cursor-after-structural-ops`. Nothing here takes a
  normative dependency on it; it is referenced in design.md as motivation only.

## Out of scope

Deliberately unchanged, each already filed with its own rationale:

- Structural keys over multi-node selections (Tab indenting only the last node) — confirmed
  again in this probe pass, but it is edit semantics, and it needs the operand definition
  this change produces before it can be designed.
- The two-transaction escalation flash (docs/research/13).
- Enter/Backspace edge cases, including Enter on an empty list item.
- Folding, zoom, and modal block-selection state.
