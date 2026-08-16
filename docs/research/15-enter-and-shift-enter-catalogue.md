# Enter / Shift+Enter: measured behavior catalogue

Date: 2026-08-06. Produced for the `enter-and-shift-enter-grammar` change.

> **Every output below is the behavior as it was BEFORE that change.** This is the evidence
> that motivated it, not a description of what the keys do now — the cases marked ❌ and most
> of those marked ⚠️ were changed deliberately, and the ones that were not are listed at the
> end. Read `openspec/specs/outline-keyboard-grammar/spec.md` for current behavior.

Every case below was produced by running the real planner — `planKey` in
`src/plugin/grammar.ts`, which calls `splitNode` in `src/ops.ts` — over a cursor position,
applying the resulting change set, and re-parsing the result. Nothing here is read off the
spec; where the spec and the measurement disagree, the measurement is what ships.

`|` is the caret. `␣` marks a meaningful trailing space, `→` a tab. `───` separates before
from after.

Legend: ✅ matches the spec as written · ⚠️ works, but unspecified or shape-dependent ·
❌ contradicts a spec requirement, or is a defect.

---

## A. Enter — behaviors the spec states

### A1. A node with NO children splits into a sibling of the same kind

**E1** childless list item, mid-text ✅

```
- alpha| beta
─────────────
- alpha
- |beta
```

The space at the split point is dropped — the remainder is trimmed.

**E2** childless list item, at end — empty lower half ✅

```
- alpha|
────────
- alpha
- |
```

**E3** ordered list renumbers across the split ✅

```
1. one|
2. two
────────
1. one
2. |
3. two
```

**E4** continuation line of a multiline item ✅

```
- first
  second| line
──────────────
- first
  second
- |line
```

**E5** paragraph, mid-text — blank-separated siblings ✅ / ⚠️

```
one| two
────────
one

 |two
```

The space at the split point is KEPT here (`" two"`, caret behind it), the opposite of E1.
Whitespace at the split point is handled per kind rather than by a rule.

**E6** the caret lands at the remainder's content start ✅ — E1–E5 all show it.

### A2. A node WITH children splits into its new first child

**E7** list item with children, mid-text ✅

```
- alpha| beta
→- child
─────────────
- alpha
→- |beta
→- child
```

**E8** list item with children, at end ✅

```
- alpha|
→- child
─────────
- alpha
→- |
→- child
```

**E9** paragraph with a list child — the remainder takes the child scope's kind ✅

```
one| two
- child
────────
one
- |two
- child
```

**E10** list item whose first child is an indented paragraph, at end ❌

```
- item|

→para
────────
- item

→para
- |
```

The new empty node lands after the whole subtree — the "jumps over the existing subtree"
shape the 2026-07-21 content-adjacent amendment exists to prevent. An empty paragraph has no
encoding, so the child branch falls through to the sibling path (`ops.ts:592`). The heading
branch answers the same problem by widening the gap (E20); list items do not.

**E11** an indent-unit mismatch re-parents an existing child ⚠️

```
- item| text
→```
→code
→```
─────────────
- item
  - |text
→```
→code
→```
```

The new child is written at the configured indent (two spaces) while the existing child uses
a tab, so the code block becomes a grandchild: the split changed the tree's shape beyond the
split. `destinationIndent` consults list-item siblings only, and there is no list-item sibling
here to copy from. Reachable when a file's own indentation disagrees with the vault's
"Indent using tabs" setting.

### A3. An end-of-node split with no encodable empty node widens the gap

**E12** paragraph, at end ✅

```
thought|

next
─────────
thought


|

next
```

Three consequences the spec does not state: the caret sits on a gap line, which the caret
policy calls non-addressable; the node materializes only when text is typed; and a SECOND
Enter is declined (a gap line falls through to stock behavior), so two presses of one key do
two different things. Abandoning the position leaves three blank lines in the file.

### A4. Enter on a heading splits the title into a child

**E13** childless heading, mid-text ✅

```
# Hello| world
──────────────
# Hello
|world
```

**E14** heading with an existing paragraph child — blank separator ✅

```
# Head|line

Body.
─────────────
# Head

|line

Body.
```

**E15** heading with an existing LIST child ❌ — the two specs disagree

```
# Head|line
- item
────────────
# Head
- |line
- item
```

`outline-keyboard-grammar` says the remainder "becomes a new paragraph";
`structural-operations` says it takes the child scope's kind. The implementation follows the
latter, so heading title text becomes a bullet.

