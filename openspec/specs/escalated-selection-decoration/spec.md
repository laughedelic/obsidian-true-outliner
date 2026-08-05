# escalated-selection-decoration Specification

## Purpose
Defines the visual rendering of an escalated (whole-node or whole-subtree) editor
selection as block-level highlight chrome, distinguishable from stock character-level
selection highlight — closing the gap where `node-selection-enforcement` escalates a
selection's bounds but leaves it rendering as plain character-level highlight.
Architecture and rationale: the selection-visual-treatment change's design.md. A
related, separately-tracked mechanism (keeping Live Preview's rendered appearance
intact while a block-covering selection is active, via blurring and a keyboard-replay
recovery path) is implemented alongside this capability but deliberately not codified
here as a formal requirement — it was validated manually rather than through automated
coverage; see `docs/research/13` for its full investigation, known limitations, and
deferred follow-ups (IME composition; Tab/Shift-Tab/Cmd+Up-Down needing
selection-aware behavior for multi-node operands).
## Requirements
### Requirement: An exact whole-node or whole-subtree selection cover renders block-level chrome
When the current editor selection contains a non-empty range that covers a single node's
whole subtree, or a FOREST of whole subtrees — starting exactly at the covered node(s)'
first character, and reaching at least their last content character (whether it ends
precisely there or extends further into that same node's own trailing gap, as the gap-line
escalation trigger's expand-only rule retains) — every line that span covers SHALL render
distinguishing block-level highlight chrome. A range that does not reach this cover, or
that starts short of it, SHALL render no additional chrome.

Recognition SHALL be derived from the selection's current bounds against the document tree
— never from how the selection was produced — so a hand-made selection that happens to
match is decorated identically to an escalated one.

The covered roots MAY sit at different depths (`selection-as-subtree-set`). Chrome SHALL be
rendered for each covered root over that root's own subtree's lines, so a mixed-depth cover
reads as the set of subtrees it is rather than as one block at any single root's column.

#### Scenario: Escalated selection from a boundary-crossing drag gets chrome
- **WHEN** a drag selection escalates to a whole-subtree forest cover (per
  `node-selection-enforcement`)
- **THEN** every line of that cover renders the block-level selected-node chrome

#### Scenario: A drag past a node's end onto its trailing gap gets chrome
- **WHEN** the user drag-selects from the middle of a node's text down onto the blank
  line that follows it (the gap-line escalation trigger), landing on the gap rather
  than exactly at the node's last content character
- **THEN** the block-level chrome still renders for that node's whole subtree

#### Scenario: Selection that merely resembles a cover also gets chrome
- **WHEN** the user selects exactly a node's own full single line of text through
  ordinary native gestures (e.g. Home then Shift+End), without any boundary crossing
- **THEN** the same block-level chrome renders, since the current selection's bounds
  match that node's cover regardless of how the selection was produced

#### Scenario: A mixed-depth forest renders chrome per root
- **WHEN** the selection covers a nested item's subtree and a following shallower item's
  subtree
- **THEN** each covered root's own lines get chrome anchored from that root, and neither
  subtree is drawn as though it sat at the other's depth

#### Scenario: A within-node partial-content selection gets no chrome
- **WHEN** the user selects part, but not all, of a single node's own content, without
  reaching its trailing gap
- **THEN** only the native character-level highlight renders; no block-level chrome
  appears

#### Scenario: Cursors never get chrome
- **WHEN** the selection is an empty range (a cursor), anywhere including on a node
  boundary or a gap line
- **THEN** no block-level chrome renders

**Covered by**: `e2e/specs/63-selection-visual-treatment.e2e.ts` (drag-past-boundary,
whole-line-text match, mixed-depth forest, partial-content, cursor); a pure-module test
suite for the cover-membership query, mirroring `tests/escalate.test.ts`'s property style.

### Requirement: Multi-range selections decorate each covered range independently
For a multi-cursor/multi-range selection, each non-empty range SHALL be evaluated
against the exact-cover test independently. A range that is an exact cover renders its
own chrome regardless of whether other ranges in the same selection are covers.

#### Scenario: One escalated range and one partial-content range in the same selection
- **WHEN** a multi-range selection has one range that is an exact whole-subtree cover
  and one range that is a partial within-node selection
- **THEN** the covering range's lines render chrome and the partial range's lines do
  not

#### Scenario: Every range in a multi-range selection is an exact cover
- **WHEN** a multi-range selection consists of several ranges, each independently an
  exact whole-subtree cover (e.g. the uniform multi-range escalation result)
- **THEN** every one of those ranges' covered lines renders chrome

**Covered by**: e2e coverage for multi-range escalated selections; pure-module tests
over multi-range inputs.

### Requirement: Chrome composes with existing decorations without displacing them
The block-level selected-node chrome SHALL render alongside indentation, guide-line,
and marker decorations on the same lines without removing, overriding, or visually
replacing them, and SHALL apply to widget-replaced atom lines (tables, callouts, raw
HTML, horizontal rules) exactly as it applies to plain `.cm-line`s, using whichever
mechanism (declarative decoration or direct DOM patch) already reaches that line kind.
A line or widget that sets its OWN opaque background directly (e.g. a code fence) SHALL
still show the chrome tint blended with that background, the same as a line that stays
transparent. A line with its own native decorative element positioned at a fixed column
(e.g. a blockquote's colored side-bar) SHALL keep that element rendering at its own
native, unshifted position, regardless of how far the chrome's own left edge reaches for
that cover.

#### Scenario: A covered subtree containing an indented list item keeps its indentation
- **WHEN** an escalated cover includes a list item several levels deep
- **THEN** the list item's indentation and guide lines render unchanged, with the
  selected-node chrome added on top

#### Scenario: A covered subtree containing a table gets chrome too
- **WHEN** an escalated cover includes a table (a widget-replaced atom)
- **THEN** the table's rendered element receives the same selected-node chrome as
  plain lines in the same cover, alongside its existing margin and marker

#### Scenario: A widget atom's chrome matches the right edge every plain line reaches
- **WHEN** an escalated cover includes a widget atom (e.g. a table) whose own rendered
  box is wider on the right than a plain line's (reserved space for a native UI
  affordance not part of its visible content)
- **THEN** that widget's chrome right edge matches every plain line's own right edge in
  the same cover, not the widget's own wider box

#### Scenario: A code fence's own opaque background still shows the chrome tint
- **WHEN** an escalated cover includes a code fence line, which (unlike a heading or
  paragraph) sets its own opaque `background-color` directly on the line rather than
  staying transparent
- **THEN** the chrome tint renders blended with that background, the same as it does on
  a transparent line — the line becomes its own stacking-context root so its `z-index:
  -1` chrome pseudo resolves behind just that line's own content, not hoisted to an
  ancestor context where it would paint behind the line's own background too

#### Scenario: A blockquote's native side-bar stays at its own position, not the chrome's left edge
- **WHEN** an escalated cover includes a blockquote line, and the cover's shared left
  edge reaches well past that blockquote's own native column
- **THEN** the blockquote's own colored side-bar renders at its own native, unshifted
  position — neither relocated to the chrome's left edge nor removed/hidden — regardless
  of how far that edge reaches for this particular cover

**Covered by**: e2e coverage extending the existing decoration corpus with an
escalated-selection-over-table/callout fixture; a dedicated code-fence stacking-context
regression check (asserting the selected line's own resolved `z-index`, since computed
background-color/z-index values on the chrome pseudo alone look correct even when the
actual paint order is wrong); a dedicated blockquote regression check comparing the
side-bar's resolved absolute position across two covers with very different shift
amounts on the same blockquote line.

### Requirement: Chrome anchors one level beyond the covered root's own column, not each line's own
The chrome's left edge SHALL align to the same column for every line of a COVERED ROOT's
own subtree, regardless of how much more deeply any individual descendant line (a nested
list item, code fence, blockquote, or table) is itself indented. That shared column SHALL be
one level shallower than that root's own column — the same column the root's PARENT would
render an indentation guide at, clearing the root's own marker icon (which is centered ON
its own column) rather than bisecting it. A top-level root (no parent) SHALL use an
equivalent one-level offset rather than its own column. The chrome SHALL NOT reach any
further left than this (content further left belongs to a shallower ancestor, outside the
current selection). A list-item root has no additive column of its own (list indentation is
deferred entirely to native rendering, consistent with how indentation guides already treat
list-item ancestors) — its own line's shift, less one level, is used as the target instead.

