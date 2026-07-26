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

**Two of these were real bugs, found live and fixed on a second manual test round
(2026-07-24)**:
- **Multi-pane conflict, fixed.** With two outline-mode panes open side by side, both
  block-selected, typing only ever reached the FIRST one (regardless of which pane the
  user had actually clicked into), with the typed text landing somewhere other than the
  selection. Root cause: `document.activeElement === document.body` is equally true for
  BOTH panes once both are blurred — it can't tell them apart, so `onDocumentKeyDown`
  always acted on whichever view's listener happened to be registered first (document
  listeners run in registration order; `stopPropagation` doesn't stop OTHER listeners on
  the SAME node from also running). Fixed by ALSO requiring `app.workspace.activeEditor
  === (this view's own MarkdownFileInfo)` — Obsidian tracks "active editor" independently
  of raw DOM focus (updated on a real click/mousedown into a leaf, including the one that
  starts a new block-selection drag there) and keeps pointing at that leaf even after this
  same plugin's own blur call removes DOM focus from it, correctly disambiguating which
  pane a keystroke belongs to.
- **Keyboard-only block selection now gets the same blur treatment, fixed.** The user's
  own framing: a keyboard-reached block cover (Shift+Arrow, no mouse) still behaved as
  "a different mode of interaction" than a mouse-drag one, and asked to make it
  consistent. Hooked onto `ViewUpdate.selectionSet` (CM6's own per-transaction update
  hook) instead of a new keymap binding — reuses the exact same `allRangesCovered` check
  everywhere else already uses. Guarded on a `mousedown`/`mouseup`-tracked `mouseDown`
  flag: an in-progress mouse drag also dispatches one transaction per pointer move, each
  its own `selectionSet` update, and may reach a covering shape WHILE THE BUTTON IS STILL
  HELD — blurring mid-drag would risk interrupting the browser's own native drag-select
  gesture. `onMouseUp`'s own separate, still-needed deferred check remains for the
  mouse-completion case: the last relevant selection-settling transaction may commit
  WHILE `mouseDown` is still true (so the `update()` hook skips it), and nothing later
  re-triggers `update()` to catch it once the button is released.

  **A follow-up bug in this same fix, found on user testing, then fixed**: typing over
  a keyboard-escalated selection sometimes inserted text at an unexpected position
  instead of replacing it — the user's own hunch was exactly right ("the cursor is in a
  different place just before we switch to block-selection mode"). Root cause: the
  `update()` hook was blurring SYNCHRONOUSLY, inside the same dispatch cycle as the
  keystroke that just escalated the selection, racing CM6's own sync of its internal
  `EditorState.selection` into the browser's native `Selection`/`Range` — blurring
  before that sync completed froze the DOM's OWN selection at a stale, pre-escalation
  position, later restored as-is on refocus and read by the browser's native
  `beforeinput` handling for the typing keystroke. The mouse-drag path never hit this,
  since a real drag continuously updates the DOM's native selection throughout the
  gesture, not at one synchronous instant. Fixed by deferring the blur via
  `setTimeout`, matching `onMouseUp`'s own already-validated pattern exactly. Confirmed
  working by the user: keyboard-selecting then typing over now replaces correctly and
  consistently, matching mouse-drag behavior.

**A third, NOT fixed — a genuine hard limitation of the reactive-refocus approach
itself**:
- **IME composition (tested live: Chinese Pinyin input) is broken in a specific way**:
  the FIRST keystroke of a composition sequence is dispatched as a plain Latin
  character (inserted literally, not composed), and only the SECOND keystroke onward
  correctly engages IME composition. Root cause, as far as can be reasoned about
  without deep OS/browser IME internals: an input method's decision to begin composing
  is tied to which element already HAS focus at the moment the OS delivers a physical
  keystroke to the input pipeline — a decision made independently of, and likely prior
  to, the browser's own DOM event dispatch. Our refocus happens REACTIVELY, inside the
  `keydown` handler for that SAME first keystroke — by the time we call `.focus()`,
  the OS may have already decided (based on the PRE-refocus, unfocused state) that
  this keystroke isn't a composable one, so it also can't retroactively be treated as
  the start of a composition. There's no earlier, reliable "the user is about to type"
  signal to refocus on instead (hovering the mouse over the editor, for instance, would
  refocus far too eagerly, defeating the whole point of staying blurred while just
  looking at a selection). Deliberately NOT attempted as a fix: any workaround here
  would be speculative and hard to verify without testing across multiple IMEs/OSes,
  exactly the kind of fragile-workaround-chasing this investigation already backed off
  from once with the CSS approach. Recorded as a known, accepted limitation: non-Latin
  IME input right after selecting a block will lose its first keystroke to literal
  Latin insertion.

