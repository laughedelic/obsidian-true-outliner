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

## Escalation math re-examination candidate (found 2026-07-23, selection-visual-treatment review)

**A same-node selection that reaches a node's own text does not yet include that node's
owned trailing gap — only a selection that's dragged INTO the gap does.** Confirmed live:
in `paragraph A\n\nparagraph B\n\nparagraph C\n`, dragging from mid-A to mid-B escalates to
exactly `paragraph A` + the gap between + `paragraph B`'s own text (lines 0–2) — NOT
B's own trailing gap (line 3). Continuing the SAME drag one line further, onto that gap,
extends the selection to include it. Both are consistent with `escalateRange`'s existing,
deliberate D4 design: `subtreeContentEnd` excludes a node's own trailing gap from its
cover, and expand-only only RETAINS an end already placed beyond the cover — it never
reaches for the gap proactively.

The question raised in review: since gap ownership already means "this blank line
belongs to the preceding node" (the same ownership the gap-line trigger itself is built
on), should reaching ANY point in a node's own text — not just dragging past it into the
gap — be enough to escalate that node's cover to include its owned gap? That would make
"select node B as a block" always include its gap in one motion, rather than needing a
second, separate drag into blank space most users wouldn't think to make.

**Deliberately not changed here**: this is `node-selection-enforcement`'s own escalation
math (`src/escalate.ts`'s `subtreeCoverOf`/`subtreeContentEnd`), a different capability
with its own already-archived spec and property tests — out of scope for
`selection-visual-treatment`, which only renders whatever the existing escalation
produces (see that change's own design.md Non-Goals). It's also not obviously a bug: the
current shape was a deliberate D4 amendment already reviewed once in a real-vault pass,
and changing `subtreeContentEnd`'s definition would ripple into every existing scenario
in `tests/escalate.test.ts` and `node-selection-enforcement`'s spec, not just this one —
a decision that deserves its own dedicated look (ideally with a few real-vault passes
the way D4 itself got), not a reflexive fix bundled into an unrelated rendering change.
Flagging here for whoever picks up `node-selection-enforcement` refinements next.

## Live Preview raw-markdown reveal during block selection: CSS approach tried and reverted, blur approach in progress (2026-07-24)

`selection-visual-treatment` (the escalated-selection chrome change) took on a
significant-UX-improvement request beyond its original chrome scope: while a
selection is a whole-node/subtree block cover, keep Live Preview's RENDERED
appearance instead of the raw-markdown reveal Obsidian normally shows for any
line a selection touches. Two real approaches were tried; this records both
for whoever picks this up next, since the second (kept) approach has its own
real, unresolved cost.

### Root cause of the reveal (still true, independent of which fix is used)
Confirmed live: stock Obsidian hides a raw-markdown "formatting mark"
whenever NO selection range overlaps its own line, and reveals it (as real,
selectable text) whenever ANY range does — for every line the range spans,
not just its two endpoints. Normal, correct behavior for character-level
editing; distracting once the user has selected a whole block. The reveal is
also NOT instant: a real drag-release leaves marks unchanged for roughly one
paint, then reveals within ~50ms — confirmed by polling `textContent` at
increasing delays after release. No plugin-facing signal (focus events,
`EditorSelection` changes, an inspectable CM6 field) was found that fires
exactly at that boundary and not before — this looks baked into Obsidian's
own internal Live Preview implementation, with no documented extension
point to intercept it directly.

### Attempt 1 (reverted): hide revealed marks via CSS
`.cm-formatting` turned out to be a stable, shared class Obsidian puts on
every revealed mark span regardless of kind (`cm-formatting-header`,
`-strong`, `-em`, `-quote`, `-link`, `-link-string`) — hiding it
(`display: none`), scoped under `.to-decor-block-selecting
.to-decor-node-selected`, worked CLEANLY for marks whose "hidden" form is
just invisible/absent text: heading `#`, bold `**`, italic `*`, blockquote
`>`, a regular link's `[]()` (plus its raw URL text, `cm-string cm-url`,
which needed a second rule since it carries no `cm-formatting` class of its
own).

It did NOT work cleanly for marks whose "hidden" form is a RICHER WIDGET that
Obsidian removes from the DOM entirely on reveal, replacing it with plain
classed text — confirmed live via DOM diffing baseline (unfocused) vs.
covered (revealed) states:
- A list marker's round bullet comes from a nested `.list-bullet` span
  present only when hidden; revealing swaps it for plain "- "/"1. " text
  with no such span.
- A task checkbox's real `<input type="checkbox">` is likewise present only
  when hidden; revealing swaps it for plain "[ ]"/"[x]" text
  (`cm-formatting-task`).
- A code fence's opening line shows a `code-block-flair` language badge
  (hidden) or collapses to plain "```js" text (revealed,
  `cm-formatting-code-block`) — and since that text was the line's ONLY
  content, hiding it also collapsed the line's own height.
- A callout's title line (`> [!note] Title`) is ONE span carrying
  `cm-hmd-callout`, with no separate mark/content split.

Hiding the text that replaced these widgets can't bring the widget back —
CSS operates on what EXISTS, not on what used to exist. An indiscriminate
first version hid all of these too, and real-vault testing surfaced concrete
regressions: list items with literally no bullet at all, a blank gap where a
checkbox used to be, a visibly shrunken code block with its badge gone, and
a completely blank callout title line. Excluding each
(`:not(.cm-formatting-list):not(.cm-formatting-task):not(.cm-formatting-code-block):not(.cm-hmd-callout)`)
reverted them to native raw-text display instead — coherent, but not
rendered.

A separate real bug, also found on real content but genuinely fixable (not a
widget-swap case): a WIKI link's brackets carry `cm-formatting-link` plus a
`-start`/`-end` suffix, WITHOUT the plain `cm-formatting` class — the general
rule had zero effect on wiki links at all. A dedicated rule
(`.cm-formatting-link-start`, `.cm-formatting-link-end`) fixed the base case,
but a SECOND round of real-vault testing found it was still incomplete: an
ALIASED wiki link (`[[Note|Alias]]`) showed BOTH the canonical link text and
the alias simultaneously; the link's underline styling disappeared even
though the brackets stayed hidden; and — unrelated to wiki links —
blockquote/callout body text visibly shifted to stick against the left
border once its `> ` mark was hidden (hiding the mark's own trailing space
along with it, apparently). None of these three were investigated further.

Also found on that second real-vault review, but NOT a defect in this rule
at all: a callout's own colored background/icon disappearing on selection is
NATIVE Obsidian behavior, confirmed live — selecting through a callout's own
lines (not just around it) makes Obsidian revert its entire custom widget
rendering to plain blockquote-styled per-line text, independent of outline
mode. A callout only looks visually distinct while collapsed to its atomic
`.cm-embed-block` widget form; Obsidian itself expands it to individually
editable `.cm-line`s the moment a selection reaches inside it. (This also
explains the FIRST round's "callouts already stay rendered" observation:
that selection never actually landed inside the callout's own content.)

**Why reverted**: not any single bug, but the shape of the growing exception
list itself — four widget-swap exclusions, a wiki-link-specific rule, and
two more real bugs surfacing on the SECOND real-vault pass (aliases,
underline, blockquote spacing) with no sign the list would stop growing.
Explicit user call: rather than keep chasing individual constructs with more
CSS special cases, back off to either true native behavior or a
simple-to-implement intermediate state, and try a structurally different
mechanism instead (below) before deciding what, if anything, to keep from
this one.

### Attempt 2 (kept, confirmed working): reproduce a real "click away" via blur, recover keyboard interaction via a real replay
A real, manual "click outside the text area" after a block-covering selection
already returns Live Preview to its fully native rendered form — confirmed
directly by the user, including for every case the CSS approach couldn't
reach (callout widget, real checkboxes, round bullets, wiki-link aliases,
all of it). The insight: this isn't something to re-derive piecemeal via
CSS — it's Obsidian's own correct rendering, gated on FOCUS, not on the CSS
classes attempt 1 was keying off.

The fix (`SelectionDecorationPlugin` in `src/plugin/decorations.ts`): a
`mouseup` listener on the editor DOM, deferred by one tick (the drag's own
selection-escalation transaction, and CM6's own internal mouseup handling,
may not have committed yet at the exact moment the native event fires), that
blurs `view.contentDOM` whenever the resulting selection is a whole-block
cover (`allRangesCovered`) — reproducing the exact DOM effect a manual click
elsewhere already produces.

**Confirmed working by the user, in their real vault**: dragging over blocks
selects them with the selection background as the only visual change — no
raw-markdown flash at all, staying in fully rendered form including
everything the CSS approach couldn't restore. Exactly the target behavior.

**The initial cost, then recovered**: blurring removes DOM focus from the
editor entirely, so typing, Backspace, Delete, and arrow-key navigation were
all initially silently ignored while unfocused — manually clicking away and
testing the same interactions reproduced identically, confirming this was
inherent to being unfocused, not a bug in the blur trigger itself. Cmd+C and
Cmd+X DID still work while unfocused even at this stage — the clue that led
to the fix: copy/cut are evidently handled via a pathway that doesn't
require contenteditable focus (a document/window-level clipboard handler, or
the browser's native Selection object being sufficient on its own), unlike
keydown-routed commands which need the contentEditable itself focused to
receive the event at all.

**The recovery mechanism**: a second listener, on `document` itself
(`keydown`, capture phase), fires whenever a keystroke lands with nothing
meaningfully focused (`document.activeElement === document.body`) while this
specific view is the one currently blurred due to a covering selection. It:
1. Refocuses `view.contentDOM` — alone, sufficient to restore ordinary
   character typing, since browsers insert typed text via a SEPARATE, later
   `beforeinput`/`input` dispatch evaluated against whatever is focused AT
   THAT time, not something frozen at the original keydown.
2. Replays the SAME `KeyboardEvent` through `@codemirror/view`'s
   `runScopeHandlers(view, event, 'editor')` — a public CM6 API for exactly
   this situation ("run this view's installed keymap against an event that
   didn't originate on its own DOM"). This is what recovers Backspace,
   Delete, arrow keys, Tab, Cmd+A, and — critically — this project's OWN
   layered keymap (the structural-edit rewriting, marker-transparent cursor
   placement, etc.), since those are matched via keydown-bound commands, and
   the ORIGINAL event's own propagation path is already fixed to
   `document.body`'s ancestry, not `contentDOM`'s — CM6's real keymap facet
   never sees it without this replay. Deliberately NOT reimplemented by hand
   (e.g. calling `@codemirror/commands` functions directly): that would
   bypass this project's own higher-precedence keymap entirely, a real
   correctness risk given how much of this codebase's own edit-enforcement
   logic lives in that layer. `runScopeHandlers` runs the real, complete,
   already-installed keymap, nothing rebuilt.

**A real bug found on the first manual test round, then fixed**: once
`runScopeHandlers` DID match and run a command, the ORIGINAL event was never
told it had been handled — so once the browser finished dispatching it, it
ALSO applied its own native default action against whatever was now focused.
For Backspace/Delete: a SECOND, generic contentEditable deletion on top of
the correct structural one, confirmed live on `## Heading 1` / `paragraph` /
`## Heading 2` — selecting Heading 1's subtree and pressing Backspace once
required TWO undos to fully revert, and the surviving cursor position
(`##|Heading 2`, missing the space after `##`) matched exactly what a
second, redundant single-character deletion from the CORRECTLY-placed
post-command cursor (`## |Heading 2`) would produce; Delete showed the same
pattern in the opposite direction (`## |eading 2` — the `H` of `Heading`
also consumed). For Tab: the browser's own native "cycle focus to the next
focusable element" behavior (Tab's default action outside a text field),
stealing focus to a toolbar button. Fixed with `event.preventDefault()` +
`event.stopPropagation()` — but ONLY when `runScopeHandlers` reports a
command actually matched; an UNMATCHED key (plain character typing) must NOT
be prevented, since that default action (the browser's own native
`beforeinput` insertion against the now-refocused editor) is exactly what
makes ordinary typing work.

**Confirmed working by the user after the fix**: typing, arrows, Backspace,
Delete (single keystroke, correct result, one undo), and copy/cut/paste all
behave correctly with the block-covering selection staying fully rendered
throughout.

**Known, accepted limitations, not chased further**:
- **Multi-pane conflict**: if two outline-mode panes both happen to be in
  the blurred/block-selected state simultaneously (both selected, neither
  since typed in), both views' listeners would try to claim the same
  keystroke — the guard (`document.activeElement === document.body`) can't
  distinguish which pane the user actually means. Not hit in practice, not
  fixed.
- **Keyboard-only block selection never triggers this at all** — the blur is
  wired to `mouseup` specifically, matching how the user originally framed
  the ask ("click outside" mimicking mouse interaction). A block cover
  reached via Shift+Arrow alone still shows the old reveal-while-focused
  behavior.
- **IME composition (Japanese/Chinese/Korean input) is untested.** Plausible
  it works (composition keydowns shouldn't match any keybinding, so
  wouldn't get `preventDefault`, letting native composition proceed against
  the refocused editor) but not verified live.
- **Tab/Shift-Tab's own multi-node behavior** (observed: indents only the
  LAST of several selected nodes, not all of them) is a separate,
  pre-existing gap, not introduced by this mechanism — see the new Track 2
  entry below ("Structural keymap commands need selection-aware behavior").

**Current status**: kept as the shipped mechanism (`decorations.ts`), not
reverted. No e2e coverage was added for either listener, deliberately —
focus/blur timing interacting with real keyboard/drag input is exactly the
kind of thing flagged as unlikely to test reliably through the automated
harness; validation here was manual, in a real vault, by design, and it
passed.

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
- **Structural keymap commands need selection-aware behavior for multi-node/subtree
  selections — filed 2026-07-24, selection-visual-treatment's keyboard-recovery
  testing.** With a covering selection spanning SEVERAL sibling subtrees, Tab
  (indent) was observed to indent only the LAST of the selected nodes, not all of
  them — the plain per-cursor Tab command has no concept of "this whole selection is
  several nodes, indent all of them together." The user's own framing: this needs
  real design, not a quick patch, and likely extends to Shift-Tab (outdent) and
  Cmd+Up/Cmd+Down (move node) too — all of them currently operate on a single
  cursor/line's own position, with no special-cased behavior for "several nodes or
  subtrees are currently selected." The user's own assessment (not independently
  re-verified against a normal, natively-focused multi-node selection): likely a
  pre-existing gap in the structural keymap itself
  (`src/plugin/keymap.ts`/`node-edit-enforcement`'s own command implementations),
  not something the keyboard-recovery work introduced — worth confirming that
  assumption before starting on a fix. Belongs with Track 2's other
  keyboard/selection-UX work above (the ladder, modal block selection), since it's
  the same category of question: what should a keyboard command do differently once
  the CURRENT operand is "several whole subtrees," not a single cursor position.
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