A cover with SEVERAL roots at different depths (`selection-as-subtree-set`) SHALL resolve
this column independently PER ROOT, over that root's own subtree's lines. The edge is
therefore stepped, one step per root, rather than shared across the whole cover. Roots tile
the cover's span contiguously, so every covered line takes exactly one root's column. Taking
the cover's start line's column for every line would pin the whole selection to its DEEPEST
root's column, since a forest's roots run deepest-first, and would leave a shallower root's
own line outside its own highlight.

#### Scenario: A selected section's nested list/code/blockquote/table all align to one edge
- **WHEN** an escalated cover is rooted at a single heading and spans a nested list item, a
  code fence, a blockquote, and a table at various (deeper) depths
- **THEN** every one of those lines' chrome renders with its left edge at the SAME
  absolute column, one level shallower than the root heading's own column — none of
  them show a gap between that column and their own (more deeply indented) content

#### Scenario: Each root of a mixed-depth cover anchors to its own column
- **WHEN** an escalated cover has two roots at different depths — a nested item and a
  following shallower item
- **THEN** each root's own subtree lines take that root's own one-level-out column, so the
  shallower root's own line sits inside its own highlight rather than to the left of an
  edge computed from the deeper root

#### Scenario: Chrome clears the covered root's own marker instead of bisecting it
- **WHEN** an escalated cover is rooted at a heading that has its own marker icon
- **THEN** the chrome's left edge sits to the left of that marker's own column, so the
  marker renders fully inside the tinted region rather than being cut through its middle

