# Selection-enforcement follow-ups (two tracks)

Findings from the real-vault manual passes of `outline-selection-enforcement`
(2026-07-20). The core verdict was positive: escalation works, live-drag is stable,
within-node selection and return-to-character-level behavior feel right.

Deferred threads split into **two distinct tracks** — kept apart deliberately so
Phase C doesn't scope-creep:

- **Phase C (edit enforcement)**: rewriting/vetoing *document edits* — boundary-
  crossing deletions become structural deletions, paste re-indentation, orphan
  prevention. Exactly the scope design.md gave it; nothing selection-UX lives here.
- **Selection UX (its own future change or changes)**: richer ways to *make and see*
  node selections — the select-all ladder, modal block selection, bullet-click,
  block-level selection rendering. Builds on the shipped escalation machinery but is
  keymap/decoration work, independent of edit rewriting; it does not need to wait for
  Phase C, nor Phase C for it.

## Resolved by amendment in the same change (2026-07-20)

Two of the original findings were adopted as D4 amendments rather than deferred —
see design.md's "D4 amendments" and the amended node-selection-enforcement delta spec:

- **Single-node selection via the gap-line trigger.** A same-node selection with an
  end on a trailing gap line escalates to that one node's whole subtree — dragging
  past a node's end, before the next node, selects exactly that node. Gap *ownership*
  (trailing gap belongs to the preceding node) is unchanged.
- **Uniform multi-range escalation.** Once any range escalates, every non-empty
  in-jurisdiction range escalates to at least its own node's subtree, so a multi-range
  copy is always a concatenation of complete subtrees — the mixed
  block-level/mid-node-fragment copy observed in the manual pass can no longer occur.
- **Expand-only invariant** (a required companion to the gap-line trigger): escalation
  never shrinks a range, which keeps no-frontmatter Select All byte-identical to stock
  (and fixed a latent trailing-newline exclusion in the pre-amendment behavior).

## Known native limitation (not ours to fix)

**Drags starting inside a rendered callout/table can't escape the widget.** In Live
Preview, when the cursor is outside a callout/table, the block is an opaque
`.cm-embed-block` replacement widget: a drag starting inside its rendered content is a
browser DOM selection that never becomes a main-editor CM6 selection, so no
transaction exists for the funnel to normalize. Table cells being edited are separate
nested CM6 editors with Obsidian's own cell→row→table selection escalation,
deliberately untouched (D6 degeneracy). Confirmed stock: reproduces with outline mode
off and with the plugin disabled. Blockquotes and code fences are unaffected (they
render as real `.cm-line`s). Any fix would mean DOM-level selection interception —
the enumerate-the-inputs architecture the manifest rejects — or an upstream Obsidian
change. Mitigation that already works: sweep from outside the widget and it is
selected whole.

## Track 1: Phase C (edit enforcement) inputs

Threads that genuinely feed the edit-rewriting change:

- **Paste-site structural handling.** The uniform multi-range rule guarantees the
  *copied* content is a valid sequence of whole subtrees, but pasting is a document
  edit: pasted block content still splices at character level into the target
  position (observed: a block-level copy pasted mid-node merges with the surrounding
  paragraph). Phase C's paste re-indentation / boundary-respecting insertion is where
  this closes.
- **Gap-line deletion semantics.** Trailing gap lines are node-owned in the model but
  read as inert empty space on screen. Phase C's "deleting a node takes its trailing
  gap along" makes that ownership user-visible for the first time — whatever it
  decides must be reconciled with how selections over gaps already behave (the
  gap-line escalation trigger, expand-only retention of gap ends). Related but
  separate: *visual* gap treatment (ownership cues, cursor snapping, collapsing
  multi-blank gaps on structural moves) is decoration/UX territory — see
  docs/research/12 and Track 2.

## Track 2: Selection UX (separate future change)

Richer node-selection interactions on top of the shipped escalation core. Keymap and
decoration work — independent of Phase C:

- **Progressive Select All (the selection ladder).** Design discussed and agreed
  after the second manual pass (2026-07-20). Repeated Cmd+A presses climb a ladder:
  the node's own content text → the node's whole subtree → the parent's subtree → …
  → the whole outline → the whole document including frontmatter (which is exactly
  native Select All, so the ladder tops out into stock behavior the filter already
  passes through). Design decisions already made:
  - *Stateless*: each press compares the current selection against the ladder's
    rungs and picks the next one up — no double-press timers; robust after any
    interruption. Same approach obsidian-outliner uses for its two-step version
    ("once = current list item, twice = entire list").
  - *Mechanism*: a high-precedence keymap handler like the grammar's Tab/Enter — NOT
    the transaction filter, which cannot distinguish repeated identical select-all
    dispatches; the ladder must intercept Mod-A before dispatch. Reuses
    `escalate.ts`'s subtree covers as the rung geometry.
  - *Multi-range*: each range steps its own ladder; `EditorSelection` normalization
    merges overlapping results, and the uniform-escalation rule keeps merged results
    whole-subtree-valid.
  - *Precedent*: generalizes both Workflowy's two-step Ctrl+A (line → whole page)
    and obsidian-outliner's item → list; matches Logseq's parent-by-parent
    escalation; degrades to the simpler behaviors in shallow documents.
  - *Detail to pin down at spec time*: whether a list item's "own content text" rung
    starts after the `- ` marker (recommended: content only, matching
    obsidian-outliner and reading better for copy) or at the line start.
  - *Why it matters beyond convenience*: it is the keyboard answer to single-node
    selection for tight list items, where the gap-line trigger has no geometry to
    work with (see next item).
