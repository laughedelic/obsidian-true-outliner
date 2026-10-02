# Design

## Context

A case file's drawing is the case file's own form with only whitespace made visible
(`scripts/notation.ts`: `stack` and `layout`), and a column states text, a selection and the
`▒` lines. Fold and zoom are outside it, and the zoom and fold specs arrange them by running
`fold-node` and `zoom-in` with the caret on the node, then read `foldedLineRanges()` and the DOM.
`docs/research/folded-and-zoomed-case-files` measures what a case file needs to say, three forms
for saying it, the glyphs the notation may use and the cases each form moves. Its results are
cited by name below and not restated.

## Goals / Non-Goals

**Goals:**

- A drawing that starts from and ends in a folded or zoomed outline, readable on GitHub, in chat
  and on a phone, and the same text as the case file.
- The smallest form that lets a real case move, decided here and not by the implementation.
- The 37 cases the note names become expressible; the drawn `before` is checked, as it is for a
  caret.

**Non-Goals:**

- The 14 cases that need a command by name, the 96 that read the DOM or a pointer, and the
  notices a refusal shows (the proposal's non-goals).

## Decisions

### D1. The state is a mark on the node's line, in every column

A fold and the zoom root are facts about a node, and the drawing already has a place for a fact
about a line: the glyph that opens it, as `▒` does. A `before` and a result column use the same
mark, so one form states the start and each result.

The same case in the form chosen (`96-fold-grammar`, "Enter inside a folded node's text opens it
first"; the caret after Enter is not measured):

before
```
►- on┃e
  - nested a
  - nested b
- two
```

expected `⏎`
```
- on
  - e
  - nested a
  - nested b
- two
```

and #259, which the tracker draws with the zoom in a sentence (the `expected` caret is the
tracker's, not measured):

before
```
1. o
●2. p
   1. a┃
      1. x
   2. b
3. q
```

expected `⌘⇧↓`
```
1. o
●2. p
   1. b
   2. a┃
      1. x
3. q
```

The alternatives, measured in the note's "Three forms":

- **A preamble list** (`fold: …`, `zoom: …`) names a node by a line number or by its text and can
  only state the start; it opens 6 cases where the mark opens 36, and cannot say that a zoom survives
  a refusal or that a fold opens.
- **A separate column** per state can say a result, at the cost of a second block per state and
  line numbers counted by hand.

### D2. `►` folds, `●` zooms, and they open the line in the order `●►▒`

The glyphs are the ones present in all three monospace fonts measured (note, "Glyphs"): `►`, `●`
and the `▒` already in use. `▸` and `▾`, the usual tree chevrons, are missing in Liberation Mono
and would be drawn from another, narrower font, which is the failure the notation's other glyphs
are already reported to have. `►` is the closed triangle and `●` is the bullet a zoom focuses on. `▼` was not taken for the zoom, since it reads as "unfolded".

A line takes each mark at most once and in a fixed order, so reading is a strip from the start of
the line, as `▒` is now, and one line has one reading. A line that is the zoom root and folded is
refused, because a zoom opens its root (`outline-zoom`; the note's item 2). `▒` after a fold mark
is allowed by the grammar and unexercised: a fold command drops the block selection (item 5).

A marked line sits one or two cells right of its neighbours, as a `▒` line does, so a marked line
and its children read one step shallower than they are. Nothing in a drawing depends on columns
lining up (note, "Glyphs"), and the alternative of a mark after the text collides with the caret,
the trailing-space `·` and the `∅` that already end a line.

### D3. A column states the whole fold and zoom state; no mark means none

A caret is compared where it is drawn, since a result drawn without one usually means it was not
measured. A fold or a zoom root is different: "the fold opens" (`96:69`, `96:109`) and "the zoom
exits" (`80:1668`) are results, and stating them needs the absence of a mark to count. So the
runner compares the folded lines and the zoom root of every result column, and holds `before` to
its marks.

The cost is that a result column that forgets a mark fails, which the report draws. The shipped
case files are unaffected: none of them leaves a fold or a zoom after any phase (note, item 6).
The asymmetry with the caret is deliberate and goes into the skill.

`compareState` is the comparison a known-failing case's `actual` is judged by and the one the unit
suite uses to refuse a marker that waits on nothing, so the marks reach both without a change of
their own; a recorded `actual` draws every mark the app held, since its absence would state none.

### D4. The mark sits on the node's first line, and the read maps a fold to its node

A fold's recorded range starts at the node's last own line, so a paragraph of two source lines is
folded from its second (note, item 1). The read takes each fold to the provider range with the same
lines and draws the mark on that range's `line`. A fold that no node claims (a native fold on a
childless heading) is drawn on the line its range starts at, and a note under the drawing says so.

Alternative: draw at the range's start line. Rejected: the mark would sit on a line that is not a
node's first, and a `before` drawn that way would fold a different node when arranged.

### D5. Arranging: clear, zoom, fold from the last line, select

The runner clears folds and zoom, because fold state persists per file (`clearFolds`) and a case's
note path repeats. It zooms with the caret on the marked line's end and `zoom-in`, then folds each
marked line from the last to the first with the caret there and `fold-node`, then sets the
selection. The order is the measured one: a zoom opens every fold, so folds follow it; a caret set
on a hidden line opens the fold, so inner folds come first and the selection last (note, items 2
and 3).

What the editor cannot hold surfaces as a `before` that is not held, drawn beside the state the
editor has: a `►` on a node with no children (`fold-node` escalates to the branch above), or a `►`
outside the zoom's subtree. Nothing checks the tree at parse time, so the notation module stays
free of the outline model.

### D6. The plugin gives the read two facts

`foldState().folded` already lists the fold ranges as lines; each entry gains the `line` of the
node that owns it. `zoomState()` beside it returns the root's line or null, from `zoomScope`. A DOM
read of the first rendered line gave the right root in the three arrangements measured, and
depends on the viewport (note, "What a state has to say"); the probe is one field read and has
precedent in `foldState()`.

### D7. The side-by-side form draws the marks after the edge

In `layout`, `▒` replaces the edge glyph. `●` and `►` follow it, so a line keeps its edge and
`undraw` finds cells at edges as it does now, with the marks stripped from the cell's first
characters. The stacked form, the default, draws the case file's own text.

### D8. Keys, and where the boundary stays

`⌘⌥↑` and `⌘⌥↓` fold and unfold under `browser.keys` on both configs, which is what the 37 need.
`⌘⌥.` does not arrive, and the zoom commands have no hotkey, so a phase cannot zoom in. A step that
names a command is the separate decision that opens the 14 more cases; nothing here forecloses it,
since a step and a mark are independent.

## Risks / Trade-offs

- **A note holding `●` or `►` cannot be a case file**, the limit `▒` already imposes. Bullets in
  pasted text (`●`, `►`) are the likely collision; a case file for such a note fails to parse,
  naming the line, and does not misread.
- **Glyph rendering on GitHub and on a phone is not measured**, only three fonts on the VM. The
  choice rests on those three and the maintainer's report; a swap is one line in `notation.ts`
  and the skill.
- **Arranging is slower than a bare case**, about 460 ms for a zoom and 730 ms for two folds with
  the existing helpers (note, "What a state has to say"), against about 30 ms for a bare case.
  One page-side call for the caret and selection recovers most of it, and a case is still well
  under the spec's other costs.
- **A drawing loses the fold a zoom opened and will restore**, and any state the plugin keeps
  beyond the marks. The cases that assert it (`91:203`, `91:235`) also run `zoom-in` and are in the
  14.

## Open Questions

For the review on this PR, which settles the format before any code:

1. `►` and `●`, or another pair from the note's table.
2. That no mark means none in a result column, against comparing folds and zoom only when the
   case's `before` draws one.
3. The eight case files that ship (tasks, 4.1).
