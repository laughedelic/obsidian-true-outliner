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

## Known gaps (diagnosed, deferred)

### Under the Minimal theme, boxed atoms (callouts, code blocks) overflow the reading column when indented

Found during the selection-visual-treatment change's manual visual pass (activating the
real Minimal theme, kepano's, already present in the test vault via the existing e2e
infrastructure — `obsidianPage.setTheme('Minimal')`). Toggling outline mode on a note with
a callout or code block nested under a heading: the box's LEFT edge correctly shifts
right by our own `margin-left` (additive indentation, Experiment 1), but its RIGHT edge
stays exactly where it was — the box doesn't shrink, it just moves, so it now overflows
past the reading column's right edge by exactly our own margin contribution. Confirmed
live via computed style: Minimal sizes these boxed elements with `max-width: 88%` (of
some ancestor), which resolves to a fixed pixel `width` that does NOT recompute when
`margin-left` changes — unlike the bundled themes, where the same elements apparently use
`width: auto` (so the browser recomputes width as "available space minus margins,"
correctly shrinking to accommodate our added margin). A depth-1 callout measured: bundled
theme's heading sibling had `marginLeft: 40.8px, marginRight: 40.8px` (symmetric, native
centering); the callout with our own indentation added had `marginLeft: 84.8px,
marginRight: -3.2px` — a negative right margin is the tell: the box's fixed width plus
the new left margin already exceeds the centering container's width, so the right edge
is forced outward to compensate.