**Current status**: kept as the shipped mechanism (`decorations.ts`), not reverted, now
covering mouse AND keyboard-driven block selection consistently, correct across
multiple panes. No e2e coverage was added for any of this, deliberately — focus/blur
timing interacting with real keyboard/drag input is exactly the kind of thing flagged as
unlikely to test reliably through the automated harness; validation here was manual, in
a real vault, by design, and it passed (except for the documented IME limitation above).

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

## Known pre-existing issue: a brief raw/character-level flash before block-cover
## chrome settles on keyboard-driven escalation (found 2026-07-24, progressive-select-all)

**A momentary flash of native character-level selection appears immediately before
block-cover chrome settles, on repeated keyboard-driven escalation from an already-
covering selection** — reported first against `progressive-select-all`'s Mod-A ladder,
then confirmed by the user to reproduce on stock `main` with plain Shift+ArrowDown too
(pressed repeatedly from an already-covering selection). Not introduced by
`progressive-select-all`; pre-existing since `selection-visual-treatment`
(d045b9b770bf1fecb2e8d0b1915da3278dee7278) first added the blur-based chrome mechanism.
Not fixed here — see "why not fixed here" below.

**Confirmed root cause for the Shift+ArrowDown case, via pure-function testing (not
timing-dependent, not a WebDriver artifact)**: `src/plugin/transaction-filter.ts`'s
`escalateSelection` returns a plain corrected selection when it changes something, and
the filter wraps that as `result = [tr, { selection: escalated }]` — an ARRAY of two
`TransactionSpec`s. CM6 applies an array from a `transactionFilter` as two SEPARATE,
sequential state transitions, each with its own DOM sync: first `tr` UNMODIFIED (the
raw, pre-escalation selection — e.g. a plain one-line cursor extension from
`cursorLineDown`-with-extend), THEN a second transaction correcting the selection to the
escalated/covering form. Confirmed directly: `escalateRanges(doc, rawOneLineExtension)`
returns a different (escalated) range for a same-node-crossing extension — exactly the
shape Shift+ArrowDown produces when it crosses into a covering shape. The raw transaction
is real and genuinely gets its own DOM sync; before this change existed, that brief raw
frame was invisible (both frames rendered as ordinary native highlight, no chrome to
contrast against). `selection-visual-treatment`'s blur/chrome mechanism is what makes it
visible: the raw frame renders with native highlight + focus, and the corrected frame is
blurred with chrome, so the two now visibly differ, and the flash reads as a "blink."

**`progressive-select-all`'s own dispatches do NOT trigger this specific mechanism** —
verified directly: `escalateRanges` run on each of the ladder's rungs (own-subtree-with-
gap, siblings-run, ancestor-subtree) returns them UNCHANGED, since a ladder rung is
already an exact cover by construction — the filter leaves a single, unsplit transaction
for these. Repeated Mod-A presses still visibly exhibit a similar flash in practice
(confirmed via instrumented real-Obsidian testing: a real `focus` event fires on
`contentDOM`, followed by the block-cover CSS class briefly toggling off then back on,
all within ~20ms), but through a DIFFERENT, not-yet-fully-isolated path — most likely
`SelectionDecorationPlugin`'s `onDocumentKeyDown` recovery mechanism (which refocuses the
already-blurred editor before replaying the keystroke via `runScopeHandlers`), possibly
compounded by Obsidian's or Electron's own Cmd+A handling independently touching focus
before the plugin's own code ever runs. A first attempted fix (deferring
`contentDOM.focus()` in `onDocumentKeyDown` until after the replay, skipped entirely when
the replayed command's result is still covering) was implemented, verified via the exact
same instrumented-listener technique to have ZERO measurable effect on the observed
event log, and reverted — ruling out that specific call site as the (sole) cause without
identifying the real one.