#### Scenario: Chrome never reaches into a shallower ancestor's own territory
- **WHEN** an escalated cover is rooted at a nested (e.g. H3) heading inside a deeper
  document structure (H1 > H2 > H3)
- **THEN** the shallower ancestor headings' (H1, H2) own lines render no chrome

**Covered by**: e2e coverage comparing the resolved viewport position of the chrome's
left edge across a heading root, its descendants at varying depths (list, code,
blockquote), its shallower ancestors, and a mixed-depth two-root cover; a dedicated
blockquote-specific regression check (Obsidian's native blockquote side-bar rule sets
`width: 1px` on the same pseudo-element this chrome uses, which silently shrank the whole
chrome box before this rule explicitly reset `width`).

### Requirement: Native character-level highlight is suppressed while the whole selection is block-covered
When every non-empty range in the current selection is an exact cover, the native
browser character-level `::selection` highlight SHALL render transparent for text inside
the outline-mode editor, so it does not visually compete with the block-level chrome.
When any non-empty range is NOT a cover (including off-mode notes, where chrome never
applies at all), the native highlight SHALL render normally.

#### Scenario: Escalated selection suppresses the native highlight
- **WHEN** a drag selection escalates to a whole-subtree cover
- **THEN** the native character-level selection highlight renders fully transparent

#### Scenario: A partial, non-covered selection keeps the native highlight
- **WHEN** the user selects part of a single node's own content (not a cover)
- **THEN** the native character-level selection highlight renders normally, unsuppressed

#### Scenario: Off-mode notes never suppress native selection
- **WHEN** a note without outline mode enabled has any selection, covered-shaped or not
- **THEN** the native character-level selection highlight always renders normally

**Covered by**: e2e coverage reading the resolved `::selection` computed
`background-color` across a covered selection, a partial selection, a cursor, and an
off-mode note.

### Requirement: Chrome is purely derived and never mutates selection or document state
The decoration SHALL be computed only from the current `EditorState` (selection and
parsed document); it SHALL NOT alter the selection, dispatch a transaction, or persist
any new state. It SHALL be scoped to outline-mode editors only, matching every other
decoration in `outline-decorations`, and SHALL have no effect in off-mode notes or
reading view.