**E16** heading whose first child is a subheading, mid-text ⚠️

```
# He|ad
## Sub
────────
# He
|ad
## Sub
```

**E17** setext heading, mid-title — the underline stays attached ✅

```
Hello| world
====
─────────────
Hello
====
|world
```

**E18** setext underline — rejected with the cue ✅

```
Hello world
==|==
────────────
(rejected: "This block can't be split here.")
```

**E19** heading, at end, childless — the gap widens ✅

**E20** heading, at end, with a paragraph child ✅

```
# Head|

Body.
────────
# Head


|

Body.
```

**E21** heading at end whose first child is a LIST item ⚠️

```
# Head|
- item
────────
# Head
- |
- item
```

Not the gap-widen path: an empty list item is encodable, so a real empty child appears.
Defensible, and it means "Enter at a heading's end" has two outcomes depending on a child's
kind.

### A5. Atoms decline the key

**E22** code fence (first line or interior), table row, quote, `hr` ✅ — declined, stock
behavior runs.

### A6. Positions outside a node's own lines

**E23** caret on a gap line ⚠️ — declines; the stock newline widens the gap.
**E24** caret in the frontmatter preamble ✅ — declines.
**E25** empty document ⚠️ — declines.

---

## B. Enter — behaviors with no spec at all

**E26** content start, node has children ❌

```
- |alpha
→- child
─────────
-␣
→- |alpha
→- child
```

Enter at the start of a line indents the user's own text one level and leaves an empty parent
behind. Every other editor inserts above and leaves the text where it was.

**E27** heading content start ❌

```
# |Hello
─────────
#␣
|Hello
```

The title is demoted to a paragraph under an empty heading.

**E28** childless item, content start ✅

```
- |alpha
─────────
-␣
- |alpha
```

**E29** top-level paragraph, at start ⚠️

```
|thought
─────────


|thought
```

No node is created — an empty paragraph has no encoding — so the file gains two leading blank
lines. The caret correctly stays with the text.

**E30** caret inside a list marker — clamped to the content column ✅

**E31** Enter on an EMPTY list item ❌

```
- item
- |
────────
- item
-␣
- |
```

Obsidian core, Logseq, Workflowy and obsidian-outliner all outdent an empty item and leave
the list at the top level. We produce an endless column of empty bullets.

**E32** Enter in a task item ⚠️

```
- [ ] alpha| beta
──────────────────
- [ ] alpha
- |beta
```

The new item is a plain bullet; Obsidian core continues the checkbox. Our model treats `[ ]`
as content rather than list chrome, so this is a model question, not a keyboard one.

**E33** non-empty text selection ❌ — the handler plans from `selection.main.head` and its
change set never touches the selected range, so the selection is not replaced: the text
survives and a split happens at the head (`keymap.ts:73`, `keymap.ts:95`).

**E34** node (block) selection ❌ — the outcome depends on invisible geometry. With the
cover's head on a trailing gap line the key is declined, stock Enter replaces the range, and
the enforcement layer rewrites it to a pure `delete.structural`: the nodes are deleted and no
newline is inserted. With the head on a content line — a final node owning no gap — the
grammar handler runs instead and appends an empty sibling without deleting anything.

**E35** multiple cursors ❌ — `makeHandler` plans one range and dispatches a single-cursor
selection, so every secondary cursor is silently discarded. This is the failure `soleCursor`
guards the motion handlers against (`keymap.ts:409`).

---

## C. Shift+Enter

### C1. The insertion keeps the caret in the same node

**S1** list item, mid-text ✅

```
- alpha| beta
──────────────
- alpha
  | beta
```

The line becomes `␣␣␣beta` — the content column plus the split point's own space. Enter drops
that space; Shift+Enter keeps it.

**S2** nested and ordered items align to their own content column ✅
**S3** a continuation line keeps its own leading whitespace ✅
**S4** paragraph, mid-text — plain continuation, still one node ✅

**S5** caret inside the list marker ❌

```
-| alpha
─────────
-
  | alpha
```

Enter clamps out of chrome (E30); Shift+Enter splits the marker.

### C2. "The result SHALL re-parse as one (multiline) node"

**S6** heading ❌ — re-parses as a heading plus a paragraph child.

```
# Hello| world
───────────────
# Hello
| world
```

An ATX heading has no multiline encoding, so no insertion can satisfy the requirement here.

**S7** setext heading, mid-title ⚠️ — stays one node, a three-line setext heading.