- **Single-node selection for tight list items (no gap lines).** In a tight list the
  next sibling starts on the very next line — no drag gesture can mean "just this
  item," so the gap-line trigger cannot apply (loose lists already work: their blank
  lines are item-owned gaps). The keyboard path is the selection ladder above; the
  natural mouse path is a click-the-bullet/marker-selects-the-subtree gesture
  (Logseq/Workflowy bullet semantics) — a DOM/decoration-layer interaction that
  belongs with the decorations work (docs/research/12), not the transaction funnel.
- **Modal block-level keyboard selection.** Once a selection is escalated, keyboard
  extension (Shift+Down etc.) currently moves the underlying character cursor and
  re-escalates per transaction — which works, but a true block-selection mode would
  extend by whole sibling subtrees per keypress, at every range of a multi-range
  selection simultaneously. This is a modal-behavior design (when to enter/leave the
  mode, how it interacts with the reversible drag-back behavior the manual pass
  praised) — spec it deliberately, not as a patch on the current rule.
- **Escalated-selection visual treatment.** The manual pass noted selection still
  *renders* as character-level highlight even when escalated to whole nodes; a
  block-level selection indication (whole-node highlight chrome) was judged out of
  scope for the enforcement change — it belongs with the decoration/polish layer
  (docs/research/12) but becomes more valuable once escalated selections are the
  operand of structural edits (Phase C) and of the ladder/modal gestures above.
- **Gap-line cursor transparency (vertical navigation) — filed 2026-07-21, second
  Phase C manual pass.** The chrome-transparency principle (design.md D9, Phase C)
  currently governs *edit* recognition only: Backspace/Delete correctly reads intent
  from the cursor regardless of gap width, but the cursor itself can still be
  *placed* on a gap line or moved through one arrow-key-press-at-a-time, same as
  stock. The natural completion — cursor placement/navigation skips gap lines
  entirely, the same way it's landing for list markers in this same change (below)
  — was deliberately deferred rather than folded into node-edit-enforcement:
  - **The concrete risk, not just caution**: CM6's vertical-motion commands
    (`cursorLineUp`/`cursorLineDown`) track a *goal column* across consecutive
    presses so Down-Down-Down through lines of different lengths stays visually
    aligned. Snapping the landing position away from a gap line on every vertical
    move recomputes the next move's goal column from the snapped position, not from
    the user's actual motion — real drift risk over a few presses, needs hands-on
    testing against real navigation, not a code review call.
  - **Mouse-click ambiguity**: clicking the rendered blank line between two nodes has
    no obviously-correct single answer for which side of the gap the cursor should
    land on (closer-in-pixels vs. always-next-node vs. always-previous-node) —
    another thing to prototype and feel-test, not decide from first principles.
  - **An invariant to knowingly reverse**: node-selection-enforcement's own spec
    states "empty ranges (cursors) SHALL never be moved by this layer — including
    cursors placed on gap lines," backed by a property test. Extending enforcement
    from edits to cursor *placement* is architecturally sound (cursor moves are
    `selection-only` transactions through the same filter — not the
    enumerate-the-inputs anti-pattern), but it's a different invariant than either
    Phase B or Phase C signed up for, and deserves its own design pass headed by a
    vertical-motion prototype as its first task.
  - **The escape hatch stays the mode toggle, not an in-outline-mode exception.** If
    cursor placement itself can't reach a gap line, "cursor deliberately left on the
    gap, editing it" stops being a real case in outline mode at all — switching
    outline mode off is already how this plugin offers raw character-level editing,
    so there's no separate in-mode exception to design. (Marker-transparent cursor
    placement, landing in this same change, needs no such exception either — the
    marker prefix has no legitimate "deliberately edit the chrome" use case the way
    a gap's blank-line-count arguably might, e.g. matching a template's spacing.)
  - **Combine with**: this belongs with Track 2 above (progressive Select All,
    modal block selection) as one future selection/cursor-UX change — both are
    keymap-adjacent, cursor/selection-level work built on the same escalation core,
    independent of edit rewriting.
  - **Visual pairing**: docs/research/12's "Collapsing gap lines" idea is the
    decoration-layer half of the same eventual feature (hiding, not just
    non-navigating, the gap) — cross-referenced there.