#### Scenario: Off-mode note shows no chrome
- **WHEN** a note without outline mode enabled has a selection that would otherwise be
  an exact node cover
- **THEN** no block-level chrome renders; the selection appears exactly as stock
  Obsidian would render it

#### Scenario: Rendering the chrome does not change the selection
- **WHEN** an exact-cover selection is displayed with chrome
- **THEN** the underlying `EditorSelection` and document content are unchanged from
  before the chrome was computed

**Covered by**: e2e off-mode reference comparison; unit test asserting the decoration
computation is a pure function of `EditorState`.

### Requirement: Block selection is a derived interaction mode
An outline-mode editor SHALL be in BLOCK-SELECTION MODE exactly when its current selection has at
least one non-empty range and every non-empty range is an exact cover — the same all-or-nothing
test that already drives the block chrome and the native-highlight suppression.

The mode SHALL be DERIVED from the current selection on every evaluation. No flag SHALL
determine whether the editor is in the mode, and no command, gesture, or keystroke SHALL enter or
leave it other than by changing the selection. The mode's observable properties — Live Preview
rendered rather than raw, the content DOM blurred, native character-level highlight suppressed,
block chrome shown — SHALL all follow from it, so they cannot disagree with one another or with
what is selected.

Focus SHALL follow the mode's TRANSITIONS, not its negation: entering the mode SHALL blur the
editor, leaving it SHALL restore focus, and a selection that is merely outside the mode SHALL
NOT cause focus to be asserted. Restoring focus SHALL go through the editor library's own focus
entry point, which re-applies the editor state's selection to the DOM, rather than focusing the
content element directly, which permits the browser's existing DOM selection to be read back
into state.

Both asymmetries exist because a focus change can carry a stale selection in either direction. A
direct DOM focus lets the browser's selection win over a correction the editor has already
resolved — observed as a click on a list marker landing between the marker and its space instead
of at content start. Asserting focus on every non-cover selection reaches the same click path at
all, which is why the restore is scoped to the transition.

A gesture whose selection is a cover BEFORE and AFTER it — keyboard extension from one cover to
the next — SHALL NOT leave and re-enter the mode, and SHALL therefore produce no focus change, no
Live Preview re-render, and no interval in which character-level selection is visible. This is a
requirement about the mode not being exited, not about the transition being fast or unobtrusive.

ENTERING the mode SHALL keep its MARKER continuous. Any marker the editor library itself
recomputes — an attribute it derives from its own model and rewrites wholesale, such as the
editor element's class list — SHALL be declared through that library's own mechanism for
contributing to it, never written imperatively alongside it. Otherwise the library's rewrite,
triggered by the very focus change entering the mode causes, drops the marker until the next
update restores it. The blur SHALL additionally be applied before the next frame is painted, per
the scheduling requirement above.

This is deliberately NOT a promise that entering the mode renders no intermediate frame at all.
Two causes of a visible frame were found and removed, and a third is known to remain and is not
yet understood; it is recorded as a known issue rather than specified away. Requiring only what
has been verified keeps this document honest about which is which.

While the editor is in block-selection mode, NO selection highlight other than the block chrome
SHALL be visible, for any number of ranges. Suppressing the platform's own text-selection
highlight is not sufficient on its own: a selection of several ranges cannot be represented by
the single native selection, so the editor library draws the remaining ranges itself, and those
SHALL be suppressed as well.

The blur direction MUST NOT run synchronously within the update that changed the selection —
doing so races CodeMirror's own DOM-selection synchronization and has been observed leaving the
browser's selection at a stale position. It SHALL nonetheless be applied BEFORE the next frame is
painted, so entering the mode never renders a frame carrying block chrome over a still-focused,
raw-markdown editor. Deferring to a plain task queue satisfies the first requirement but not the
second. The policy SHALL apply only to the editor that is the host application's own active
editor, so two simultaneously blurred panes do not both act on one keypress.