**S8** setext underline ❌ — splits `====` into a `==` paragraph child. Enter rejects this
position (E18); Shift+Enter mangles it.

**S9** indented paragraph ❌

```
- item

→para| text
────────────
- item

→para
| text
```

The continuation is inserted at column 0, losing the node's own indentation. It survives as
one node only by CommonMark's lazy-continuation rule, and the source no longer matches the
tree.

**S10** at a node's end ❌

```
- alpha|
─────────
- alpha
  |
```

The new line is whitespace-only, so it re-parses as a gap rather than as part of the node —
the "one node" guarantee does not hold, and the caret is on a non-addressable line. Typing
there does repair it into one node. Paragraphs and headings produce the same shape.

**S11** at the end of a line that is not the node's LAST ❌ — S10's mechanism, at a node's middle
instead of its end, where the same blank line bisects the node rather than trailing it. Measured
2026-08-11 from a real-vault report ("the second line jumps to the right with a paragraph icon").

```
- foo|
  bar
────────
- foo
  |
  bar        ← now a paragraph CHILD of the item, at depth 1
```

Node counts go 1→2 for a flat item and for a two-line paragraph, 2→3 for an item that already
has children — so this is where "the tree SHALL have the same node count before and after the
keypress" (`outline-keyboard-grammar`) is actually false. The trigger is exact: the caret at the
END of a line that is not the node's last. Mid-text is unaffected, since the new line carries the
text after the caret and is not blank.

The displacement, measured with a 24px `--to-decor-unit` and a 20px marker gutter:

| Shape | The line below the position | Before | While the position is open |
|---|---|---|---|
| `- foo` / `␣␣bar` | `␣␣bar` | list continuation, `margin-left: 0` | paragraph at depth 1, `padding-left: 44px`, ¶ marker |
| the same under a heading | `␣␣bar` | list continuation, `margin-left: 24px` | paragraph at depth 2, `padding-left: 68px`, ¶ marker |
| `- top` / `⇥- foo` / `⇥␣␣bar` | `⇥␣␣bar` | list continuation, `margin-left: 0` | paragraph at depth 2, `padding-left: 68px`, ¶ marker |
| `alpha` / `beta` | `beta` | continuation, no marker | its own paragraph node, ¶ marker |

Closed by `a-position-does-not-split-its-node`, which leaves the buffer as it is and resolves the
outline above it: the rendering, the four structural keys, node extension, and the select-all
ladder all read the tree the position stands for. What that change measured beyond the rendering
is in its own tasks.md Findings — six of seven consumers were acting on the bisected parse, and a
list bisection hides the defect a paragraph bisection exposes, because a list attaches the tail as
a CHILD (carried along by any subtree operation) where a paragraph leaves it a SIBLING.

**S12** at the end of a line whose marker has no trailing space ❌ — left open. `-` parses as an
item with content column 2, but `LIST_CONT_RE` in `grammar.ts` requires whitespace after the
marker, so Shift+Enter writes a column-0 line. Typing there makes a TOP-LEVEL paragraph, so the
position belongs to no node and nothing downstream can repair it. Found by the differential
property test in `tests/decorate.test.ts`, which pins it; recorded in
[docs/research/12-decoration-follow-ups.md](12-decoration-follow-ups.md).

### C3. Atoms, gaps, preamble ✅ — declined.

### C4. Unspecified

**S13** non-empty selection and **S14** multi-cursor — the same gaps as E33/E35;
`insertionPlan` inserts at the head and never replaces the selection.

---

## C2. Found after the change shipped (real-vault pass, 2026-08-09)

Five findings from using the implemented behavior. Three are fixed in the change; two
are recorded here because they are not Enter's to fix.

**Fixed.** A split at the start of a line a Shift+Enter had just made left the upper half
with a blank last line — not a line of the node at all, it re-parses as a gap — so
Shift+Enter-then-Enter produced an extra blank where Enter alone produced none. A block
selection was removed by cutting its text out rather than by the structural delete, so an
ordered run did not renumber around it, and the key acted at the range's START rather than
at the caret the deletion produces: with the last items of a list selected that points at
whatever FOLLOWS the list, so Enter created a node of that node's kind (a heading, in the
reported case) instead of a list item, and at a document's end it pointed at a gap line and
declined outright. And repeated Enter on a provisional position kept widening the gap; it
now means "not here" — the caret advances to the next node and the keypress is cancelled.