**Why not fixed here**: this is `node-selection-enforcement`/`transaction-filter.ts` and
`escalated-selection-decoration`/`decorations.ts` territory — two already-shipped,
already-tested capabilities with their own committed contracts and e2e suites, not
`progressive-select-all`'s own scope (whose own dispatches were shown not to be the
trigger for at least the confirmed Shift+ArrowDown mechanism). A real fix has real
architectural weight either way: collapsing the transaction filter's two-step escalation
into one combined transition risks the filter's existing, carefully-tested
selection-escalation contract; suppressing the visual distinction during a single-tick
gap touches the blur mechanism's own already-reviewed, multi-round-tested design (see
this same file's "Live Preview raw-markdown reveal" entry above for how much manual
back-and-forth that mechanism already took to land). Both deserve their own dedicated
look with real-vault manual passes, matching this project's established practice for
this class of change — not a reflexive fix bundled into an unrelated ladder feature.

**For whoever picks this up**: start from the confirmed mechanism above (the transaction
filter's `[tr, {selection: escalated}]` split) for the Shift+ArrowDown/general-
raw-command case; the Mod-A-specific residual flash needs its own focused
instrumented-listener investigation (the technique used here — real `focus`/`blur`
listeners plus a `MutationObserver` on the block-selecting class, installed via
`executeObsidian` before the keypress, not polling afterward — is fast and reliable in
this harness even though this whole area is otherwise flagged as unlikely to test
automatically) to determine whether it's `onDocumentKeyDown`, an Obsidian/Electron-level
Cmd+A interaction, or something else.

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
  - **Escape is left unbound, on purpose, for this — recorded here so this thread
    finds it (`content-space-caret` D6, 2026-07-25).** That change deliberately does
    NOT bind Escape, specifically so it stays free for whatever "leave block-selection
    mode" gesture this work settles on. Measured behavior to build on: native Escape
    on a covering selection is messier than either of two earlier readings — on a
    forward two-node cover the FIRST press changes nothing and the SECOND collapses to
    the head edge, landing on what is (post `content-space-caret`) a gap-line position;
    that placement resolver now redirects it to the covered node's content end
    automatically, so whatever a future Escape-adjacent binding does, it inherits a
    caret that's already on content, never on chrome. The two-press oddity itself
    (plausibly the blur-based chrome mechanism consuming the first Escape) is still
    unexplained and worth understanding before this work binds the key for anything.
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
  - **✅ RESOLVED by `content-space-caret` (2026-07-25).** The vertical-motion
    prototype this entry called for ran (docs/research/04 Q24): the goal-column drift
    risk is real but small (a one-character discrepancy, only when a chase bounces off
    a node shorter than the goal column, under a non-monospace font — the direct,
    no-bounce cases land pixel-exact) and does not change the direction this entry
    already argued for. The mouse-click ambiguity resolved cleanly too: gap ownership
    (already established, all-or-nothing, for the escalation trigger) answers it with
    no heuristic — a gap always belongs to the node above it. Cursor placement now
    skips gap lines and list-item markers uniformly (`src/caret.ts`), the invariant
    reversal is made explicit in `node-selection-enforcement`'s own spec, and the
    escape hatch is exactly the mode toggle this entry predicted, not an in-mode
    exception.

## The selection/cursor-UX track, planned as five changes (2026-07-25)

Track 2 above was filed as "its own future change or changes". It is now planned, and the
plan changed one thing this document had treated as settled: the escalation rule's
whole-subtree invariant.

### The pivot: downward closure, not upward

Re-reading the originating rationale (`outline-selection-enforcement` design D4) against real
Logseq use showed that the recorded justification — *a selection covering a heading but not
its section, or a list item but not its children, has no valid structural meaning* — argues
only for **downward closure**: a node is never selected without its whole subtree. The other
half of the shipped rule, expanding a crossing range to the contiguous run of children of the
deepest common ancestor scope, was never separately justified. It is what pulls an ancestor
into a selection that merely crossed a scope boundary.

Measured consequences (real Obsidian, 2026-07-25): one Shift+ArrowDown from a subtree's last
child selects the entire document; two cursors in adjacent siblings plus one press collapse to
a single whole-document range; and once an ancestor is in the cover, the node a gesture started
from is unrecoverable from the selection.

Every comparable outliner — Logseq, Workflowy, Roam, Notion, Dynalist, Tana — enforces
downward closure and none enforces the upward half. This project had already conceded the point
in writing: D4's own multi-range amendment calls a multi-range copy "a concatenation of complete
subtrees — structurally valid by construction."

The finding that makes the pivot small: **the cover stays a single contiguous range.** Node
order is text order, so a document-order run of nodes closed under descendants already occupies
contiguous text. Selecting a nested item and the following top-level item needs no ancestor to
bridge them — the ancestor's own line sits above the span, not between its parts. The old rule
reached for it because of the common-ancestor formulation, not because any text needed bridging.

This resolves this document's own "Escalation math re-examination candidate" entry, and removes
the need for stored extension-origin state in keyboard extension.

### The five changes and their order

1. `fix-orphan-gap-on-node-deletion` — deleting an exactly-selected node leaves its blank line
   behind, and multi-range deletions are not enforced at all. First, because its choice of layer
   decides whether a cover's end includes its owned gap's newline, which is geometry the pivot
   builds on.
2. `selection-as-subtree-set` — the pivot above.
3. `node-selection-extension` — Shift+Arrow as one node per press, symmetric, stateless.
   Depends on 2, and is materially simpler because of it.
4. `content-space-caret` — gap lines and marker prefixes stop being caret-addressable.
   Independent of all of the above.
5. `paste-heading-section-reencoding` — a heading section pasted into a list mangles.
   Independent; a re-encoding problem, not a selection one.

### What this track still owns

Modal block-selection state and the cherry-picking `Cmd`-click gesture remain unplanned.
`node-selection-extension` deliberately uses the simplest discriminator that works — one range
is a block selection, several are multi-cursor — and records its known edge for reassessment
after real use rather than pre-solving it with a mode.

## Parked: exiting a table's nested editor lands the caret on a gap line (found 2026-07-26, `content-space-caret` real-vault pass)

Vertical motion INTO a table is correct — the gap is skipped, Obsidian's table widget takes the
caret into a cell. Coming back OUT is not: the first press off the top (or bottom) row parks the
caret on the surrounding gap line, and only the NEXT press moves it onto real content. A one-press
lag, symmetric before and after the table.

Measured, with a `cm.dispatch` monkey-patch recording a stack trace per call (pressing ArrowUp
repeatedly from inside a table):

```
up#1  t.dispatchUpdate    → {4,2}   Obsidian, still inside the table
up#2  t.dispatchUpdate    → {2,2}   Obsidian, still inside the table
up#3  t.placeCursorAround → {1,0}   Obsidian — THE GAP LINE
up#4  PLUGIN              → {0,0}   us, correcting only on the following press
```

The keypress never reaches our keymap: a table cell runs its own nested CM6 editor, which consumes
the arrow and, on the way out, calls Obsidian's own `placeCursorAround` to hand focus back to the
outer editor. Our handler only sees the press AFTER that, which is why the correction is late
rather than absent.

**Why the obvious fix is not available.** The filter does see that dispatch, and could rewrite it.
It doesn't, because `resolveForeignCursors` (`transaction-filter.ts`, Q25) is deliberately scoped
to the MARKER half of placement resolution and never the gap half — D2 scopes gap-line resolution
to real user gestures, and `62-outline-edit-enforcement` asserts it directly ("a PROGRAMMATIC
gap-line placement is untouched"). That same narrowing is what lets the checkbox fix coexist with
five other tests. Widening it to gaps was tried and reverted: it broke those five across four spec
files.

**What picking this up would involve.** D2's exemption was written with a plugin calling
`Editor.setSelection` in mind. `placeCursorAround` is a different animal: Obsidian moving the caret
while servicing a keypress the user actually made. Distinguishing "another plugin placed this
cursor" from "Obsidian moved it while servicing a user gesture" is the real question, and it means
reopening a decided design point rather than patching a call site. Note also that a state-level
`transactionFilter` cannot detect a nested editor at all — `isNestedEditor` needs DOM ancestry, and
`editorInfoField` resolves to the same outer `MarkdownView` for both — so any rule here has to hold
without knowing whether it is running in a cell.

Related, and probably the same root: entering a table from a heading shows a brief caret flash on
the gap line before the caret settles into the first cell.

## Follow-up: "jump to block start/end" wants its own binding (opened 2026-07-26, `content-space-caret` close)

`content-space-caret` shipped Home/End as a single step within the caret's own raw line, after three
attempts at an escalating ladder (visual row → node, and a variant with the raw line between) were
each retired following real-vault use. The full account is `docs/research/04` Q26; the short version
is that an escalating Home makes one keypress mean different things depending on state the user
cannot see — where the previous press left the caret, and where the renderer chose to wrap the text.

Moving the caret to a multi-line block's own start or end is still worth having. It should be its
own motion with its own binding, not a second meaning layered onto Home. As a separate command it
is discoverable, it can be rebound, it does not make the most-pressed key in the editor
state-dependent, and it can be defined over the node tree — where "the block" is unambiguous —
rather than over rendered rows.

Worth deciding at the same time whether it belongs to the same family as the `progressive-select-all`
ladder (which climbs the tree by design, and where escalation IS the feature because the selection
it produces is visible). A caret has no such feedback, which is most of why the ladder failed here.

## Follow-up: a dev-mode raw-keydown readout (opened 2026-07-26, `content-space-caret` close)

The keymap-liveness probe (`setMotionProbe`, dev builds only) reports every key this plugin BINDS:
what CM6 routed to us and what we consumed. It is blind to the failure that actually cost this change
several sessions — the user pressing a key we do not bind at all. On macOS, cmd+Left is
`Mod-ArrowLeft` and fn+Left is `Home`; the reporter had always assumed cmd+Left was Home. Every
report described cmd+Left's native ladder while every fix landed on `Home`. The decisive clue was
cmd+Left's ABSENCE from the readout, which only surfaced because they happened to try both keys.

A raw-keydown log in dev builds — `key`, `code`, modifiers, `defaultPrevented`, and whether any bound
handler claimed it — would have answered "you pressed Mod-ArrowLeft, we bind Home" on the first
press. Small, and it closes a whole class of cross-purposes debugging.

Related, deliberately NOT done (see `docs/research/04` Q27): binding `Mod-ArrowLeft`/`Mod-ArrowRight`
to the same content-space motion as Home/End. cmd+Left already cannot land on chrome — the
transaction filter clamps its column-0 rung off the marker — so there is no invariant to gain, and
overriding a native ladder users may prefer is a real cost. Revisit only if the native ladder turns
out to violate something the filter cannot catch.

## Follow-up: bidi-correct BOUNDARY crossings (opened 2026-07-26, `content-space-caret` review)

Within-line horizontal motion is now native and bidi-correct: the adapter asks CM6's
`moveByChar`, flipping `forward` by `textDirectionAt` exactly as CM6's own `cursorCharLeft`/
`cursorCharRight` do. Measured — in an RTL run ArrowRight moves to a LOWER offset, and LTR lines are
unaffected. Note the flip lives in the COMMAND, not in `moveByChar`, which returns logical offsets
regardless of direction; a first attempt that delegated without the flip changed nothing at all, and
the test written for it passed with the delegation disabled.

What is NOT handled: `planHorizontal` decides WHETHER a press crosses a boundary using LOGICAL
position — "at or before the content boundary" for left, "at the line's end" for right. In an RTL run
those two fire at the logically-first and logically-last positions, which are the visually LAST and
FIRST. So a caret at the visual right edge of an RTL line does not cross to the next node on
ArrowRight the way it would in LTR text.

Fixing it means deciding what "the next content position" means for mixed-direction text — whether
node order follows logical document order (it does, structurally) while motion within a line follows
visual order, and what happens at the seam. That is a design question about the content-space model,
not a patch, which is why it is filed rather than fixed in a review round. Anyone picking it up should
start from CM6's `bidiSpans`/`Direction` and from what native Obsidian does at an RTL line's edges,
since matching native behavior has been the right default everywhere else in this change.