Keyboard input SHALL remain available in the blurred state. A key press observed while blurred
SHALL first be offered to the editor's own installed keymap; only a key that no command handles
SHALL focus the editor immediately, because such a key is inserted by the browser's own
subsequent input handling against whatever is focused at that time. A key that a command DOES
handle SHALL NOT cause a focus change on its own — the selection it produces decides focus
through the policy above. Where that command's result LEAVES the mode, focus SHALL be restored
without waiting for any deferral: this path only replays keys while the selection is still a
cover, so a keystroke arriving before the deferred restore would be dropped.

A key MEASURED not to need focus SHALL NOT cause one. Copy is such a key: the platform reads it
off the DOM selection, which survives the blur. The exclusion SHALL be stated as specific keys
rather than as a general test for whether input will follow — commands the host application
handles above the editor's own keymap, undo among them, reach this path too and are lost if it
declines, and which chords those are is not knowable from the key event.

#### Scenario: A multi-range block selection shows only block chrome
- **WHEN** three separate cursors are each extended into a cover, so the selection has three
  covered ranges
- **THEN** every range renders block chrome and none renders any additional selection
  background, whether drawn by the platform or by the editor library

#### Scenario: Entering the mode never drops the mode's marker
- **WHEN** a caret in an outline-mode note is extended into its first cover, which enters
  block-selection mode and blurs the editor
- **THEN** the mode's marker is present continuously from that moment, with no intervening
  update in which it is absent — the library's own rewrite of the attribute carries it rather
  than clearing it

#### Scenario: Keyboard extension between two covers stays in the mode
- **WHEN** the selection is a block cover, the editor is therefore blurred, and the user presses
  a selection-extension key that yields another block cover
- **THEN** the editor remains blurred throughout, Live Preview stays in its rendered form, and
  no character-level selection appears beneath the block chrome at any point

#### Scenario: A gesture leaving block selection restores focus
- **WHEN** the selection is a block cover and the user performs a gesture whose result is not a
  cover — collapsing to a caret, or selecting part of one node's content
- **THEN** the editor is focused again, and ordinary text editing works with no extra keypress
  needed to restore focus

#### Scenario: Clicking in an ordinary document does not disturb caret placement
- **WHEN** the editor is NOT in block-selection mode and the user clicks on a list item's marker
- **THEN** the caret lands where caret placement resolves it — the item's content start — and
  the focus policy does not act at all, since no mode transition occurred

#### Scenario: Typing into a block selection still lands
- **WHEN** the selection is a block cover, the editor is blurred, and the user types an ordinary
  character that no command handles
- **THEN** the editor is focused and the character replaces the block selection, exactly as it
  would have with the editor already focused

#### Scenario: A bound command runs without a focus round-trip
- **WHEN** the selection is a block cover, the editor is blurred, and the user presses a key
  bound to a plugin command
- **THEN** the command runs against the block selection and the editor's focus state is decided
  only by the selection the command produced, not by the fact that a key was pressed

#### Scenario: A command leaving the mode restores focus before the next keystroke
- **WHEN** a command run from the blurred state produces a selection that is not a cover, and
  the user immediately presses a key the editor's own keymap does not claim
- **THEN** that key reaches the editor, rather than falling into a window where the editor is
  blurred and this path no longer replays

#### Scenario: An edit made over a block selection can be undone
- **WHEN** the selection is a block cover, the editor is therefore blurred, the user deletes the
  selection and then invokes undo
- **THEN** the buffer is restored — the undo keystroke reaches the editor even though the
  editor's own keymap does not claim it

#### Scenario: Copying a block selection stays in the mode
- **WHEN** the selection is a block cover, the editor is therefore blurred, and the user presses
  the platform's copy shortcut
- **THEN** the editor stays blurred with its chrome, and the copied text is the covered text

#### Scenario: Mouse drag settles into block selection unchanged
- **WHEN** the user drag-selects across node boundaries so the selection escalates to a cover
- **THEN** the editor ends blurred with the block chrome shown, the same as before this
  requirement — the drag path's observable behavior is unchanged