**Not fixed here — an ordered run misnumbers when its HEAD is deleted.** Measured directly
against `deleteSubtrees`, with no Enter involved:

```
delete the first two of 1,2,3   →  "3. c"          (expected "1. c")
delete the first of 5,6,7       →  "6. b" "7. c"   (expected "5. b" "6. c")
```

`renumberOrdered` takes a run's start number as the MINIMUM of what remains, which is right
for a move (a `5. 6. 7.` list keeps starting at 5) and wrong for a deletion that removes the
run's head. Plain Backspace over the same selection hits it, so it belongs to the delete
operation's renumbering contract rather than to the keyboard grammar. Fixing it means
capturing each ordered run's start BEFORE the removal and renumbering the survivors from it.

Fixed by `fix-ordered-renumbering-on-removal` (archived 2026-08-10). The outputs above are
the pre-change record and stay as measured. What that change found beyond this entry, each
measured before being changed:

- **The same rule reaches `indent` and `unwrapListItem`** — a node leaving its own level is
  a removal too, so `- bullet` / `1. one` / `2. two` left `2. two` behind.
- **A merge is a removal in all three of its shapes**, which the change's own first draft
  got wrong: absorbing a non-ordered separator JOINS two runs and rewrote the survivor's own
  number, absorbing a node's first child renumbered nothing at all, and a node absorbed from
  an outer scope can head a run whose predecessor at that level is a bullet.
- **A new node materialized in a CHILD scope was written as a plain bullet** whatever the
  existing children were, so Enter at the end of a heading above a numbered list produced
  `- `. Reported from a real vault against the shipped Enter behavior; the donor that
  decides the child scope's KIND now decides its marker too.

Left open and filed separately: renumbering can push a marker past the parser's nine-digit
ceiling (`999999999.` → `1000000000.`), which re-parses as a paragraph. Pre-existing on
every insert path, and closing it means deciding what an operation does at the ceiling.

**Not fixed here — abandoning a position opened OVER a block selection leaves debris.**
Block-select a paragraph, press Enter, then move away.

The symptom recorded here first was "the paragraph comes back", written while the abandon
was still an undo of the whole keypress. It did not survive the change to a reverse edit,
and re-measuring against the planner and a real `EditorState` found the defect alive in a
milder form — one stray blank line, not a restored paragraph:

```
alpha/beta/gamma, beta block-selected   →  "alpha␤␤␤gamma␤"   (expected "alpha␤␤gamma␤")
the same at the document's end          →  "alpha␤␤"          (expected "alpha␤")
the same between wide gaps              →  "alpha␤␤␤␤gamma␤"  (expected "alpha␤␤␤gamma␤")
```

The cause is worth recording exactly, because it is why no better formula exists. The
plan's changes are a MINIMAL DIFF of the whole transformation, so the deletion and the
insertion are not separate sub-changes at all — for `alpha`/`beta`/`gamma` the diff is a
single replacement of `beta` by a blank line. `provisional-cleanup.ts` read the place's
extent back out of that shape, as the transaction's net line growth, and the removal
cancels exactly one line of the growth the position added.

The information needed is real but lives one layer up: `planOverSelection` computes the
intermediate text (after the removal, before the key acts), and the abandon edit is the
diff from the final text back to THAT. So the fix is for the plan to carry its own abandon
edit — computed where both states are known — and for the cleanup to apply it rather than
derive one. That also removes the last piece of guessing from the module.

Taken up by `abandon-removes-only-the-place`, which found two more shapes the same
derivation reaches, both with a plain caret and no selection involved:

```
Enter at the end of `1. a` in 1,2,3     →  "1. a␤3. b␤4. c␤"  (expected 1,2,3 restored)
Enter at the end of `alpha␤␤beta`       →  "alpha␤␤beta␤"     (expected "alpha␤␤beta")
```

The first is worse than debris: the keypress renumbered the run on the way in, and a
removal that only deletes a line leaves the renumbering standing. The second is the
end-of-document extent — the layout there is `[separator][position]`, so the caret sits on
the SECOND of the two lines, and a span counted forward from it runs off the end. A
last-line guard added with `decorate-provisional-positions` fixed only the sub-case where
that made the computed range empty ("removes nothing" became "removes one line"), which is
why all three end-of-document shapes still left a blank line behind.

Stating the edit rather than deriving it answers all five at once, because a reversal is
expressed in bytes rather than reasoned about in categories: whatever the operation wrote,
renumbering included, is what comes back out.