This is a base-indentation issue (`MarginCompensation`, Experiment 1), not a
selection-visual-treatment one — the escalated-selection chrome merely inherits whatever
box width these atoms end up with, and was found while manually reviewing that change's
own screenshots, not caused by it. **Not an obvious/low-risk fix**: closing it properly
means live-measuring, per widget-atom kind, what width the box would have BEFORE our own
margin contribution (mirroring `nativeMarginBasePx`'s "read the native value live, don't
assume" pattern, but for `max-width`-based sizing instead of `margin-inline: auto`), then
explicitly constraining `width`/`max-width` to compensate — and verifying that fix doesn't
regress the bundled-theme case (which already works via a completely different sizing
mechanism, `width: auto`). Needs its own investigation with Minimal (and ideally another
max-width-style theme) actually installed and screenshotted, not a guess from one data
point.

### A non-list-item child of a list item is indented twice

Found while cataloguing Enter/Shift+Enter (2026-08-06,
`15-enter-and-shift-enter-catalogue.md` E10/E11), from a real-vault report that indented
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

**Amended 2026-08-11** (`a-position-does-not-split-its-node`): the first measured shape above —
a blank line followed by indented text under an item — had a TRANSIENT way in as well as the
deliberate one. Shift+Enter at the end of a line that is not its node's last wrote exactly that
blank line, so the item's own continuation re-parsed as a paragraph child and picked up this
entry's double indentation for as long as the caret stayed there. That way in is closed: the
rendering now reads the outline the position stands for. The entry itself stands unchanged for
the deliberate shape — text the user themselves indented under an item, blank-separated — which
is a real document rather than a place, and still renders with both indentations.

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

### Shift+Enter on an item whose marker has no trailing space opens a position outside the node

`parse.ts` reads `-` as a list item with content column 2 (`LIST_ITEM_RE` allows a marker at
end-of-line); `grammar.ts`'s `LIST_CONT_RE` requires whitespace after the marker, so it finds no
match and Shift+Enter writes an empty line instead of the item's continuation indent. Typing there
produces a TOP-LEVEL paragraph, so the position stands for no continuation of anything, and the
`a-position-does-not-split-its-node` overlay correctly declines to repair it — there is no tree in
which that node is whole.

A buffer defect rather than a rendering one, which is why it was left out of that change. Found by
its differential property test, and pinned by a test of its own
(`tests/decorate.test.ts`, "a position the grammar writes OUTSIDE its node is not one this can
repair"). The fix is to derive the continuation prefix from the same rule the parser uses for the
content column, rather than from a second regex that disagrees with it about a marker at
end-of-line.

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

### Outdent leaves the caret off the place it just moved

Found while closing `a-position-does-not-split-its-node`. Tab on a provisional position interior
to a node now leaves the caret ON the place, at its new content column — the operation's result is
read through the same outline the operation acted on, so `caret-policy` sees the place as one of
the node's own lines rather than as a trailing gap. Shift+Tab does not: its edit is line-level, so
a pre-op column at the END of the place's line maps with assoc=1 onto the START of the line below,
and the resolution is deliberately not consulted once the mapped position has left the place's own
line.

Measured: `- top` / `⇥- foo` / `⇥␣␣` (place) / `⇥␣␣bar`, Shift+Tab leaves the caret at line 3
column 0 — the start of `␣␣bar` — where it belongs at line 2 column 2. Asserted as measured in
`tests/grammar.test.ts` so a fix has to change it deliberately.

Closing it means either clamping a mapped caret that leaves a place back onto it, which puts a
placement rule in `grammar.ts` where `caret-placement-policy` says placement rules live, or giving
`caret-policy` the place as a fact so it can own the rule. The second is the shape the rest of that
policy already has.

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

## Deferred mechanisms (working today, better shapes known)

- **`forceRedraw` → a real refresh API.** The off/on mode-toggle hack for
  byte-identical-decoration settings changes stays because `app.workspace.updateOptions()`
  demonstrably fails that scenario (evaluated with evidence — see `forceRedraw`'s doc
  comment in `main.ts` and tasks.md 5.3). Worth re-evaluating if Obsidian ever ships an
  API that forces a view-plugin refresh, or if our extension moves to the
  swap-the-extension-array pattern that makes `updateOptions()` produce a real
  reconfigure diff.
- **Viewport-limited decoration building.** Facts build over the whole document; building
  only over `view.viewport` (rebuild on `docChanged || viewportChanged`) is the standard
  shape (obsidian-lapel demonstrates it) and becomes worthwhile for multi-thousand-line
  documents. CM6's incremental `syntaxTree` could also supply per-line *kind*
  classification with no separate reparse — though not our tree *depths* (tasks.md 5.4's
  closing note).

## Design ideas (not started, deliberately)

### Layer configurability: everything optional except indentation

Make most of the decoration system configurable and optional. Indentation is the one
essential layer (though its **unit size should be configurable** — today it's the fixed
`--to-decor-unit` fallback of 1.5rem); everything else should be independently
switchable without breaking the indentation underneath:

- **Guide lines and marker icons toggleable separately** — each layer off entirely, with
  the others unaffected. (The gutter-reservation question resurfaces here: today the
  marker gutter is reserved unconditionally so `markerVisibility` never reflows text;
  turning icons off *as a layer* could legitimately drop the gutter too — a different
  contract than hiding some icons, worth deciding explicitly.)
- **Which icons to show, and their style** — extend the existing `markerVisibility` axis
  toward per-kind selection, style variants, and possibly **custom icons per node kind**.
  Folds in the per-level heading markers idea (H1–H6, validated in the wild by
  obsidian-lapel): thread the heading `level` through `LineDecorationFact` and branch
  `buildMarkerIcon` (or render a text label). Lapel's theming pattern is worth copying
  regardless of the built-in visuals: `data-kind`/`data-level` attributes plus
  CSS-custom-property indirection, so themes/snippets can restyle markers without
  touching the plugin.
- **A simpler, consistent bullet-style marker set as an opt-in** — one uniform mark for
  every kind, closer to a traditional outliner's look. (Experiment 5b's uniform dot lost
  the head-to-head as the *default*, but as an opt-in preset under the 5a mechanism it's
  just an icon-set swap, none of 5b's positioning machinery.)

User CSS snippets remain the escape hatch for anything finer-grained than whatever
settings surface we commit to (design.md Non-Goals) — the settings axis should stay
small and opinionated rather than mirror every CSS knob.

The `hierarchy-position-indicators` change took the first bite of this: its two settings
(`guideHighlight`, `markerHighlight`) are independently switchable and its appearance
is driven by `--to-decor-accent`/`--to-trail-width`, so retuning the look needs a snippet
rather than another setting. The larger "every layer optional, indentation unit configurable"
work above is untouched by it.

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
[14-experiment-position-indicators.md](14-experiment-position-indicators.md#deferred-drawing-segments-along-native-list-columns).
Pairs naturally with the "native list decoration experiments" entry below — both are about owning
list geometry rather than deferring to it.

### Marker/guide interactions (hover and click)

Concrete interaction ideas on top of the existing "marker as a click target" direction:

- ~~**Hover on a marker → highlight its guide line**~~ — **graduated** into the
  `hierarchy-position-indicators` change, in the form that turned out to matter more: the
  highlight follows the CARET rather than the pointer, since the question users actually
  have is "where am I", not "what is under my mouse". See
  [14-experiment-position-indicators.md](14-experiment-position-indicators.md). A
  pointer-driven version is still unbuilt and still gated on the same caveats below.
- **Click on a marker → zoom into that node** (depends on zoom functionality existing —
  a separate feature, not a decoration change).
- **Click on a guide → zoom into, or fold, the whole subtree** — which of the two should
  be configurable.

The standing caveats from doc 10's addendum still gate all of these: `MarkerWidget`
currently sets `pointer-events: none` + `ignoreEvent() → true` (both need careful
revisiting against CM6 focus/cursor handling), guides are `pointer-events: none`
pseudo-elements today (a click target needs a real hit area), and lapel's menu
positioning uses non-public API, so a public-API-only equivalent needs verifying first.

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

- **Shrinking only our own added list margin** — the standing open question from
  Experiment 1's review (list items sit visibly right of same-depth siblings due to
  Obsidian's native hang). Full framing, including the two known risks (clamping, and
  compensating from the list *root*'s hang, not per-item):
  [10-experiment-5-block-markers.md](10-experiment-5-block-markers.md#open-question-shrinking-only-our-own-added-list-margin).
  A design decision to surface deliberately, not implement in passing.
- **Native list decoration experiments** — beyond the margin question above: spacing,
  alignment, and bullet-marker style for lists could all be revisited. Not important
  now; native list rendering is deliberately untouched today (the additive-only
  discipline), so any change here needs the same experiment-and-look rigor the original
  series used.
- **Collapsing gap lines.** Blank separator lines between paragraphs/headings/blocks are
  fully preserved today; once the outline structure is explicit, they're arguably
  redundant, and hiding/collapsing them (as a **configurable option**) would tighten the
  outline view. Needs investigation of whether CM6 line-hiding (replace decorations over
  blank lines) coexists with editing on those positions, and interacts with the guide
  continuity work (`computeLineGuides` deliberately covers gap lines — collapsed gaps
  change that geometry). **Scope boundary decided 2026-07-21** (node-edit-enforcement's
  second manual pass, docs/research/13's "Gap-line cursor transparency" entry): this is
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
- **Preserve the viewport position when toggling outline mode.** In a long document,
  toggling outline mode on or off currently jumps the view to the top — the user loses
  their place exactly when comparing the two renderings. Best effort, on some consistent
  logic: the cursor is a natural anchor in edit mode (reading mode, if it ever gets
  outline rendering, needs a different one). Collapsing gap lines (above) would make
  exact restoration harder — the anchor logic should be chosen to degrade gracefully
  rather than promise pixel fidelity.

### Vertical-alignment polish (minor, recorded from real-vault use)

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

## Verification-infrastructure ideas

- **Community-theme sweep as repeatable infrastructure.** The hardening pass probed
  Minimal/Catppuccin/Things via a throwaway spec (install theme into the sandboxed vault,
  screenshot fixtures, review by eye) — clean results, but the probe wasn't kept. If
  theme regressions ever become a recurring concern, that probe shape is the starting
  point; committing third-party theme CSS to the repo (licensing, size, staleness) is the
  main cost to weigh.
- **Consolidating per-experiment verification residue into `verification.md`** — the
  split noted in tasks.md 3.3 (each experiment doc carries its own results section)
  stays livable; consolidate only if navigating it proves hard in practice.
