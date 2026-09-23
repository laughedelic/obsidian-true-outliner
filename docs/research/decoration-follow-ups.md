# Decoration follow-ups: deferred ideas and known gaps

A parking lot for decoration-related improvements we have deliberately chosen **not** to
do yet. The decoration system (additive indentation + CSS-gradient guides + SVG icon
block markers) is hardened and production-ready as of the outline-decorations hardening
pass; the project's priority now is proving the rest of the roadmap's goals are
implementable, not polishing this one layer further. Items land here with enough
diagnosis that picking one up later doesn't require re-discovery; nothing here is
scheduled.

When an item graduates to real work, it should get its own openspec change (or fold into
one), not be patched ad hoc — several of these touch the model or are design decisions,
not bug fixes.

**This lot is closed to new entries.** A follow-up found today is filed as a GitHub issue in the
session that found it and linked from the note that records it (AGENTS.md, "A follow-up is an
issue"). What is still live here moves out as it is touched; an entry marked **Extracted to #N**
has already moved, and keeps only enough to say what it is and where it went, with its heading left
in place so citations still resolve. An entry that CLOSED keeps its measurements here rather than
pointing at a dead issue — that is what this file was always for, and it does not change.

## Known gaps (diagnosed, deferred)

### Under the Minimal theme, boxed atoms (callouts, code blocks) overflow the reading column when indented

**Extracted to [#118](https://github.com/laughedelic/obsidian-true-outliner/issues/118).** A
`max-width`-sized box moves right with our own `margin-left` without shrinking, so it overflows
the reading column by exactly our contribution. A base-indentation issue
(`MarginCompensation`, Experiment 1), not a selection-chrome one. The measurements, the
bundled-theme contrast and what a fix has to do are in the issue.

### A non-list-item child of a list item is indented twice

**Graduated** — closed by the `source-indentation-collapses` change (issue #117), which collapses
a non-list line's own source indentation so the depth rules are the only thing positioning it.
The geometry this entry left unmeasured is in `docs/research/source-indentation-width`, with the
one residue the fix leaves inside an indented fence.

Found while cataloguing Enter/Shift+Enter (2026-08-06,
`enter-and-shift-enter-catalogue.md` E10/E11), from a real-vault report that indented
text under a list item renders misaligned.

The two indentation regimes disagree for exactly one shape. `styles.css` applies our
depth-derived `padding-left` to every non-list-item line and deliberately leaves list
items to Obsidian's native list indentation. A list item's own SOURCE indentation is
therefore its only indentation, while a paragraph, code fence, table or callout that is a
CHILD of a list item gets our depth padding **plus** its own literal leading whitespace
rendered as characters. Two visual columns for one tree depth, and the amount depends on
whether the file used a tab or spaces.

Measured shapes that reach it (`parse.ts`): a blank line followed by indented text under
an item (`- item` / `` / `  text`) parses as a paragraph CHILD, where the same text
without the blank line is a continuation LINE of the item; an indented fence, table or
nested quote under an item is a child with or without the blank line.

Fixing it is a decoration decision, not a parse one: either subtract a child's own leading
whitespace from its depth padding (the source whitespace already encodes the same depth),
or render non-list children with the native regime the way list items are. Both need the
guide-line and marker offsets re-derived, which is why this is a change of its own.

**How it was closed.** Neither candidate below survived the measurement as written. Subtracting
the run's width needs a width nothing can state — it is the file's, not the tree's — and the
native regime for a non-list line is no indentation at all, so there was nothing to render it
with. What the pass found instead is that markdown itself reads the run as structure and reading
mode renders none of it: collapsing it to no width, and leaving the depth rules to supply the
column, is the same trade `lists-on-the-outline-grid` made for a list item's own run.

**Amended 2026-08-11** (`a-position-does-not-split-its-node`): the first measured shape above —
a blank line followed by indented text under an item — had a TRANSIENT way in as well as the
deliberate one. Shift+Enter at the end of a line that is not its node's last wrote exactly that
blank line, so the item's own continuation re-parsed as a paragraph child and picked up this
entry's double indentation for as long as the caret stayed there. That way in is closed: the
rendering now reads the outline the position stands for. The entry itself stands unchanged for
the deliberate shape — text the user themselves indented under an item, blank-separated — which
is a real document rather than a place, and still renders with both indentations.

### A replaced source-indentation run holds caret positions that share one x

Left by `source-indentation-collapses` (issue #117), which takes a non-list child's own leading
whitespace out of the rendering. The characters stay in the document and stay addressable —
`contentBoundaryCh` returns 0 for every non-list kind (`caret.ts`, D7) — so Home and the arrows
can still land inside a run that renders nothing, and every such position draws at the
replacement's own edge.

Measured on `      second deeper` under `  first line`, arrowing left from the text start: six
presses at x=66.4 — ch 6, 5, 4, 3, 2, 1, 0, the caret never appearing to move — and the seventh
reaching the previous line's end. Home lands at ch 0, also 66.4, so it appears not to move
either; typing there writes at column 0, which takes the line out of its item
(`x      second deeper`). Selection and deletion are stock: Shift+Left selects one space,
Backspace at the text start removes one space.

`EditorView.atomicRanges` would make the run one step for the arrows, and was measured doing
exactly that — but CM6 consults the same facet for deletion, and the two cannot be scoped apart:
Backspace at the text start then took all six spaces at once, a block leaving its parent in one
press. The author's call was to keep editing stock and leave the caret as recorded here.

What would close it is a rule about where the caret may stand, which is `content-space-caret`'s
to make: its boundary rule returning the run's own length for a non-list node, with a Backspace
that still removes one column. Every shape that spec pins today is a list item — whose run this
layer does not touch — so the reading has to be extended rather than reused. Whoever picks it up
should read a replaced run and a list item's marker prefix as the same kind of thing, and check
what a click at the text's left edge resolves to.

### A provisional (gap) line has no decoration facts, so the caret visibly jumps

**Graduated** — closed by the `decorate-provisional-positions` change, which renders the
caret's own gap line as the node the parse would make of it if a character were typed there.
One residual is NOT ours and stays deferred; it is recorded below.

Same catalogue, S10, and it explains a real-vault observation: Shift+Enter at the end of a
nested list item puts the caret on the new line "without any indentation", and typing
one character makes it "align correctly".

`decorate()` emits facts only for nodes' own lines; a blank or whitespace-only line is a
trailing-gap line and gets none — no depth, so no depth padding. The caret therefore
renders at the document's left edge plus whatever literal whitespace the line holds, and
the moment a character lands there the line becomes part of the node, gains its depth
fact, and shifts right.

This affects every provisional line the grammar produces (end-of-node Enter, end-of-node
Shift+Enter, and the unwrap position `enter-and-shift-enter-grammar` adds), so it gets
worse as those become first-class. The mechanism is available — give a gap line the
owning node's depth — but which depth a gap line between two different depths should take
is the open question, and it interacts with the guide-line rule that already covers gap
lines.

**How it was closed.** The open question dissolved rather than being answered: the layer asks
what the line WOULD BE if a character were typed at the caret, which the parse already knows,
instead of what depth a gap "is". That also covers the shape the depth framing cannot express
— Shift+Enter's position is not a node at any depth, it is a continuation line of the node
above.

Measured live before building (16px font, `--to-decor-unit` 24px, marker gutter 20px; x
values relative to the line's own box):

| Shape | Caret today | Caret once a character is typed |
|---|---|---|
| Enter's position under a depth-1 paragraph | +0px | +44px (= 1 × 24 + 20 gutter) |
| Shift+Enter's position, list under a heading | +16.75px, no margin | +36px, `margin-left: 24px` |
| Shift+Enter's position, PURE list | +16.75px | +36px |

Enter's case closes exactly: the injected fact gives the line the same `padding-left` a real
depth-1 paragraph has, and the caret lands on 44px instead of 0 — where it previously sat on
the depth-0 guide column. The list case closes the 24px our own layer was withholding (the
`supplementalDepth` margin, which is exactly the "one level left, outside the list block"
users report).

### A provisional position inside a zoomed subtree renders the view at the source document's depth

**Graduated** — closed by the `positions-re-base-with-the-zoom` change. Kept here with its
measurement, because the entry as first written named only a quarter of it.

First found during `outline-zoom`'s review (PR #69, a suppressed Copilot comment on
`decorations.ts`'s `computeTrail`) and recorded as a trail-only gap. It is not: every render
path that a provisional position feeds parses the WHOLE buffer, and while zoomed each of them
hands the decoration layer depths counted from the note's own root instead of from the zoom
root.

`computeProvisional` builds `materializeProbe` against `state.doc.toString()` and parses that.
Nothing downstream re-bases the result, so every consumer of it spends a source-depth tree in a
view that `baseFacts` has re-based (design D9). The leaks that follow, and which of them fires,
depend on what the position did to the parse:

| While a position is open | Where the depths come from | What re-bases |
| --- | --- | --- |
| Position stands for a NEW node | its own fact: whole buffer | every other line's fact |
| Position stands for a NEW node | guides, every visible line: whole buffer | nothing |
| Position BISECTS a node | every line's facts AND guides: whole buffer | nothing |
| Either | the position trail: whole buffer | nothing |
| Either | the caret guide scope: whole buffer | nothing |

The last row arrived after this entry was written, with the caret-scoped guide modes: a new
consumer read the same materialization and inherited the same frame. That is the shape of the
defect rather than an accident of it — the materialization was the only thing in this layer that
did not re-base, so every consumer reached for it and got source depths.

Measured against `# Top` / `## Mid` / `- one` / `  - nested` / (blank) / `- two`, zoomed to
`## Mid` with the caret on the blank line. The zoomed view renders `## Mid` at depth 0, `- one`
at 1, `- nested` at 2; with the position open, the position's own row renders at depth 2 where
a real line there renders at 1, and the guide columns of every visible row gain the hidden
ancestor's: `## Mid` draws `[0]` where it drew none, `- one` draws `[0, 1]` where it drew `[0]`.
Opening the position interior to a paragraph instead — the bisecting case — moves the whole
subtree: `## Mid` renders at depth 1, its paragraph at 2, a sibling item at 3, one level right
for the one hidden ancestor. Both violate `outline-zoom`'s "Depth is measured from the zoom root
while zoomed" and `outline-decorations`' "Indentation guides re-base with the zoom scope", and
both are transient — the view snaps back the moment the caret leaves the blank line.

The fix is one step earlier than the entry originally proposed: build the probe from the SCOPE
document rather than from the buffer, at a root-relative line, and shift the results back by the
root's start line — the same translation `baseFacts` and `zoomAwarePositionTrail` already apply,
applied before the probe is built rather than after. `tree-projection` guarantees the subtree
document's line K is the source's line N + K with the node's own lines unchanged, so the caret's
column carries over untouched and the probe asks the same question of a smaller document.

One visible consequence beyond the depths, found while closing it: the single-root guide
qualifier had been reading the whole note on such a render, because that was the document the
guides came from. Both halves read the view's own document now, so the outermost column no longer
blinks back on as the caret crosses a blank row inside a zoom with the qualifier on.

### A list item's continuation line does not align with the item's own content

Two separate stock-Obsidian offsets, found while closing the row above and confirmed
byte-identical with outline mode **off** — neither is this plugin's to cause or to fix.

Obsidian wraps a continuation line's leading whitespace in `<span class="cm-hmd-list-indent
cm-hmd-list-indent-N">` and gives that span its own width. That width is derived from the
whitespace, not from the width of the MARKER the continuation is supposed to sit under, and
the two disagree:

| Line | Marker's own width | Continuation indent span | Continuation sits |
|---|---|---|---|
| `- alpha` | 23.42px | 24.38px | 0.96px right |
| `1. alpha` | 30.39px | 28.56px | **1.82px left** |
| `10. alpha` | 40.16px | 36.00px | **4.16px left** |

So an ordered list's continuation hangs slightly LEFT of its own text, worse the wider the
number — reported from real-vault use during the `decorate-provisional-positions` pass, where
it was visible on the newly-decorated provisional line and then found to predate it.

The second offset is about the CARET rather than the text, and appears only once the run
spans more than one nesting level: at end-of-line CM6 measures the caret by the text run's own
metrics, inside the wider span, while a following character's own span starts at the span's
right edge. A caret on `    ` (two levels) sits at +16.75px where the first typed character
lands at +36px. At one level the two agree exactly, which is why this shows up as "the caret
is fine here and jumps there".

Neither is closable from where this layer stands. Both would mean overriding the width of
`.cm-hmd-list-indent` — DOM we do not own — from a live measurement of the marker beside it,
per line and per theme. More decisively, it would make a list render differently with the
plugin on than off, which is the one hard invariant `outline-decorations` states about pure
lists. Doing it anyway is a change of its own, with that requirement amended deliberately
rather than broken in passing.

**First offset closed 2026-08-25** by `lists-on-the-outline-grid` (design D9). Both conditions
the paragraph above named are met: that change already amends the pure-list invariant
deliberately, and it already overrides `.cm-hmd-list-indent`'s width — but STATES it from the
item's own depth rather than measuring the marker, so the per-line, per-theme measurement is
not needed after all. A continuation line takes the whole stated hang where a first line takes
the hang less its marker gutter. Measured after: exact for every kind whose marker fits the
gutter. A marker wider than the gutter (`10. `) pushes its own first row out and its
continuation follows the grid's text column instead, 8.16px left of that row in the bundled
theme — the same wide-marker exception the grid states elsewhere, and the only part that would
still need the marker's glyph width to close.

The second offset, about the CARET rather than the text, is still open, and the number above
is stale — `lists-on-the-outline-grid` changed its sign. Re-measured 2026-08-27 against
Obsidian 1.13.7, on `\t  ` as the whitespace-only continuation of a depth-1 item: the wrapper's
STATED width is 44px (the item's own hang) while the text inside it — one `.cm-indent` holding
the tab, one `.cm-indent-spacing` holding two spaces — runs to 48.38px. The same continuation
carrying text puts the caret on 44, because CM6 resolves that position to the following
content span; with nothing following, the caret takes the text's end and lands 4.38px PAST its
own column instead of 19.25px short of it.

That is the mechanism the entry below this one describes, arriving through the other side: a
box and its text disagreeing, with the caret following the text. It does not close the same
way. There the marker's box was wider than its text and an element inside the run could take
up the slack; here the text is wider than the box, `overflow: hidden` hides the excess from
the eye but not from the measurement, and closing it means making `.cm-indent` and
`.cm-indent-spacing` sum to the stated hang rather than adding anything.

Worth keeping as a lesson: "not closable from where this layer stands" was true of the
mechanism examined and false of the problem, the same shape as the two probes that concluded
native list columns could only be followed.

### An empty list item's caret is measured from the marker's TEXT, not from its box

**Graduated** — closed by `list-new-item-caret`. Recorded here for the LEVERS it measures,
which several of the entries above and below turn on: what a caret's own measurement does and
does not see. One case of the same family stays open and is recorded in the entry above.

CM6 measures a caret from a DOM Range that ends at the position. The rect of that range covers
the text it crosses and any element it FULLY CONTAINS — an element the range merely ends
inside contributes only up to the endpoint. Width given to an ancestor, such as the
`min-width` that sizes a marker span to the gutter, lies past the range's end and is invisible
to it. On an item WITH content the position resolves to the start of the following content
span and lands on the text column anyway; on an EMPTY item the marker's own run is all there
is to measure.

Measured against Obsidian 1.13.7 in the e2e harness, bundled theme, 16px root, unit 24px,
gutter 20px. `x` is relative to the line's own box; "run end" is a Range over the marker span's
own text.

| Empty item | Caret | Marker run end | Marker span box | Text column (same shape, with text) |
|---|---|---|---|---|
| `- ` | 4.19 | 4.19 | [0, 20] | 20 |
| `- ` nested one level | 28.19 | 28.19 | [24, 44] | 44 |
| `2. ` | 11.59 | 11.59 | painted [−6.8, 13.2], layout [0, 20] | 20 |
| `10. ` | 21.36 | 21.36 | painted [−6.8, 21.36], layout [0, 28.16] | 28.16 |
| `- [ ] `, caret at ch 2 | 11.42 | 11.42 | [0, 11.42] | 11.42 |
| `- [ ] `, caret at ch 6 | 19.99 | — (widget) | — | — |

Four findings, each of which decided something:

1. **The native caret is the caret.** Obsidian renders `.cm-layer.cm-cursorLayer` but leaves it
   empty — the caret is the browser's own, drawn from the DOM selection. `coordsAtPos` and the
   DOM selection's own rect agreed to the hundredth of a pixel in all eight measurements, so
   `coordsAtPos` is the right instrument for a CARET even though it is the wrong one for a
   marker's BOX (the soft-wrap defect `lists-on-the-outline-grid` closed).
2. **A bullet has an element inside the run; an ordered number does not.** `.list-bullet` is
   present on the caret's own line, `display: inline-flex`, `width: 0`, with an absolutely
   positioned `::after` at `left: -3.04px` — so the dot's centre is on the depth column because
   the box is zero-wide there. `.list-number` is NOT emitted on the caret's own line: the
   ordered marker span holds the raw text `2. ` and no child element at all.
3. **Trailing PADDING on the bullet moves the caret and leaves the dot alone; width moves
   both.** With `padding-inline-end: 10px` the caret went 4.19 → 14.19 and the dot's centre
   stayed on 0; with `width: 10px` the caret went to 14.19 and the dot's centre moved to 5,
   because the `::after`'s own `left` is resolved against the content box. With
   `padding-inline-end: calc(var(--to-marker-gutter) - var(--to-space-advance))` the caret
   landed on 20.02 against a text column of 20.
4. **A task item's caret at its content END renders the checkbox and lands on the text
   column.** With the caret at ch 2 the line shows raw source (`- ` span, `[ ]` span, one
   space) and every column is the source's. With it at ch 6 — `- [ ] |` — Obsidian renders the
   `.task-list-label` widget and the caret measures 19.99, the gutter. The placement change and
   the geometry are the same fix for that kind.

The ordered case is the one finding 2 leaves without a lever, and it is two terms: the
`translateX(-icon/2)` that puts a number's left edge on a block icon's moves the measured run
as well as the ink, and the `min-width` slack accounts for the rest. `transform` does not move
LAYOUT, which is why the following text still starts at the untransformed box edge — and why a
wide `10. ` renders its text 6.8px right of where its own glyphs end.

**How it was closed.** A `Decoration.mark` supplies the element finding 2 says Obsidian does
not: it wraps the marker's digits, and `styles.css` sizes that box the way it sizes
`.list-bullet`. The span also gives back the shift with a negative inline-end margin, so a
number's own text stops trailing 6.8px behind its glyphs. After: caret and text column agree at
20.02 for `- ` and `2. `, 21.36 for `10. `, 31.12 for `100. `, with every number's painted left
edge still on −6.8.

One case the close does NOT reach: a marker followed by more than one space. The sizing adds
"the gutter, less one space", which is the shortfall only when the marker carries exactly one,
so it is gated on that (`ONE_SPACE_MARKER_CLASS`) and a wider marker renders as it always did —
its column intact, its empty-item caret still short of it. Closing that needs the free space
distributed by the layout engine; measured, making the marker span a flex container moves the
bullet's dot off its column, because the growth lands on the content box Obsidian centres the
dot in.

A fourth finding came out of the same family later, and is worth keeping beside these because
it is not about pixels at all: `contentColumnCh` stops after a list marker, so on a task item
the column a user reads as "where content starts" was four characters right of the one the code
used. That gap turned up in four places — the split's insert-before test, the classifier that
decides a Backspace crosses a boundary, the merge's own marker strip, and caret placement —
each with its own symptom. The lesson is the one this file keeps relearning: a boundary that
several gestures share needs one definition, and a marker Obsidian renders as chrome is not
automatically chrome to the code that reads the line.

### A structural key pressed on a provisional position leaves the blank line in the file

Found while closing `a-position-does-not-split-its-node`, and out of its scope deliberately.

`provisional-cleanup.ts` drops its record of the created place on ANY document change, so a
keypress that edits the document — Tab, Shift+Tab, Alt+Arrow — takes the place out of the
cleanup's hands. Nothing is wrong at the moment it happens: the operation now acts on the whole
node, the place moves with it, and typing there still continues the node. But if the user walks
away instead, the blank line stays in the file, and a blank line inside what they see as one node
is a real split on disk — the item's continuation becomes a paragraph child the next time the file
is opened.

Byte-identical to stock Obsidian, which also leaves the line. What makes it worth recording is
that the outline model now asserts something about that line where stock only stores it.

Closing it means deciding what a structural key should do to a place it did not create: carry the
record forward through the operation (the record is per-view and the operation's own dispatch
could re-state it), or cancel the place first — which is not available, because Enter-then-Tab is
the canonical outliner gesture for "new node, one level in" and cancelling would destroy it.

### Node-granular selection halves a bisected node, and cannot be fixed without provenance

Measured while closing `a-position-does-not-split-its-node`, attempted, and withdrawn — the most
useful part is why.

Against the raw parse a node bisected by a provisional position reads as two, so Shift+Arrow
extension covers only the half above the position wherever the tail becomes a SIBLING, and
select-all's CONTENT rung — a node's own lines, never its children — covers half in every shape,
list and paragraph alike. Measured, with the caret on the position:

| Shape | rung 1, raw | rung 1, resolved |
|---|---|---|
| `- one` / `- foo` / place / `␣␣bar` | `- foo` and the place only | the item's three own lines |
| `# H` / `alpha` / place / `beta` | `alpha` and the place | both of the paragraph's own lines |

The pure functions are right when handed `resolvedOutline`'s tree. What is missing is an adapter
that knows when to hand it to them, and the reason it is missing is structural rather than
incidental.

Resolving the outline requires knowing the blank line is a PLACE. The document cannot say: a blank
line the user authored between two paragraphs is byte-identical to one Shift+Enter opened inside
one paragraph, and reading it wrong is not a cosmetic error — measured, Tab with the caret on that
gap treated the two paragraphs as one node and indented both. So the structural keys are TOLD,
from `provisional-cleanup`'s per-view record. The selection handlers cannot use that record:

- With the record LIVE, either handler's own dispatch is a selection that leaves the position,
  which is the abandon gesture — the place is removed and the caret collapses before any cover is
  visible. Pinned in `e2e/specs/30-keyboard-grammar.e2e.ts`.
- With no record — after a redo, or once a document change dropped it, which is exactly the state
  where a half-node cover is visible and STICKS — there is nothing to read.

The one state where the fix would show is the one state where the record is gone. A first pass
wired both handlers to the record anyway; the branch was unreachable and was removed rather than
left implying a fix (`keymap.ts` carries the note where it would go).

Closing it means giving a provisional position provenance that outlives the per-view record: a
`StateField` holding the place's position, mapped through changes so it survives undo and redo,
which is what `structural-history-integration`'s own "does NOT survive undo/redo" limitation
already contemplates. That field would serve the abandon path too, so it is worth doing once
rather than twice — and it is a change of its own, not a patch to this one.

### A structural key leaves the caret off a TRAILING place, and leaves the place its old width

**Closed** by `a-trailing-place-moves-with-its-node` (issue #130). Kept with its measurements,
because the correction it carries is easy to re-derive and the parked residual below belongs with
it.

**The gap, as it was.** A place at the END of a node's lines — Shift+Enter at the end of its last
line, the ordinary way to open a continuation — is not a bisection, so `positionBisectsANode`
declined to resolve it and a structural key acted on the raw parse, where the place is a trailing
gap. Two things followed, and both were visible in two keypresses:

| Gesture | After Shift+Enter | After the structural key |
|---|---|---|
| `- top` / `␣␣- foo`, Shift+Tab | place `␣␣␣␣` at 2:4 | `- top` / `- foo` / `␣␣␣␣`, caret 1:2 |
| `- a` / `- foo`, Tab | place `␣␣` at 2:2 | `- a` / `␣␣- foo` / `␣␣`, caret 1:4 |

`caret-policy` refused the trailing gap as a caret target, so the caret fell back to the moved
node's content start — off the line the user was about to type into. And the place kept the width
it had while the node's content column moved, so typing there made a CHILD of the node rather than
continuing it. Reproduced with and without a following continuation line, with a following
sibling, under a heading, with children, on a task marker, on a two-digit ordered marker, on a
tab-indented item, and with no final newline.

**What the re-measurement added.** The MOVES are worse than either key the table above names, and
in a different way. Their caret is right — `caret-placement-policy` sends a move to its subject's
content start, which an interior place has always taken — but the place's LINE stayed where it
was while the node moved, so the node that inherited the line inherited the place: move-up on
`- a` / `- foo` / `␣␣` gave `- foo` / `- a` / `␣␣`, and move-down on `- top` / `␣␣- foo` / `␣␣␣␣` /
`␣␣- bar` gave `- top` / `␣␣- bar` / `␣␣␣␣` / `␣␣- foo`, handing `- bar` a place the user opened on
`- foo`.

**The fix.** The gate split along what each caller knows. `positionJoinsANode` asks only that the
place's own materialized line is not a first line, and the operations ask it through
`placeOutline`, which will not answer without the place line `provisional-cleanup` records.
`positionBisectsANode` keeps both halves and stays the rendering's, which has no place line to ask
with — so the document's own final blank line is still out of reach of an operation that was not
told a place is there. The exclusion's stated reason (`indent` re-emits a node's lines, so
resolving that line would write trailing whitespace at the end of the file) survives as the
place-line test rather than as the gate.

It is a fix in the GRAMMAR, and reaches the app only as far as the place line does: the entry below
is why a second structural keypress is handed none, trailing place and interior place alike.

**Parked, and measured.** An ENTER place — blank-separated, so its materialized line is a first
line — still does not resolve, and must not: the tree it stands for would contain a node that does
not exist yet, which is the half of the gate that cannot be widened (`outline-decorations` forbids
it, and two measured shapes show it). With such a place open below a paragraph, Tab indents the
paragraph and leaves the place at column 0, so typing there makes a top-level node rather than a
sibling of the one that moved. Whether that is wrong depends on where the node the place stands
for ought to live, which the raw tree does not encode — so it is recorded rather than guessed at.

**The correction.** The superseded entry, "Outdent leaves the caret off the place it just moved",
recorded Shift+Tab on `- top` / `⇥- foo` / `⇥␣␣` (place) / `⇥␣␣bar` leaving the caret at line 3
column 0, and attributed it to outdent's line-level edit mapping a column at the end of the
place's line with assoc=1 onto the start of the line below. The pre-op column it measured from was
4. `⇥␣␣` is three characters, so column 4 is not a position on that line, and `keymap.ts` builds a
column as an offset minus its own line's start. At column 3 that shape — an INTERIOR place — keeps
the caret on the place at its new content column, as Tab does, across the widths an interior
place's content column takes. So the asymmetry the entry reported between the two keys was not
there either: both keys were right on an interior place and both were wrong on a trailing one.
"Right on an interior place" holds for ONE structural keypress from a freshly opened place; the
entry below is why a second one does not get the same answer.

Re-measuring that column today gives line 3 column 2 rather than column 0:
`source-indentation-collapses` has since had `planCaret` resolve a mapped position that lands
inside chrome, so the off-the-line column reaches the content start of `␣␣bar` instead of its line
start. A different wrong answer to the same impossible question, and the reason the superseded
entry's own figure no longer reproduces.

What the off-the-line column did reach was a disagreement between two halves of one keypress.
`materializeProbe` clamps the column into its line before resolving the tree the place stands for,
while `dispatch.ts`'s flat `{line, ch}` → offset arithmetic read the same column as the start of
the line below. The conversion clamps now, and `tests/minimal-change-history.test.ts` ("holds a
column inside its own line") holds the two together. Three other conversions of the same shape —
`cm-pos.ts`'s `linePosToOffset`, `grammar.ts`'s `offsetInNewText`, `transaction-filter.ts`'s
`offsetInLines` — do not clamp, and agree with this one only while every position they are handed
is in range.

### An indent writes its unit on the first line and spaces on the continuation lines

Found while re-measuring the entry below, and unrelated to places: it reproduces with none open, so
it belongs to the indent operation.

With the editor's indent unit set to a TAB, `indent` writes the unit on the node's own first line
and SPACES on the lines below it. Measured on `- top` / `- foo` / `␣␣bar` with the caret in `foo`
and no place open:

| Unit | Result |
|---|---|
| `⇥` | `- top` / `⇥- foo` / `␣␣␣␣␣␣bar` — a tab on the marker line, six spaces below it |
| `␣␣␣␣` | `- top` / `␣␣␣␣- foo` / `␣␣␣␣␣␣bar` |
| `␣␣` | `- top` / `␣␣- foo` / `␣␣␣␣bar` |

The space units are self-consistent; the tab unit is not. The continuation lines come out at the
item's content COLUMN counted in characters, which is the right column only while the unit is
spaces — so a tab-indented vault gets a node whose own lines are indented two ways, which
`source-indentation-collapses` then has to render.

Not diagnosed further. Closing it starts with which of `indent`'s two writers computes the
continuation prefix, and whether a column is the right currency for it at all when the unit is a
tab.

### The place record is single-shot, so a SECOND structural key mistreats the place

**Closed** by `a-carried-place-keeps-its-record` (issue #142). Kept with its measurements, because
the re-measurement below retires one of the two rows the issue reported and the two residuals it
names are still parked.

**The gap, as it was.** `grammar.ts` is told which blank line holds a place by what was then
`createdPlaceLine`, which reads `provisional-cleanup`'s record. That record was re-established only
by a keypress the module counts as CREATING one — `GAP_PLACE_EVENTS` and `NODE_PLACE_EVENTS`, which
list split, sibling-heading, continue, unwrap, and (for a gap place only) outdent. `indent` was in
neither list. So a Tab that carried a place along left no record behind, and a second structural
keypress saw an ordinary blank line.

Both halves of the damage followed, and both were reported from the real app:

| Gesture | Result |
|---|---|
| `- top` / `⇥- foo` / `⇥␣␣bar`, Shift+Enter, Shift+Tab, Tab | `- top` / `␣␣- foo` / `␣␣` / `␣␣␣␣bar`, caret 1:4 — the place keeps two columns while the item moves to four, and the caret is off it |
| `- one` / `- foo` / `␣␣bar`, Shift+Enter, Tab, Shift+Tab | `- one` / `- foo` / `␣␣␣␣` / `␣␣bar`, caret 1:2 — the caret lands at the start of `foo`, and the place is left deeper than the item |

**Re-measured in the real app** once `a-trailing-place-moves-with-its-node` was in, and only the
SECOND row survives. The first row is closed by that change rather than by this entry: it fixed
Shift+Tab's caret, which used to leave the place, and a caret that stays ON the place is what
`recordablePlace` needs to re-establish the record for the `outdent` its event list already
names. The Tab after it now acts on the place. Measured in Obsidian, indent unit a tab:
`- top` / `⇥- foo` / `⇥␣␣` / `⇥␣␣bar` → Shift+Tab → caret 2:2 on the place → Tab →
`- top` / `⇥- foo` / `␣␣␣␣␣␣` / `␣␣␣␣␣␣bar`, caret 2:6, which is the planner's own answer WITH the place
line (without it the place stays two columns wide and the caret drops to 1:3).

The second row reproduces unchanged, in the real app, on the same base: `- one` / `- foo` /
`␣␣bar` → Shift+Enter → Tab → `- one` / `␣␣␣␣- foo` / `␣␣␣␣␣␣` / `␣␣␣␣␣␣bar` with the caret on the place
— and then Shift+Tab → `- one` / `- foo` / `␣␣␣␣␣␣` / `␣␣bar`, caret 1:2. `indent` leaves no record,
so the key after it reads an ordinary blank line.

Which keys keep the record today, each measured with a place open on `- one` / `␣␣- foo` /
`␣␣␣␣bar` / `␣␣- two`:

| Key after a place | Caret after | Record after |
|---|---|---|
| Tab (`input.structure.indent`) | on the place | none — the event is in neither list |
| Shift+Tab (`input.structure.outdent`) | on the place | the place |
| Move up / down (`move.structure`) | the moved node's content start | none |

The moves are a separate shape rather than a third case of this one. `caret-placement-policy`'s
SUBJECT rule sends their caret to the node, not to the place, so there is no place at the caret
for any record to be about — and `placeOutline` resolves only where the place line and the caret
agree, so a record kept through a move would not be read either. A place the user left behind by
moving its node is the parking-lot entry above ("A structural key pressed on a provisional
position leaves the blank line in the file"), not this one.

The grammar is right in both: handed the place line, `planKey` produces the correct document and
caret for every step of both sequences. Only the live path differs, and only from the second
keypress on, which is why a single-keypress measurement — the shape every entry here was taken
from — reports the behaviour as correct.

`recordablePlace` and its event lists exist to answer "was a place CREATED here", which the abandon
path needs: an outdent that merely relocated an already-empty item created nothing, and undoing it
would restore a bullet the user left the list to escape. `createdPlaceLine` asks a different
question — "is this blank line a place" — and inherits an answer scoped to the first one. Closing
it means separating the two, so a keypress that CARRIES a place forward keeps the record while only
a creating one starts it. The `undoDepth` guard in `liveRecord` is the same story one level down: it
is right for the abandon path and wrong for this one.

The PALETTE loses the record for a second, independent reason, found closing the trailing-place
entry: the module writes one only for a transaction carrying the `abandonEdit` annotation, which
`keymap.ts` attaches from the plan's own `abandon` edit, and `main.ts`'s `runOp` builds its plan
itself and states none. So a palette operation over a place leaves it standing with nothing behind
it even for a key the event lists do name, and abandoning it leaves it in the file. Separating the
two questions above does not reach that one; giving `runOp` the plan's `abandon` form does.

Not caused by #129, which touches only `dispatch.ts`'s `{line, ch}` conversion: both sequences
reproduced identically against `main`'s own `dispatch.ts`.

**How it closed.** The record splits in two. A PLACE record holds the line an open place occupies,
started by a creating dispatch and kept by one of ours that began with the caret on that place and
left the caret on an empty place; the removal record keeps every condition it had, including the
`undoDepth` backstop, which a fact issuing no edit does not need. `createdPlaceLine` became
`openPlaceLine`, the name being the defect in miniature.

**Still parked**, both named above: the ABANDON record does not survive a carrying key either, so
walking away after a Tab still leaves the blank line in the file (the entry above this one); and
the palette writes no record at all, for or against, because `runOp` dispatches with no `userEvent`
and states no `abandon` edit.

**And newly reachable**: after a carrying key the place record answers while the removal record does
not, which is the state `keymap.ts`'s note about the selection handlers said did not exist. It is a
slice of the shapes rather than the general case, so the handlers stay on the raw parse and the note
now says so.


### The palette path does not resolve a place at all

**Closed** by `a-trailing-place-moves-with-its-node`, which is where it was found.

`main.ts`'s `runOp` passed no place line, so the same document and caret diverged by entry point:
Shift+Tab from the keymap on `- top` / `␣␣- foo` / `␣␣␣␣` (an interior place) / `␣␣␣␣bar` gave
`- top` / `- foo` / `␣␣` / `␣␣bar` with the caret on the place, while the command palette and any
custom hotkey gave `- top` / `- foo` / `␣␣␣␣` / `␣␣bar` with the caret at 1:2. Keyboard and palette
agreeing is what `selection-structural-ops` exists to hold, so it closed with the trailing-place
entry rather than on its own: `runOp` resolves through `placeOutline` now, and the resolved tree
feeds the operand, the zoom re-resolution, the operation and the caret policy alike.

The place-line test moved INSIDE `placeOutline` at the same time, which is what keeps this shut.
Each call site used to spell the test itself; the keyboard path spelled it twice, slightly
differently, and the palette spelled it not at all.

### A caret parked on a blank line the user authored reads it as a bisection

Design D5 of `a-position-does-not-split-its-node`, recorded as the price of deriving the layer
from document and caret alone.

`alpha` / blank / `beta` with the caret on the blank line: the tree that caret stands for merges
all three into one paragraph, so the overlay renders `beta` as a continuation line and drops its
marker. Truthful about what typing there would do, and wrong about the document the user has.

Reachable only by a programmatic placement — `content-space-caret` redirects a click on a blank
line to the node above and keeps every motion in content space — so no user gesture arrives here.

**The operation path does NOT take this reading**, and the difference is worth stating: measured,
Tab with the caret on that gap treated `alpha` and `beta` as one node and indented both. A wrong
preview costs a redraw; a wrong edit costs the user's document. So the structural keys and the
selection consumers are told which line holds a place, from `provisional-cleanup`'s own record,
while the rendering keeps deriving it. The asymmetry is deliberate.
Closing it means reading `provisional-cleanup.ts`'s created-place record from the decoration
layer, which is exactly the view state D5 keeps out of a state-derived computation, and which
`node-edit-enforcement` already accepts for its own gap-line rule. That precedent is the argument
for revisiting it; the cost is that the rendering stops being a pure function of the document.

### RTL-aware placement (openspec outline-decorations task 5.9)

The marker's `left`-shift assumes the line's first character renders at the physical
left; in RTL it renders at the right, so the icon lands on top of the text, and
indentation + guides sit on the physical left edge, detached from right-aligned text.
Full finding and screenshot evidence: the hardening pass's RTL e2e test
(`52-block-markers-icons.e2e.ts`) and tasks.md 5.9. **Deprioritized until there are real
users who need RTL** — the fix is direction-aware placement (per-line direction
detection, mirrored shift, and a design decision about which side the gutter/guides
belong on), not a patch.

### Two untested edges of the line-level-widget predicate

Left over from the decorate-widget-rendered-lines change, which replaced the DOM-patch
loop's class enumeration with a structural predicate ("a direct child of `.cm-content`
that isn't a plain `.cm-line`"). Both are recorded rather than closed because closing
either needs a scenario the current e2e corpus can't produce cheaply — neither is a known
defect.

- **The `.cm-gap` exclusion is untested.** CodeMirror mounts `.cm-gap` placeholders as
  direct children of `.cm-content` when a document is long enough to be
  viewport-virtualized, which is exactly the shape the predicate would otherwise claim and
  patch. The exclusion is in the selector, but every fixture measured had zero `.cm-gap`
  elements (documents far too short to virtualize), so the guard has never actually fired.
  Confirming it needs a multi-thousand-line fixture — which is also what
  viewport-limited decoration building (below) would need, so the two pair naturally.
- **A real embed re-render is only approximated.** An embed's contents are rendered by
  Obsidian's own markdown renderer, unlike the CM6-owned widget subtrees the marker's
  injection site was originally designed against, so it can re-render on its own schedule
  (the embedded note finishes loading, or is edited in another pane). The marker is
  prepended to the line-level wrapper rather than into that inner content, which should
  make it immune, and the idempotence e2e covers repeated renders — but it triggers them
  by moving the cursor, not by actually editing the embedded note from elsewhere. If a
  duplicated or vanished marker on an embed is ever reported, this is the first thing to
  reproduce.

### A done task's strikethrough starts on the marker's own trailing space

Found while deriving the marker gutter ([marker-text-gap.md](marker-text-gap.md)). Obsidian tokenises
`- [ ] ` so that the space between `]` and the text is the first character of the CONTENT
span, not of the marker — which is why the task label carries a `min-width` of "the gutter,
less one space" to put the text on the column at all. A completed task's `line-through`
decorates that whole content span, the leading space included, so the rule begins one space
before the first letter.

That was always true and read as slack while the gutter was wide. Tightening it left the
strikethrough starting close enough to the checkbox to read as a line coming out of it,
rather than as a line through the text. Nothing is misaligned — the text column is exactly
where the derivation puts it — and no assertion covers strikethrough geometry.

Closing it means keeping the marker's own trailing space out of the decorated run, which is
a decoration that splits the content span rather than a CSS adjustment: sizing the label
differently would move the text column, which is the one thing the gutter's derivation
fixes.

### A tab-separated list marker's text does not follow the gutter

Also from [marker-text-gap.md](marker-text-gap.md). The one-space sizing rules are gated on
`to-decor-marker-1sp`, deliberately: on `-\tfoo` or `-  foo` the padding they add lands on
top of whitespace that is already there and pushes the item's own text off its column. So a
tab-separated item's text sits where its literal whitespace puts it, and does not move with
the gutter.

The two kinds of row therefore start their text on different columns, and the derivation
widened that difference rather than causing it. Sizing the whitespace to "the hang, less
whatever the marker occupies" is the shape that already works for the indentation wrapper
(`.cm-hmd-list-indent`), so the same treatment applied to a non-one-space marker's own run
is the obvious candidate — measured against the several ways Obsidian tokenises that
whitespace, which is what makes it more than a one-line change.

### A folded widget-rendered node carries no fold chrome, and loses its marker

Measured while landing `decoration-line-inputs` (2026-09-12, Obsidian 1.13.7 in the e2e
harness), on `# S` / blank / `![[Embed target]]` / `- child` / `  - grandchild` / blank /
`Plain para.` / `- child`. The whole-line embed is a paragraph the list attaches to, so it is a
foldable node — `foldState()` lists line 2 among ours and the fold takes, hiding lines 3–4 — and
the plain paragraph at line 6 is its control.

| | Line 2, the embed | Line 6, the plain paragraph |
| --- | --- | --- |
| Unfolded | marker icon; **no fold toggle** | marker icon, fold toggle |
| Folded | widget keeps only its guides; a bare `.cm-line` beside it with nothing at all; **no marker, no `to-decor-folded`, no count** | `to-decor-folded`, the toggle collapsed, the marker, the count |

Identical on `main` before the change and on its branch after, so it is a gap the change
preserves rather than one it made. Two mechanisms, both already documented: the fold toggle
and the count are `Decoration.widget`s, which have no effect on a widget-rendered line
(docs/research/decoration-lessons, "CodeMirror 6"), and folding the node makes Obsidian render
a plain `.cm-line` for it beside the widget, which turns off the widget path's marker as a
doubly-rendered line while the plain rendering carries no line decoration of its own. Closing
it means the widget path drawing the fold treatment the line's record already carries — the
record has the folded flag and the count, unread there — and a control that is not a CM6
widget; whether a folded embed is common enough to be worth that is the question to answer
first.

## Deferred mechanisms (working today, better shapes known)

- **`forceRedraw` → a real refresh API.** The off/on mode-toggle hack for
  byte-identical-decoration settings changes stays because `app.workspace.updateOptions()`
  demonstrably fails that scenario (evaluated with evidence — see `forceRedraw`'s doc
  comment in `main.ts` and tasks.md 5.3). Worth re-evaluating if Obsidian ever ships an
  API that forces a view-plugin refresh, or if our extension moves to the
  swap-the-extension-array pattern that makes `updateOptions()` produce a real
  reconfigure diff.
- **A widget atom's marker and guide on a plugin-owned element, outside the widget.** Both
  currently live inside the widget's own box, which is why the box has to be forced to
  `overflow: visible` and `contain: none`, and why a table's scroll had to move to an inner
  wrapper at all ([table-scroll-region.md](table-scroll-region.md)). Drawing them on an element of ours instead — the
  pattern the footer and the zoom trail already use (`chrome-line.ts`'s own-chrome class) — would
  let every widget keep Obsidian's own boxes untouched, and would dissolve that whole class of
  problem, `--to-selected-right`'s notch included. Far larger than the CSS fixes it would retire,
  and it reopens Experiment 2a's question (a measured overlay) with a third answer, so it wants
  its own measurement pass rather than a note in a bug fix.
- **Viewport-limited decoration building.** Facts build over the whole document; building
  only over `view.viewport` (rebuild on `docChanged || viewportChanged`) is the standard
  shape (obsidian-lapel demonstrates it) and becomes worthwhile for multi-thousand-line
  documents. CM6's incremental `syntaxTree` could also supply per-line *kind*
  classification with no separate reparse — though not our tree *depths* (tasks.md 5.4's
  closing note).

### A zoomed list-item root keeps its within-list indentation

`outline-zoom` re-bases indentation by decorating the zoom root's subtree AS a document, so the
root renders at depth 0 and everything below it counts outward from there (its design D9). That
removes the contribution THIS plugin makes. For a list item it cannot remove the other half: the
within-list depth comes from Obsidian's own list rendering, driven by the raw markdown nesting,
which "One indentation grid for every kind" retargets by supplying the unit but never repositions
line by line. So zooming into a twice-nested list item still renders it two levels in.

The fix, for whoever picks it up: **one** negative `margin-left` on the content container, not
per-line surgery. Every visible line shares the identical offset while zoomed — precisely because
they are all inside one subtree — so a single uniform shift is correct where a per-line adjustment
would be fighting native rendering once per line, which Experiment 1's rule forbids.

What changed since this was first written down: the offset is now COMPUTABLE rather than measured.
It is the root's own depth within its list times the outline unit, and the plugin already states
both. Before the outline grid landed, the same shift would have had to measure whatever Obsidian
resolved from the leading whitespace, which is the part that made it unattractive.

Deferred on purpose until the plain case has been used against a real vault: a zoom into a heading
or a paragraph — the common case — is already correct, and this is visible only when the root is
itself a nested list item.

## Design ideas (not started, deliberately)

### Layer configurability: everything optional except indentation

**Partly closed 2026-09-08** by `outline-appearance-settings`, which took the unit and the
whole guide layer. What it did, and what it deliberately left:

- **The unit is a preset ladder**, defaulting narrower on a phone or tablet. The rungs are
  measured against the grid's floor on both device classes
  ([outline-unit-width.md](outline-unit-width.md)), and a setting reaches the declaration through a property
  of its own so a snippet still wins over it.
- **The guide layer has an off state**, two caret-scoped ones — the levels the cursor is
  inside, and the ladder inside the node it is in — and a qualifier that drops the outermost
  guide under a single root. Obsidian's own indent guides stay suppressed in outline mode
  whichever is chosen: they sit on columns this grid does not use, so drawing none of ours is a
  reason to show nothing rather than to show one that does not line up.
- **Guide intensity is a preset** over declarations that hold every value. Thickness is NOT:
  offered, read side by side, and withdrawn as too heavy at every rung above the default. It
  stays a declaration a snippet can retune, and the accent's width follows it.
- **Still open**: everything about MARKERS below — the icon layer's own off switch and the
  gutter-reservation question that comes with it, per-kind icons, style variants, and the
  bullet-style set. The single-root qualifier also does not cascade: a single root with a
  single child repeats the shape one level down and keeps its guide, deliberately, so the
  visible ladder never depends on content several levels away. Whether that deeper case is
  worth a rule of its own is unanswered.
- **Also open: telling readers about the snippet route.** Every value this layer draws from is a
  custom property a snippet can retune — the unit, the guide's colour and its weight, the accent's
  colour and weight, the marker's size — and the specs require it to stay that way, with an e2e
  case behind the unit's. None of that is written down anywhere a reader would look. A short
  documented list of the properties and what each one moves would serve the tinkerer without
  growing the settings surface, which is the trade this whole entry is about. Guide WEIGHT is the
  first thing on it: offered as a setting, withdrawn as too heavy at every rung above the default,
  and left as a declaration precisely so a snippet can still reach it
  ([experiment-2-guide-lines.md](experiment-2-guide-lines.md)).

Make most of the decoration system configurable and optional. Indentation is the one
essential layer; everything else should be independently switchable without breaking the
indentation underneath:

- **Marker icons toggleable as a layer** — off entirely, with the others unaffected. (The
  gutter-reservation question resurfaces here: today the
  marker gutter is reserved unconditionally so `markerVisibility` never reflows text;
  turning icons off *as a layer* could legitimately drop the gutter too — a different
  contract than hiding some icons, worth deciding explicitly.) Guides got their own off
  switch above; the markers' is what is left.
- **Which icons to show, and their style** — extend the existing `markerVisibility` axis
  toward per-kind selection, style variants, and possibly **custom icons per node kind**.
  The per-level heading markers idea (H1–H6, validated in the wild by obsidian-lapel) is
  **taken by the `heading-level-markers` change**: the mark, the two setting axes and why a
  text label was rejected are in [heading-level-markers.md](heading-level-markers.md). The
  rest of this item is the roadmap's "Marker configurability"
  ([#157](https://github.com/laughedelic/obsidian-true-outliner/issues/157)).
- **A simpler, consistent bullet-style marker set as an opt-in** — one uniform mark for
  every kind, closer to a traditional outliner's look. (Experiment 5b's uniform dot lost
  the head-to-head as the *default*, but as an opt-in preset under the 5a mechanism it's
  just an icon-set swap, none of 5b's positioning machinery.)
- **List bullets belong on the same appearance surface** — Obsidian exposes
  `--list-bullet-size`/`-radius`/`-border`/`-transform` and `--list-marker-color`, all
  confirmed effective in Live Preview, so a bullet-style setting is variables only. Folded
  into [native-list-decoration.md](native-list-decoration.md)'s phase 3 so lists and
  blocks get one marker-appearance surface rather than two.
- **The indentation unit** got its prerequisite from phase 1 there — `--to-decor-unit` became a
  real declaration before it could be pushed into `--list-indent` — and
  `outline-appearance-settings` then made it a setting. Closed.

User CSS snippets remain the escape hatch for anything finer-grained than whatever
settings surface we commit to (design.md Non-Goals) — the settings axis should stay
small and opinionated rather than mirror every CSS knob.

The `hierarchy-position-indicators` change took the first bite of this: its two settings
(`guideHighlight`, `markerHighlight`) are independently switchable and its appearance
is driven by `--to-decor-accent`/`--to-trail-width`, so retuning the look needs a snippet
rather than another setting. `outline-appearance-settings` took the second, above; what is
left of "every layer optional" is the marker layer.

### Drawing the ancestor trail's segments along native list columns

Deferred out of `hierarchy-position-indicators` deliberately. Its `path` style steps in one level
per non-list ancestor; where the chain runs through list nesting it descends at the nearest
non-list ancestor's column instead. Each list ancestor's own bullet IS accented, so the levels
stay legible — what is missing is only the connecting lines between them.

Probing settled that this is a **second rendering mechanism, not an extension of the current
one**, which is why it belongs here rather than as a follow-up to that change: `.cm-indent` spans
do not correspond to list levels (2-space indentation emits none for a real level), and there is
no constant per-level step to publish as a measured CSS variable (columns track the rendered width
of whatever whitespace the file contains). What is left is per-item measurement plus
absolutely-positioned overlays — obsidian-outliner's technique, and Experiment 2a's, which 2b
deliberately replaced with the measurement-free gradient the whole decoration layer now rests on.
Measurements and the full argument:
[experiment-position-indicators.md](experiment-position-indicators.md#deferred-drawing-segments-along-native-list-columns).
Pairs naturally with the "native list decoration experiments" entry below — both are about owning
list geometry rather than deferring to it.

**Closed 2026-08-22** by `lists-on-the-outline-grid`: list levels sit on `depth × unit`, the
existing gradient draws them, and `computePositionTrail`'s two list-item exclusions are gone,
so the trail steps one level per ancestor whatever its kind. No second mechanism was needed.

The blocker's remaining half — "`.cm-indent` spans do not correspond to list levels" — was also
answered without one, later in the same change: the spans do not, but the single
`.cm-hmd-list-indent` WRAPPER around them does, and stating its width from the item's own depth
puts two- and three-space levels on the grid too. See that change's design D9.

**Amended 2026-08-20** ([native-list-decoration.md](native-list-decoration.md)): the
blocker above holds only while native list columns are taken as given. They are not — they are
computed from `--list-indent`, which we can set to our own unit, and once every list level sits
on `depth × unit` the existing gradient can draw list segments with no measurement and no second
mechanism. This entry now closes as part of that doc's phase 2 rather than needing an overlay of
its own.

### Marker/guide interactions (hover and click)

Concrete interaction ideas on top of the existing "marker as a click target" direction:

- ~~**Hover on a marker → highlight its guide line**~~ — **graduated** into the
  `hierarchy-position-indicators` change, in the form that turned out to matter more: the
  highlight follows the CARET rather than the pointer, since the question users actually
  have is "where am I", not "what is under my mouse". See
  [experiment-position-indicators.md](experiment-position-indicators.md). A
  pointer-driven version is still unbuilt and still gated on the same caveats below.
- ~~**Click on a marker → zoom into that node**~~ — **done** (`outline-zoom`, D15). What the
  caveats below turned out to be worth, measured 5 September 2026 against Obsidian 1.13.7:
  - `pointer-events: none` was the real obstacle, and lifting it for marks that stand for a
    document node is the whole of that half.
  - `ignoreEvent() → true` was read backwards. It does not merely make CM6 ignore a widget's
    events; through `eventBelongsToEditor` it makes CM6 skip its OWN registered handlers for
    anything inside such a widget. So `EditorView.domEventHandlers` is not a route to a marker at
    all — measured: a click on a list bullet reached it and a click on a marker icon did not. The
    gesture needs a listener of its own, in the capture phase, above the editor.
  - A third obstacle nobody had filed: a list item's mark is Obsidian's `.list-bullet`, and the
    native `.collapse-indicator` is a 30.8px box whose painted chevron is ~10px wide — the
    invisible remainder covers the bullet outright, so `elementFromPoint` at the bullet's centre
    returns the indicator and a real click folds. Fixed with a stacking order, since CSS cannot
    make part of a box transparent to the pointer.
  - The listener has to be on `pointerdown`. On a touch device there is no mouse event at all, so
    a `mousedown` listener makes the gesture simply not exist there; the mobile e2e run is what
    said so. A pointer gesture still produces the mouse events afterwards, and `preventDefault`
    on `pointerdown` does not suppress them for a mouse, so a handled press has to swallow the
    `mousedown`/`mouseup`/`click` behind it.
  - And three for whoever writes the test, each of which cost a run:
    - A synthesised event dispatched ON the mark proves nothing. It bypasses hit-testing, so it
      passes with `pointer-events: none` still in force. Dispatch on whatever
      `elementFromPoint` returns at the mark's centre instead — that fails exactly when a real
      click would, and it is the instrument that found both the `pointer-events` and the
      fold-indicator defects.
    - A real click targets the `<rect>` inside a mark's SVG, which is an `SVGElement` and not an
      `HTMLElement`; a narrow `instanceof` guard silently drops every real click.
    - WebDriver's own pointer does not survive mobile emulation: a press aimed at a marker's
      centre in viewport coordinates lands on the line behind it. `element.click()` is no better
      — it demands the element be "interactable", which a mark inside a widget atom and a
      zero-width bullet span both fail while being perfectly clickable by a person.
- ~~**Click on a guide → zoom into, or fold, the whole subtree**~~ — **done** as FOLD
  (`better-folding-ux`, D7). The caveat dissolved rather than being solved: no hit area needs
  inventing, because the columns can be read from what was painted. The guide overlay is a
  `::after` whose gradient is positioned per column, so `guideHit` (`zoom-click.ts`) reads its
  computed `background-position-x` and `background-size` for the columns and the unit, and its
  `left` plus `border-left-width` for the origin — the overlay is shifted back off the line by
  the line's own margin and bled out by a border, so the line's box edge is NOT the origin on
  any list whose root is indented, and a first version that measured from it put every column a
  level out. The tolerance is a third of a unit, a press must land left of the line's own text,
  and a fold control owns a press only when the point lies within its own hit box (a touch tap is
  snapped to the nearest control by the browser without moving its coordinates). Guides stay
  `pointer-events: none` and nothing about their painting changed. Which of fold and zoom the
  gesture performs is still not configurable — one default action now, stated so a setting can be
  added without changing what the gesture means.

Lapel's menu positioning uses non-public API, so a public-API-only equivalent needs verifying
first.

### The affordance budget: four gestures, one 14px gutter, and a task with no mark to spare

**Extracted to [#202](https://github.com/laughedelic/obsidian-true-outliner/issues/202).** A
node's row offers one 14px marker gutter to four node-level gestures: zoom, fold, drag and a menu.
Zoom and fold fit as two adjacent targets, since the native fold chevron paints its ink 3px clear
of the marker column (measured). `drag-nodes-with-a-drop-preview` put the drag on the mark, and
ruled out a handle of its own on the 0.83px of gutter left unclaimed
([node-drag-and-drop.md](node-drag-and-drop.md) section 1). What was left is a task, whose mark is
Obsidian's checkbox and so cannot take the zoom click; the comparison with other outliners, the
options and what closing it involves are in the issue. Whether node-level gestures belong in the
gutter at all is a Discussions question (#157).

### Outline decorations in reading mode

Today outline mode only renders in Live Preview — the plugin registers CM6 editor
extensions exclusively, and design.md lists reading view as untouched-by-construction.
Making outline mode toggleable **independently of the edit/reading mode** would make the
plugin useful as a pure reading aid (explicit document structure) even before any
editing features matter to a user. This is a genuinely new mechanism, not a port: reading
view renders through a `MarkdownPostProcessor` pipeline, not CM6, so none of the
decoration plumbing (facts → decorations/DOM patches) carries over directly — only the
pure `decorate()`/`computeLineGuides()` layer does.

### Other design ideas

- ~~**Shrinking only our own added list margin**~~ — **closed** by
  `lists-on-the-outline-grid`, and dissolved rather than answered. The question assumed the
  native hang was a given to compensate for; the change states the hang itself from
  `(depth − supplementalDepth) × unit + gutter`, so there is no residual margin left to shrink.
  Original framing:
  [experiment-5-block-markers.md](experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin).
- **Native list decoration experiments** — **DONE** (`lists-on-the-outline-grid`). List levels
  step by the outline unit, our own gradient draws every level, the caret trail reaches into
  lists, the bullet sits on its own column at a marker's weight, and the hanging indent is
  stated rather than measured. What follows is the research that got there; the residuals it
  left are listed at the end of this entry.

  **Researched and planned 2026-08-20**:
  [native-list-decoration.md](native-list-decoration.md). Obsidian computes list
  columns from public CSS variables (`--list-indent`, `--indentation-guide-editing-indent`,
  the `--list-bullet-*` set), so the columns can be *set* onto our own decoration grid
  instead of measured and followed. Measured: one variable puts every tab- or 4-space-indented
  list level on `--to-decor-unit`, with the native hanging indent recomputing itself, and a
  second puts the native list guides on our own guide columns. That doc carries the
  measurements, the residual gaps (2- and 3-space files, a stale hang after a mode toggle,
  the bullet's own column), and a four-phase plan. Phase 1 subsumes the margin question
  above: once list levels step by our unit there is no separate "shrink our own added margin"
  problem left to solve.
- **Collapsing gap lines.** Blank separator lines between paragraphs/headings/blocks are
  fully preserved today; once the outline structure is explicit, they're arguably
  redundant, and hiding/collapsing them (as a **configurable option**) would tighten the
  outline view. Needs investigation of whether CM6 line-hiding (replace decorations over
  blank lines) coexists with editing on those positions, and interacts with the guide
  continuity work (`computeLineGuides` deliberately covers gap lines — collapsed gaps
  change that geometry). **Scope boundary decided 2026-07-21** (node-edit-enforcement's
  second manual pass, docs/research/selection-follow-ups's "Gap-line cursor transparency" entry): this is
  *visual* hiding only — the text on disk is untouched either way, same additive-only
  discipline as the rest of decorations. **Not in scope, here or anywhere near-term**:
  auto-correcting or preventing the user from *creating* extra blank lines (e.g. an
  outline-mode Enter-Enter-Enter collapsing itself to one gap) — that's auto-correcting
  keystrokes as they happen, the exact shape of surprise this project's design
  philosophy warns against ("a wrong rewrite is surprising"), and a different problem
  from hiding what's already there. Pairs with (and should land alongside, not before)
  gap-line cursor/vertical-navigation transparency — a decoration that visually hides a
  gap but still lets the cursor rest inside it one arrow-press at a time would be a
  confusing half-measure.
- **Preserve the viewport position when toggling outline mode** — extracted to
  [#143](https://github.com/laughedelic/obsidian-true-outliner/issues/143). The view jumps to the top of a long document, losing the reader's place at
  the moment the toggle exists for. The anchor question, and the two interactions a fix has to
  design around (gap-line concealment's collapsed rows, and what `foldKeepingPlace()` already
  learned about CodeMirror's own scroll anchoring), are in the issue.

### Vertical-alignment polish (minor, recorded from real-vault use)

**Amended 2026-08-25** (`lists-on-the-outline-grid`): a node's FOLD CHEVRON now follows its own
mark vertically, measured per line, so the anchors below no longer drag the chevron around with
them. One kind is left out and belongs to this entry: an **ordered item's chevron**. Its mark is
its glyphs, and no element's box is where they sit — `.cm-formatting-list-ol`'s box is the text
row, whose centre the chevron already shares, while the digits rest on the baseline about 1.7px
lower, where the bullet beside them sits. Closing it needs the ink's own extent, which no rect
exposes; a canvas `TextMetrics.actualBoundingBoxAscent` would give it, at the cost of a second
measurement mechanism for one kind of marker.

**Amended 2026-08-22** (`lists-on-the-outline-grid`): a synthetic marker and a list bullet now
share a column but not a vertical anchor, and deliberately so. Unifying them on
`vertical-align: middle` was built and reversed — `middle` resolves against the parent's
x-height, so on a heading it drops the icon below the heading's own glyphs (measured: an H1's
icon went from 8.45px above its text-rect centre to 2.96px below). The bullet keeps the optical
centre, the icon keeps `baseline`, and they differ by ~7px on a body row. Whether that reads as
wrong, and what a single anchor would have to be, joins this entry.


The table and callout icons currently flex-center vertically within the widget's full
box; for consistency with everything else (markers otherwise track the first text row)
they should stick near the **top** of the block instead. The code-block icon could also
come down slightly (it sits a touch too high at the top). Cosmetic only, low stakes —
bundled with the next deliberate decoration pass rather than done ad hoc.

Wiki embeds now share this: they take the same widget marker mechanism (see
decorate-widget-rendered-lines), so an embed's paragraph marker flex-centers against the
whole embedded block's height — visibly further from its first text row than a table's,
since an embed is usually taller. Confirmed in that change's own screenshot pass. Same
fix, one more kind to cover.

- ~~**The backlinks footer's fold affordance is not the outline's.**~~ — **done**
  (`better-folding-ux`, D9). The row's control now wears the editor's own fold chrome, and a
  folded row's marker takes the folded treatment. One correction to the entry's own framing: the
  permanent visibility was right, not a defect. A footer row has no hover convention to inherit
  and no fold command behind it, so the control stays visible there while the editor's is
  hover-revealed — and it stays a real `button` with a label and an `aria-expanded`, because what
  the two surfaces share is chrome and never semantics.

- **A node holding several references renders one row** — extracted to
  [#121](https://github.com/laughedelic/obsidian-true-outliner/issues/121). `place()` keeps
  the FIRST reference per node, so the header's count and the footer's rows disagree. A
  model change rather than a rendering one; the two resolutions and why the contract belongs
  with `backlinks-controls`' counting rules are in the issue.

- ~~**A footer row's fold only goes one way.**~~ — **done** (`better-folding-ux`, section 8),
  and by exactly the fix this entry predicted: the row model now carries `foldable` — whether the
  row HAS a subtree — beside `foldedCount`, so the control survives the expansion that zeroes the
  count.

### Left in the lot by `better-folding-ux`

- **The guide gesture is one action, not a choice.** Clicking a guide folds; zooming from a guide
  is unbuilt, and which of the two a click performs is not configurable. The gesture is stated so
  a setting can be added later without changing what it means, and nobody has asked for the zoom
  form since click-to-zoom shipped on the mark.
- **The footer's own controls are below a touch target** — extracted to [#144](https://github.com/laughedelic/obsidian-true-outliner/issues/144).
  Around 11px for the row fold, against the 24px hit area the editor's affordance gets under a
  coarse pointer. The footer's sizing question rather than folding's.
- ~~**A repaint drops focus inside the footer.**~~ — **closed** by
  `search-hits-and-footer-content-filter`, which met the same defect on the search field, where it
  cost every character after the first. Controls now carry a stable `data-focus-key` and
  `rememberFocus`/`restoreFocus` follow the key rather than the element
  (`backlinks-footer.ts`). The original note: the footer rebuilds its whole tree on every render,
  so a control a keyboard reader has focused is replaced under them — measured while testing the
  row fold, where a press after a repaint landed on the body.
- ~~**Fold state is per file, and zoom clears nothing on exit.**~~ — **decided** the other way
  (D7a): leaving a zoom folds again what entering it opened. The original note: Clearing a zoom leaves the folds
  that zoom opened open (`outline-zoom` states this deliberately). Whether entering and leaving a
  zoom should restore the fold arrangement it found is a real question and unanswered; it needs a
  reader's judgment about what "where I was" means, not another measurement.

## Verification-infrastructure ideas

- **The footer's default sort has no test, and the obvious place for one was the
  wrong place.** Groups are ordered by source mtime (D15). The structural
  baseline captured that order implicitly and went red on CI for it — a fresh
  checkout stamps every fixture with the same time, so CI ordered the groups
  differently from a working copy while every row was identical. The baseline
  now snapshots groups in NAME order, which is right for what it tests but
  leaves the sort itself unverified. Testing it needs fixtures with controlled
  mtimes, which the e2e harness cannot set from inside the app: it would have to
  happen in `run-e2e.mjs` while staging the sandbox vault, before Obsidian
  launches. Worth doing when the sort becomes configurable — `backlinks-controls`
  owns sort options — rather than building the fixture machinery for one case.

- **Parallel e2e workers shared one OS clipboard — fixed by serialising them.**
  `pasteText` writes the system clipboard and presses Mod+V; `61` and `67` press
  Mod+C into that same clipboard. All three were in `selection`, whose specs run
  in parallel Electron instances, and one clipboard belongs to the machine — so
  no per-instance isolation could help. Seen twice on CI, in both directions: a
  paste receiving another spec's copied fixture (`c2 / t1 / t2` where
  `New block one.` was expected), and a copy losing its content before its own
  spec could read it.

  The three specs are now a `clipboard` group that `run-e2e.mjs` forces to one
  instance, whatever the caller asks for, because the constraint belongs to the
  specs rather than to whoever invokes them. The rest of `selection` keeps its
  parallelism, and the new group is its own CI job since the matrix is built
  from `--list-groups`.

  The tempting alternative was rejected: synthesising a `paste` ClipboardEvent
  would remove the shared resource but stop exercising a real paste — the same
  trap as asserting a caret with a dispatched MouseEvent — and the copy side
  cannot be faked that way at all.
- **The verdict-timing p95 budget flaked at its boundary on CI — acted on.**
  `62-outline-edit-enforcement`'s "verdict computation stays within budget"
  asserts `p95 <= 8`ms and went red twice: 8.20ms on desktop, 8.10ms on mobile,
  with the medians (`<= 3`ms) nowhere near their own limit both times. `p95` is a
  plain quantile over collected samples, and at two measured rounds it sat close
  enough to the maximum that one GC pause on a shared runner became the
  statistic. Fixed by taking four measured rounds instead of two, which moves
  the 95th percentile away from the worst sample; the threshold is unchanged,
  because the bar was never the problem. Noted here in case the tail returns at
  four rounds — the next honest step would be reporting the distribution rather
  than widening the bar.
- **Community-theme sweep as repeatable infrastructure.** The hardening pass probed
  Minimal/Catppuccin/Things via a throwaway spec (install theme into the sandboxed vault,
  screenshot fixtures, review by eye) — clean results, but the probe wasn't kept. If
  theme regressions ever become a recurring concern, that probe shape is the starting
  point; committing third-party theme CSS to the repo (licensing, size, staleness) is the
  main cost to weigh.
- **Consolidating per-experiment verification residue into `verification.md`** — the
  split noted in tasks.md 3.3 (each experiment doc carries its own results section)
  stays livable; consolidate only if navigating it proves hard in practice.
- **The settings setters still repaint from behind their own data write.**
  `setMarkerVisibility`, `setGuideHighlight`, `setMarkerHighlight` and
  `setBacklinksFooter` each `await this.saveData(...)` before calling
  `forceRedraw()`, which is the shape `toggleMode` was fixed out of when it
  turned out to be putting the whole outline's paint behind disk latency
  (docs/research/decoration-lessons, "Verification and process discipline"). The reordering is
  the same one: `this.data` is already mutated before the await, so the redraw
  can happen first and the write can settle after it. Left alone because a
  settings toggle repainting a moment late is not the defect the mode toggle
  was, and because `forceRedraw` itself is already parked here for a revisit —
  worth folding into that revisit rather than doing twice.

### The backlinks footer's first read races Obsidian's own cache on CI

`77-footer-controls` "shortens the header on the same narrow footer that sheds facet words" fails
on roughly every other CI run and never locally, and `readStable`'s diagnostic finally named the
field: the header's totals climbing — `408 · 126 → 411 · 127` over ten seconds of samples. The
cause is not the footer. `resetVault` reloads the vault, and Obsidian's metadata cache resolves
the reloaded files asynchronously — measured through a wait that logged its samples on CI, at
two to four files a second, so thirty-five to seventy-five seconds for this 149-file vault,
against a moment locally. Everything the footer counts comes from that cache, so a footer whose
DOM has long been quiet is still counting a vault Obsidian has not finished reading.

Three forms of a wait were tried on the branch and reverted: gated on the resolved-link count
reaching the file count (a link-less file never appears in it, so unreachable); gated on the
cache's own file list plus a still resolved-link count, inside `settle()` (stacked past mocha's
per-case budget in the specs that settle a dozen times); the same, once per spec file in
`openFooter` with a minute's budget and memoised (the minute is not enough on the slower runners,
and a wait that never succeeds memoises nothing, so every open pays it). What would work is a
wait in the harness's per-spec-file setup, after the vault reset, with a budget sized from the
measured rate and the vault's file count — and a resolved-link count held still as the criterion,
never a comparison to the file count. Parked: it is harness work with a cost on every spec file,
and the case it fixes is one intermittent read.

### A top-level leading run's caret positions are quantised, not measured

Obsidian groups a leading run into `.cm-indent` spans of four columns each and sizes them from
`--list-indent` rather than from the characters, so a caret position at a group's edge renders at
the box's edge. Measured on `    four-space line,`: three steps of 5.08px — a space — and a fourth
of 24.9px. A nine-space line jumps at the fourth and the eighth. At the seam between the last box
and the text the caret can draw at either side, which reads as skipping the first letter.

Stock, and measured identical with outline mode off but for the marker gutter's 14px. Nothing here
touches a top-level run: `source-indentation-collapses` reports its fact only under a list item,
where the run restates a depth. Fixing it would mean reaching `70-source-indent.css`'s override of
that quantiser onto lines this layer otherwise leaves alone — worth it only if the stepping is
reported as confusing in its own right. Issue #140.