**Not fixed here — a redone provisional position cannot be abandoned again.** Press Enter at
a paragraph's end, move away (the keypress is undone), then REDO: the position comes back
with the caret in it, but abandoning it a second time does nothing. The gap then persists and
is unreachable, since caret motion skips gap lines — only another undo removes it.

The cause is that `provisional-cleanup.ts` re-arms its record only for its own dispatches, and
a redo is not one. Two attempts to recognise the redo failed: CodeMirror's own `redo`
`userEvent` never arrived, and a history-depth test (`redoDepth` decreasing) did not fire
either, which suggests the host's redo does not run through CodeMirror's history command at
all. Both were reverted rather than shipped unverified. Whatever recognises it must stay
narrow — re-arming on any change that leaves the caret on an empty place would also record a
Backspace that empties an item, and then undo the user's own deletion.

Still open after `abandon-removes-only-the-place`, and untouched by it — but the SEQUENCE
above is stale, and was re-measured in the real editor while archiving that change. "Move
away, then REDO" only worked while the cleanup was an undo of the keypress. Since it became a
real edit it leaves no redo branch, and redo after an abandon does nothing at all. The
reachable sequence is Enter, UNDO, REDO: the position returns with the caret in it and is no
longer recorded. Undo after an abandon also returns it, which is deliberate rather than a
defect — re-arming there would delete it again the moment the caret moved.

| # | Defect | Cases |
|---|---|---|
| D1 | Enter at a content start demotes the node's own text (items with children, all headings) | E26, E27 |
| D2 | Enter on an empty list item never outdents — the one outliner convention every peer implements | E31 |
| D3 | Neither key replaces a non-empty selection; block selections differ by where the cover's head lands | E33, E34, S13 |
| D4 | Neither key handles multiple cursors — secondaries are silently discarded | E35, S14 |
| D5 | Shift+Enter breaks its own one-node guarantee on headings, setext underlines, and at any node's end | S6, S8, S10 |
| D6 | Shift+Enter does not clamp out of chrome and drops an indented paragraph's own indentation | S5, S9 |
| D7 | End-of-node Enter on an item with a paragraph child jumps over the subtree | E10 |
| D8 | The two specs disagree on a heading remainder's kind | E15 |
| D9 | Split-point whitespace is dropped for items, kept for paragraphs, kept by Shift+Enter everywhere | E1, E5, S1 |
| D10 | The provisional gap state is unspecified: a second press is stock, and abandoning it leaves blank lines | E12, E23 |

All ten are addressed by `enter-and-shift-enter-grammar`, with two carve-outs. D3's
multi-cursor half becomes a decline rather than a plan-every-range implementation — a strict
improvement over silently discarding secondaries, with the full treatment filed alongside the
open question of structural keys over a multi-node selection. E32 (task continuation) is
implemented as a marker rule only: whether `[ ]` is content or list chrome stays a model
question, deliberately untouched.

Two findings did NOT survive review as stated. D10's "the provisional gap is gratuitous" reads
as a defect and is not one: the two blank lines are the only encoding that lets the parse tell
Enter's provisional position from Shift+Enter's, and a narrower gap was chosen in review, then
withdrawn when it turned out to need editor state (that change's design.md D1). What was real
in the complaint — debris from an unused keypress — is answered by undoing the keypress rather
than by writing less. And the decoration half of E10/E11 is not a split defect at all; both
decoration findings are recorded in `12-decoration-follow-ups.md`.

## Where S10 and E10 finally landed (`decorate-provisional-positions`, 2026-08-10)

Both were closed together, by the change that made a provisional position render as the node
the parse would make of it if a character were typed there.

**S10's decoration half.** The caret on a whitespace-only continuation position now carries
the same `supplementalDepth` contribution the line gets once text lands, so it renders inside
the list block instead of at the list's parent column. One residual is NOT ours and stays
open: a caret at the end of a list-indent run measures by the run's own text rather than by
the fixed width Obsidian gives the span containing it, byte-identical with the plugin
disabled. Measured, and recorded in `12-decoration-follow-ups.md`.

**E10's other half.** Building the rendering rule turned up an encoding defect underneath it,
which the catalogue's own entry could not have seen: the routing landed the position in the
right PLACE, but wrote it at column 0. Typing there produced a top-level paragraph and left
the item's existing child following it as another top-level node — the subtree flattened. The
position now carries its destination scope's indentation, so what materializes is the child
the routing intended.
